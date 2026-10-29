// 계산 엔진(site/engine.js) 테스트. 실행: node --test tests/
// 숫자를 바꾸는 수정이 의도된 것이면 아래 '기준값'도 같이 고치고 FAQ를 확인할 것
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const e = require('../site/engine.js');
const EOK = 1e8;

// 노원구 84㎡(34평형), 2026년 10월 데이터 기준과 비슷한 조건
const P = { kind: 'apt', mort: 4.66, jloan: 4.35, deposit: 3.14, conv: 4.8, wdep: 14.3, jgrow: 3.9, grow: 3.6, ratio: 64.1 };
const INP = { price: 8.3, cash: 3, years: 6 };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('취득세: 6억 이하 1%, 9억 초과 3% (+지방교육세 10%), 오피스텔 4.6%', () => {
  near(e.acqTax(5 * EOK), 5 * EOK * 0.011, 1, '5억');
  near(e.acqTax(10 * EOK), 10 * EOK * 0.033, 1, '10억');
  near(e.acqTax(7.5 * EOK), 7.5 * EOK * (7.5 * 2 / 3 - 3) / 100 * 1.1, 1, '7.5억(구간 사이)');
  near(e.acqTax(3 * EOK, 'offi'), 3 * EOK * 0.046, 1, '오피스텔');
});

test('중개수수료 상한 요율', () => {
  near(e.brokerFee(1 * EOK), 1 * EOK * 0.005, 1, '1억');
  near(e.brokerFee(5 * EOK), 5 * EOK * 0.004, 1, '5억');
  near(e.brokerFee(20 * EOK), 20 * EOK * 0.007, 1, '20억');
  near(e.brokerFee(5 * EOK, 'offi'), 5 * EOK * 0.005, 1, '오피스텔');
});

test('보유세: 0원이면 0, 집값이 오르면 줄지 않음, 비싼 집은 종부세가 붙어 크게 뜀', () => {
  assert.equal(e.holdingTax(0), 0);
  let prev = 0;
  for (let v = 1; v <= 60; v++) { const t = e.holdingTax(v * EOK); assert.ok(t >= prev, `${v}억에서 줄어듦`); prev = t; }
  assert.ok(e.holdingTax(30 * EOK) > e.holdingTax(15 * EOK) * 2, '종부세 구간');
});

test('기준값: 노원구 6년 (바뀌면 의도한 변경인지 확인)', () => {
  const r = e.simulate(INP, P);
  near(r.buy / 1e4, 52362, 50, '매매');
  near(r.jeonse / 1e4, 45438, 50, '전세');
  near(r.wolse / 1e4, 42065, 50, '월세');
  near(r.flow.spend / 1e4, 21193, 50, '매달 쓴 돈 합계');
});

test('결과가 뒤집히는 집값 상승률에서는 매매와 빌리는 쪽이 같아짐', () => {
  const be = e.breakeven(INP, P);
  near(be, 2.39, 0.02, '노원 상승률');
  const r = e.simulate(INP, P, be);
  near(r.buy, Math.max(r.jeonse, r.wolse), 1e5, '같아지는 지점');
});

test('"이 금액보다 싸면" 금액보다 1% 싸게 넣으면 실제로 결과가 뒤집힘', () => {
  const r = e.simulate(INP, P);
  const eq = e.equivalents(INP, P, r);
  assert.equal(eq.side, 'rent');
  const fixed = { Dfix: r.D0, Wfix: r.W, rentFix: r.rent0 };
  const j = e.simulate(INP, { ...P, ...fixed, Dfix: eq.jeonse * 0.99 });
  assert.ok(j.jeonse > j.buy, '전세');
  const m = e.simulate(INP, { ...P, ...fixed, rentFix: eq.rent * 0.99 });
  assert.ok(m.wolse > m.buy, '월세');
  // 빌리는 쪽이 이길 때는 집값
  const P2 = { ...P, grow: 0.5 };
  const r2 = e.simulate(INP, P2);
  const eq2 = e.equivalents(INP, P2, r2);
  assert.equal(eq2.side, 'buy');
  const b = e.simulate({ ...INP, price: eq2.price / EOK * 0.99 }, { ...P2, Dfix: r2.D0, Wfix: r2.W, rentFix: r2.rent0 });
  assert.ok(b.buy > Math.max(b.jeonse, b.wolse), '집값');
});

test('전세금이 내려가도 전세대출 이자가 마이너스가 되지 않음', () => {
  const r = e.simulate({ price: 3, cash: 3, years: 10 }, { ...P, jgrow: -2, ratio: 110, grow: -2 });
  assert.ok(r.flow.jInterest >= 0, `이자 ${r.flow.jInterest}`);
});

test('극단적인 입력에서도 숫자가 나옴 (NaN·무한대 없음)', () => {
  const cases = [
    [{ price: 8.3, cash: 0, years: 1 }, P],
    [{ price: 8.3, cash: 20, years: 30 }, P],
    [{ price: 0.5, cash: 3, years: 6 }, { ...P, ratio: 120 }],
    [{ price: 40, cash: 1, years: 6 }, { ...P, grow: -5 }],
    [{ price: 2, cash: 1, years: 6 }, { ...P, kind: 'offi', conv: 0, wdep: 0 }],
  ];
  for (const [inp, p] of cases) {
    const r = e.simulate(inp, p);
    for (const k of ['buy', 'jeonse', 'wolse']) assert.ok(Number.isFinite(r[k]), `${k} ${JSON.stringify(inp)}`);
    const eq = e.equivalents(inp, p, r);
    for (const v of [eq.jeonse, eq.rent, eq.price]) assert.ok(v == null || Number.isFinite(v));
  }
});

test('매달 쓰는 돈은 셋이 같고, 기간이 길수록 늘어남', () => {
  const a = e.simulate({ ...INP, years: 4 }, P), b = e.simulate({ ...INP, years: 8 }, P);
  assert.ok(b.flow.spend > a.flow.spend);
});

test('대출 없이(noLoan): 가진 돈이 모자라면 매매·전세는 할 수 없고, 판정에서 빠짐', () => {
  const p = { ...P, noLoan: true };
  const r = e.simulate(INP, p);   // 가진 돈 3억 < 집값 8.3억, 전세금 5.3억
  assert.equal(r.ok.buy, false); assert.equal(r.ok.jeonse, false); assert.equal(r.ok.wolse, true);
  assert.deepEqual(e.ranking(r).map(x => x[0]), ['wolse']);
  const rich = e.simulate({ ...INP, cash: 10 }, p);
  assert.ok(rich.ok.buy && rich.ok.jeonse);
  assert.equal(rich.flow.bInterest, 0);
  // 대출을 받을 수 있으면 결과가 그대로
  const same = e.simulate(INP, { ...P, noLoan: false });
  near(same.buy / 1e4, 52362, 50, '매매');
});

test('지역 이름 로마자: 소리 바뀜과 시·군·구', () => {
  const R = require('../site/romanize.js');
  const want = { '종로구': 'Jongno-gu', '중랑구': 'Jungnang-gu', '신림': 'Sillim', '왕십리': 'Wangsimni', '강릉시': 'Gangneung-si',
    '덕양구': 'Deogyang-gu', '광양시': 'Gwangyang-si', '수원시 장안구': 'Suwon-si Jangan-gu', '대구': 'Daegu', '울릉군': 'Ulleung-gun' };
  for (const [ko, en] of Object.entries(want)) assert.equal(R.place(ko), en, ko);
});
