# 영끌각

같은 돈, 같은 기간이면 몇 년 뒤 내 돈이 가장 많이 남는 건 매매·전세·월세 중 어디일까?
지역을 고르고 가진 돈과 거주 기간만 넣으면 바로 알려주는 웹 계산기.

## 데이터 갱신

1. 저장소 Settings → Secrets and variables → Actions에 `MOLIT_API_KEY` 등록 (공공데이터포털 일반 인증키)
2. Actions → Collect prices → Run workflow
   - `test`: 노원구 한 달치로 키와 응답 확인
   - `full`: 전체 수집 후 `site/data/regions.json` 커밋
3. 이후 매달 16일 자동 갱신

출처: 국토교통부 실거래가 공개시스템 (공공데이터포털 API)
