import { ALLOWED_QUIZ_FACT_IDS, QUIZ_FIRST_DATE } from '../_shared/quiz-facts.js';

const textEncoder = new TextEncoder();
const VISITOR_COOKIE = 'gh_quiz_id';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const ANSWER_RETENTION_DAYS = 90;
const MAX_BODY_BYTES = 2048;
const PUBLIC_SAMPLE_MINIMUM = 30;

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(value))));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) {
    different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return different === 0;
}

function isCalendarDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function latestAcceptedDate(now) {
  return new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function validateAnswerPayload(value, now = new Date()) {
  const quizId = typeof value?.quizId === 'string' ? value.quizId.trim() : '';
  const questionId = typeof value?.questionId === 'string' ? value.questionId.trim() : '';
  const choiceIndex = value?.choiceIndex;
  if (!/^[a-z0-9][a-z0-9-]{4,80}$/.test(quizId)) throw new Error('quizId 형식이 올바르지 않습니다.');
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]{2,80}$/.test(questionId)) throw new Error('questionId 형식이 올바르지 않습니다.');
  const date = questionId.slice(0, 10);
  const factId = questionId.slice(11);
  if (!isCalendarDate(date) || date < QUIZ_FIRST_DATE || date > latestAcceptedDate(now)) {
    throw new Error('questionId 날짜가 발행 범위를 벗어났습니다.');
  }
  if (!ALLOWED_QUIZ_FACT_IDS.has(factId)) throw new Error('questionId가 검증된 문제은행에 없습니다.');
  const matchingQuiz = quizId === `daily-market-${date}`
    || (quizId === 'vix-50-direction-demo' && date === '2026-07-18');
  if (!matchingQuiz) throw new Error('quizId와 questionId 날짜가 일치하지 않습니다.');
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 2) throw new Error('choiceIndex 범위가 올바르지 않습니다.');
  return { quizId, questionId, choiceIndex };
}

export async function createSignedVisitor(secret, visitorId = crypto.randomUUID()) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('쿠키 서명 키가 너무 짧습니다.');
  if (!/^[0-9a-f-]{36}$/i.test(visitorId)) throw new Error('방문자 식별자 형식이 올바르지 않습니다.');
  return `${visitorId}.${await hmac(visitorId, secret)}`;
}

export async function readSignedVisitor(signedValue, secret) {
  if (typeof signedValue !== 'string' || typeof secret !== 'string' || secret.length < 16) return null;
  const separator = signedValue.lastIndexOf('.');
  if (separator < 1) return null;
  const visitorId = signedValue.slice(0, separator);
  const signature = signedValue.slice(separator + 1);
  if (!/^[0-9a-f-]{36}$/i.test(visitorId) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = await hmac(visitorId, secret);
  return constantTimeEqual(signature, expected) ? visitorId : null;
}

function cookieValue(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

function isSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function visitorHash(visitorId, secret) {
  const value = textEncoder.encode(`globalhot-quiz:${visitorId}:${secret}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', value));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.QUIZ_DB || !env.QUIZ_COOKIE_SECRET) {
    return json({ error: 'answer_stats_unavailable' }, 503);
  }

  if (!isSameOrigin(request)) {
    return json({ error: 'cross_origin_rejected' }, 403);
  }
  if ((Number(request.headers.get('Content-Length')) || 0) > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413);
  }

  const contentType = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') return json({ error: 'unsupported_media_type' }, 415);

  let answer;
  try {
    const rawBody = await request.text();
    if (textEncoder.encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'payload_too_large' }, 413);
    }
    answer = validateAnswerPayload(JSON.parse(rawBody));
  } catch (error) {
    return json({ error: 'invalid_answer', message: error.message }, 400);
  }

  try {
    let visitorId = await readSignedVisitor(cookieValue(request, VISITOR_COOKIE), env.QUIZ_COOKIE_SECRET);
    let setCookie = '';
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      const signed = await createSignedVisitor(env.QUIZ_COOKIE_SECRET, visitorId);
      setCookie = `${VISITOR_COOKIE}=${signed}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
    }
    const hashedVisitor = await visitorHash(visitorId, env.QUIZ_COOKIE_SECRET);
    const createdAt = new Date().toISOString();
    const insert = await env.QUIZ_DB.prepare(`
      INSERT INTO quiz_answers (quiz_id, question_id, visitor_hash, choice_index, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (quiz_id, question_id, visitor_hash) DO NOTHING
    `).bind(answer.quizId, answer.questionId, hashedVisitor, answer.choiceIndex, createdAt).run();

    const countsResult = await env.QUIZ_DB.prepare(`
      SELECT choice_index AS choiceIndex, COUNT(*) AS count
      FROM quiz_answers
      WHERE quiz_id = ? AND question_id = ?
      GROUP BY choice_index
      ORDER BY choice_index
    `).bind(answer.quizId, answer.questionId).all();
    const choiceCounts = [0, 0, 0];
    for (const row of countsResult.results || []) {
      if (Number.isInteger(row.choiceIndex) && row.choiceIndex >= 0 && row.choiceIndex < choiceCounts.length) {
        choiceCounts[row.choiceIndex] = Number(row.count) || 0;
      }
    }
    const total = choiceCounts.reduce((sum, count) => sum + count, 0);
    const publicStats = total >= PUBLIC_SAMPLE_MINIMUM;

    const cutoff = new Date(Date.now() - ANSWER_RETENTION_DAYS * 86400000).toISOString();
    const cleanup = env.QUIZ_DB.prepare('DELETE FROM quiz_answers WHERE created_at < ?').bind(cutoff).run();
    if (typeof context.waitUntil === 'function') context.waitUntil(cleanup.catch(() => undefined));

    return json({
      accepted: Number(insert?.meta?.changes || 0) > 0,
      duplicate: Number(insert?.meta?.changes || 0) === 0,
      total,
      public: publicStats,
      choiceCounts: publicStats ? choiceCounts : null,
      minimumPublicSample: PUBLIC_SAMPLE_MINIMUM,
    }, 200, setCookie ? { 'Set-Cookie': setCookie } : {});
  } catch (error) {
    console.error('[quiz-answer] D1 request failed', error);
    return json({ error: 'answer_stats_unavailable' }, 503);
  }
}
