import { error, json } from './comments.js';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const TOKEN_ISSUER = 'globalhot-admin';

const encoder = new TextEncoder();

function toBase64Url(input) {
  return btoa(String.fromCharCode(...input)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function hmacSecret(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signToken(secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('admin secret is not configured');
  const payload = JSON.stringify({ iss: TOKEN_ISSUER, exp: now + TOKEN_TTL_MS });
  const payloadUrl = toBase64Url(encoder.encode(payload));
  const signature = await crypto.subtle.sign('HMAC', await hmacSecret(secret), encoder.encode(payloadUrl));
  return `${payloadUrl}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || typeof secret !== 'string' || secret.length < 32) return null;
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const payloadUrl = token.slice(0, dot);
  const supplied = token.slice(dot + 1);
  const expected = toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacSecret(secret), encoder.encode(payloadUrl))));
  if (!timingSafeEqualHex(supplied, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadUrl)));
  } catch {
    return null;
  }
  if (!payload || payload.iss !== TOKEN_ISSUER || typeof payload.exp !== 'number') return null;
  if (payload.exp <= now) return null;
  return payload;
}

export async function adminLogin(context, password) {
  if (!context.env?.DB) return error('service_unavailable', '관리자 서비스를 사용할 수 없습니다.', 503);
  const secret = context.env.ADMIN_SECRET;
  if (!secret || secret.length < 32) return error('service_unavailable', '관리자 설정이 초기화되지 않았습니다.', 503);
  if (typeof password !== 'string' || password.length < 8) {
    return error('unauthorized', '비밀번호가 올바르지 않습니다.', 401);
  }
  const digest = async (value) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const suppliedHash = await digest(`${secret}:${password}`);
  const expectedHash = await digest(`${secret}:${secret}`);
  if (!timingSafeEqualHex(suppliedHash, expectedHash)) {
    return error('unauthorized', '비밀번호가 올바르지 않습니다.', 401);
  }
  const token = await signToken(secret, Date.now());
  return json({ ok: true, token, expiresIn: TOKEN_TTL_MS });
}

export async function requireAdmin(context) {
  if (!context.env?.DB) return error('service_unavailable', '관리자 서비스를 사용할 수 없습니다.', 503);
  const secret = context.env.ADMIN_SECRET;
  if (!secret || secret.length < 32) return error('service_unavailable', '관리자 설정이 초기화되지 않았습니다.', 503);
  const authorization = context.request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const session = await verifyToken(token, secret, Date.now());
  if (!session) return error('unauthorized', '관리자 인증이 필요합니다.', 401);
  return null;
}