// 언어: <html lang="en">이면 영어판 (site/en/). 문구는 L(한국어, 영어)로 같이 적음
const EN = document.documentElement.lang === 'en';
const L = (ko, en) => EN ? en : ko;
const place = k => EN && typeof RR !== 'undefined' ? RR.place(k) : k;   // 지역 이름 로마자 (romanize.js, 영어판에서만 불러옴)
// 지도 탭: [id, 이름]. 폰에서는 드롭다운
const TABS = L([['seoul', '서울'], ['cap', '경기 · 인천'], ['m26', '부산'], ['m27', '대구'], ['m30', '대전 · 세종'], ['m29', '광주'], ['m31', '울산'], ['nat', '전국']],
  [['seoul', 'Seoul'], ['cap', 'Gyeonggi'], ['m26', 'Busan'], ['m27', 'Daegu'], ['m30', 'Daejeon'], ['m29', 'Gwangju'], ['m31', 'Ulsan'], ['nat', 'All Korea']]);
const METRO_OF = { '26': 'm26', '27': 'm27', '30': 'm30', '36': 'm30', '29': 'm29', '31': 'm31' };

// ── 상수 ───────────────────────────────────────────────
const SIDO = { '12':'전남광주', '11':'서울','26':'부산','27':'대구','28':'인천','29':'광주','30':'대전','31':'울산','36':'세종','41':'경기',
  '42':'강원','51':'강원','43':'충북','44':'충남','45':'전북','52':'전북','46':'전남','47':'경북','48':'경남','50':'제주' };
// 주택 유형: [id, 이름, 시세 파일, 지수 파일]. 크기 구간·평 표기는 시세 파일에 들어 있음
const TYPES = [['apt', L('아파트', 'Apartment'), 'regions.json', 'index.json'], ['villa', L('빌라', 'Villa'), 'regions-villa.json', 'index-villa.json'], ['offi', L('오피스텔', 'Officetel'), 'regions-offi.json', 'index-offi.json']];
const TYPE_DATA = {};      // id → { data, idx } (받아둔 것)
const TYPE_OK = { apt: true };   // 시세 파일이 있는 유형만 고를 수 있음
// 아파트는 공급면적 '평형', 빌라·오피스텔은 전용면적 '평'
let SIZE_KEYS = ['39', '49', '59', '74', '84', '101', '114'];
let PYEONG = { '39': 16, '49': 20, '59': 25, '74': 30, '84': 34, '101': 40, '114': 45 };
let PY_WORD = '평형', MAIN_SIZE = '84';
const sizeText = k => L(`${k}㎡(${PYEONG[k]}${PY_WORD})`, `${k}㎡ (${PYEONG[k]} pyeong)`);
const MIN_DEALS = 3;          // 이보다 거래가 적은 크기는 고를 수 없음
const FALLBACK_GROW = 2.0;    // 상승률 데이터가 없을 때 (임시)
const FALLBACK_RATIO = 60;    // 전세가율 데이터가 없을 때 (임시)
const RATES = { mort: 4.2, jloan: 4.0, deposit: 3.0 };   // 임시값. rates.json(한국은행 ECOS)이 있으면 그 값으로 바뀜
let RATES_INFO = null;
// 한국부동산원 월간 아파트 지수 (data/index.json). 있으면 상승률은 이걸 우선 씀
let IDX = null;
let whyOpen = false;   // 결론 옆 '?' 펼침 상태
// 기본 상승률: 지수가 시작된 달(대부분 2003년 11월)부터 지금까지 연평균.
// 오르고 내린 시기를 여러 번 포함해서, 몇 년 전과 비교하느냐에 덜 흔들림
const GROW_BASIS = ['gall', 'g20', 'g15', 'g10', 'g5'];
const BASIS_LABEL = L({ gall: '장기 평균', g20: '20년 평균', g15: '15년 평균', g10: '10년 평균', g5: '5년 평균' },
  { gall: 'long-run average', g20: '20-year average', g15: '15-year average', g10: '10-year average', g5: '5-year average' });
const basisOf = g => { if (!g) return null; for (const k of GROW_BASIS) if (g[k] != null) return k; return null; };
const RENT_FALLBACK = { conv: 4.5, wdep: 20, jgrow: 2.5 };   // 지역·시도 데이터가 없을 때만 (임시)
const YEARS = [2, 4, 6, 10];
const ASSUME = EN ? [
  { key: 'grow',    label: 'Home prices rise per year' },
  { key: 'ratio',   label: 'Jeonse deposit (% of price)' },
  { key: 'jgrow',   label: 'Jeonse & rent rise per year' },
  { key: 'mort',    label: 'Mortgage rate' },
  { key: 'jloan',   label: 'Jeonse loan rate' },
  { key: 'deposit', label: 'Savings rate' },
  { key: 'wdep',    label: 'Rent deposit (% of jeonse)' },
  { key: 'conv',    label: 'Jeonse-to-rent rate (per year)' },
] : [
  { key: 'grow',    label: '집값이 1년에 오르는 비율' },
  { key: 'ratio',   label: '전세금 (집값의 몇 %)' },
  { key: 'jgrow',   label: '전세금·월세가 1년에 오르는 비율' },
  { key: 'mort',    label: '집 살 때 대출 금리' },
  { key: 'jloan',   label: '전세 대출 금리' },
  { key: 'deposit', label: '예금 금리' },
  { key: 'wdep',    label: '월세 보증금 (전세금의 몇 %)' },
  { key: 'conv',    label: '월세 환산 기준 (만 원)', unit: '만 원', to: v => Math.round(v / 12 * 100 * 10) / 10, from: v => v * 12 / 100 },
];
// 동네 이름으로도 찾게 (법정동 코드 기준)
const ALIAS = {
  '41135': '판교 정자 서현 분당', '41597': '동탄', '41590': '동탄', '41285': '일산', '41287': '일산', '41173': '평촌',
  '41117': '광교', '41410': '산본', '28185': '송도', '28275': '청라', '28290': '검단', '28260': '청라 검단',
  '28155': '영종', '28125': '제물포', '28110': '영종', '41450': '미사 위례', '41570': '한강신도시', '41480': '운정',
  '26350': '센텀', '27260': '수성', '30200': '둔산 도안',
};
// 2018년 지도 경계 ↔ 지금 구 코드 (새 코드가 없으면 옛 코드)
const INCHEON_MAP = {
  '중구': [['28155', '28125'], ['28110']], '동구': [['28125'], ['28140']], '서구': [['28275', '28290'], ['28260']],
  '남구': [['28177'], ['28177']],
};

// ── 지역 데이터 ─────────────────────────────────────────
let DATA = null;
const REG = {};

function normalize(raw) {
  const sizes = raw.sizes || (raw.p84 ? { '84': { p: raw.p84, n: raw.n84, j: raw.j84, nj: raw.nj84 } } : {});
  return { sizes, avg: raw.avg, cnt: raw.cnt || 0, g5: raw.g5, g10: raw.g10, n84: raw.n84 || 0,
    conv: raw.conv ?? null, wdep: raw.wdep ?? null, nconv: raw.nconv || 0, jg5: raw.jg5 ?? null, jg10: raw.jg10 ?? null };
}
// 여러 지역을 합칠 때: 건수로 가중 평균 (중간값의 근사)
function combine(list) {
  const out = { sizes: {}, avg: null, cnt: 0, g5: null, g10: null, n84: 0, conv: null, wdep: null, nconv: 0, jg5: null, jg10: null };
  const wavg = (pairs) => { const w = pairs.reduce((s, [, n]) => s + n, 0); return w ? pairs.reduce((s, [v, n]) => s + v * n, 0) / w : null; };
  for (const k of SIZE_KEYS) {
    const ps = list.filter(r => r.sizes[k]?.p).map(r => [r.sizes[k].p, r.sizes[k].n]);
    const js = list.filter(r => r.sizes[k]?.j).map(r => [r.sizes[k].j, r.sizes[k].nj]);
    const n = ps.reduce((s, x) => s + x[1], 0), nj = js.reduce((s, x) => s + x[1], 0);
    if (n || nj) out.sizes[k] = { p: wavg(ps), n, j: wavg(js), nj };
  }
  out.avg = wavg(list.filter(r => r.avg).map(r => [r.avg, r.cnt]));
  out.cnt = list.reduce((s, r) => s + r.cnt, 0);
  out.n84 = list.reduce((s, r) => s + r.n84, 0);
  out.g5 = wavg(list.filter(r => r.g5 != null).map(r => [r.g5, Math.max(r.n84, 1)]));
  out.g10 = wavg(list.filter(r => r.g10 != null).map(r => [r.g10, Math.max(r.n84, 1)]));
  out.conv = wavg(list.filter(r => r.conv != null).map(r => [r.conv, Math.max(r.nconv, 1)]));
  out.wdep = wavg(list.filter(r => r.wdep != null).map(r => [r.wdep, Math.max(r.nconv, 1)]));
  out.nconv = list.reduce((s, r) => s + (r.nconv || 0), 0);
  out.jg5 = wavg(list.filter(r => r.jg5 != null).map(r => [r.jg5, Math.max(r.n84, 1)]));
  out.jg10 = wavg(list.filter(r => r.jg10 != null).map(r => [r.jg10, Math.max(r.n84, 1)]));
  // 지수: 묶인 지역들의 같은 기간 값을 거래 건수로 가중 평균
  const withIdx = list.filter(r => r.idx?.sale);
  if (withIdx.length) {
    const mix = part => {
      const g = {};
      for (const k of ['g5', 'g10', 'g15', 'g20', 'gall']) {
        const v = wavg(withIdx.filter(r => r.idx[part]?.[k] != null).map(r => [r.idx[part][k], Math.max(r.cnt, 1)]));
        if (v != null) g[k] = Math.round(v * 100) / 100;
      }
      return Object.keys(g).length ? g : null;
    };
    out.idx = { level: 'mix', label: null, sale: mix('sale'), jeonse: mix('jeonse') };
  }
  return out;
}
const norm = t => t.replace(/[\s-]+/g, '').toLowerCase();
const sidoName = sc => place(SIDO[sc] || '');
const allOf = n => L(`${n} 전체`, `All of ${n}`);
const shortName = full => full.replace(/^\S+\s/, '');   // "서울특별시 노원구" → "노원구"

