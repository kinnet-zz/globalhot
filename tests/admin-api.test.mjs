import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { requireAdmin, signToken, verifyToken } from '../functions/_lib/admin.js';

const GOOD_SECRET = 'this-is-a-test-only-admin-secret-1234567890';

async function buildDb() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  const [first, second, third] = await Promise.all([
    readFile(new URL('../migrations/0001_recommendations.sql', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0002_real_profiles.sql', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0003_model_comments.sql', import.meta.url), 'utf8'),
  ]);
  database.exec(first);
  database.exec(second);
  database.exec(third);
  return database;
}

function wrappedDb(database) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      const bound = { args: undefined };
      const runner = {
        bind(...args) { bound.args = args; return runner; },
        all(...args) {
          const resolved = bound.args ?? args;
          return { results: statement.all(...resolved) };
        },
        first(...args) {
          const resolved = bound.args ?? args;
          return statement.get(...resolved) ?? null;
        },
        run(...args) {
          const resolved = bound.args ?? args;
          const info = statement.run(...resolved);
          return { meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
        },
      };
      return runner;
    },
  };
}

function ctx(db, { secret = GOOD_SECRET, headers = {}, url = 'http://localhost/api/admin/stats' } = {}) {
  return {
    env: db ? { DB: db, ...(secret ? { ADMIN_SECRET: secret } : {}) } : {},
    request: new Request(url, { method: 'GET', headers }),
  };
}

function postCtx(db, body, { secret = GOOD_SECRET, headers = {}, url = 'http://localhost/api/admin/models/enako' } = {}) {
  return {
    env: db ? { DB: db, ...(secret ? { ADMIN_SECRET: secret } : {}) } : {},
    request: new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  };
}

function bearerOf(token) {
  return { Authorization: 'Bearer ' + token };
}

test('verifyToken accepts a valid signed token and rejects tampered or expired payloads', async () => {
  const token = await signToken(GOOD_SECRET, Date.now());
  assert.ok(await verifyToken(token, GOOD_SECRET, Date.now()));
  assert.equal(await verifyToken(token + 'x', GOOD_SECRET, Date.now()), null);
  assert.equal(await verifyToken(token, 'different-secret-of-sufficient-length!!', Date.now()), null);
  const expired = await signToken(GOOD_SECRET, Date.now() - 15 * 60 * 60 * 1000);
  assert.equal(await verifyToken(expired, GOOD_SECRET, Date.now()), null);
  const past = await signToken(GOOD_SECRET, 0);
  assert.equal(await verifyToken(past, GOOD_SECRET, Date.now()), null);
});

test('requireAdmin returns 401 without a token and 503 without config or DB', async () => {
  const db = wrappedDb(await buildDb());
  const denied = await requireAdmin(ctx(db, { headers: {} }));
  assert.equal(denied.status, 401);
  const noSecret = await requireAdmin(ctx(db, { secret: '' }));
  assert.equal(noSecret.status, 503);
  const noDb = await requireAdmin({ env: {}, request: new Request('http://localhost/', { headers: {} }) });
  assert.equal(noDb.status, 503);
});

