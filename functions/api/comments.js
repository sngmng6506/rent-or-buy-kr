// GET  /api/comments?region=11350&limit=10&before=123  → { count, items: [{ id, text, tag, created }] }
// POST /api/comments  { region, text, tag }            → { item }
// 저장소: D1 (바인딩 이름 DB). 1분에 1개, 신고 3번이면 숨김
import { json, fail, REGION_RE, checkText, checkTag, ipHash } from '../../lib/comments-lib.js';

const RATE_SECONDS = 60;
const HIDE_AT = 3;

export async function onRequestGet({ request, env }) {
  if (!env.DB) return fail('NO_DB', '코멘트 저장소가 아직 연결되지 않았어요.', 503);
  const url = new URL(request.url);
  const region = url.searchParams.get('region') || '';
  if (!REGION_RE.test(region)) return fail('REGION', '지역이 올바르지 않아요.');
  const limit = Math.min(30, Math.max(0, parseInt(url.searchParams.get('limit') ?? '10', 10) || 0));
  const before = parseInt(url.searchParams.get('before') || '0', 10) || 0;
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE region = ? AND hidden = 0').bind(region).first('n');
  let items = [];
  if (limit > 0) {
    const q = before
      ? env.DB.prepare('SELECT id, text, tag, created_at FROM comments WHERE region = ? AND hidden = 0 AND id < ? ORDER BY id DESC LIMIT ?').bind(region, before, limit)
      : env.DB.prepare('SELECT id, text, tag, created_at FROM comments WHERE region = ? AND hidden = 0 ORDER BY id DESC LIMIT ?').bind(region, limit);
    items = (await q.all()).results.map(r => ({ id: r.id, text: r.text, tag: r.tag, created: r.created_at }));
  }
  return json({ count, items });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return fail('NO_DB', '코멘트 저장소가 아직 연결되지 않았어요.', 503);
  let body;
  try { body = await request.json(); } catch { return fail('BODY', '보낸 내용을 읽지 못했어요.'); }
  const region = String(body.region || '');
  if (!REGION_RE.test(region)) return fail('REGION', '지역이 올바르지 않아요.');
  const c = checkText(body.text);
  if (c.error) return fail(c.error, c.message);
  const tag = checkTag(body.tag);
  const ip = await ipHash(request, env);
  const now = Math.floor(Date.now() / 1000);
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?').bind(ip, now - RATE_SECONDS).first('n');
  if (recent > 0) return fail('RATE', '1분에 한 번만 남길 수 있어요. 잠시 뒤에 다시 써주세요.', 429);
  const r = await env.DB.prepare('INSERT INTO comments (region, text, tag, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(region, c.text, tag, ip, now).run();
  return json({ item: { id: r.meta.last_row_id, text: c.text, tag, created: now } }, 201);
}

export { HIDE_AT };
