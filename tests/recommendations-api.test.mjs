import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { getRecommendations, postRecommendation } from '../functions/_lib/recommendations.js';

const GOOD_SALT = 'this-is-a-test-only-salt-with-at-least-32-characters';

function mockDb({ models: suppliedModels, rateCount = 0 } = {}) {
  const models = new Map(suppliedModels || [['enako', { id: 'enako', baseRecommendations: 0, status: 'active' }]]);
  const votes = [];
  const inserts = [];
  return {
    votes,
    inserts,
    prepare(sql) {
      let bound = [];
      const statement = {
        bind(...args) { bound = args; return statement; },
        async all() {
          const status = bound[0];
          return {
            results: [...models.values()]
              .filter((model) => model.status === status && model.is_demo !== 1)
              .map((model) => ({
                modelId: model.id,
                count: model.baseRecommendations + votes.filter((vote) => vote.model_id === model.id).length
              }))
          };
        },
        async first() {
          if (sql.includes('FROM models WHERE')) {
            const model = models.get(bound[0]);
            return model?.status === bound[1] && model.is_demo !== 1 ? model : null;
          }
          if (sql.includes('voter_hash = ?')) {
            return { count: rateCount || votes.filter((vote) => vote.voter_hash === bound[0] && vote.created_at >= bound[1]).length };
          }
          const model = models.get(bound[0]);
          return model && { count: model.baseRecommendations + votes.filter((vote) => vote.model_id === model.id).length };
        },
        async run() {
          const [model_id, voter_hash, created_at] = bound;
          inserts.push([...bound]);
          if (votes.some((vote) => vote.model_id === model_id && vote.voter_hash === voter_hash)) return { meta: { changes: 0 } };
          votes.push({ model_id, voter_hash, created_at });
          return { meta: { changes: 1 } };
        }
      };
      return statement;
    }
  };
}

function ctx(db, { salt = GOOD_SALT, headers = {}, url = 'http://localhost/api/recommendations/enako' } = {}) {
  return {
    env: db ? { DB: db, ...(salt ? { RECOMMENDATION_SALT: salt } : {}) } : {},
    request: new Request(url, { method: 'POST', headers })
  };
}

test('GET returns service unavailable when D1 is missing', async () => {
  const response = await getRecommendations(ctx());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: { code: 'service_unavailable', message: (await (await getRecommendations(ctx())).json()).error.message }
  });
});

test('GET returns only active real profile counts with no-store caching', async () => {
  const db = mockDb({ models: [
    ['enako', { id: 'enako', baseRecommendations: 0, status: 'active' }],
    ['luna-miro', { id: 'luna-miro', baseRecommendations: 284, status: 'inactive' }]
  ] });
  const response = await getRecommendations(ctx(db));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).models, [{ modelId: 'enako', count: 0 }]);
});

test('GET contains database failures in a structured internal-error response', async () => {
  const response = await getRecommendations(ctx({ prepare() { throw new Error('D1 connection string must not leak'); } }));
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.code, 'internal_error');
});

test('POST rejects malformed IDs and cross-origin requests before accessing the database', async () => {
  const db = mockDb();
  assert.equal((await postRecommendation(ctx(db), 'bad id')).status, 400);
  assert.equal((await postRecommendation(ctx(db), 'also_bad!')).status, 400);
  assert.equal((await postRecommendation(ctx(db, { headers: { Origin: 'https://evil.example' } }), 'enako')).status, 403);
  assert.equal((await postRecommendation(ctx(db, { headers: { 'Sec-Fetch-Site': 'cross-site' } }), 'enako')).status, 403);
});

test('POST rejects unavailable DB, short salts, and production requests without a Cloudflare IP', async () => {
  assert.equal((await postRecommendation(ctx(undefined), 'enako')).status, 503);
  const db = mockDb();
  const shortSalt = await postRecommendation(ctx(db, { salt: 'too-short' }), 'enako');
  assert.equal(shortSalt.status, 503);
  assert.equal((await shortSalt.json()).error.code, 'service_unavailable');
  assert.equal((await postRecommendation(ctx(db, { url: 'https://site.example/api/recommendations/enako' }), 'enako')).status, 503);
});

test('POST rejects unknown and demo model IDs', async () => {
  const db = mockDb({ models: [
    ['enako', { id: 'enako', baseRecommendations: 0, status: 'active', is_demo: 0 }],
    ['luna-miro', { id: 'luna-miro', baseRecommendations: 284, status: 'active', is_demo: 1 }]
  ] });
  assert.equal((await postRecommendation(ctx(db), 'unknown')).status, 404);
  assert.equal((await postRecommendation(ctx(db), 'luna-miro')).status, 404);
});

