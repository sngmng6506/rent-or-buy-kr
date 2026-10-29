// 코멘트 검사 규칙 (lib/comments-lib.js) 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkText, checkTag, REGION_RE } from '../lib/comments-lib.js';

test('정상 글은 통과, 공백 정리', () => {
  assert.equal(checkText('  작년에 34평   전세 5억에 들어왔어요 ').text, '작년에 34평 전세 5억에 들어왔어요');
  assert.ok(checkText('84㎡ 1,200만원 올랐어요, 2024년 계약').text);
  assert.ok(checkText('2년 뒤 3억 5천에 팔았어요').text);
});
test('빈 글·100자 넘는 글 막기', () => {
  assert.equal(checkText('   ').error, 'EMPTY');
  assert.equal(checkText('가'.repeat(101)).error, 'TOO_LONG');
  assert.ok(checkText('가'.repeat(100)).text);
});
test('링크·연락처·광고 막기', () => {
  for (const s of ['https://a.b', 'www.abc.com 보세요', 'abc.kr', '오픈채팅 오세요', 'open.kakao.com/o/x', '카톡: abc'])
    assert.equal(checkText(s).error, 'LINK', s);
  for (const s of ['010-1234-5678', '02 123 4567', '1588-1234 상담'])
    assert.equal(checkText(s).error, 'PHONE', s);
  assert.equal(checkText('분양 문의 주세요').error, 'BANNED');
  assert.equal(checkText('ㅅㅂ 비싸네').error, 'BANNED');
});
test('조건 표시와 지역 키', () => {
  assert.equal(checkTag('아파트 84㎡(34평형) · 6년 · 매매 이득'), '아파트 84㎡(34평형) · 6년 · 매매 이득');
  assert.equal(checkTag('<script>'), null);
  assert.ok(REGION_RE.test('11350') && REGION_RE.test('sido:11') && REGION_RE.test('cap:수원'));
  assert.ok(!REGION_RE.test('../etc') && !REGION_RE.test(''));
});