test('admin login returns a working token only for the right password', async () => {
  const authModule = await import('../functions/api/admin/auth.js');
  const attempt = async (password) => authModule.onRequestPost({
    request: new Request('http://localhost/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }),
    env: { DB: wrappedDb(await buildDb()), ADMIN_SECRET: GOOD_SECRET },
  });
  assert.equal((await attempt(GOOD_SECRET)).status, 200);
  assert.equal((await attempt('the-wrong-password-value')).status, 401);
  assert.equal((await attempt('')).status, 401);
  assert.equal((await attempt('short')).status, 401);

  const login = await attempt(GOOD_SECRET);
  const payload = await login.json();
  assert.equal(payload.ok, true);
  assert.ok(payload.token);
  assert.ok(await verifyToken(payload.token, GOOD_SECRET, Date.now()));
});

test('stats and comments list require admin auth and work with a token', async () => {
  const database = await buildDb();
  const db = wrappedDb(database);
  const insert = database.prepare(
    'INSERT INTO model_comments (model_id, author_name, content, commenter_hash, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  insert.run('enako', '테스터', '멋져요', 'hash', '2026-08-11T01:00:00.000Z');

  const token = await signToken(GOOD_SECRET, Date.now());

  const statsModule = await import('../functions/api/admin/stats.js');
  const deniedStats = await statsModule.onRequestGet(ctx(db, { headers: {} }));
  assert.equal(deniedStats.status, 401);
  const stats = await statsModule.onRequestGet(ctx(db, { headers: bearerOf(token) }));
  assert.equal(stats.status, 200);
  const statsPayload = await stats.json();
  assert.equal(statsPayload.totalComments, 1);
  const enako = statsPayload.models.find((model) => model.modelId === 'enako');
  assert.equal(enako.commentCount, 1);
  assert.equal(enako.status, 'active');
  assert.ok(statsPayload.models.some((model) => model.modelId === 'kiko-mizuhara'));

  const commentsModule = await import('../functions/api/admin/comments/index.js');
  const comments = await commentsModule.onRequestGet(ctx(db, { headers: bearerOf(token) }));
  assert.equal(comments.status, 200);
  const commentsPayload = await comments.json();
  assert.equal(commentsPayload.comments.length, 1);
  assert.deepEqual(commentsPayload.comments[0], {
    id: 1,
    modelId: 'enako',
    authorName: '테스터',
    content: '멋져요',
    createdAt: '2026-08-11T01:00:00.000Z',
  });

  const filtered = await commentsModule.onRequestGet(ctx(db, {
    headers: bearerOf(token),
    url: 'http://localhost/api/admin/comments?modelId=does-not-exist',
  }));
  assert.deepEqual((await filtered.json()).comments, []);
});

test('comment deletion removes a single comment and rejects bad IDs', async () => {
  const database = await buildDb();
  const db = wrappedDb(database);
  const insert = database.prepare(
    'INSERT INTO model_comments (model_id, author_name, content, commenter_hash, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  insert.run('enako', 'a', 'x', 'h1', '2026-08-11T01:00:00.000Z');
  insert.run('enako', 'b', 'y', 'h2', '2026-08-11T02:00:00.000Z');

  const token = await signToken(GOOD_SECRET, Date.now());
  const delModule = await import('../functions/api/admin/comments/[commentId].js');
  const denied = await delModule.onRequestDelete(ctx(db), '1');
  assert.equal(denied.status, 401);
  const bad = await delModule.onRequestDelete(ctx(db, { headers: bearerOf(token) }), 'nope');
  assert.equal(bad.status, 400);
  const missing = await delModule.onRequestDelete(ctx(db, { headers: bearerOf(token) }), '99');
  assert.equal(missing.status, 404);
  const ok = await delModule.onRequestDelete(ctx(db, { headers: bearerOf(token) }), '1');
  assert.equal(ok.status, 200);
  const rows = database.prepare('SELECT id FROM model_comments ORDER BY id').all();
  assert.deepEqual(rows.map((row) => Number(row.id)), [2]);
});

test('model hide, restore, and delete endpoints enforce admin auth and valid state', async () => {
  const database = await buildDb();
  const db = wrappedDb(database);
  const token = await signToken(GOOD_SECRET, Date.now());
  const modelModule = await import('../functions/api/admin/models/[modelId].js');

  const denied = await modelModule.onRequestPost(ctx(db), 'enako', { action: 'hide' });
  assert.equal(denied.status, 401);

  const badAction = await modelModule.onRequestPost(postCtx(db, { action: 'delete' }, { headers: bearerOf(token) }), 'enako');
  assert.equal(badAction.status, 400);

  const hidden = await modelModule.onRequestPost(postCtx(db, { action: 'hide' }, { headers: bearerOf(token) }), 'enako');
  assert.equal(hidden.status, 200);
  assert.equal(database.prepare('SELECT status FROM models WHERE id = ?').get('enako').status, 'inactive');

  const restored = await modelModule.onRequestPost(postCtx(db, { action: 'restore' }, { headers: bearerOf(token) }), 'enako');
  assert.equal(restored.status, 200);
  assert.equal(database.prepare('SELECT status FROM models WHERE id = ?').get('enako').status, 'active');

  const missing = await modelModule.onRequestPost(postCtx(db, { action: 'hide' }, { headers: bearerOf(token) }), 'does-not-exist');
  assert.equal(missing.status, 404);

  const deleteMissing = await modelModule.onRequestDelete(ctx(db, { headers: bearerOf(token) }), 'does-not-exist');
  assert.equal(deleteMissing.status, 404);
});

test('model deletion cascades its comments in real SQLite', async () => {
  const database = await buildDb();
  const db = wrappedDb(database);
  const insert = database.prepare(
    'INSERT INTO model_comments (model_id, author_name, content, commenter_hash, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  insert.run('enako', 'a', 'x', 'h1', '2026-08-11T01:00:00.000Z');
  insert.run('enako', 'b', 'y', 'h2', '2026-08-11T02:00:00.000Z');

  const token = await signToken(GOOD_SECRET, Date.now());
  const modelModule = await import('../functions/api/admin/models/[modelId].js');
  const removed = await modelModule.onRequestDelete(ctx(db, { headers: bearerOf(token) }), 'enako');
  assert.equal(removed.status, 200);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM models WHERE id = ?').get('enako').count, 0);
  const orphaned = database.prepare('SELECT COUNT(*) AS count FROM model_comments WHERE model_id = ?').get('enako').count;
  assert.equal(orphaned, 0);
});

test('DB failures in admin queries become structured internal errors', async () => {
  const token = await signToken(GOOD_SECRET, Date.now());
  const breaking = {
    prepare() { throw new Error('D1 failure should be hidden'); },
  };
  const commentsModule = await import('../functions/api/admin/comments/index.js');
  const response = await commentsModule.onRequestGet(ctx(breaking, { headers: bearerOf(token) }));
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.code, 'internal_error');
});