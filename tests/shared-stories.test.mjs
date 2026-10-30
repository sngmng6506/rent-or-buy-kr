// 실제 코멘트 UI 코드를 두 언어 환경에서 실행해 같은 API·지역 키를 쓰는지 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { checkText, checkTag } from '../worker/rules.js';

const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
const section = app.slice(app.indexOf("const TALK_API ="), app.indexOf('// ── 주소에 입력값 담기'));
const regionParam = app.match(/const regionParam = .*;/)[0];

function client(english, fetch) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: '', innerHTML: '', value: '', hidden: true, checked: true,
      dataset: {}, listeners: {}, classList: { add() {}, remove() {} },
      addEventListener(event, fn) { this.listeners[event] = fn; }, focus() {},
    });
    return nodes.get(id);
  };
  const context = vm.createContext({
    EN: english, L: (ko, en) => english ? en : ko, $: node,
    REG: { 'c:11350': { key: 'c:11350', short: english ? 'Nowon' : '노원구' } },
    state: { region: 'c:11350', type: 'apt', size: '84', years: 6 },
    TYPES: [['apt', english ? 'Apartment' : '아파트'], ['offi', english ? 'Officetel' : '오피스텔']],
    OBJ: { buy: english ? 'buying' : '매매' }, SEAL: { buy: english ? 'BUY' : '매매' },
    PYEONG: { '84': 34, '90': 25 }, lastVerdict: 'buy', sizeText: () => '84㎡(34평형)',
    document: { addEventListener() {}, documentElement: { classList: { add() {}, remove() {} } } },
    localStorage: { getItem: () => null }, location: { search: '' },
    URLSearchParams, Date, Intl, fetch, setTimeout,
  });
  vm.runInContext(regionParam + '\n' + section, context);
  return { node, context, run: code => vm.runInContext(code, context),
    async post(text) {
      node('talk-text').value = text;
      await node('talk-form').listeners.submit({ preventDefault() {} });
    },
  };
}

function sharedApi() {
  const posts = [], requests = [];
  const fetch = async (url, options = {}) => {
    requests.push({ url, ...options });
    if (url.endsWith('/report')) return { ok: true, json: async () => ({ ok: true }) };
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      const item = { id: posts.length + 1, text: body.text, tag: body.tag, created: Date.now() / 1000 };
      posts.unshift({ ...item, region: body.region });
      return { ok: true, json: async () => ({ item }) };
    }
    const query = new URL(url, 'https://test.local').searchParams;
    const all = posts.filter(p => p.region === query.get('region'));
    const before = Number(query.get('before'));
    return { ok: true, json: async () => ({ count: all.length,
      items: all.filter(p => !before || p.id < before).slice(0, Number(query.get('limit'))) }) };
  };
  return { posts, requests, fetch };
}

test('한국어·영어에서 쓴 글을 같은 지역 목록에서 원문 그대로 조회', async () => {
  const api = sharedApi(), ko = client(false, api.fetch), en = client(true, api.fetch);
  await ko.post('노원구에 살고 있어요 <동네>');
  await en.post('I live here too.');
  for (const page of [ko, en]) {
    await page.run('refreshTalkCount()');
    assert.equal(page.node('talk-btn').hidden, false);
    assert.equal(page.node('talk-count').textContent, '2');
    await page.run('loadTalk()');
    assert.match(page.node('talk-list').innerHTML, /I live here too\./);
    assert.match(page.node('talk-list').innerHTML, /노원구에 살고 있어요 &lt;동네&gt;/);
    for (const post of api.posts) assert.ok(page.node('talk-list').innerHTML.includes(post.tag));
  }
  const bodies = api.requests.filter(r => r.method === 'POST').map(r => JSON.parse(r.body));
  assert.deepEqual(bodies.map(b => b.region), ['11350', '11350']);
  assert.ok(bodies.every(b => !('lang' in b) && !('language' in b)));
  assert.ok(api.requests.filter(r => !r.method).every(r => !new URL(r.url, 'https://test.local').searchParams.has('lang')));
  assert.equal(api.posts[0].text, 'I live here too.');
  assert.equal(api.posts[1].text, '노원구에 살고 있어요 <동네>');
});

test('영어 작성의 계산 조건 태그가 공용 저장 규칙을 통과', async () => {
  const en = client(true, sharedApi().fetch);
  for (const type of ['apt', 'offi']) {
    en.context.state.type = type; en.context.state.size = type === 'apt' ? '84' : '90';
    en.context.state.years = 30;
    const tag = en.run('talkTagText()');
    assert.equal(checkTag(tag), tag);
  }
  assert.equal(checkText('I rented here last year.').text, 'I rented here last year.');
});

test('영어 페이지에서도 공용 작성 제한 오류를 영어로 표시', async () => {
  const en = client(true, async () => ({ ok: false, json: async () => ({ error: 'RATE', message: '1분에 한 번만 남길 수 있어요.' }) }));
  await en.post('Another story');
  assert.match(en.node('talk-msg').textContent, /once a minute/);
  assert.equal(en.node('talk-send').textContent, 'Post');
  assert.equal(en.node('talk-text').value, 'Another story');
});

test('한국어·영어 신고가 같은 코멘트 ID를 사용', async () => {
  const api = sharedApi();
  for (const english of [false, true]) {
    const page = client(english, api.fetch);
    const report = { dataset: { id: '7' }, textContent: '' };
    await page.node('talk-list').listeners.click({ target: { closest: selector => selector === '.talk-report' ? report : null } });
    const request = api.requests.at(-1);
    assert.equal(request.url, '/api/comments/report');
    assert.deepEqual(JSON.parse(request.body), { id: '7' });
  }
});
