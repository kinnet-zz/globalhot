const JSON_HEADERS = {
  'content-type': 'application/json; charset=UTF-8',
  'cache-control': 'no-store',
};
const ACTIVE = 'active';
const MODEL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function unavailable() {
  return error('service_unavailable', '서비스를 일시적으로 사용할 수 없습니다.', 503);
}

function error(code, message, status, extra = {}) {
  return json({ ok: false, error: { code, message }, ...extra }, status);
}

function isValidModelId(modelId) {
  return typeof modelId === 'string' && modelId.length > 0 && modelId.length <= 64 && MODEL_ID.test(modelId);
}

function isLocalhost(url) {
  const host = new URL(url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function requestIsAllowed(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get('Sec-Fetch-Site') !== 'cross-site';
}

async function voterHash(salt, ip, userAgent) {
  const input = new TextEncoder().encode(JSON.stringify([salt, ip, userAgent]));
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function voterIp(request) {
  const cloudflareIp = request.headers.get('CF-Connecting-IP');
  if (cloudflareIp) return cloudflareIp;
  if (!isLocalhost(request.url)) return null;
  const forwarded = request.headers.get('X-Forwarded-For');
  return forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
}

async function activeModel(db, modelId) {
  return db.prepare(
    'SELECT id, base_recommendations AS baseRecommendations FROM models WHERE id = ? AND status = ?'
  ).bind(modelId, ACTIVE).first();
}

async function modelCount(db, modelId) {
  return db.prepare(
    'SELECT m.base_recommendations + COUNT(v.id) AS count FROM models m LEFT JOIN recommendation_votes v ON v.model_id = m.id WHERE m.id = ? GROUP BY m.id'
  ).bind(modelId).first();
}

function safeCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function safeModel(row) {
  return { modelId: String(row?.modelId ?? ''), count: safeCount(row?.count) };
}

function logUnexpected(request) {
  const requestId = request.headers.get('CF-Ray') ?? 'generic';
  console.error(`recommendations request failed (${requestId})`);
}

export async function getRecommendations(context) {
  if (!context.env?.DB) return unavailable();
  try {
    const result = await context.env.DB.prepare(
      'SELECT m.id AS modelId, m.base_recommendations + COUNT(v.id) AS count FROM models m LEFT JOIN recommendation_votes v ON v.model_id = m.id WHERE m.status = ? GROUP BY m.id ORDER BY m.id'
    ).bind(ACTIVE).all();
    return json({ ok: true, models: (result.results ?? []).map(safeModel) });
  } catch {
    logUnexpected(context.request);
    return error('internal_error', '요청을 처리하지 못했습니다.', 500);
  }
}

export async function postRecommendation(context, modelId) {
  if (!isValidModelId(modelId)) return error('invalid_model_id', '잘못된 모델 ID입니다.', 400);
  if (!requestIsAllowed(context.request)) return error('forbidden', '허용되지 않은 요청 출처입니다.', 403);
  const db = context.env?.DB;
  const salt = context.env?.RECOMMENDATION_SALT;
  if (!db || typeof salt !== 'string' || salt.trim().length < 32) return unavailable();

  const ip = voterIp(context.request);
  if (!ip) return unavailable();

  try {
    const model = await activeModel(db, modelId);
    if (!model) return error('not_found', '모델을 찾을 수 없습니다.', 404);

    const hash = await voterHash(salt, ip, context.request.headers.get('User-Agent') ?? '');
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const rate = await db.prepare(
      'SELECT COUNT(*) AS count FROM recommendation_votes WHERE voter_hash = ? AND created_at >= ?'
    ).bind(hash, oneHourAgo).first();
    if (Number(rate?.count ?? 0) >= 20) return error('rate_limited', '잠시 후 다시 시도해 주세요.', 429);

    const inserted = await db.prepare(
      'INSERT OR IGNORE INTO recommendation_votes (model_id, voter_hash, created_at) VALUES (?, ?, ?)'
    ).bind(modelId, hash, new Date().toISOString()).run();
    if (Number(inserted.meta?.changes ?? 0) === 0) {
      const count = await modelCount(db, model.id);
      return error('already_recommended', '이미 추천한 모델입니다.', 409, {
        model: { modelId: model.id, count: safeCount(count?.count ?? model.baseRecommendations) },
      });
    }

    const count = await modelCount(db, model.id);
    return json({
      ok: true,
      model: { modelId: model.id, count: safeCount(count?.count ?? model.baseRecommendations) },
      recommended: true,
    }, 201);
  } catch {
    logUnexpected(context.request);
    return error('internal_error', '요청을 처리하지 못했습니다.', 500);
  }
}