function buildRegions(data) {
  const raw = data.regions;
  const bySido = {};
  for (const [code, r] of Object.entries(raw)) {
    if (!r.cnt && !(r.sizes && Object.keys(r.sizes).length)) continue;
    const sc = code.slice(0, 2), name = shortName(r.name);
    const e = { key: 'c:' + code, code, sido: sc, name: `${SIDO[sc] || ''} ${name}`.trim(), short: name, alias: ALIAS[code] || '', ...normalize(r), idx: IDX?.regions?.[code] || null };
    REG[e.key] = e;
    (bySido[sc] ||= []).push(e);
  }
  // 시도 전체
  for (const [sc, list] of Object.entries(bySido)) {
    REG['sido:' + sc] = { key: 'sido:' + sc, sido: sc, name: allOf(sidoName(sc)), short: sidoName(sc), whole: true, ...combine(list), idx: IDX?.regions?.['sido:' + sc] || null };
  }
  // 서울 지도: 구 = 코드 하나
  for (const gu of Object.keys(MAPS.seoul.gu)) {
    const name = gu.split(':')[1];
    const e = Object.values(REG).find(x => x.sido === '11' && x.short === name);
    if (e) { REG[gu] = e; e.mapKey = gu; }
  }
  // 전국 지도: 2018년 시군구 경계 ↔ 시도 + 이름
  const natKeys = new Set([...Object.keys(MAPS.nat.gu), ...Object.values(MAPS.metro).flatMap(m => Object.keys(m.gu))]);
  for (const key of natKeys) {
    if (!key.startsWith('nat:')) continue;
    const [, sc, nm] = key.split(':');
    // 2026년 7월 광주·전남 통합: 옛 경계(29, 46)를 통합특별시(12) 지역으로 찾음
    const pool = (sc === '29' || sc === '46') ? [...(bySido['12'] || []), ...(bySido[sc] || [])] : (bySido[sc] || []);
    const e = pool.find(x => norm(x.short) === nm) || (sc === '36' ? pool[0] : null);   // 세종시 ↔ 세종특별자치시
    if (e) { REG[key] = e; e.mapKey = key; }
  }
  // 전국 지도의 광역시 덩어리: 그 도시의 구 전체
  for (const key of Object.keys(MAPS.nat.gu)) {
    if (!key.startsWith('metro:')) continue;
    const sc = key.split(':')[1];
    const list = [...new Set(Object.keys(MAPS.metro[sc === '30' ? '30' : sc].gu)
      .filter(k => k.split(':')[1] === sc).map(k => REG[k]).filter(Boolean))];
    if (!list.length) continue;
    REG[key] = { key, sido: list[0].sido, name: allOf(sidoName(sc)), short: sidoName(sc), mapKey: key, whole: true, metroTab: 'm' + sc, ...combine(list) };
  }
  // 경기 지도: 시 = 그 시의 구 전체
  for (const key of Object.keys(MAPS.cap.gu)) {
    if (!key.startsWith('gyeonggi:')) continue;
    const city = key.split(':')[1];
    const list = (bySido['41'] || []).filter(x => x.short === city || x.short.startsWith(city + ' '));
    if (!list.length) continue;
    if (list.length === 1) { REG[key] = list[0]; list[0].mapKey = key; continue; }
    REG[key] = { key, sido: '41', name: L(`경기 ${city} 전체`, `All of ${place(city)}`), short: EN ? place(city).replace(/-(si|gun)$/, '') : city.replace(/(시|군)$/, ''), mapKey: key, whole: true, ...combine(list) };
    list.forEach(x => { x.parentMap = key; });
  }
  // 인천 지도: 2018년 경계에 지금 구를 맞춤
  for (const key of Object.keys(MAPS.cap.gu)) {
    if (!key.startsWith('incheon:')) continue;
    const old = key.split(':')[1];
    const [now, before] = INCHEON_MAP[old] || [[], []];
    let list = now.map(c => REG['c:' + c]).filter(Boolean);
    if (!list.length) list = before.map(c => REG['c:' + c]).filter(Boolean);
    if (!list.length) list = (bySido['28'] || []).filter(x => x.short === old);
    if (!list.length) continue;
    const label = list.map(x => place(x.short)).join('·');
    REG[key] = list.length === 1 ? list[0] : { key, sido: '28', name: L(`인천 ${label}`, `Incheon ${label}`), short: label, whole: true, ...combine(list) };
    REG[key].mapKey = key;
    list.forEach(x => { if (x !== REG[key]) x.parentMap ||= key; });
  }
  // 영어판: 이름 짝 맞추기가 끝난 뒤 보이는 이름만 로마자로 (검색은 한글 이름으로도 되게 ko에 남김)
  if (EN) for (const e of new Set(Object.values(REG))) {
    if (e.whole || e.ko) continue;
    e.ko = e.name; e.name = place(e.name); e.short = place(e.short);
  }
}

// 이 지역에서 고를 수 있는 크기와 값
const sizeOk = (r, k) => (r.sizes[k]?.n || 0) >= MIN_DEALS;
function defaultSize(r, want) {
  if (want && sizeOk(r, want)) return want;
  if (sizeOk(r, MAIN_SIZE)) return MAIN_SIZE;
  const best = SIZE_KEYS.filter(k => sizeOk(r, k)).sort((a, b) => r.sizes[b].n - r.sizes[a].n)[0];
  return best || null;
}
function growthOf(r) {
  // 1순위: 부동산원 지수 (같은 표본 아파트를 따라가서 단지 구성에 덜 흔들림)
  const ix = r.idx?.sale ? r.idx : (REG['sido:' + r.sido]?.idx?.sale ? REG['sido:' + r.sido].idx : null);
  if (ix) {
    const k = basisOf(ix.sale);
    // 지수 이름표(ix.label)는 한글: '노원구', '전남 전체', '전국'
    const lbl = ix.label ? (EN ? (/ 전체$/.test(ix.label) ? allOf(place(ix.label.replace(/ 전체$/, ''))) : ix.label === '전국' ? 'all of Korea' : place(ix.label)) : ix.label) : null;
    const who = ix !== r.idx ? allOf(sidoName(r.sido)) : ix.level === 'own' ? r.short : (lbl || allOf(sidoName(r.sido)));
    return { g: ix.sale[k], g5: ix.sale.g5 ?? null, g10: ix.sale.g10 ?? null, basis: k, label: who, src: 'idx', from: ix.sale.from };
  }
  // 2순위: 실거래 중간값 비교 (지수가 없는 지역). 지역 표본이 적으면 시도 전체 값
  const sido = REG['sido:' + r.sido];
  const own = !r.whole && r.n84 >= 10;
  const g10 = own && r.g10 != null ? r.g10 : (r.whole && r.g10 != null ? r.g10 : sido?.g10);
  const g5 = own && r.g5 != null ? r.g5 : (r.whole && r.g5 != null ? r.g5 : sido?.g5);
  const label = (own || r.whole) && r.g10 != null ? r.short : allOf(sidoName(r.sido));
  return { g: g10 ?? null, g5: g5 ?? null, g10: g10 ?? null, basis: 'g10', label, src: 'deal' };
}
function jeonseGrowth(r) {
  const ix = r.idx?.jeonse ? r.idx : REG['sido:' + r.sido]?.idx;
  const g = ix?.jeonse; const k = basisOf(g);
  return k ? g[k] : null;
}
// 전월세 조건: 지역 → 시도 전체 → 임시값 순으로
function rentTermsOf(r) {
  const sido = REG['sido:' + r.sido] || {};
  const pick = (own, ok, sv, fb) => (ok && own != null) ? own : (sv ?? fb);
  const enough = (r.nconv || 0) >= 10;
  // 전환율이 연 2~10%를 벗어나면 표본이 이상하다고 보고 시도 값을 씀 (작은 시군 몇 곳)
  const convOk = enough && r.conv >= 2 && r.conv <= 10;
  return {
    conv: Math.round(pick(r.conv, convOk, sido.conv, RENT_FALLBACK.conv) * 100) / 100,
    wdep: Math.round(pick(r.wdep, enough, sido.wdep, RENT_FALLBACK.wdep / 100) * 1000) / 10,
    jgrow: Math.round((jeonseGrowth(r) ?? pick(r.jg10, r.n84 >= 10, sido.jg10, RENT_FALLBACK.jgrow)) * 10) / 10,
  };
}
function ratioOf(r, k) {
  const s = r.sizes[k];
  if (s && s.p && s.j && s.n >= MIN_DEALS && s.nj >= MIN_DEALS) return Math.round(s.j / s.p * 1000) / 10;
  const sido = REG['sido:' + r.sido]?.sizes[k];
  if (sido && sido.p && sido.j) return Math.round(sido.j / sido.p * 1000) / 10;
  return FALLBACK_RATIO;
}
const priceAt = (r, k) => (k && r.sizes[k]?.p) ? r.sizes[k].p : null;   // 만원

// ── 상태 ───────────────────────────────────────────────
const state = { type: 'apt', region: null, size: '84', price: 8, cash: 3, years: 6, manual: false, noLoan: false, p: { ...RATES, ...RENT_FALLBACK, grow: FALLBACK_GROW, ratio: FALLBACK_RATIO } };

function applyRegion(key, keepSize) {
  const r = REG[key]; if (!r) return;
  state.region = key;
  state.size = defaultSize(r, keepSize ? state.size : MAIN_SIZE);
  const gr = growthOf(r);
  state.p = { kind: state.type, noLoan: state.noLoan, ...RATES, ...rentTermsOf(r), grow: gr.g ?? FALLBACK_GROW, ratio: ratioOf(r, state.size) };
  const pr = priceAt(r, state.size);
  if (pr) { state.price = Math.round(pr / 1000) / 10; state.manual = false; } else state.manual = true;
}

