# AGENTS.md

영끌각 — 전세·월세·매매 중 N년 뒤 순자산이 가장 큰 쪽을 알려주는 웹 계산기. 정적 사이트, 광고(AdSense) 수익형.

## 구조

```
site/index.html            계산기 페이지 뼈대 (지역 페이지도 이걸 틀로 씀)
site/app.js, site/app.css  계산 엔진·지도·검색·화면 (모든 페이지 공용)
site/r/<시군구코드>/       지역별 페이지 (scripts/build_pages.py가 생성, 직접 수정 금지)
site/faq/index.html        계산 방법·자주 묻는 질문 (계산 방식 바꾸면 같이 수정)
site/data/regions.json     지역 시세 (scripts/collect.py가 생성, 직접 수정 금지)
scripts/collect.py         국토부 실거래가 API 수집 → regions.json
scripts/build_pages.py     regions.json + index.html → site/r/ 지역 페이지·목록
scripts/rates.py           한국은행 ECOS 금리(주담대·전세대출·정기예금) → rates.json
data/lawd_codes.json       마지막으로 받은 법정동코드 목록 (API 실패 시 사용, 수집 때 자동 갱신)
data/lawd_fallback.json    저장본도 없을 때 쓰는 예비 시군구 코드
.github/workflows/collect.yml  매달 16일 자동 수집, 수동 실행(test/full)
```

## 데이터

- 매매: 국토교통부_아파트 매매 실거래가 상세 자료 (RTMSDataSvcAptTradeDev)
- 전월세: 국토교통부_아파트 전월세 실거래가 자료 (RTMSDataSvcAptRent), 월세 0원 = 전세
- 시군구 코드: 행정안전부_법정동코드 (StanReginCd), 실패 시 예비 목록
- 금리: 한국은행 ECOS 예금은행 가중평균금리 신규취급액 (121Y006 주택담보대출·전세자금대출, 121Y002 정기예금), 항목은 이름으로 찾음
- 인증키: GitHub Secret `MOLIT_API_KEY`(공공데이터포털, 매매·전월세·법정동 공용), `ECOS_API_KEY`(한국은행). 코드·페이지에 키 넣지 않기
- 개발계정은 하루 호출 수 제한이 있음. 상승률은 매달이 아니라 5년·10년 전 같은 3개월 창만 받음

## 규칙

- 단순함 우선: 입력 3개(지역·가진 돈·기간), 버튼 없이 즉시 계산, 화면에 전문 용어 금지
- 면적은 항상 평수와 함께: 84㎡(34평형)
- 숫자는 근거와 함께: 화면에 "○○ 기준 X%로 가정" 표시, 임시값은 임시라고 표시
- 판정 문구는 매매/전세/월세 중 이기는 쪽 + 얼마 더 남는지 금액
- 계산 방식·기본값·데이터 기준을 바꾸면 `site/faq/index.html`의 설명과 숫자도 같은 커밋에서 고치기
- 재산세·종부세·취득세는 법정 세율로 계산(사용자 조정 항목 아님). 세법이 바뀌면 `holdingTax`·`acqTax`와 FAQ 함께 수정
- `site/index.html`·`app.css`·`app.js`를 바꾸면 `python scripts/build_pages.py`를 돌려 `site/r/`도 같은 커밋에 넣기 (수집 워크플로우도 매달 다시 만듦)
- 주소에 입력값을 담음: `?r=시군구코드&s=평형(전용㎡)&p=직접 넣은 집값&c=가진 돈&y=년`. 지역 페이지는 `window.PRESET_REGION`으로 지역을 정함
