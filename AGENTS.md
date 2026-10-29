# AGENTS.md

영끌각 — 전세·월세·매매 중 N년 뒤 순자산이 가장 큰 쪽을 알려주는 웹 계산기. 정적 사이트, 광고(AdSense) 수익형.

## 구조

```
site/index.html            계산기 페이지 뼈대 (지역 페이지도 이걸 틀로 씀)
site/app.js, site/app.css  화면·지도 그리기·검색·입력 (모든 페이지 공용)
site/engine.js             계산 엔진: 세금·대출·전세 재계약·월세·예금, 뒤집히는 값 (순수 함수, tests/에서 검사)
site/maps.js               지도 모양 데이터(SVG 경로)만
tests/                     엔진·코멘트 규칙 테스트. `node --test tests/*.test.mjs`
functions/api/comments*    지역 코멘트 API (Cloudflare Pages Functions + D1 바인딩 DB)
lib/comments-lib.js        코멘트 검사 규칙(100자·링크·전화·금칙어)·IP 해시. functions/ 밖이라 주소로 안 열림
migrations/                D1 표 만들기 SQL. wrangler.toml에 D1 ID
docs/comments.md           코멘트 켜는 법(배포·D1·비밀값·관리)
site/r/<시군구코드>/       지역별 페이지 (scripts/build_pages.py가 생성, 직접 수정 금지)
site/faq/index.html        계산 방법·자주 묻는 질문 (계산 방식 바꾸면 같이 수정)
site/about/, site/privacy/ 소개, 개인정보 처리방침 (광고·쿠키·데이터 처리 바꾸면 같이 수정)
site/og.png, favicon*      공유 이미지(1200×630), 파비콘(집 도장)
site/robots.txt, llms.txt, sitemap.xml  build_pages.py가 생성
site/data/regions.json     지역 시세 (scripts/collect.py가 생성, 직접 수정 금지)
scripts/collect.py         국토부 실거래가 API 수집 → regions.json
scripts/build_pages.py     지역 페이지(site/r/)·목록, 모든 페이지의 <!-- seo --> 태그·연락처, robots·sitemap·llms.txt 생성
scripts/site_config.json   배포 주소(url)·연락처. url이 비면 canonical·sitemap 생략
scripts/reb_index.py       한국부동산원 아파트 매매·전세가격지수 → index.json (상승률)
scripts/common.py          스크립트 공용 표(시도 이름). 행정구역이 바뀌면 여기와 app.js의 SIDO
scripts/rates.py           한국은행 ECOS 금리(주담대·전세대출·정기예금) → rates.json
data/lawd_codes.json       마지막으로 받은 법정동코드 목록 (API 실패 시 사용, 수집 때 자동 갱신)
data/lawd_fallback.json    저장본도 없을 때 쓰는 예비 시군구 코드
.github/workflows/collect.yml  매달 16일 자동 수집(유형별 작업 → 금리 → 페이지), 수동 실행(test/full/rates/reb/reb-test)
.github/workflows/check.yml    push마다 엔진 테스트·문법 검사
```

## 데이터

- 주택 유형: apt 아파트(regions.json·index.json), villa 연립·다세대(regions-villa.json·index-villa.json), offi 오피스텔(regions-offi.json·index-offi.json). `collect.py --type`, `reb_index.py --type`. 단독·다가구는 매매(건물)와 임대(방) 단위가 달라 제외
- 매매: 국토교통부_아파트 매매 실거래가 상세 자료 (RTMSDataSvcAptTradeDev), 연립다세대(RTMSDataSvcRHTrade2, 끝에 2), 오피스텔(RTMSDataSvcOffiTrade)
- 전월세: 국토교통부_아파트 전월세 실거래가 자료 (RTMSDataSvcAptRent), 연립다세대(RTMSDataSvcRHRent), 오피스텔(RTMSDataSvcOffiRent). 월세 0원 = 전세
- 지수 표: 아파트 A_2024_00045·00050, 연립/다세대 A_2024_00080·00085, 오피스텔(시계열) A_2024_00615·00618
- 시군구 코드: 행정안전부_법정동코드 (StanReginCd), 실패 시 예비 목록
- 상승률: 한국부동산원 R-ONE 월간 아파트 매매가격지수(A_2024_00045)·전세가격지수(A_2024_00050), 항목 100001. `scripts/reb_index.py` → `site/data/index.json`. 기본값은 지수 시작 달부터의 연평균(`gall`), 지수 없는 시군은 시도 지수, 지수 파일이 없으면 실거래 중간값 비교
- 금리: 한국은행 ECOS 예금은행 가중평균금리 신규취급액 (121Y006 주택담보대출·전세자금대출, 121Y002 정기예금), 항목은 이름으로 찾음
- 인증키: GitHub Secret `MOLIT_API_KEY`(공공데이터포털, 매매·전월세·법정동 공용), `ECOS_API_KEY`(한국은행), `REB_API_KEY`(한국부동산원 R-ONE). 코드·페이지에 키 넣지 않기
- 개발계정은 API마다 하루 1만 회. 지수가 없을 때 쓰는 실거래 상승률은 매달이 아니라 5년·10년 전 같은 3개월 창만 받음

## 규칙

- 단순함 우선: 입력은 집 종류(아파트·빌라·오피스텔)·지역·크기·가진 돈·기간, 버튼 없이 즉시 계산, 화면에 전문 용어 금지
- 면적은 항상 평수와 함께: 84㎡(34평형)
- 숫자는 근거와 함께: "○○ 기준 X%로 가정" 표시(결론 옆 "?"를 누르면 보임), 임시값은 임시라고 표시
- 도장 옆에는 결론 한 문장만. 가정·뒤집히는 조건·금액은 결론 옆 "?"에 접어둠. 막대 제목 옆 "?"는 막대 아래 금액이 고른 기간 합계라는 안내
- 판정 문구는 매매/전세/월세 중 이기는 쪽 + 얼마 더 이득인지 금액 ("6년 살면 매매가 전세보다 X원 더 이득이에요", 항상 매매와 비교). 금액은 막대에 보이는 10만 원 단위 금액끼리의 차이, 10만 원 미만이면 "거의 같아요"
- 계산 방식·기본값·데이터 기준을 바꾸면 `site/faq/index.html`의 설명과 숫자도 같은 커밋에서 고치기
- 재산세·종부세·취득세는 법정 세율로 계산(사용자 조정 항목 아님). 세법이 바뀌면 `holdingTax`·`acqTax`와 FAQ 함께 수정. 오피스텔은 취득세 4.6%·중개 0.5% (`acqTax`·`brokerFee`의 kind)
- `site/index.html`·`app.css`·`app.js`·`engine.js`를 바꾸면 `python scripts/build_pages.py`를 돌려 `site/r/`도 같은 커밋에 넣기 (수집 워크플로우도 매달 다시 만듦)
- 주소에 입력값을 담음: `?t=유형(villa·offi, 아파트면 생략)&r=시군구코드&s=크기(전용㎡)&p=직접 넣은 집값&c=가진 돈&y=년`. 지역 페이지는 `window.PRESET_REGION`으로 지역을 정함
- 계산 결과가 바뀌는 수정은 `tests/engine.test.mjs` 기준값도 같이 고치기. 엔진 함수는 `engine.js`에만 두고 화면 코드에서 DOM을 엔진에 넘기지 않기
- 결과는 두 탭: "결과 비교하기"(막대, 기본)와 "그래프로 비교하기"(1~30년 선 그래프, 주소 `v=chart`). 그래프 색은 `.chart`의 `--c-*` (dataviz 검사 통과값, 바꾸면 다시 검사)
- UI: 글씨 크기는 `--fs-*` 6단계만, 펼치기는 꺾쇠(›) 또는 "?" 두 가지만. 폰 입력칸 16px 이상, 누르는 영역 44px
- 공유하기는 결과 칸 오른쪽 위. 밝게/어둡게 버튼은 머리 오른쪽, 고른 값은 localStorage `yk-theme`(모든 페이지 머리의 짧은 스크립트가 적용)
- 후원 링크: Ko-fi https://ko-fi.com/sngmng (첫 화면 맨 아래, 소개 페이지). 광고처럼 튀지 않게 한 줄로만
- 지역 코멘트("○○ 이야기"): 지도 아래 버튼 → PC 오른쪽 패널, 폰 아래 시트. 자동으로 열지 않음. 지역 페이지는 시세 설명 아래 최근 3개. 규칙 바꾸면 tests/comments.test.mjs·개인정보 처리방침·FAQ 같이
