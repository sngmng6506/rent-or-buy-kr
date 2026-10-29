// POST /api/comments/report { id } → 같은 사람은 한 번만, 3번 쌓이면 숨김
import { json, fail, ipHash } from '../../../lib/comments-lib.js';
import { HIDE_AT } from '../comments.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return fail('NO_DB', '코멘트 저장소가 아직 연결되지 않았어요.', 503);
  let body;
  try { body = await request.json(); } catch { return fail('BODY', '보낸 내용을 읽지 못했어요.'); }
  const id = parseInt(body.id, 10);
  if (!id) return fail('ID', '어떤 코멘트인지 알 수 없어요.');
  const ip = await ipHash(request, env);
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO comment_reports (comment_id, ip_hash) VALUES (?, ?)').bind(id, ip).run();
  if (ins.meta.changes) {
    await env.DB.prepare('UPDATE comments SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ? THEN 1 ELSE hidden END WHERE id = ?').bind(HIDE_AT, id).run();
  }
  return json({ ok: true });
}
