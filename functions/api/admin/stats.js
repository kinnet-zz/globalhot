import { requireAdmin } from '../../_lib/admin.js';
import { error, json } from '../../_lib/comments.js';

export async function onRequestGet({ request, env }) {
  const context = { env, request };
  const denied = await requireAdmin(context);
  if (denied) return denied;

  try {
    const counts = await env.DB.prepare(
      `SELECT m.id AS modelId, m.display_name AS displayName, m.status AS status,
              (SELECT COUNT(*) FROM model_comments c WHERE c.model_id = m.id) AS commentCount
       FROM models m
       WHERE m.is_demo = 0
       ORDER BY commentCount DESC, m.display_name ASC
       LIMIT 500`
    ).all();
    const models = (counts.results || []).map((row) => ({
      modelId: row.modelId,
      displayName: row.displayName,
      status: row.status,
      commentCount: Number(row.commentCount),
    }));
    const total = await env.DB.prepare('SELECT COUNT(*) AS count FROM model_comments').first();
    return json({ ok: true, models, totalComments: Number(total?.count || 0) });
  } catch {
    return error('internal_error', '통계를 불러오지 못했습니다.', 500);
  }
}