// 코멘트 검사 규칙 (worker/rules.js) 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkText, checkTag, REGION_RE } from '../worker/rules.js';
import worker from '../worker/index.js';
import { report } from '../worker/comments.js';

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

test('없는 코멘트 신고는 저장하지 않고 404를 돌려준다', async () => {
  let writes = 0;
  const env = {
    HASH_SALT: 'test-salt',
    DB: { prepare() { return { bind() { return {
      first: async () => null,
      run: async () => { writes += 1; },
    }; } }; } },
  };
  const response = await report(new Request('https://example.test/api/comments/report', {
    method: 'POST', body: JSON.stringify({ id: 999 }),
  }), env);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'NOT_FOUND', message: '없는 코멘트예요.' });
  assert.equal(writes, 0);
});

test('HASH_SALT가 없으면 코멘트 API를 열지 않는다', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/comments'), { DB: {} });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'NO_CONFIG', message: '코멘트 설정이 아직 완료되지 않았어요.' });
});
