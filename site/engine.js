// 영끌각 계산 엔진 — 화면과 상관없는 순수 계산만 (세금·대출·전세 재계약·월세·예금, 결과가 뒤집히는 값)
// 브라우저에서는 전역 함수로, Node(tests/)에서는 require로 씀. app.js보다 먼저 불러야 함
const EOK = 1e8;
function acqTax(P, kind) {                 // 1주택 취득세 + 지방교육세 근사
  if (kind === 'offi') return P * 0.046;   // 오피스텔은 주택이 아니라 4% + 농특세·지방교육세 = 4.6%
  const e = P / EOK;
  const t = e <= 6 ? 1 : e <= 9 ? (e * 2 / 3 - 3) : 3;
  return P * t / 100 * 1.1;
}
function brokerFee(P, kind) {               // 매매 중개수수료 상한 요율
  if (kind === 'offi') return P * 0.005;   // 주거용 오피스텔(전용 85㎡ 이하) 0.5%
  const e = P / EOK;
  const r = e < 2 ? 0.5 : e < 9 ? 0.4 : e < 12 ? 0.5 : e < 15 ? 0.6 : 0.7;
  return P * r / 100;
}

// 1세대 1주택 보유세 (연간, 원). 공시가격은 시세의 69%로 가정
const PUBLIC_RATIO = 0.69;
function bracket(base, steps) {             // steps: [[상한, 세율%], ...] 누진
  let tax = 0, prev = 0;
  for (const [cap, rate] of steps) {
    if (base <= prev) break;
    tax += (Math.min(base, cap) - prev) * rate / 100; prev = cap;
  }
  return tax;
}
function holdingTax(price) {
  const pub = price * PUBLIC_RATIO, E = EOK;
  // 재산세: 공시 9억 이하 1주택 특례
  const special = pub <= 9 * E;
  const fmr = special ? (pub <= 3 * E ? 0.43 : pub <= 6 * E ? 0.44 : 0.45) : 0.6;
  const base = pub * fmr;
  const prop = bracket(base, special
    ? [[0.6 * E, 0.05], [1.5 * E, 0.1], [3 * E, 0.2], [Infinity, 0.35]]
    : [[0.6 * E, 0.1], [1.5 * E, 0.15], [3 * E, 0.25], [Infinity, 0.4]]);
  const local = prop * 0.2 + base * 0.0014;  // 지방교육세 + 도시지역분
  // 종합부동산세: 1주택 공제 12억, 공정시장가액비율 60%, 농어촌특별세 20%
  const cb = Math.max(0, pub - 12 * E) * 0.6;
  const comp = bracket(cb, [[3 * E, 0.5], [6 * E, 0.7], [12 * E, 1.0], [25 * E, 1.3], [50 * E, 1.5], [94 * E, 2.0], [Infinity, 2.7]]) * 1.2;
  return prop + local + comp;
}

function simulate(inp, p, growOverride) {
  const P = inp.price * EOK, C = inp.cash * EOK, months = inp.years * 12;
  const g = (growOverride ?? p.grow) / 100;
  const rm = p.mort / 1200, rj = p.jloan / 1200, rd = p.deposit / 1200;

  const upfront = acqTax(P, p.kind) + brokerFee(P, p.kind);
  let bal = Math.max(0, P + upfront - C);
  const loan0 = bal;
  const pay = bal > 0 ? bal * rm / (1 - Math.pow(1 + rm, -360)) : 0;
  let invB = Math.max(0, C - P - upfront);

  let D = p.Dfix ?? P * p.ratio / 100;      // Dfix·Wfix·rentFix: '이 금액이면 뒤집혀요' 계산용 고정값
  let jl = Math.max(0, D - C);
  const jl0 = jl, D0 = D;
  let invJ = Math.max(0, C - D);

  const W = p.Wfix ?? Math.min(C, D * p.wdep / 100); // 월세 보증금은 그 지역 월세 계약의 보통 비율만큼
  const rent0 = p.rentFix ?? (D - W) * p.conv / 100 / 12;
  let invW = C - W;

  // 돈 흐름 합계
  const f = { bInterest: 0, bTax: upfront, bEarn: 0, jInterest: 0, jEarn: 0, wRent: 0, wEarn: 0, spend: 0, top: { buy: 0, jeonse: 0, wolse: 0 } };

  for (let m = 1; m <= months; m++) {
    const yr = Math.floor((m - 1) / 12);
    if (m > 1 && (m - 1) % 24 === 0) {     // 2년마다 전세금 인상분은 대출로
      const nd = D * Math.pow(1 + p.jgrow / 100, 2);
      jl += nd - D; D = nd;
      if (jl < 0) { invJ += -jl; jl = 0; }   // 전세금이 내리면 돌려받은 돈은 대출부터 갚고 남으면 예금
    }
    const tax = holdingTax(P * Math.pow(1 + g, yr)) / 12;   // 그해 집값 기준
    let outB = tax; f.bTax += tax;
    if (bal > 0) { const it = bal * rm; f.bInterest += it; outB += pay; bal = bal + it - pay; }
    const outJ = jl * rj; f.jInterest += outJ;
    const outW = rent0 * Math.pow(1 + p.jgrow / 100, yr); f.wRent += outW;
    const M = Math.max(outB, outJ, outW);  // 같은 돈을 쓰고, 덜 쓴 쪽은 차액을 예금
    f.spend += M;
    f.top[M === outB ? 'buy' : M === outJ ? 'jeonse' : 'wolse']++;   // 어느 쪽이 기준이었는지
    f.bEarn += invB * rd; f.jEarn += invJ * rd; f.wEarn += invW * rd;
    invB = invB * (1 + rd) + (M - outB);
    invJ = invJ * (1 + rd) + (M - outJ);
    invW = invW * (1 + rd) + (M - outW);
  }

  const Pn = P * Math.pow(1 + g, inp.years);
  const sale = brokerFee(Pn, p.kind); f.bTax += sale;
  return {
    buy: Pn - sale - Math.max(0, bal) + invB,
    jeonse: D - jl + invJ,
    wolse: W + invW,
    gain: Pn - P, flow: f,
    ltv: P > 0 ? loan0 / P : 0, jltv: D0 > 0 ? jl0 / D0 : 0, rent0, W, D0,
  };
}

