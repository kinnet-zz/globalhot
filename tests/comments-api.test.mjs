import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { listComments, postComment } from '../functions/_lib/comments.js';

const GOOD_SALT = 'this-is-a-test-only-salt-with-at-least-32-characters';

function mockDb({ models: suppliedModels = [['enako', { id: 'enako', status: 'active' }]], rateCount = 0, comments = [] } = {}) {
  const models = new Map(suppliedModels);
  const rows = [...comments];
  const inserts = [];
  return {
    rows,
    inserts,
    prepare(sql) {
      let bound = [];
      const statement = {
        bind(...args) { bound = args; return statement; },
        async all() {
          if (sql.includes('FROM model_comments')) {
            const [modelId, limit] = bound;
            return {
              results: rows.filter((row) => row.model_id === modelId).slice(0, limit).reverse().map((row) => ({
                authorName: row.author_name,
                content: row.content,
                createdAt: row.created_at
              }))
            };
          }
          return { results: [] };
        },
        async first() {
          if (sql.includes('FROM models WHERE')) {
            const model = models.get(bound[0]);
            return model?.status === bound[1] && model.is_demo !== 1 ? model : null;
          }
          if (sql.includes('FROM model_comments WHERE')) {
            return { count: rateCount || rows.filter((row) => row.model_id === bound[0] && row.commenter_hash === bound[1]).length };
          }
          return null;
        },
        async run() {
          inserts.push([...bound]);
          rows.push({ model_id: bound[0], author_name: bound[1], content: bound[2], commenter_hash: bound[3], created_at: bound[4] });
          return { meta: { last_row_id: rows.length } };
        }
      };
      return statement;
    }
  };
}

function ctx(db, { salt = GOOD_SALT, headers = {}, url = 'http://localhost/api/comments/enako' } = {}) {
  return {
    env: db ? { DB: db, ...(salt ? { COMMENTS_SALT: salt } : {}) } : {},
    request: new Request(url, { method: 'POST', headers })
  };
}

test('GET returns service unavailable when D1 is missing', async () => {
  const response = await listComments({ env: {} }, 'enako');
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error.code, 'service_unavailable');
});

test('GET rejects malformed model IDs and lists comments newest-first', async () => {
  const db = mockDb({ comments: [
    { model_id: 'enako', author_name: '댓글러', content: '멋져요', created_at: '2026-08-11T01:00:00.000Z' },
    { model_id: 'enako', author_name: '두 번째', content: '멋져요 2', created_at: '2026-08-11T02:00:00.000Z' }
  ] });
  assert.equal((await listComments(ctx(db), 'bad id')).status, 400);
  const response = await listComments(ctx(db), 'enako');
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.comments.length, 2);
  assert.deepEqual(payload.comments[0], { authorName: '두 번째', content: '멋져요 2', createdAt: '2026-08-11T02:00:00.000Z' });
});

test('GET wraps database failures in a structured internal-error response', async () => {
  const response = await listComments({ env: { DB: { prepare() { throw new Error('boom'); } } } }, 'enako');
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.code, 'internal_error');
});

test('POST rejects malformed IDs, cross-origin requests, short salts, and missing IPs first', async () => {
  const db = mockDb();
  assert.equal((await postComment(ctx(db), 'bad id', { authorName: 'a', content: 'bc' })).status, 400);
  assert.equal((await postComment(ctx(db, { headers: { Origin: 'https://evil.example' } }), 'enako')).status, 403);
  assert.equal((await postComment(ctx(db, { headers: { 'Sec-Fetch-Site': 'cross-site' } }), 'enako')).status, 403);
  assert.equal((await postComment(ctx(db, { salt: 'too-short' }), 'enako')).status, 503);
  assert.equal((await postComment(ctx(db, { url: 'https://site.example/api/comments/enako' }), 'enako')).status, 503);
});

test('POST rejects empty, overlong, or personal-data comment bodies', async () => {
  const db = mockDb();
  const options = { headers: { 'X-Forwarded-For': '203.0.113.77' } };
  const tooLongName = 'x'.repeat(25);
  assert.equal((await postComment(ctx(db, options), 'enako', { authorName: '', content: 'abc' })).status, 400);
  assert.equal((await postComment(ctx(db, options), 'enako', { authorName: tooLongName, content: 'abc' })).status, 400);
  assert.equal((await postComment(ctx(db, options), 'enako', { authorName: 'a', content: 'x' })).status, 400);
  assert.equal((await postComment(ctx(db, options), 'enako', { authorName: 'a', content: '주민등록번호를 알려주세요' })).status, 400);
  assert.equal((await postComment(ctx(db, options), 'enako', { authorName: '카드번호맨', content: 'abc' })).status, 400);
});