// ── 표시 도우미 ─────────────────────────────────────────
// 영어판 금액: ₩312.4M, ₩3.12B (10만 원 = 0.1M 단위)
function wonEn(v, short) {
  const a = Math.abs(v), s = v < 0 ? '−' : short ? '+' : '';
  if (a >= 1e9) return `${s}₩${(Math.round(a / 1e7) / 100).toLocaleString('en-US')}B`;
  if (a >= 1e6) return `${s}₩${(Math.round(a / 1e5) / 10).toLocaleString('en-US')}M`;
  return `${s}₩${Math.round(a / 1e3).toLocaleString('en-US')}k`;
}
function won(v) {
  if (EN) return wonEn(v);
  const neg = v < 0; v = Math.abs(v);
  const eok = Math.floor(v / EOK), man = Math.round((v % EOK) / 1e5) * 10;   // 10만 원 단위 (막대끼리 빼면 판정 금액과 맞게)
  let s;
  if (eok > 0) s = man >= 10000 ? `${eok + 1}억` : man > 0 ? `${eok}억 ${man.toLocaleString('ko-KR')}만` : `${eok}억`;
  else s = `${(Math.round(v / 1e5) * 10).toLocaleString('ko-KR')}만`;
  return (neg ? '−' : '') + s + ' 원';
}
function wonShort(v) {                     // 돈 흐름 줄용: 2.1억, 4,300만
  if (EN) return wonEn(v, true);
  const a = Math.abs(v), sign = v < 0 ? '−' : '+';
  const man = Math.round(a / 1e5) * 10;     // 10만 원 단위
  if (a >= EOK || man >= 10000) return `${sign}${(Math.round(a / EOK * 10) / 10).toLocaleString('ko-KR')}억`;
  return `${sign}${man.toLocaleString('ko-KR')}만`;
}
const pct = v => (Math.round(v * 10) / 10).toFixed(1) + '%';
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const SUBJ = { buy: '매매가', jeonse: '전세가', wolse: '월세가' };
const OBJ = L({ buy: '매매', jeonse: '전세', wolse: '월세' }, { buy: 'buying', jeonse: 'jeonse', wolse: 'monthly rent' });
const SEAL = L({ buy: '매매', jeonse: '전세', wolse: '월세' }, { buy: 'BUY', jeonse: 'JEONSE', wolse: 'RENT' });
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);

function chips(el, items, cur, onPick, disabled = () => false) {
  el.innerHTML = '';
  for (const [val, label, title] of items) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = label;
    if (title) b.title = title;
    b.setAttribute('aria-pressed', String(val === cur));
    if (disabled(val)) { b.disabled = true; b.title = L('최근 거래가 적어서 고를 수 없어요', 'Too few recent deals for this size'); }
    b.addEventListener('click', () => onPick(val));
    el.appendChild(b);
  }
}

function buildAssume() {
  const box = $('assume'); box.innerHTML = '';
  for (const a of ASSUME) {
    const field = document.createElement('div'); field.className = 'assume-field';
    const l = document.createElement('label'); l.htmlFor = 'a-' + a.key;
    const t = document.createElement('span'); t.textContent = a.label; l.appendChild(t);
    const i = document.createElement('input');
    // 대부분은 %, 월세는 '전세금−월세 보증금 1억 원당 월 만 원'으로 보여주고 내부에서는 연 %로 바꿈
    i.type = 'number'; i.step = '0.1'; i.id = 'a-' + a.key; i.value = a.to ? a.to(state.p[a.key]) : state.p[a.key];
    i.setAttribute('aria-label', a.label + (a.unit ? '' : ' (%)'));
    i.addEventListener('input', () => { const v = parseFloat(i.value); if (!isNaN(v)) { state.p[a.key] = a.from ? a.from(v) : v; render(); } });
    l.appendChild(i); field.appendChild(l);
    if (a.key !== 'grow') {
      const help = document.createElement('p'); help.className = 'assume-help'; help.id = 'a-help-' + a.key;
      i.setAttribute('aria-describedby', help.id); field.appendChild(help);
    }
    box.appendChild(field);
  }
}