// 같은 크기 집을 이 금액 이하로 빌리면(또는 사면) 결과가 뒤집히는 금액. f는 값이 커질수록 줄어든다고 보고 반씩 좁힘
function solveDown(f, lo, hi) {
  if (f(lo) < 0 || f(hi) > 0) return null;   // 범위 안에 답이 없음
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  return lo;
}
function equivalents(inp, p, res) {
  const fixed = { Dfix: res.D0, Wfix: res.W, rentFix: res.rent0 };
  if (res.buy >= Math.max(res.jeonse, res.wolse)) {
    // 매매가 이길 때: 전세금 / 월세(보증금은 그대로)를 얼마까지 낮춰야 매매만큼 남나
    const P = inp.price * EOK;
    const jeonse = solveDown(D => { const r = simulate(inp, { ...p, ...fixed, Dfix: D }); return r.jeonse - r.buy; }, 0, P * 1.5);
    const rent = solveDown(m => { const r = simulate(inp, { ...p, ...fixed, rentFix: m }); return r.wolse - r.buy; }, 0, 1e7);
    return { side: 'rent', jeonse, rent, W: res.W };
  }
  // 빌리는 쪽이 이길 때: 집값이 얼마 이하면 매매가 따라잡나 (전세·월세 조건은 지금 그대로)
  // 같은 계산 안에서 비교해야 '매달 같은 돈' 기준이 맞음 (집값이 바뀌면 그 기준 금액도 바뀜)
  const price = solveDown(x => { const r = simulate({ ...inp, price: x }, { ...p, ...fixed }); return Math.max(r.jeonse, r.wolse) - r.buy; }, inp.price * 3, 0.1);
  return { side: 'buy', price: price != null ? price * EOK : null };
}

function breakeven(inp, p) {
  const f = g => { const r = simulate(inp, p, g); return r.buy - Math.max(r.jeonse, r.wolse); };
  let lo = -10, hi = 20;
  if (f(lo) > 0) return -Infinity;
  if (f(hi) < 0) return Infinity;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}
// 전세·월세에서 남는 돈을 연 몇 %로 굴려야 매매만큼 남는지
function requiredReturn(inp, p, kind, target) {
  const f = r => simulate(inp, { ...p, deposit: r })[kind] - target;
  let lo = 0, hi = 40;
  while (f(hi) < 0 && hi < 100000) { lo = hi; hi *= 2; }   // 상한 없이 늘려가며 찾음
  if (f(hi) < 0) return Infinity;                          // 굴릴 돈이 거의 없어 따라잡을 수 없음
  if (f(lo) > 0) return 0;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}
function ranking(r) {
  return [['buy', r.buy], ['jeonse', r.jeonse], ['wolse', r.wolse]].sort((a, b) => b[1] - a[1]);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EOK, acqTax, brokerFee, PUBLIC_RATIO, bracket, holdingTax, simulate, solveDown, equivalents, breakeven, requiredReturn, ranking };
}
