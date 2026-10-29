// 지역 이름 로마자 표기 (국어의 로마자 표기법, 영어 페이지 전용)
// 받침과 다음 글자 사이 소리 바뀜(종로 → Jongno, 신림 → Sillim, 왕십리 → Wangsimni)까지 반영. 시·군·구는 '-si', '-gun', '-gu'로 떼어 씀
const RR = (() => {
  const INI = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
  const MED = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
  // 받침 → 대표음 (0 없음, k, n, t, l, m, p, ng)
  const FIN = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
  // 받침이 뒤 'ㅇ'으로 넘어갈 때의 소리 (연음)
  const LINK = ['', 'g', 'kk', 'gs', 'n', 'nj', 'nh', 'd', 'r', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h'];   // ㅇ받침은 넘어가지 않음 (광양 → Gwangyang)
  const SUFFIX = { '시': 'si', '군': 'gun', '구': 'gu', '읍': 'eup', '면': 'myeon', '동': 'dong' };

  function syllables(word) {
    const out = [];
    for (const ch of word) {
      const c = ch.codePointAt(0) - 0xac00;
      if (c < 0 || c > 11171) { out.push({ raw: ch }); continue; }
      out.push({ i: Math.floor(c / 588), m: Math.floor((c % 588) / 28), f: c % 28 });
    }
    return out;
  }
  function stem(word) {
    const s = syllables(word);
    let res = '';
    for (let k = 0; k < s.length; k++) {
      const a = s[k];
      if (a.raw) { res += a.raw; continue; }
      let ini = INI[a.i];
      const prev = s[k - 1];
      if (k === 0 && a.i === 5) ini = 'r';   // 첫소리 ㄹ (드묾)
      if (prev && !prev.raw) {
        const pf = FIN[prev.f];
        if (a.i === 11 && prev.f) ini = '';                       // 연음은 앞 글자에서 처리
        else if (a.i === 5 && prev.f) ini = (pf === 'n' || pf === 'l') ? 'l' : 'n';   // ㄴ·ㄹ+ㄹ → ll, 그 밖 받침+ㄹ → n
        else if (a.i === 2 && pf === 'l') ini = 'l';               // ㄹ+ㄴ → ll
      }
      res += ini + MED[a.m];
      if (a.f) {
        const next = s[k + 1];
        const nIni = next && !next.raw ? next.i : -1;
        let fin = FIN[a.f];
        if (nIni === 11) fin = LINK[a.f];                          // 덕양 → Deogyang
        else if (nIni === 2 || nIni === 6 || nIni === 5) {          // 비음화: ㄱ→ng, ㄷ→n, ㅂ→m
          if (fin === 'k') fin = 'ng'; else if (fin === 't') fin = 'n'; else if (fin === 'p') fin = 'm';
          if (nIni === 5 && fin === 'n') fin = 'l';                 // 신림 → Sillim
        }
        res += fin;
      }
    }
    return res;
  }
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
  // '수원시 장안구' → 'Suwon-si Jangan-gu', '노원구' → 'Nowon-gu', '서울' → 'Seoul'
  // 관례 표기가 따로 있는 이름
  const FIXED = { '대구': 'Daegu', '전남광주': 'Gwangju-Jeonnam', '센텀': 'Centum', '한강신도시': 'Hangang New Town', '세종시': 'Sejong', '세종특별자치시': 'Sejong' };
  function place(name) {
    return String(name).split(/\s+/).filter(Boolean).map(w => {
      if (FIXED[w]) return FIXED[w];
      const last = w.slice(-1);
      if (w.length >= 2 && SUFFIX[last]) return cap(stem(w.slice(0, -1))) + '-' + SUFFIX[last];
      return cap(stem(w));
    }).join(' ');
  }
  return { stem, place };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RR;
