# 영끌각

같은 돈, 같은 기간이면 몇 년 뒤 내 자산이 가장 많이 남는 건 매매·전세·월세 중 어디일까?
집 종류(아파트·빌라·오피스텔)와 지역을 고르고 가진 돈과 거주 기간만 넣으면 바로 알려주는 웹 계산기.

## 데이터 갱신

1. 저장소 Settings → Secrets and variables → Actions에 `MOLIT_API_KEY`(공공데이터포털), `ECOS_API_KEY`(한국은행), `REB_API_KEY`(한국부동산원 R-ONE) 등록
2. Actions → Collect prices → Run workflow
   - `test`: 키와 응답 확인
   - `full`: 시세·지수·금리 전체 수집 후 커밋, 지역 페이지 다시 만들기
3. 이후 매달 16일 자동 갱신

코멘트("○○ 이야기") 켜는 법은 [docs/comments.md](docs/comments.md), 작업 규칙은 [AGENTS.md](AGENTS.md).

출처: 국토교통부 실거래가 공개시스템(공공데이터포털 API), 한국부동산원 R-ONE, 한국은행 ECOS

## 향후 일정

- [ ] 도메인(rent-or-buy-kr.app) 연결, Cloudflare Pages 배포, 코멘트용 D1 연결
- [ ] Google Search Console·네이버 서치어드바이저 등록, AdSense 신청
- 보류: **AI로 예측하기 (시험)**. 지수 데이터는 2003년 이후 큰 흐름이 4번 정도뿐이라 장기 평균을 이기기 어렵다고 봄. 실거래 원본(천만 건 이상)을 쌓으면 다시 검토. 기획: [docs/ai-forecast.md](docs/ai-forecast.md)
