const JSON_HEADERS = {
  'content-type': 'application/json; charset=UTF-8',
  'cache-control': 'no-store',
};
const ACTIVE = 'active';
const MODEL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AUTHOR_MAX = 24;
const CONTENT_MAX = 2000;
const LIST_LIMIT = 100;

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function unavailable() {
  return error('service_unavailable', '댓글 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.', 503);
}

export function error(code, message, status, extra = {}) {
  return json({ ok: false, error: { code, message }, ...extra }, status);
}

function isValidModelId(modelId) {
  return typeof modelId === 'string' && modelId.length > 0 && modelId.length <= 64 && MODEL_ID.test(modelId);
}

function requestIsAllowed(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get('Sec-Fetch-Site') !== 'cross-site';
}

function commenterHash(salt, ip) {
  const input = new TextEncoder().encode(JSON.stringify([salt, ip]));
  return crypto.subtle.digest('SHA-256', input).then((digest) => {
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  });
}

function commenterIp(request) {
  const cloudflareIp = request.headers.get('CF-Connecting-IP');
  if (cloudflareIp) return cloudflareIp;
  const host = new URL(request.url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return null;
  const forwarded = request.headers.get('X-Forwarded-For');
  return forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
}

async function activeModel(db, modelId) {
  return db.prepare(
    'SELECT id FROM models WHERE id = ? AND status = ? AND is_demo = ?'
  ).bind(modelId, ACTIVE, 0).first();
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function validCommentAuthor(value) {
  const name = cleanText(value);
  if (!name || name.length > AUTHOR_MAX) return null;
  if (/[\uD800-\uDBFF\uDC00-\uDFFF]/.test(name) && name.replace(/[\uD800-\uDFFF]/g, '').length < 1) return null;
  return name;
}

function validCommentContent(value) {
  const content = cleanText(value);
  if (!content || content.length < 2 || content.length > CONTENT_MAX) return null;
  return content;
}

const BLOCKED_PHRASES = [
  '개인정보', '주민등록번호', '전화번호', '카드번호', '계좌번호', '비밀번호', '인증번호',
];

function isClean(content, author) {
  const sample = (content + ' ' + author).toLowerCase();
  return !BLOCKED_PHRASES.some((phrase) => sample.includes(phrase.toLowerCase()));
}

async function recentComments(db, modelId, ipHash, limitMinutes) {
  const since = new Date(Date.now() - limitMinutes * 60 * 1000).toISOString();
  return db.prepare(
    'SELECT COUNT(*) AS count FROM model_comments WHERE model_id = ? AND commenter_hash = ? AND created_at >= ?'
  ).bind(modelId, ipHash, since).first();
}

export async function listComments(context, modelId) {
  if (!context.env?.DB) return unavailable();
  if (!isValidModelId(modelId)) return error('bad_request', '유효하지 않은 모델 ID입니다.', 400);
  try {
    const rows = await context.env.DB.prepare(
      'SELECT author_name AS authorName, content, created_at AS createdAt FROM model_comments WHERE model_id = ? ORDER BY id DESC LIMIT ?'
    ).bind(modelId, LIST_LIMIT).all();
    const comments = (rows.results || []).map((row) => ({
      authorName: row.authorName,
      content: row.content,
      createdAt: row.createdAt,
    }));
    return json({ ok: true, comments });
  } catch {
    return error('internal_error', '댓글을 불러오지 못했습니다.', 500);
  }
}

export async function postComment(context, modelId, body) {
  if (!context.env?.DB) return unavailable();
  const salt = context.env.COMMENTS_SALT;
  if (!isValidModelId(modelId)) return error('bad_request', '유효하지 않은 모델 ID입니다.', 400);
  if (!requestIsAllowed(context.request)) return error('forbidden', '교차 출처 요청은 허용되지 않습니다.', 403);
  if (!salt || salt.length < 32) return unavailable();
  const ip = commenterIp(context.request);
  if (!ip) return unavailable();
  const authorName = validCommentAuthor((body && body.authorName) || '');
  const content = validCommentContent((body && body.content) || '');
  if (!authorName) return error('bad_request', '작성자 이름을 1~24자로 입력해 주세요.', 400);
  if (!content) return error('bad_request', '댓글 내용을 2~2000자로 입력해 주세요.', 400);
  if (!isClean(content, authorName)) return error('bad_request', '개인정보가 포함된 댓글은 등록할 수 없습니다.', 400);

  try {
    const hash = await commenterHash(salt, ip);
    // Rate limit: 5 comments per model per IP per 10 minutes.
    const recent = await recentComments(context.env.DB, modelId, hash, 10);
    if (Number(recent?.count || 0) >= 5) return error('rate_limited', '댓글을 너무 자주 작성했습니다. 잠시 후 다시 시도해 주세요.', 429);

    const result = await context.env.DB.prepare(
      'INSERT INTO model_comments (model_id, author_name, content, commenter_hash, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(modelId, authorName, content, hash, new Date().toISOString()).run();
    return json({ ok: true, comment: { id: Number(result.meta.last_row_id), authorName, content, createdAt: new Date().toISOString() } }, 201);
  } catch {
    return error('internal_error', '댓글을 등록하지 못했습니다.', 500);
  }
}