import { adminLogin } from '../../_lib/admin.js';
import { error } from '../../_lib/comments.js';

export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return error('bad_request', '잘못된 JSON 요청입니다.', 400);
  }
  const password = typeof body.password === 'string' ? body.password : '';
  return adminLogin({ env, request }, password);
}