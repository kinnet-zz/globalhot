import { requireAdmin } from '../../../_lib/admin.js';
import { error, json } from '../../../_lib/comments.js';

const LIST_LIMIT = 200;

export async function onRequestGet({ request, env }) {
  const context = { env, request };
  const denied = await requireAdmin(context);
  if (denied) return denied;

  const url = new URL(request.url);
  const modelId = (url.searchParams.get('modelId') || '').trim();
  const query = (url.searchParams.get('q') || '').trim();

  let sql = 'SELECT c.id, c.model_id AS modelId, c.author_name AS authorName, c.content, c.created_at AS createdAt FROM model_comments c';
  const conditions = [];
  const params = [];
  if (modelId) {
    conditions.push('c.model_id = ?');
    params.push(modelId);
  }
  if (query) {
    conditions.push('(c.content LIKE ? OR c.author_name LIKE ?)');
    params.push(`%${query}%`, `%${query}%`);
  }
  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
  sql += ' ORDER BY c.id DESC LIMIT ?';
  params.push(LIST_LIMIT);

  try {
    const rows = await env.DB.prepare(sql).bind(...params).all();
    const comments = (rows.results || []).map((row) => ({
      id: row.id,
      modelId: row.modelId,
      authorName: row.authorName,
      content: row.content,
      createdAt: row.createdAt,
    }));
    return json({ ok: true, comments });
  } catch {
    return error('internal_error', '댓글 목록을 불러오지 못했습니다.', 500);
  }
}