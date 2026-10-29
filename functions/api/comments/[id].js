// DELETE /api/comments/123  (헤더 x-admin-key: ADMIN_KEY) → 운영자 삭제
import { json, fail, isAdmin } from '../../../lib/comments-lib.js';

export async function onRequestDelete({ request, env, params }) {
  if (!env.DB) return fail('NO_DB', '코멘트 저장소가 아직 연결되지 않았어요.', 503);
  if (!isAdmin(request, env)) return fail('ADMIN', '삭제 권한이 없어요.', 403);
  const id = parseInt(params.id, 10);
  if (!id) return fail('ID', '어떤 코멘트인지 알 수 없어요.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM comment_reports WHERE comment_id = ?').bind(id),
    env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}
