// 코멘트 API 공용 (worker/comments.js에서 import): 응답, 검사, IP 해시
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const fail = (code, message, status = 400) => json({ error: code, message }, status);

// 지역 키: 시군구 코드(5자리) 또는 계산기의 묶음 키(sido:11, cap:수원 등)
export const REGION_RE = /^[0-9A-Za-z:가-힣·\s-]{1,40}$/u;

// 광고·연락처 막기: 주소, 도메인, 전화번호, 카톡 아이디 유도
const LINK_RE = /(https?:\/\/|www\.|\.(com|net|kr|co|io|me|ly|xyz|shop|site)\b|open\.kakao|카톡\s*[:：]|오픈채팅|텔레그램|t\.me\/)/i;
const PHONE_RE = /(0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})|(1[5-8]\d{2}[-.\s]?\d{4})/;   // 010-…, 02-…, 1588-…
// 금칙어: 너무 넓게 잡으면 정상 글도 막히니 확실한 것만 (필요하면 추가)
const BANNED = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '개새', '좆', '존나', '꺼져', '분양문의', '대출문의', '상담문의', '수익보장', '리딩방'];

export function checkText(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return { error: 'EMPTY', message: '내용을 적어주세요.' };
  if ([...text].length > 100) return { error: 'TOO_LONG', message: '100자까지 쓸 수 있어요.' };
  if (LINK_RE.test(text)) return { error: 'LINK', message: '주소나 연락처는 남길 수 없어요.' };
  if (PHONE_RE.test(text.replace(/[0-9]+억|[0-9,]+만|[0-9]+평|[0-9]+년|[0-9]+%/g, ''))) return { error: 'PHONE', message: '전화번호는 남길 수 없어요.' };
  const flat = text.replace(/\s/g, '');
  if (BANNED.some(w => flat.includes(w))) return { error: 'BANNED', message: '쓸 수 없는 말이 들어 있어요.' };
  return { text };
}

export function checkTag(raw) {
  if (raw == null || raw === '') return null;
  const tag = String(raw).replace(/\s+/g, ' ').trim();
  return [...tag].length <= 40 && /^[0-9A-Za-z가-힣㎡·\s.,()%-]+$/u.test(tag) ? tag : null;
}

export async function ipHash(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  const salt = env.HASH_SALT || 'yeongkkeul';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ip));
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const isAdmin = (request, env) => !!env.ADMIN_KEY && request.headers.get('x-admin-key') === env.ADMIN_KEY;