// ── 지도 ───────────────────────────────────────────────
function tintFor(r) {
  const prices = Object.values(REG).filter(x => x.mapKey).map(x => priceAt(x, state.size) || x.avg).filter(Boolean);
  const lo = Math.log(Math.min(...prices)), hi = Math.log(Math.max(...prices));
  const v = priceAt(r, state.size) || r.avg;
  return v ? (10 + 75 * (Math.log(v) - lo) / Math.max(hi - lo, 1e-6)).toFixed(0) + '%' : '0%';
}
function buildMap(svgId, data) {
  const svg = $(svgId);
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${data.W} ${data.H}`);
  for (const [key, g] of Object.entries(data.gu)) {
    const grp = document.createElementNS(NS, 'g');
    const path = document.createElementNS(NS, 'path'); path.setAttribute('d', g.d);
    const tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', g.cx); tx.setAttribute('y', g.cy + 3.5);
    if (key === 'seoul' || key === 'capital') {
      grp.setAttribute('class', 'seoul-block'); tx.textContent = key === 'seoul' ? L('서울', 'Seoul') : L('수도권', 'Capital area');
      if (key === 'capital') {
        grp.style.cursor = 'pointer'; grp.setAttribute('role', 'button'); grp.setAttribute('tabindex', '0');
        grp.setAttribute('aria-label', L('수도권 지도로 가기', 'Go to the capital area map'));
        const goCapital = () => showTab('cap');
        grp.addEventListener('click', goCapital);
        grp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goCapital(); } });
      }
      grp.append(path, tx); svg.appendChild(grp); continue;
    }
    const r = REG[key];
    grp.dataset.key = key;
    if (!r) {
      grp.setAttribute('class', 'rg off');
      const raw = key.split(':').pop().replace(/^.+시(?=.+구$)/, '');
      tx.textContent = EN ? place(raw).replace(/-(si|gun|gu)$/, '') : raw.replace(/(시|군|구)$/, '');
      grp.append(path, tx); svg.appendChild(grp); continue;
    }
    grp.setAttribute('class', 'rg'); grp.setAttribute('tabindex', '0'); grp.setAttribute('role', 'button');
    tx.textContent = EN ? r.short.replace(/-(si|gun|gu)$/, '').replace(/^.+-si /, '') : r.short.length <= 2 ? r.short : r.short.replace(/(시|군|구)$/, '');
    const title = document.createElementNS(NS, 'title'); grp.appendChild(title);
    grp.append(path, tx);
    const go = () => r.metroTab ? showTab(r.metroTab) : pickRegion(key);   // 광역시 덩어리는 그 도시 지도로
    grp.addEventListener('click', go);
    grp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    svg.appendChild(grp);
  }
}
function measureLabels(svg) {
  if (svg.dataset.measured) return;
  // 지도가 작게 그려지는 폰에서도 이름이 10px 넘게 보이도록 글자 크기를 맞춤
  const w = svg.getBoundingClientRect().width, vb = svg.viewBox.baseVal?.width;
  if (w && vb) svg.style.setProperty('--fs', Math.max(10, Math.min(20, 10.5 * vb / w)).toFixed(1) + 'px');
  for (const grp of svg.querySelectorAll('.rg')) {
    try {
      const b = grp.querySelector('path').getBBox(), w = grp.querySelector('text').getComputedTextLength();
      if (!b.width) return;
      grp.dataset.small = String(b.width < w + (svg.id === 'map-nat' ? 20 : 6) || b.height < (svg.id === 'map-nat' ? 28 : 14));
    } catch (e) { return; }
  }
  svg.dataset.measured = '1';
}
let tab = 'seoul', metroShown = null;
function showTab(t) {
  tab = t;
  const isMetro = t.startsWith('m');
  $('box-seoul').hidden = t !== 'seoul';
  $('box-cap').hidden = t !== 'cap';
  $('box-nat').hidden = t !== 'nat';
  $('box-metro').hidden = !isMetro;
  if (isMetro && metroShown !== t && DATA) {
    const m = MAPS.metro[t.slice(1)];
    buildMap('map-metro', m);
    $('map-metro').dataset.measured = '';
    $('map-metro').style.maxWidth = Math.min(700, Math.round(560 * m.W / m.H)) + 'px';   // 세로로 긴 도시는 폭을 줄임
    metroShown = t;
  }
  requestAnimationFrame(() => { measureLabels($(isMetro ? 'map-metro' : 'map-' + t)); paintMaps(); });
  chips($('tabs'), TABS, t, showTab);
  const sel = $('tab-select');
  if (!sel.options.length) {
    for (const [id, name] of TABS) sel.add(new Option(name, id));
    sel.addEventListener('change', () => showTab(sel.value));
  }
  sel.value = t;
}
const mapKeyOf = key => { const r = REG[key]; return r ? (r.mapKey || r.parentMap || null) : null; };
function tabOf(key) {
  const r = REG[key]; if (!r) return null;
  const mk = mapKeyOf(key);
  if (r.sido === '12') return mk && mk.startsWith('nat:29:') ? 'm29' : (mk ? 'nat' : null);
  if (METRO_OF[r.sido]) return METRO_OF[r.sido];
  if (!mk) return null;
  return mk.startsWith('seoul:') ? 'seoul' : mk.startsWith('nat:') ? 'nat' : 'cap';
}
function paintMaps() {
  const sel = mapKeyOf(state.region);
  const selMetro = sel && sel.startsWith('nat:') ? 'metro:' + sel.split(':')[1] : null;   // 광역시 구를 고르면 전국 지도에서는 도시 전체를 표시
  for (const grp of document.querySelectorAll('.map .rg')) {
    const r = REG[grp.dataset.key];
    if (r) {
      grp.style.setProperty('--t', tintFor(r));
      const v = priceAt(r, state.size);
      grp.querySelector('title').textContent = `${r.name}${v ? ' · ' + won(v * 1e4) : ''}`;
      grp.setAttribute('aria-label', grp.querySelector('title').textContent);
    }
    const on = grp.dataset.key === sel || grp.dataset.key === selMetro;
    grp.classList.toggle('on', on);
    grp.setAttribute('aria-pressed', String(on));
    grp.querySelector('text').style.display = (grp.dataset.small === 'true' && !on) ? 'none' : '';
    if (on) grp.parentNode.appendChild(grp);
  }
}

function pickRegion(key) {
  applyRegion(key, true);
  const t = tabOf(key);
  if (t) showTab(t);
  syncInputs(); buildAssume(); drawSizes(); paintMaps(); render();
}
function pickSize(k) {
  const r = REG[state.region];
  state.size = k;
  state.p.ratio = ratioOf(r, k);
  const pr = priceAt(r, k);
  if (pr) { state.price = Math.round(pr / 1000) / 10; state.manual = false; }
  syncInputs(); buildAssume(); drawSizes(); paintMaps(); render();
}
function drawSizes() {
  const r = REG[state.region];
  chips($('sizes'), SIZE_KEYS.map(k => EN ? [k, `${k}㎡`, `${PYEONG[k]} pyeong`] : [k, PYEONG[k] + PY_WORD, `전용 ${k}㎡`]), state.size, pickSize, k => !r || !sizeOk(r, k));
}

// ── 결과 ───────────────────────────────────────────────
let lastVerdict = null;
function render() {
  const r0 = REG[state.region];
  if (!r0) return;
  const inp = { price: state.price, cash: state.cash, years: state.years };
  const p = state.p;
  const res = simulate(inp, p);
  const rank = ranking(res);
  const win = rank[0][0];
  const canBuy = able(res, 'buy');
  // 판정은 항상 '매매'와 비교: 매매가 이기면 가장 나은 빌리는 쪽과, 빌리는 쪽이 이기면 매매와.
  // 대출 없이 계산해서 살 수 없으면 할 수 있는 것끼리 비교
  const vs = !canBuy ? rank[1]?.[0] : win === 'buy' ? rank[1][0] : 'buy';
  const r10 = x => Math.round((x - res.flow.spend) / 1e5) * 1e5;   // 막대에 보이는 금액끼리의 차이
  const gap = vs ? r10(res[win]) - r10(res[vs]) : 0;
  const buyWins = win === 'buy';
  const gr = growthOf(r0);
  const Y = state.years;

  // 선택한 지역
  const v = priceAt(r0, state.size), s = state.size && r0.sizes[state.size];
  $('picked').innerHTML = v
    ? L(`<b>${r0.name}</b> <span class="muted">· ${sizeText(state.size)} 평균 가격</span> <b>${won(v * 1e4)}</b>${s.n < 10 ? ` <span class="muted">· 거래가 적어 참고만 하세요</span>` : ''}`,
        `<b>${r0.name}</b> <span class="muted">· ${sizeText(state.size)} average price</span> <b>${won(v * 1e4)}</b>${s.n < 10 ? ` <span class="muted">· few deals, use as a rough guide</span>` : ''}`)
    : L(`<b>${r0.name}</b> <span class="muted">· 최근 거래가 적어 시세가 없어요. 집 가격을 직접 넣어주세요.</span>`,
        `<b>${r0.name}</b> <span class="muted">· Not enough recent deals for a price. Enter the price yourself.</span>`);
  $('price-hint').textContent = state.manual && v ? L('직접 입력한 가격이에요.', 'You entered this price.') : '';

  // 도장
  const seal = $('seal');
  seal.classList.toggle('no', !buyWins);
  $('seal1').textContent = SEAL[win];
  if (lastVerdict && lastVerdict !== win) { seal.classList.remove('pop'); void seal.offsetWidth; seal.classList.add('pop'); }
  lastVerdict = win;

  // 결론 + 가정 + 다른 흐름
  const noBuy = canBuy ? '' : L('대출 없이는 가진 돈으로 이 집을 살 수 없어요. ', 'Without a loan, your cash isn’t enough to buy here. ');
  let lead;
  if (!vs) lead = L('대출 없이는 가진 돈으로 사거나 전세를 얻을 수 없어요. 월세만 할 수 있어요.', 'Without a loan, your cash isn’t enough to buy or pay a jeonse deposit here. Monthly rent is your only option.');
  else if (gap < 1e5) lead = noBuy + L(`${Y}년 살면 ${OBJ[win]}와 ${OBJ[vs]}가 거의 같아요.`, `Over ${Y} years, ${OBJ[win]} and ${OBJ[vs]} come out about the same.`);
  else lead = noBuy + L(`${Y}년 살면 ${SUBJ[win]} ${OBJ[vs]}보다 <b>${won(gap)}</b> 더 이득이에요.`,
    `Over ${Y} years, ${OBJ[win]} leaves you <b>${won(gap)}</b> more than ${OBJ[vs]}.`);
  const g = p.grow;
  const edited = gr.g == null || Math.abs(g - gr.g) > 0.05;
  const rentNow = able(res, 'jeonse') && res.jeonse >= res.wolse ? OBJ.jeonse : OBJ.wolse;
  const since = gr.basis === 'gall' && gr.from ? L(gr.from.slice(0, 4) + '년부터 평균', 'average since ' + gr.from.slice(0, 4)) : BASIS_LABEL[gr.basis];
  const src = gr.src === 'idx' ? L(', 한국부동산원', ', Korea Real Estate Board') : '';
  const basis = edited ? '' : L(` (${gr.label} ${since}${src})`, ` (${gr.label}, ${since}${src})`);
  const assume = L(`집값이 해마다 <b>${pct(Math.abs(g))}</b> ${g >= 0 ? '오른다고' : '떨어진다고'} 봤어요${basis}.`,
    `We assume home prices ${g >= 0 ? 'rise' : 'fall'} <b>${pct(Math.abs(g))}</b> a year${basis}.`);
  let beLine = '', flip = '';
  if (canBuy) {
    const be = breakeven(inp, p);
    if (be === -Infinity) beLine = L('계산한 집값 상승률 범위에서는 매매가 유리해요.', 'Buying is better across the home price growth rates checked.');
    else if (be === Infinity) beLine = L('계산한 집값 상승률 범위에서는 전세나 월세가 유리해요.', 'Jeonse or monthly rent is better across the home price growth rates checked.');
    else if (buyWins) beLine = be >= 0 ? L(`집값이 해마다 <b>${pct(be)}</b>보다 덜 오르면 ${rentNow}가 유리해요.`, `If prices rise less than <b>${pct(be)}</b> a year, ${rentNow} wins.`)
      : L(`집값이 해마다 <b>${pct(-be)}</b>보다 더 떨어지면 ${rentNow}가 유리해요.`, `If prices fall more than <b>${pct(-be)}</b> a year, ${rentNow} wins.`);
    else beLine = be >= 0 ? L(`집값이 해마다 <b>${pct(be)}</b>보다 더 오르면 매매가 유리해요.`, `If prices rise more than <b>${pct(be)}</b> a year, buying wins.`)
      : L(`집값이 해마다 <b>${pct(-be)}</b>보다 덜 떨어지면 매매가 유리해요.`, `If prices fall less than <b>${pct(-be)}</b> a year, buying wins.`);
    // NYT식: 같은 크기 집을 이 금액 이하로 빌리면/사면 결과가 뒤집힘
    const eq = equivalents(inp, p, res);
    const down = (v, u) => Math.floor(v / u) * u;
    if (eq.side === 'rent') {
      const j = eq.jeonse > 0 && able(res, 'jeonse') ? won(down(eq.jeonse, 1e6)) : null, m = eq.rent > 0 ? won(down(eq.rent, 1e4)) : null;
      if (j && m) flip = L(`전세가 <b>${j}</b>보다 싸면 전세가, 월세가 <b>${m}</b>보다 싸면 월세가 매매보다 이득이에요.`,
        `Jeonse beats buying if the deposit is under <b>${j}</b>; monthly rent beats buying if it’s under <b>${m}</b> a month.`);
      else if (j) flip = L(`전세가 <b>${j}</b>보다 싸면 전세가 매매보다 이득이에요.`, `Jeonse beats buying if the deposit is under <b>${j}</b>.`);
      else if (m) flip = L(`월세가 <b>${m}</b>보다 싸면 월세가 매매보다 이득이에요.`, `Monthly rent beats buying if it’s under <b>${m}</b> a month.`);
    } else if (eq.price != null && eq.price > 0) {
      flip = L(`이 집을 <b>${won(down(eq.price, 1e6))}</b>보다 싸게 사면 매매가 이득이에요.`, `Buying wins if you can buy this home for under <b>${won(down(eq.price, 1e6))}</b>.`);
    }
  }
  // 도장 옆에는 결론만, 가정·뒤집히는 조건은 '왜 그런지 보기'에
  $('why').innerHTML = `${lead} <button class="help" id="why-help" type="button" aria-expanded="${whyOpen}" aria-controls="why-more" aria-label="${L('왜 그런지 보기', 'Why?')}">?</button>`;
  $('why-detail').innerHTML = `<p>${assume}</p>${beLine ? `<p>${beLine}</p>` : ''}${flip ? `<p>${flip}</p>` : ''}`;
  saveUrl();
  if (view === 'chart') drawChart();
  refreshTalkCount();
  if (talk.open && $('talk-tag')) $('talk-tag').textContent = L(`내 계산 조건 붙이기: ${talkTagText()}`, `Include my calculation: ${talkTagText()}`);
  $('peek').innerHTML = `<span class="pk-seal${buyWins ? '' : ' no'}">${SEAL[win]}</span><span>${lead}</span>`;

  // 대출 경고는 해당 막대 아래에
  const warns = {};
  if (!p.noLoan && res.ltv > 0.7) warns.buy = L(`필요한 대출금이 집값의 ${Math.round(res.ltv * 100)}%예요. 실제 대출 한도를 넘을 수 있어요`, `The loan is ${Math.round(res.ltv * 100)}% of the price; the required loan may exceed your actual borrowing limit`);
  if (!p.noLoan && res.jltv > 0.8) warns.jeonse = L(`필요한 대출금이 전세금의 ${Math.round(res.jltv * 100)}%예요. 실제 대출 한도를 넘을 수 있어요`, `The loan is ${Math.round(res.jltv * 100)}% of the deposit; the required loan may exceed your actual borrowing limit`);
  // 전세금이 집값에 가까우면(깡통전세) 보증금을 못 돌려받을 위험
  if (p.ratio >= 90) warns.jeonse = (warns.jeonse ? warns.jeonse + ' · ' : '') +
    L(`전세금이 집값의 ${Math.round(p.ratio)}%라 나중에 보증금을 다 못 돌려받을 위험이 커요`, `The deposit is ${Math.round(p.ratio)}% of the home’s price, so you risk not getting it all back`);
  $('warn').textContent = '';

  // 막대 + 돈 흐름
  $('bars-title').textContent = L(`${Y}년 뒤 내 자산`, `Your assets after ${Y} years`);
  $('bars-note').textContent = L(`막대 아래 대출 이자·예금 이자·월세·세금은 ${Y}년 동안 합친 금액이에요. 지금 가진 돈에 더하고 빼면 막대 금액이 돼요.`,
    `The amounts under each bar (loan interest, savings interest, rent, taxes) are totals over ${Y} years. Add them to your cash today to get the bar.`);
  const f = res.flow;
  const flows = {
    buy: [[res.gain >= 0 ? L('집값 상승', 'Price gain') : L('집값 하락', 'Price drop'), res.gain], [L('대출 이자', 'Loan interest'), -f.bInterest], [L('세금·수수료', 'Taxes & fees'), -f.bTax], f.bEarn > 1e6 ? [L('남는 돈의 예금 이자', 'Interest on savings'), f.bEarn] : null],
    jeonse: [[L('대출 이자', 'Loan interest'), -f.jInterest], [L('남는 돈의 예금 이자', 'Interest on savings'), f.jEarn]],
    wolse: [[L('월세', 'Rent'), -f.wRent], [L('남는 돈의 예금 이자', 'Interest on savings'), f.wEarn]],
  };
  // 1등이 아닌 쪽마다: 남는 돈을 해마다 몇 % 벌어야 1등을 따라잡는지
  const need = {};
  for (const k of ['buy', 'jeonse', 'wolse']) {
    if (k === win || !able(res, k)) continue;
    const r = requiredReturn(inp, p, k, res[win]);
    need[k] = r === Infinity ? L(`계산 범위에서는 ${OBJ[win]}와 같은 결과가 되는 수익률을 찾지 못했어요`, `No return matching ${OBJ[win]} was found within the range checked`)
      : L(`${OBJ[win]}와 같은 결과가 되려면 남는 돈에서 연 <b>${pct(r)}</b>의 수익이 필요해요`, `To match ${OBJ[win]}, your savings need an annual return of <b>${pct(r)}</b>`);
  }
  // 셋 다 똑같이 들어간 '매달 집에 쓴 돈'을 빼고 보여줌 → 가진 돈 + 막대 아래 항목 = 막대 금액 (차이·판정은 그대로)
  const spent = res.flow.spend;
  const rows = [['buy', res.buy - spent], ['jeonse', res.jeonse - spent], ['wolse', res.wolse - spent]];
  const max = Math.max(...rows.filter(([k]) => able(res, k)).map(x => x[1]), 1);
  for (const [id, val] of rows) {
    const row = $('row-' + id);
    const isWin = id === win, can = able(res, id);
    row.classList.toggle('win', isWin);
    row.classList.toggle('no-buy', isWin && !buyWins);
    row.classList.toggle('cant', !can);
    const width = can ? Math.max(0, val / max) * 100 : 0;
    row.querySelector('.fill').style.setProperty('--w', width + '%');   // 길이는 clip-path로 (레이아웃 안 건드림)
    const vEl = row.querySelector('.val');
    vEl.textContent = can ? won(val) : L('대출 없이는 못 해요', 'Not possible without a loan');
    const outside = width < 45;
    vEl.style.left = outside ? `calc(${width}% + 10px)` : '10px';
    vEl.style.color = outside ? (can ? 'var(--ink)' : 'var(--ink-2)') : '';
    row.querySelector('.flow').innerHTML = !can ? '' : flows[id].filter(Boolean).filter(([, x]) => Math.abs(x) >= 1e5)
      .map(([k, x]) => `<span class="detail">${k} <b class="${x < 0 ? 'minus' : 'plus'}">${wonShort(x)}</b></span>`).join('')
      + (need[id] ? `<span class="need detail">→ ${need[id]}</span>` : '')
      + (warns[id] ? `<span class="rwarn">${warns[id]}</span>` : '');
  }

  $('note').textContent = L(
    '매달 주거비가 적게 드는 선택지는 절약한 돈을 예금에 넣는다고 계산해요.',
    'We assume any savings from lower monthly housing costs go into a savings account.');
  const help = {
    ratio: L(`전세금 ${won(res.D0)}`, `Jeonse deposit: ${won(res.D0)}`),
    wdep: L(`월세 보증금 ${won(res.W)}`, `Rent deposit: ${won(res.W)}`),
    conv: L(`전세금과 월세 보증금의 차액 1억 원당 월세예요. 현재 월세는 ${won(res.rent0)}이에요.`, `The annual rate applies to the jeonse deposit minus the rent deposit. Monthly rent: ${won(res.rent0)}`),
    jgrow: L('전세는 2년마다, 월세는 해마다 오른다고 봐요.',
      p.noLoan ? 'Jeonse rises every 2 years, paid from savings; rent rises yearly.' : 'Jeonse rises every 2 years; monthly rent rises yearly.'),
  };
  for (const key of ['mort', 'jloan', 'deposit']) {
    const month = RATES_INFO?.rates[key]?.month;
    help[key] = month
      ? L(`기본값: 한국은행 ${month.slice(0, 4)}년 ${Number(month.slice(4))}월 은행 평균`,
        `Default: Bank of Korea bank average, ${month.slice(0, 4)}-${month.slice(4)}`)
      : L('기본값은 참고용 임시 금리예요.', 'The default is a temporary reference rate.');
  }
  for (const [key, text] of Object.entries(help)) $('a-help-' + key).textContent = text;
}

// ── 입력 ───────────────────────────────────────────────
// 숫자 칸 단위: 한국어는 억 원, 영어는 백만 원(M). 내부 값과 막대(range)는 억 단위 그대로
const U = EN ? 100 : 1;
const shown = v => Math.round(v * U * 10) / 10;
function syncInputs() {
  $('price').value = state.price; $('price-n').value = shown(state.price);
  $('cash').max = Math.max(15, Math.ceil(state.price));
  $('cash').value = state.cash; $('cash-n').value = shown(state.cash);
}
function bindAmount(rangeId, numId, key) {
  const mark = () => { if (key === 'price') state.manual = true; };
  const set = v => { if (isNaN(v) || v < 0) return; state[key] = Math.round(v * 10) / 10; mark(); syncInputs(); render(); };
  $(rangeId).addEventListener('input', e => set(parseFloat(e.target.value)));
  $(numId).addEventListener('change', e => set(parseFloat(e.target.value) / U));
  $(numId).addEventListener('input', e => { const v = parseFloat(e.target.value) / U; if (!isNaN(v) && v > 0) { state[key] = v; mark(); $(rangeId).value = v; render(); } });
}
function drawYears() {
  chips($('years'), YEARS.map(y => [y, y + L('년', ' yrs')]), state.years, v => { state.years = v; drawYears(); render(); });
  const n = $('years-n');
  if (document.activeElement !== n) n.value = YEARS.includes(state.years) ? '' : state.years;
  n.parentElement.classList.toggle('on', !YEARS.includes(state.years));
}
$('years-n').addEventListener('input', e => {
  const v = Math.round(parseFloat(e.target.value));
  if (!isNaN(v) && v >= 1 && v <= 30) { state.years = v; drawYears(); render(); }
});
$('years-n').addEventListener('change', e => {
  const v = Math.round(parseFloat(e.target.value));
  if (isNaN(v)) { drawYears(); return; }
  state.years = Math.min(30, Math.max(1, v)); e.target.value = state.years; drawYears(); render();
});

// 결론 옆 '?': 가정·뒤집히는 조건 펼치기 (버튼은 render마다 새로 그려서 위임으로 받음)
document.addEventListener('click', e => {
  if (!e.target.closest('#why-help')) return;
  whyOpen = !whyOpen;
  $('why-more').hidden = !whyOpen;
  e.target.closest('#why-help').setAttribute('aria-expanded', String(whyOpen));
});

// 막대 '?': 막대 아래 금액이 고른 기간 합계라는 안내 펼치기
$('bars-help').addEventListener('click', () => {
  const open = $('bars').classList.toggle('open');
  $('bars-help').setAttribute('aria-expanded', String(open));
});

// 좁은 화면: 결과 칸이 안 보이면 아래에 결론 한 줄
{
  const peek = $('peek');
  let resultVisible = true, typing = false;
  const sync = () => {
    const show = !resultVisible && !typing;
    peek.hidden = !show;
    document.documentElement.classList.toggle('peek-on', show);
  };
  new IntersectionObserver(([e]) => { resultVisible = e.isIntersecting; sync(); }, { threshold: 0.6 }).observe(document.querySelector('.verdict'));
  document.addEventListener('focusin', e => { typing = e.target.id !== 'peek' && e.target.matches('#q, input, select, button, summary, a'); sync(); });
  document.addEventListener('focusout', () => { typing = false; setTimeout(sync, 0); });
  peek.addEventListener('click', e => { e.preventDefault(); $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); });
}

// ── 그래프로 비교하기 ───────────────────────────────────
// 1~30년 각각 그만큼 살았을 때 내 자산(막대와 같은 값: 결과 − 매달 집에 쓴 돈 합계)
const CHART_YEARS = 30;
const SERIES = L([['buy', '매매'], ['jeonse', '전세'], ['wolse', '월세']], [['buy', 'Buy'], ['jeonse', 'Jeonse'], ['wolse', 'Monthly rent']]);
let view = 'bars', chartData = null;
function yearly(inp, p) {
  const rows = [];
  for (let y = 1; y <= CHART_YEARS; y++) {
    const r = simulate({ ...inp, years: y }, p);
    rows.push({ y, buy: r.buy - r.flow.spend, jeonse: r.jeonse - r.flow.spend, wolse: r.wolse - r.flow.spend });
  }
  return rows;
}
function setView(v, save = true) {
  view = v;
  const chart = v === 'chart';
  $('chart').hidden = !chart; $('bars').hidden = chart;
  $('tab-chart').setAttribute('aria-selected', String(chart)); $('tab-bars').setAttribute('aria-selected', String(!chart));
  $('tab-chart').tabIndex = chart ? 0 : -1; $('tab-bars').tabIndex = chart ? -1 : 0;
  if (chart) drawChart();
  if (save) saveUrl();
}
for (const [id, v] of [['tab-bars', 'bars'], ['tab-chart', 'chart']]) $(id).addEventListener('click', () => setView(v));
document.querySelector('.view-tabs').addEventListener('keydown', e => {   // 좌우 화살표로 탭 이동
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const next = view === 'chart' ? 'bars' : 'chart'; setView(next); $('tab-' + next).focus(); e.preventDefault();
});
function niceStep(range, n) {
  const raw = range / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}
function axisWon(v) {                       // 축 눈금: 3억, 1.5억, 5,000만, 0
  if (v === 0) return '0';
  if (EN) { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e9 ? `${s}₩${Math.round(a / 1e8) / 10}B` : `${s}₩${Math.round(a / 1e6)}M`; }
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= EOK) return s + (Math.round(a / EOK * 10) / 10).toLocaleString('ko-KR') + '억';
  return s + Math.round(a / 1e4).toLocaleString('ko-KR') + '만';
}
function drawChart() {
  if (view !== 'chart' || !REG[state.region]) return;
  const inp = { price: state.price, cash: state.cash, years: state.years };
  const rows = chartData = yearly(inp, state.p);
  const okNow = simulate(inp, state.p);   // 대출 없이 할 수 없는 쪽은 선을 그리지 않음 (기간과 상관없음)
  const series = SERIES.filter(([k]) => able(okNow, k));
  const svg = $('chart-svg'), W = Math.max(280, $('chart-box').clientWidth), H = W < 480 ? 230 : 270;
  const m = { l: 46, r: W < 480 ? 12 : 44, t: 12, b: 26 };
  const vals = rows.flatMap(r => series.map(([k]) => r[k]));
  let lo = Math.min(0, ...vals), hi = Math.max(...vals);
  const step = niceStep(hi - lo || EOK, 4);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const x = y => m.l + (y - 1) / (CHART_YEARS - 1) * (W - m.l - m.r);
  const yv = v => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
  let s = '';
  for (let v = lo; v <= hi + 1; v += step) {   // 가로 눈금선(옅게)과 금액
    s += `<line class="grid${v === 0 ? ' zero' : ''}" x1="${m.l}" x2="${W - m.r}" y1="${yv(v)}" y2="${yv(v)}"/>`;
    s += `<text class="tick" x="${m.l - 6}" y="${yv(v) + 4}" text-anchor="end">${axisWon(v)}</text>`;
  }
  for (const y of [1, 5, 10, 15, 20, 25, 30]) s += `<text class="tick" x="${x(y)}" y="${H - 6}" text-anchor="middle">${y}${L('년', 'y')}</text>`;
  const cy = state.years;
  s += `<line class="now" x1="${x(cy)}" x2="${x(cy)}" y1="${m.t}" y2="${H - m.b}"/>`;
  const nearRight = x(cy) > W - m.r - 60;   // 오른쪽 끝이면 이름표를 선 왼쪽에
  s += `<text class="now-l" x="${x(cy) + (nearRight ? -5 : 5)}" y="${m.t + 10}" text-anchor="${nearRight ? 'end' : 'start'}">${cy}${L('년', 'y')}</text>`;
  for (const [k] of series) s += `<polyline class="ln ln-${k}" points="${rows.map(r => `${x(r.y).toFixed(1)},${yv(r[k]).toFixed(1)}`).join(' ')}"/>`;
  const at = rows[cy - 1];
  for (const [k] of series) s += `<circle class="dot dot-${k}" cx="${x(cy)}" cy="${yv(at[k])}" r="4.5"/>`;
  // 오른쪽 끝 이름표: 서로 14px 넘게 떨어질 때만 (겹치면 범례로 충분)
  if (m.r > 20) {
    const last = rows[CHART_YEARS - 1], ys = series.map(([k, n]) => [yv(last[k]), n]).sort((a, b) => a[0] - b[0]);
    const apart = ys.every((v, i) => i === 0 || v[0] - ys[i - 1][0] >= 14);
    if (apart) for (const [py, n] of ys) s += `<text class="end" x="${W - m.r + 6}" y="${py + 4}">${n}</text>`;
  }
  s += `<line class="cross" id="chart-cross" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/>`;
  s += `<rect class="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/>`;
  svg.innerHTML = s;
  chartGeom = { x, m, W };

  // 머리글: 매매가 언제부터 앞서는지
  const lead = rows.map(r => r.buy >= Math.max(able(okNow, 'jeonse') ? r.jeonse : -Infinity, r.wolse));
  const first = lead.indexOf(true), stays = first >= 0 && lead.slice(first).every(Boolean);
  let head;
  if (!able(okNow, 'buy')) head = L('대출 없이는 이 집을 살 수 없어서 빌리는 쪽만 보여줘요.', 'Without a loan you can’t buy here, so only renting is shown.');
  else if (first === 0 && stays) head = L('1년만 살아도 매매가 가장 이득이에요.', 'Buying wins even if you stay just 1 year.');
  else if (stays) head = L(`<b>${first + 1}년</b> 이상 살면 매매가 전세·월세보다 이득이에요.`, `Stay <b>${first + 1} years</b> or more and buying beats renting.`);
  else if (first < 0) head = L('30년 안에는 전세나 월세가 매매보다 이득이에요.', 'Renting beats buying for any stay up to 30 years.');
  else head = L(`<b>${first + 1}년</b>부터 매매가 앞서다가 다시 뒤집혀요. 세로선 근처를 눌러 해마다 비교해보세요.`, `Buying pulls ahead from <b>year ${first + 1}</b>, then falls behind again. Tap the chart to compare each year.`);
  $('chart-head').innerHTML = head;
  // 화면 읽기용 표
  $('chart-table').innerHTML = `<caption>${L('해마다 내 자산', 'Your assets by year')}</caption><tr><th>${L('기간', 'Years')}</th>${series.map(([, n]) => `<th>${n}</th>`).join('')}</tr>` +
    rows.map(r => `<tr><td>${r.y}${L('년', '')}</td>${series.map(([k]) => `<td>${won(r[k])}</td>`).join('')}</tr>`).join('');
  chartSeries = series;
}
let chartGeom = null, chartSeries = SERIES;
function chartHover(e) {
  if (!chartData || !chartGeom) return;
  const svg = $('chart-svg'), box = svg.getBoundingClientRect(), { x, m, W } = chartGeom;
  const px = (e.clientX - box.left) * (W / box.width);
  const y = Math.min(CHART_YEARS, Math.max(1, Math.round(1 + (px - m.l) / (W - m.l - m.r) * (CHART_YEARS - 1))));
  const r = chartData[y - 1];
  const cross = $('chart-cross'); cross.setAttribute('x1', x(y)); cross.setAttribute('x2', x(y)); cross.setAttribute('visibility', 'visible');
  const tip = $('chart-tip');
  tip.innerHTML = `<b>${L(`${y}년 살면`, `After ${y} years`)}</b>` + chartSeries.map(([k, n]) => `<span><i class="k-${k}"></i>${n} <b>${won(r[k])}</b></span>`).join('');
  tip.hidden = false;
  const left = x(y) / W * box.width;
  tip.style.left = Math.min(Math.max(left - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth) + 'px';
}
function chartLeave() { $('chart-tip').hidden = true; const c = $('chart-cross'); if (c) c.setAttribute('visibility', 'hidden'); }
$('chart-svg').addEventListener('pointermove', chartHover);
$('chart-svg').addEventListener('pointerdown', chartHover);
$('chart-svg').addEventListener('pointerleave', chartLeave);
let chartResize = null;
window.addEventListener('resize', () => { clearTimeout(chartResize); chartResize = setTimeout(drawChart, 150); });

// ── 밝게/어둡게 ─────────────────────────────────────────
// 처음엔 기기 설정을 따르고, 버튼을 누르면 반대로 바꿔서 저장 (다른 페이지도 머리의 짧은 스크립트가 적용)
const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
function syncThemeBtn() {
  const dark = isDark();
  $('theme-btn').setAttribute('aria-label', dark ? L('밝게 보기', 'Light mode') : L('어둡게 보기', 'Dark mode'));
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = dark ? '#111318' : '#f3f5f8';
}
$('theme-btn').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('yk-theme', next); } catch (e) {}
  syncThemeBtn();
  if (view === 'chart') drawChart();
});
syncThemeBtn();