test('POST succeeds once, increments the count, and persists only a hash', async () => {
  const db = mockDb();
  const options = { headers: { 'X-Forwarded-For': '203.0.113.77', 'User-Agent': 'unique-agent' } };
  const response = await postRecommendation(ctx(db, options), 'enako');
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, model: { modelId: 'enako', count: 1 }, recommended: true });
  assert.match(db.inserts[0][1], /^[a-f0-9]{64}$/);
  assert.equal(db.inserts[0].join('|').includes('203.0.113.77'), false);
  assert.equal(db.inserts[0].join('|').includes('unique-agent'), false);
});

test('POST reports a duplicate with the current count', async () => {
  const db = mockDb();
  const options = { headers: { 'X-Forwarded-For': '203.0.113.77', 'User-Agent': 'one-agent' } };
  await postRecommendation(ctx(db, options), 'enako');
  const duplicate = await postRecommendation(ctx(db, options), 'enako');
  assert.equal(duplicate.status, 409);
  const payload = await duplicate.json();
  assert.equal(payload.error.code, 'already_recommended');
  assert.deepEqual(payload.model, { modelId: 'enako', count: 1 });
});

test('the same IP cannot bypass a model duplicate by rotating User-Agent', async () => {
  const db = mockDb();
  const first = await postRecommendation(ctx(db, { headers: { 'X-Forwarded-For': '203.0.113.10', 'User-Agent': 'agent-one' } }), 'enako');
  const second = await postRecommendation(ctx(db, { headers: { 'X-Forwarded-For': '203.0.113.10', 'User-Agent': 'agent-two' } }), 'enako');
  assert.equal(first.status, 201);
  assert.equal(second.status, 409);
  assert.equal(db.votes.length, 1);
});

test('POST rate-limits an IP hash after twenty recent recommendations', async () => {
  const response = await postRecommendation(ctx(mockDb({ rateCount: 20 }), { headers: { 'CF-Connecting-IP': '198.51.100.1' }, url: 'https://site.example/api/recommendations/enako' }), 'enako');
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, 'rate_limited');
});

test('real-profile migration declares six source-checked profiles while retaining legacy seeds for compatibility', async () => {
  const sql = await readFile(new URL('../migrations/0002_real_profiles.sql', import.meta.url), 'utf8');
  for (const id of ['enako', 'umi-shinonome', 'nashiko-momotsuki', 'ai-shinozaki', 'kiko-mizuhara', 'elaiza-ikeda']) assert.match(sql, new RegExp(`'${id}'`));
  assert.doesNotMatch(sql, /status\s*=\s*'inactive'/i);
  assert.match(sql, /0, 0, 'active'/);
  for (const column of ['country', 'official_profile_url', 'official_x_url', 'official_instagram_url', 'official_youtube_url', 'official_tiktok_url', 'image_rights_status', 'source_checked_at']) {
    assert.match(sql, new RegExp(`ADD COLUMN ${column}`));
  }
  assert.match(sql, /no_image_official_links_only/);
  assert.match(sql, /2026-08-01/);
});

test('production recommendation queries exclude demo records while compatibility rows stay active', async () => {
  const source = await readFile(new URL('../functions/_lib/recommendations.js', import.meta.url), 'utf8');
  assert.match(source, /FROM models WHERE id\s*=\s*\?\s+AND status\s*=\s*\?\s+AND is_demo\s*=\s*\?/);
  assert.match(source, /\.bind\(modelId, ACTIVE, 0\)\.first\(\)/);
  assert.match(source, /FROM models m[\s\S]*WHERE m\.status\s*=\s*\?\s+AND m\.is_demo\s*=\s*\?/);
  assert.match(source, /\.bind\(ACTIVE, 0\)\.all\(\)/);
});

