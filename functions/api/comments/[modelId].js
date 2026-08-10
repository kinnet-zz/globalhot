import { listComments, postComment } from '../../_lib/comments.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const modelId = parts[parts.length - 1] || '';
  return listComments({ env, request }, modelId);
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const modelId = parts[parts.length - 1] || '';
  let body = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: { code: 'bad_request', message: '잘못된 JSON 요청입니다.' } }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' },
    });
  }
  return postComment({ env, request }, modelId, body);
}