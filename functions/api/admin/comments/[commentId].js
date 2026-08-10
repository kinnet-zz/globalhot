import { requireAdmin } from '../../../_lib/admin.js';
import { error, json } from '../../../_lib/comments.js';

export async function onRequestDelete({ request, env }, commentId) {
  const context = { env, request };
  const denied = await requireAdmin(context);
  if (denied) return denied;

  const id = Number(commentId);
  if (!Number.isInteger(id) || id <= 0) return error('bad_request', '유효하지 않은 댓글 ID입니다.', 400);
  try {
    const result = await env.DB.prepare('DELETE FROM model_comments WHERE id = ?').bind(id).run();
    if (!result.meta?.changes) return error('not_found', '댓글을 찾을 수 없습니다.', 404);
    return json({ ok: true, deleted: id });
  } catch {
    return error('internal_error', '댓글을 삭제하지 못했습니다.', 500);
  }
}