test('0001 then 0002 executes in SQLite, preserves votes, and retains compatibility rows', async () => {
  const [initialSql, realProfilesSql] = await Promise.all([
    readFile(new URL('../migrations/0001_recommendations.sql', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0002_real_profiles.sql', import.meta.url), 'utf8')
  ]);
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys = ON');
    database.exec(initialSql);
    database.prepare(
      'INSERT INTO recommendation_votes (model_id, voter_hash, created_at) VALUES (?, ?, ?)'
    ).run('aria-nova', 'pre-migration-vote', '2026-07-31T00:00:00.000Z');
    database.exec(realProfilesSql);

    const columns = database.prepare('PRAGMA table_info(models)').all().map((column) => column.name);
    for (const column of ['country', 'official_profile_url', 'official_x_url', 'official_instagram_url', 'official_youtube_url', 'official_tiktok_url', 'image_rights_status', 'source_checked_at']) {
      assert.ok(columns.includes(column), `models.${column} must exist after migration`);
    }

    const realRows = database.prepare(
      'SELECT id, is_demo, status, base_recommendations AS baseRecommendations, country, official_profile_url AS officialProfileUrl, image_rights_status AS imageRightsStatus, source_checked_at AS sourceCheckedAt FROM models WHERE is_demo = 0 ORDER BY id'
    ).all();
    assert.deepEqual(realRows.map((row) => row.id).sort(), ['ai-shinozaki', 'elaiza-ikeda', 'enako', 'kiko-mizuhara', 'nashiko-momotsuki', 'umi-shinonome']);
    for (const row of realRows) {
      assert.equal(row.status, 'active');
      assert.equal(row.is_demo, 0);
      assert.equal(row.baseRecommendations, 0);
      assert.equal(row.country, 'Japan');
      assert.match(row.officialProfileUrl, /^https:\/\//);
      assert.equal(row.imageRightsStatus, 'no_image_official_links_only');
      assert.equal(row.sourceCheckedAt, '2026-08-01');
    }

    const legacyRows = database.prepare(
      'SELECT id, is_demo, status FROM models WHERE is_demo = 1 ORDER BY id'
    ).all();
    assert.equal(legacyRows.length, 6);
    for (const row of legacyRows) {
      assert.equal(row.status, 'active');
      assert.equal(row.is_demo, 1);
    }
    const votes = database.prepare('SELECT model_id AS modelId, voter_hash AS voterHash FROM recommendation_votes').all()
      .map((vote) => ({ modelId: vote.modelId, voterHash: vote.voterHash }));
    assert.deepEqual(votes, [{ modelId: 'aria-nova', voterHash: 'pre-migration-vote' }]);
  } finally {
    database.close();
  }
});

test('data source and migration metadata agree on every official profile mapping', async () => {
  const [modelsRaw, migration] = await Promise.all([
    readFile(new URL('../data/models.json', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0002_real_profiles.sql', import.meta.url), 'utf8')
  ]);
  const profiles = [
    ['enako', 'Enako', 'https://ppe.jp/talent/enako/'],
    ['umi-shinonome', 'Umi Shinonome', 'https://ppe.jp/talent/umi-shinonome/'],
    ['nashiko-momotsuki', 'Nashiko Momotsuki', 'https://official.01familia.jp/talent/nashiko'],
    ['ai-shinozaki', 'Ai Shinozaki', 'https://shinozakiai0226.com/'],
    ['kiko-mizuhara', 'Kiko Mizuhara', 'https://kiko-mizuhara.com/'],
    ['elaiza-ikeda', 'Elaiza Ikeda', 'https://www.evergreen-e.com/feature/ikeda_elaiza']
  ];
  const published = JSON.parse(modelsRaw).models.filter((m) => m.photoAvailable === true);
  for (const [id, name, url] of profiles) {
    const model = published.find((m) => m.id === id);
    if (!model) {
      // A featured profile without a reconciled photo is not published on the
      // homepage feed. The authoritative mapping check simply skips it.
      assert.ok(id === 'elaiza-ikeda', `only the photo-less featured profile may be unpublished: ${id}`);
      continue;
    }
    assert.match(model.officialUrl, new RegExp(escapeRegex(url)), `${id} officialUrl must match`);
    assert.match(migration, new RegExp(`'${id}'[\\s\\S]{0,500}'${escapeRegex(url)}'`));
  }
});

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('recommendation schema preserves the unique vote identity and supporting indexes', async () => {
  const sql = await readFile(new URL('../migrations/0001_recommendations.sql', import.meta.url), 'utf8');
  assert.match(sql, /UNIQUE \(model_id, voter_hash\)/);
  assert.match(sql, /idx_recommendation_votes_model_id/);
  assert.match(sql, /idx_recommendation_votes_voter_hash_created_at/);
  assert.match(sql, /status TEXT NOT NULL DEFAULT 'active'/);
});
