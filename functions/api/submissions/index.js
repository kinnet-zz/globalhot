// 커뮤니티 화제 등록 API — X/인스타/스레드 등 게시물 URL을 받아 임베드 피드로 제공.
// 콘텐츠 복제 없이 URL만 저장하며, 렌더링은 각 플랫폼 공식 임베드로 클라이언트에서 수행.
// 스팸 방지: COMMENTS_SALT 기반 IP 해시 + IP당 하루 10건 한도.

const JSON_HEADERS = {
  'content-type': 'application/json; charset=UTF-8',
  'cache-control': 'no-store',
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function error(code, message, status) {
  return json({ ok: false, error: { code, message } }, status);
}

function requestIsAllowed(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get('Sec-Fetch-Site') !== 'cross-site';
}

function submitterIp(request) {
  const cloudflareIp = request.headers.get('CF-Connecting-IP');
  if (cloudflareIp) return cloudflareIp;
  const host = new URL(request.url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return null;
  const forwarded = request.headers.get('X-Forwarded-For');
  return forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
}

async function submitterHash(salt, ip) {
  const input = new TextEncoder().encode(JSON.stringify([salt, ip]));
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 허용 플랫폼 및 URL 검증 — 각 플랫폼의 공식 게시물 URL 형식만 허용
function detectPlatform(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.replace(/^www\./, '');
  if (host === 'x.com' || host === 'twitter.com') {
    return /^\/[A-Za-z0-9_]{1,15}\/status\/\d+/.test(parsed.pathname) ? 'x' : null;
  }
  if (host === 'instagram.com') {
    return /^\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/.test(parsed.pathname) ? 'instagram' : null;
  }
  if (host === 'threads.com' || host === 'threads.net') {
    return /\/post\/[A-Za-z0-9_-]+/.test(parsed.pathname) ? 'threads' : null;
  }
  if (host === 'youtube.com' || host === 'youtu.be') {
    return 'youtube';
  }
  return null;
}

function validNote(value) {
  if (typeof value !== 'string') return '';
  const note = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return note.slice(0, 200);
}

const DAILY_LIMIT = 10;
const LIST_LIMIT = 50;

export async function onRequestGet(context) {
  if (!context.env?.DB) return error('service_unavailable', '등록 서비스를 사용할 수 없습니다.', 503);
  try {
    const rows = await context.env.DB.prepare(
      'SELECT id, url, platform, note, created_at AS createdAt FROM rank_submissions WHERE status = ? ORDER BY id DESC LIMIT ?'
    ).bind('approved', LIST_LIMIT).all();
    return json({ ok: true, submissions: rows.results || [] });
  } catch {
    return error('internal_error', '등록 목록을 불러오지 못했습니다.', 500);
  }
}

export async function onRequestPost(context) {
  if (!context.env?.DB) return error('service_unavailable', '등록 서비스를 사용할 수 없습니다.', 503);
  if (!requestIsAllowed(context.request)) return error('forbidden', '교차 출처 요청은 허용되지 않습니다.', 403);
  const salt = context.env.COMMENTS_SALT;
  if (!salt || salt.length < 32) return error('service_unavailable', '등록 서비스를 사용할 수 없습니다.', 503);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return error('bad_request', '요청 본문이 올바르지 않습니다.', 400);
  }

  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!url || url.length > 2048) return error('bad_request', '게시물 URL을 입력해 주세요.', 400);
  const platform = detectPlatform(url);
  if (!platform) {
    return error('bad_request', '지원 형식: X(x.com/.../status/...), 인스타그램(p/reel), 스레드(post), 유튜브 게시물 URL', 400);
  }
  const note = validNote(body?.note);

  const ip = submitterIp(context.request);
  if (!ip) return error('service_unavailable', '등록 서비스를 사용할 수 없습니다.', 503);

  try {
    const hash = await submitterHash(salt, ip);
    // 중복 URL 차단
    const dup = await context.env.DB.prepare('SELECT id FROM rank_submissions WHERE url = ?').bind(url).first();
    if (dup) return error('duplicate', '이미 등록된 게시물입니다.', 409);
    // Rate limit: IP당 하루 DAILY_LIMIT 건
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const recent = await context.env.DB.prepare(
      'SELECT COUNT(*) AS count FROM rank_submissions WHERE submitter_hash = ? AND created_at >= ?'
    ).bind(hash, since).first();
    if (Number(recent?.count || 0) >= DAILY_LIMIT) {
      return error('rate_limited', '등록 한도(하루 10건)를 초과했습니다. 내일 다시 시도해 주세요.', 429);
    }

    const result = await context.env.DB.prepare(
      'INSERT INTO rank_submissions (url, platform, note, submitter_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(url, platform, note, hash, 'approved', new Date().toISOString()).run();
    return json({ ok: true, submission: { id: Number(result.meta.last_row_id), url, platform, note, createdAt: new Date().toISOString() } }, 201);
  } catch {
    return error('internal_error', '등록하지 못했습니다.', 500);
  }
}