// ── 이 동네 이야기 (지역 코멘트) ──────────────────────────
// 한국어·영어 모두 같은 지역 키로 Worker(/api/comments) + D1의 글을 공유한다. 본문·태그는 원문 그대로 표시한다.
const TALK_API = '/api/comments';
const talk = { region: null, items: [], open: false, lastFocus: null, countFor: null };
const talkKey = () => regionParam(state.region);
const talkName = () => { const r = REG[state.region]; return r ? (r.short || r.name) : L('이 동네', 'this area'); };
const talkHeading = () => L(`${talkName()} 이야기`, `Stories from ${talkName()}`);
function talkError(data) {
  const messages = {
    EMPTY: 'Please write a story.', TOO_LONG: 'You can write up to 100 characters.',
    LINK: 'Links and contact details are not allowed.', PHONE: 'Phone numbers are not allowed.',
    BANNED: 'This text contains words that are not allowed.', REGION: 'Please select a valid area.',
    RATE: 'You can post once a minute. Please try again shortly.',
  };
  return L(data?.message || '지금은 요청을 처리할 수 없어요. 잠시 뒤에 다시 해주세요.',
    messages[data?.error] || 'Your request could not be completed. Please try again later.');
}
function talkTagText() {
  const t = TYPES.find(x => x[0] === state.type)?.[1] || '';
  const win = lastVerdict ? L(`${OBJ[lastVerdict]} 이득`, SEAL[lastVerdict]) : '';
  if (EN) return [`${t} ${state.size ? `${state.size}㎡(${PYEONG[state.size]}p)` : ''}`.trim(), `${state.years}y`, win].filter(Boolean).join(' · ');
  return [`${t} ${state.size ? sizeText(state.size) : ''}`.trim(), `${state.years}년`, win].filter(Boolean).join(' · ');
}
function when(sec) {
  const d = Math.max(0, Date.now() / 1000 - sec);
  if (d < 60) return L('방금', 'just now');
  if (d < 3600) return L(`${Math.floor(d / 60)}분 전`, `${Math.floor(d / 60)}m ago`);
  if (d < 86400) return L(`${Math.floor(d / 3600)}시간 전`, `${Math.floor(d / 3600)}h ago`);
  if (d < 86400 * 7) return L(`${Math.floor(d / 86400)}일 전`, `${Math.floor(d / 86400)}d ago`);
  return new Intl.DateTimeFormat(L('ko-KR', 'en'), { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(sec * 1000));
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let adminKey = null;
try {
  const q = new URLSearchParams(location.search);
  if (q.get('admin')) { localStorage.setItem('yk-admin', q.get('admin')); q.delete('admin'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); }
  adminKey = localStorage.getItem('yk-admin');
} catch (e) {}
async function talkFetch(region, limit, before) {
  const q = new URLSearchParams({ region, limit: String(limit) }); if (before) q.set('before', before);
  const r = await fetch(`${TALK_API}?${q}`, { headers: { accept: 'application/json' } });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || d.error) throw new Error(talkError(d));
  return d;
}
function talkItem(c) {
  return `<li data-id="${c.id}"><p>${esc(c.text)}</p><div class="talk-meta">${c.tag ? `<span class="talk-ctag">${esc(c.tag)}</span>` : ''}<span>${when(c.created)}</span>` +
    `<button type="button" class="talk-report" data-id="${c.id}">${L('신고', 'Report')}</button>${adminKey ? `<button type="button" class="talk-del" data-id="${c.id}">${L('삭제', 'Delete')}</button>` : ''}</div></li>`;
}
function setTalkCount(n) { $('talk-count').textContent = n ? String(n) : ''; }
async function refreshTalkCount() {
  const key = talkKey(); if (!key || key === talk.countFor) return;
  talk.countFor = key;
  $('talk-btn-label').textContent = talkHeading();
  setTalkCount(0);
  if (talk.open) { $('talk-title').textContent = talkHeading(); loadTalk(); return; }   // 열어둔 채 지역을 바꾸면 그 지역 이야기로
  try { const d = await talkFetch(key, 0); $('talk-btn').hidden = false; if (talk.countFor === key) setTalkCount(d.count); } catch (e) { /* 배포 전이거나 연결 실패: 버튼을 숨긴 채로 */ }
}
async function loadTalk(more = false) {
  const key = talkKey(), list = $('talk-list'), msg = $('talk-msg');
  if (!more) { talk.items = []; list.innerHTML = `<li class="talk-empty">${L('불러오는 중…', 'Loading…')}</li>`; }
  try {
    const before = more && talk.items.length ? talk.items[talk.items.length - 1].id : 0;
    const d = await talkFetch(key, 10, before);
    if (key !== talkKey()) return;
    talk.items = talk.items.concat(d.items);
    list.innerHTML = talk.items.length ? talk.items.map(talkItem).join('')
      : `<li class="talk-empty">${L(`아직 이야기가 없어요. ${esc(talkName())}에서 살아봤거나 알아본 경험을 첫 번째로 남겨주세요.`, `No stories yet. Share your experience of living in or exploring ${esc(talkName())}.`)}</li>`;
    $('talk-more').hidden = talk.items.length >= d.count;
    setTalkCount(d.count);
  } catch (e) {
    list.innerHTML = `<li class="talk-empty">${L('지금은 이야기를 불러올 수 없어요. 잠시 뒤에 다시 열어주세요.', 'Stories could not be loaded. Please try again later.')}</li>`;
    $('talk-more').hidden = true;
  }
  msg.textContent = '';
}
function openTalk() {
  talk.open = true; talk.lastFocus = document.activeElement;
  $('talk-title').textContent = talkHeading();
  $('talk-tag').textContent = L(`내 계산 조건 붙이기: ${talkTagText()}`, `Include my calculation: ${talkTagText()}`);
  $('talk').hidden = false; $('talk-dim').hidden = false;
  requestAnimationFrame(() => { $('talk').classList.add('on'); $('talk-dim').classList.add('on'); });
  document.documentElement.classList.add('talk-open');
  loadTalk();
  if (matchMedia('(pointer: fine)').matches) $('talk-text').focus(); else $('talk-close').focus();
}
function closeTalk() {
  talk.open = false;
  $('talk').classList.remove('on'); $('talk-dim').classList.remove('on');
  document.documentElement.classList.remove('talk-open');
  setTimeout(() => { if (!talk.open) { $('talk').hidden = true; $('talk-dim').hidden = true; } }, 200);
  talk.lastFocus?.focus?.();
}
$('talk-btn').addEventListener('click', openTalk);
$('talk-close').addEventListener('click', closeTalk);
$('talk-dim').addEventListener('click', closeTalk);
$('talk-more').addEventListener('click', () => loadTalk(true));
document.addEventListener('keydown', e => {
  if (!talk.open) return;
  if (e.key === 'Escape') { closeTalk(); return; }
  if (e.key === 'Tab') {   // 패널 안에서만 이동
    const f = [...$('talk').querySelectorAll('button:not([hidden]), input, [href]')].filter(x => x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
  }
});
$('talk-form').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('talk-text'), msg = $('talk-msg'), btn = $('talk-send');
  const text = input.value.trim();
  if (!text) { msg.textContent = L('내용을 적어주세요.', 'Please write a story.'); input.focus(); return; }
  btn.disabled = true; btn.textContent = L('남기는 중…', 'Posting…');
  try {
    const r = await fetch(TALK_API, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ region: talkKey(), text, tag: $('talk-tag-on').checked ? talkTagText() : '' }) });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || d.error) { msg.textContent = talkError(d); return; }
    input.value = ''; msg.textContent = L('남겼어요.', 'Posted.');
    talk.items.unshift(d.item);
    $('talk-list').innerHTML = talk.items.map(talkItem).join('');
    setTalkCount((parseInt($('talk-count').textContent, 10) || 0) + 1);
  } catch (err) {
    msg.textContent = talkError();
  } finally { btn.disabled = false; btn.textContent = L('남기기', 'Post'); }
});
$('talk-list').addEventListener('click', async e => {
  const rep = e.target.closest('.talk-report'), del = e.target.closest('.talk-del');
  if (rep) {
    if (rep.dataset.done) return;
    rep.dataset.done = '1'; rep.textContent = L('신고했어요', 'Reported');
    fetch(`${TALK_API}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: rep.dataset.id }) }).catch(() => {});
  }
  if (del && adminKey) {
    // 헤더에는 영문·숫자만 들어가서 인코딩해 보냄 (한글·특수문자 키도 되게)
    const r = await fetch(`${TALK_API}/${del.dataset.id}`, { method: 'DELETE', headers: { 'x-admin-key': encodeURIComponent(adminKey) } }).catch(() => null);
    if (r && r.ok) { talk.items = talk.items.filter(c => String(c.id) !== del.dataset.id); del.closest('li').remove(); setTalkCount(Math.max(0, (parseInt($('talk-count').textContent, 10) || 1) - 1)); }
    else $('talk-msg').textContent = r && r.status === 403 ? L('관리 키가 맞지 않아요. ?admin=키 로 다시 열어주세요.', 'Invalid admin key. Reopen with ?admin=your-key.') : L('삭제하지 못했어요. 잠시 뒤에 다시 해주세요.', 'Could not delete the story. Please try again later.');
  }
});
// 지역 페이지: 시세 설명 아래에 최근 이야기 3개
async function talkLatest() {
  const box = document.getElementById('talk-latest'); if (!box) return;
  try {
    const d = await talkFetch(talkKey(), 3);
    box.innerHTML = `<h3>${esc(talkHeading())} <span>${d.count}</span></h3>` +
      (d.items.length ? `<ol class="talk-list">${d.items.map(c => `<li><p>${esc(c.text)}</p><div class="talk-meta">${c.tag ? `<span class="talk-ctag">${esc(c.tag)}</span>` : ''}<span>${when(c.created)}</span></div></li>`).join('')}</ol>` : `<p class="talk-none">${L('아직 이야기가 없어요.', 'No stories yet.')}</p>`) +
      `<button type="button" class="talk-open-btn">${d.items.length ? L('이야기 더 보기·남기기', 'Read and share stories') : L('첫 이야기 남기기', 'Share the first story')}</button>`;
    box.querySelector('.talk-open-btn').addEventListener('click', openTalk);
    box.hidden = false;
  } catch (e) { box.hidden = true; }
}

// ── 주소에 입력값 담기 (공유 링크) ───────────────────────
// ?t=유형(villa·offi, 아파트면 생략)&r=시군구코드(또는 묶음 키)&s=크기(전용㎡)&p=직접 넣은 집값(억)&c=가진 돈(억)&y=년
const regionParam = key => { const r = REG[key]; if (!r) return null; return r.key.startsWith('c:') ? r.key.slice(2) : r.key; };
function shareUrl() {
  const q = new URLSearchParams();
  const rp = regionParam(state.region); if (rp && rp !== window.PRESET_REGION) q.set('r', rp);
  if (state.type !== 'apt') q.set('t', state.type);
  if (view === 'chart') q.set('v', 'chart');
  if (state.size) q.set('s', state.size);
  if (state.manual) q.set('p', state.price);
  if (state.noLoan) q.set('l', '0');
  q.set('c', state.cash); q.set('y', state.years);
  return location.origin + location.pathname + '?' + q.toString();
}
let urlTimer = null, urlLive = false;   // 처음 열 때는 주소를 그대로 두고, 사용자가 바꾼 뒤부터 담음
function saveUrl() {
  if (!urlLive) return;
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => { try { history.replaceState(null, '', shareUrl()); } catch (e) {} }, 400);
}
function readUrl() {
  const q = new URLSearchParams(location.search), num = k => { const v = parseFloat(q.get(k)); return isNaN(v) ? null : v; };
  const r = q.get('r') || window.PRESET_REGION;
  return { region: r ? (REG['c:' + r] ? 'c:' + r : (REG[r] ? r : null)) : null, size: q.get('s'), price: num('p'), cash: num('c'), years: num('y'), view: q.get('v'), noLoan: q.get('l') === '0' };
}
$('share').addEventListener('click', async () => {
  const url = shareUrl(), btn = $('share'), r = REG[state.region];
  const text = L(`${r ? r.short || r.name : ''} ${state.years}년 살면 어디가 더 남을까? 영끌각에서 계산해봤어요.`,
    `${r ? r.short || r.name : ''}: buy, jeonse or monthly rent over ${state.years} years? I ran the numbers.`);
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: L('영끌각', 'Rent or Buy Korea'), text, url }); return; }
    await navigator.clipboard.writeText(url);
    btn.querySelector('span').textContent = L('링크를 복사했어요', 'Link copied'); btn.classList.add('done');
    setTimeout(() => { btn.querySelector('span').textContent = L('공유하기', 'Share'); btn.classList.remove('done'); }, 2000);
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    window.prompt(L('이 링크를 복사하세요', 'Copy this link'), url);
  }
});

// ── 검색 ───────────────────────────────────────────────
let INDEX = [], hits = [], cursor = -1;
function buildIndex() {
  const seen = new Set();
  INDEX = Object.values(REG).filter(r => { if (seen.has(r)) return false; seen.add(r); return true; })
    .filter(r => !r.metroTab).map(r => ({ key: r.key, r, text: norm(r.name + ' ' + (r.ko || '') + ' ' + (r.alias || '') + ' ' + (EN && r.alias ? place(r.alias) : '') + ' ' + (r.whole ? '' : (SIDO[r.sido] || '') + ' ' + (EN ? sidoName(r.sido) : ''))) }));
}
function renderHits() {
  const ul = $('q-list'), q = norm($('q').value);
  const input = $('q');
  ul.innerHTML = '';
  if (!q) { ul.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); return; }
  hits = INDEX.filter(x => x.text.includes(q))
    .sort((a, b) => (b.r.whole ? 1 : 0) - (a.r.whole ? 1 : 0) || a.r.name.length - b.r.name.length).slice(0, 8);
  if (!hits.length) {
    const li = document.createElement('li'); li.className = 'empty';
    li.textContent = L('찾는 곳이 없어요. 시·군·구나 동네 이름으로 찾아보세요.', 'No match. Try a city or district name, like Gangnam or Bundang.'); ul.appendChild(li);
  }
  hits.forEach((h, i) => {
    const li = document.createElement('li'); li.id = 'q-' + i; li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === cursor));
    li.append(document.createTextNode(h.r.name));
    const v = priceAt(h.r, defaultSize(h.r, state.size));
    const sp = document.createElement('span'); sp.textContent = v ? won(v * 1e4) : L('시세 없음', 'no price'); li.appendChild(sp);
    li.addEventListener('mousedown', e => { e.preventDefault(); choose(i); });
    ul.appendChild(li);
  });
  ul.hidden = false; input.setAttribute('aria-expanded', 'true');
  if (cursor >= 0 && hits[cursor]) input.setAttribute('aria-activedescendant', 'q-' + cursor);
  else input.removeAttribute('aria-activedescendant');
}
function choose(i) {
  const h = hits[i]; if (!h) return;
  $('q').value = ''; cursor = -1; renderHits(); $('q').blur();
  pickRegion(h.key);
}
$('q').addEventListener('input', () => { cursor = -1; renderHits(); });
$('q').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { cursor = Math.min(cursor + 1, hits.length - 1); renderHits(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { cursor = Math.max(cursor - 1, 0); renderHits(); e.preventDefault(); }
  else if (e.key === 'Enter') { choose(cursor >= 0 ? cursor : 0); e.preventDefault(); }
  else if (e.key === 'Escape') { $('q').value = ''; renderHits(); }
});
$('q').addEventListener('blur', () => { $('q-list').hidden = true; $('q').setAttribute('aria-expanded', 'false'); });

// 영어판: 대출을 받을 수 있는지 (외국인은 비자·소득에 따라 막히는 경우가 많음)
function drawLoan() {
  const box = $('loan'); if (!box) return;
  chips(box, [[false, 'Yes'], [true, 'No']], state.noLoan, v => { state.noLoan = v; state.p.noLoan = v; drawLoan(); render(); });
}

// ── 시작 ───────────────────────────────────────────────
bindAmount('price', 'price-n', 'price');
bindAmount('cash', 'cash-n', 'cash');
$('reset').addEventListener('click', () => { applyRegion(state.region, true); syncInputs(); buildAssume(); drawSizes(); render(); });
syncInputs(); drawYears(); buildAssume(); showTab('seoul');


// ── 주택 유형 ───────────────────────────────────────────
function loadType(id) {
  if (TYPE_DATA[id]) return Promise.resolve(TYPE_DATA[id]);
  const [, , file, ifile] = TYPES.find(x => x[0] === id);
  return Promise.all([
    fetch('data/' + file).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch('data/' + ifile).then(r => r.ok ? r.json() : null).catch(() => null),
  ]).then(([data, idx]) => (TYPE_DATA[id] = { data, idx }));
}
function useType(id, td) {
  state.type = id;
  DATA = td.data; IDX = td.idx;
  const sz = td.data.sizes || {};
  if (Object.keys(sz).length) {
    SIZE_KEYS = Object.keys(sz).sort((a, b) => sz[a].min - sz[b].min);
    PYEONG = Object.fromEntries(SIZE_KEYS.map(k => [k, sz[k].pyeong]));
  }
  PY_WORD = td.data.pyeong_word || '평형';
  MAIN_SIZE = td.data.main || '84';
  for (const k of Object.keys(REG)) delete REG[k];
  buildRegions(td.data); buildIndex();
  buildMap('map-seoul', MAPS.seoul); buildMap('map-cap', MAPS.cap); buildMap('map-nat', MAPS.nat);
  for (const m of ['map-seoul', 'map-cap', 'map-nat']) $(m).dataset.measured = '';
  metroShown = null;
}
function drawTypes() {
  chips($('types'), TYPES.map(([id, name]) => [id, name]), state.type, pickType, id => !TYPE_OK[id]);
  for (const b of $('types').children) if (b.disabled) b.title = L('시세를 준비하고 있어요', 'Prices coming soon');
}
function pickType(id) {
  if (id === state.type) return;
  loadType(id).then(td => {
    const prev = state.region, prevSido = REG[prev]?.sido;
    useType(id, td);
    const key = REG[prev] ? prev : (REG['sido:' + prevSido] ? 'sido:' + prevSido : Object.keys(REG)[0]);
    applyRegion(key, false);
    drawTypes(); syncInputs(); buildAssume(); drawSizes(); showTab(tabOf(key) || tab); paintMaps(); render();
  }).catch(() => { TYPE_OK[id] = false; drawTypes(); });
}

const ratesReady = fetch('data/rates.json')
  .then(r => r.ok ? r.json() : null)
  .then(d => {
    if (!d) return;
    for (const k of ['mort', 'jloan', 'deposit']) if (d.rates?.[k]?.value) RATES[k] = d.rates[k].value;
    RATES_INFO = d;
  })
  .catch(() => {});

const firstType = (() => { const t = new URLSearchParams(location.search).get('t'); return TYPES.some(x => x[0] === t) ? t : 'apt'; })();
// 다른 유형 시세 파일이 있는지 미리 확인 (없으면 버튼을 흐리게)
for (const [id] of TYPES) if (id !== firstType) loadType(id).then(() => { TYPE_OK[id] = true; drawTypes(); }).catch(() => { TYPE_OK[id] = false; drawTypes(); });

Promise.all([loadType(firstType).catch(() => firstType === 'apt' ? Promise.reject() : loadType('apt')), ratesReady])
  .then(([td]) => {
    TYPE_OK[td.data.type || 'apt'] = true;
    useType(td.data.type || 'apt', td); drawTypes();
    const u = readUrl();
    const start = u.region || (REG['seoul:노원구'] ? 'seoul:노원구' : Object.keys(REG)[0]);
    applyRegion(start, false);
    const r = REG[start];
    if (u.size && SIZE_KEYS.includes(u.size) && sizeOk(r, u.size)) {
      state.size = u.size; state.p.ratio = ratioOf(r, u.size);
      const pr = priceAt(r, u.size); if (pr) state.price = Math.round(pr / 1000) / 10;
    }
    if (u.price > 0 && u.price <= 100) { state.price = u.price; state.manual = true; }
    if (u.cash != null && u.cash >= 0 && u.cash <= 100) state.cash = u.cash;
    if (u.years >= 1 && u.years <= 30) state.years = Math.round(u.years);
    if (u.view === 'chart') setView('chart', false);
    if (u.noLoan && $('loan')) { state.noLoan = true; state.p.noLoan = true; }
    drawLoan();
    syncInputs(); buildAssume(); drawSizes(); drawYears(); showTab(tabOf(start) || 'seoul'); paintMaps(); render();
    urlLive = true;
    talkLatest();
  })
  .catch(() => {
    REG.manual = { key: 'manual', name: L('직접 입력', 'Custom'), short: L('직접 입력', 'Custom'), sido: '', sizes: {}, cnt: 0, n84: 0, whole: true };
    state.region = 'manual'; state.manual = true; state.size = null;
    $('picked').textContent = L('시세를 불러오지 못했어요. 집 가격을 직접 넣어주세요.', 'Couldn’t load prices. Enter the price yourself.');
    render();
  });