test('POST rejects unknown and demo model IDs', async () => {
  const db = mockDb({ models: [
    ['enako', { id: 'enako', status: 'active' }],
    ['luna-miro', { id: 'luna-miro', status: 'active', is_demo: 1 }]
  ] });
  const options = { headers: { 'X-Forwarded-For': '203.0.113.77' } };
  assert.equal((await postComment(ctx(db, options), 'unknown', { authorName: 'a', content: 'bc' })).status, 404);
  assert.equal((await postComment(ctx(db, options), 'luna-miro', { authorName: 'a', content: 'bc' })).status, 404);
});

test('POST persists a comment while storing only an IP hash, never the raw IP', async () => {
  const db = mockDb();
  const options = { headers: { 'X-Forwarded-For': '203.0.113.77', 'User-Agent': 'unique-agent' } };
  const response = await postComment(ctx(db, options), 'enako', { authorName: '댓글러', content: '프로필이 정말 멋져요.' });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.comment.id, 1);
  assert.match(db.inserts[0][3], /^[a-f0-9]{64}$/);
  assert.equal(db.inserts[0].join('|').includes('203.0.113.77'), false);
  assert.equal(db.inserts[0].join('|').includes('unique-agent'), false);
});

test('POST cleans whitespace before storing and rate-limits after five per IP per model', async () => {
  const db = mockDb();
  const options = { headers: { 'X-Forwarded-For': '203.0.113.77' } };
  const first = await postComment(ctx(db, options), 'enako', { authorName: '  댓글러  ', content: '안녕\t하세요.\n' });
  assert.equal(first.status, 201);
  assert.equal(db.rows[0].author_name, '댓글러');
  assert.equal(db.rows[0].content, '안녕 하세요.');
  const limited = await postComment(ctx(mockDb({ rateCount: 5 }), options), 'enako', { authorName: 'a', content: 'bc' });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, 'rate_limited');
});

test('list and post speak the same DB table as the 0003 migration', async () => {
  const sql = await readFile(new URL('../migrations/0003_model_comments.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS model_comments/);
  assert.match(sql, /author_name TEXT NOT NULL/);
  assert.match(sql, /content TEXT NOT NULL/);
  assert.match(sql, /commenter_hash TEXT NOT NULL/);
  assert.match(sql, /idx_model_comments_model_id_created_at/);
  assert.match(sql, /idx_model_comments_model_id_id/);
  assert.match(sql, /REFERENCES models\(id\) ON DELETE CASCADE/);
});

test('0003 migration executes in SQLite and supports listing after a real insert', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys = ON');
    const first = await readFile(new URL('../migrations/0001_recommendations.sql', import.meta.url), 'utf8');
    const second = await readFile(new URL('../migrations/0002_real_profiles.sql', import.meta.url), 'utf8');
    const third = await readFile(new URL('../migrations/0003_model_comments.sql', import.meta.url), 'utf8');
    database.exec(first);
    database.exec(second);
    database.exec(third);

    const inserted = database.prepare(
      'INSERT INTO model_comments (model_id, author_name, content, commenter_hash, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run('enako', '댓글러', '멋져요', 'hash123', '2026-08-11T01:00:00.000Z');
    assert.equal(Number(inserted.lastInsertRowid), 1);

    const rows = database.prepare(
      'SELECT author_name AS authorName, content, created_at AS createdAt FROM model_comments WHERE model_id = ? ORDER BY id DESC'
    ).all('enako').map((row) => ({ authorName: row.authorName, content: row.content, createdAt: row.createdAt }));
    assert.deepEqual(rows, [{ authorName: '댓글러', content: '멋져요', createdAt: '2026-08-11T01:00:00.000Z' }]);

    const columns = database.prepare('PRAGMA table_info(model_comments)').all().map((column) => column.name);
    for (const column of ['id', 'model_id', 'author_name', 'content', 'commenter_hash', 'created_at']) {
      assert.ok(columns.includes(column), `model_comments.${column} must exist`);
    }
  } finally {
    database.close();
  }
});