import { requireAdmin } from '../../../_lib/admin.js';
import { error, json } from '../../../_lib/comments.js';

const MODEL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function onRequestPost({ request, env }, modelId) {
  const context = { env, request };
  const denied = await requireAdmin(context);
  if (denied) return denied;

  if (!MODEL_ID.test(String(modelId || ''))) return error('bad_request', '유효하지 않은 모델 ID입니다.', 400);
  let body = {};
  try {
    body = await request.json();
  } catch {
    return error('bad_request', '잘못된 JSON 요청입니다.', 400);
  }

  const action = body.action;
  if (action !== 'hide' && action !== 'restore') {
    return error('bad_request', 'action 은 hide 또는 restore 여야 합니다.', 400);
  }
  const status = action === 'hide' ? 'inactive' : 'active';
  try {
    const result = await env.DB.prepare(
      'UPDATE models SET status = ? WHERE id = ? AND is_demo = 0'
    ).bind(status, modelId).run();
    if (!result.meta?.changes) return error('not_found', '모델을 찾을 수 없습니다.', 404);
    return json({ ok: true, modelId, status });
  } catch {
    return error('internal_error', '모델 상태를 변경하지 못했습니다.', 500);
  }
}

export async function onRequestDelete({ request, env }, modelId) {
  const context = { env, request };
  const denied = await requireAdmin(context);
  if (denied) return denied;

  if (!MODEL_ID.test(String(modelId || ''))) return error('bad_request', '유효하지 않은 모델 ID입니다.', 400);
  try {
    const result = await env.DB.prepare('DELETE FROM models WHERE id = ? AND is_demo = 0').bind(modelId).run();
    if (!result.meta?.changes) return error('not_found', '모델을 찾을 수 없습니다.', 404);
    return json({ ok: true, deleted: modelId });
  } catch {
    return error('internal_error', '모델을 삭제하지 못했습니다.', 500);
  }
}