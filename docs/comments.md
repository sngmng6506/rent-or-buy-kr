# 이 동네 이야기 (지역 코멘트) 켜기

계산기의 "○○ 이야기" 버튼과 지역 페이지의 최근 이야기는 Cloudflare Pages Functions(`functions/api/`)와
Cloudflare D1(무료 SQLite)로 동작한다. 정적 파일만 올리면 버튼은 보이지만 "불러올 수 없어요"가 뜬다.

## 1. Pages 프로젝트 (한 번)
- Cloudflare 대시보드 → Workers & Pages → 만들기 → Pages → GitHub 연결 → `rent-or-buy-kr`
- 빌드 명령: 비움 / 빌드 출력 디렉터리: `site` / 루트 디렉터리: 비움(저장소 맨 위)
- `functions/`는 저장소 맨 위에 있어야 함 (지금 구조 그대로)

## 2. D1 데이터베이스 (한 번)
- Workers & Pages → D1 → 만들기 → 이름 `yeongkkeul-comments`
- 만든 DB의 ID를 `wrangler.toml`의 `database_id`에 넣고 커밋
- DB 화면 → 콘솔에 `migrations/0001_comments.sql` 내용을 붙여 넣고 실행 (표 만들기)

## 3. 비밀값 (한 번)
- Pages 프로젝트 → 설정 → 변수 및 비밀 → 비밀(암호화)로 추가
  - `ADMIN_KEY`: 삭제용 비밀번호 (길게 아무 문자열)
  - `HASH_SALT`: IP 해시용 아무 문자열 (바꾸면 1분 제한·신고 기록이 초기화됨)
- 다시 배포하면 적용

## 4. 운영
- 내 브라우저에서 한 번 `https://도메인/?admin=ADMIN_KEY`로 열면, 그 브라우저에서만 코멘트마다 "삭제"가 보임
- 신고 3번이면 자동으로 숨김. 숨긴 글을 다시 보이게 하려면 D1 콘솔에서 `UPDATE comments SET hidden = 0, reports = 0 WHERE id = …`
- 무료 한도: D1 하루 읽기 500만 행·쓰기 10만 행, Functions 하루 10만 요청. 넘으면 그날만 오류(요금 없음)

## 로컬 시험
```bash
npx wrangler d1 migrations apply yeongkkeul-comments --local
printf 'ADMIN_KEY=test\nHASH_SALT=local\n' > .dev.vars
npx wrangler pages dev        # http://localhost:8788
```

## 규칙 (lib/comments-lib.js)
- 100자, 로그인·닉네임 없음, 1분에 1개
- 주소·도메인·오픈채팅·전화번호(010-, 02-, 1588-) 막기, 금칙어 `BANNED`
- IP 원본은 저장하지 않고 소금 친 해시 앞 16자만 (1분 제한·신고 중복 확인용)
