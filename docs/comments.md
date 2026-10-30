# 이 동네 이야기 (지역 코멘트) 켜기

사이트는 Cloudflare Workers 하나로 배포한다. `site/`는 정적 파일(assets)로 바로 나가고, `/api/*`만 `worker/index.js`가 처리한다.
"○○ 이야기" 버튼과 지역 페이지의 최근 이야기는 이 API와 Cloudflare D1(무료 SQLite)로 동작한다. D1을 연결하기 전에는 API가 503을 돌려주고 버튼은 숨겨진다.

한국어·영어 페이지는 같은 지역 키로 같은 글 목록을 조회하고 작성한다. 언어별 저장소나 필터는 없으며, 본문과 계산 조건 태그는 작성 당시 원문 그대로 표시한다. 기존 글도 그대로 공유한다.

## API 계약

모든 응답은 JSON이며 `cache-control: no-store`를 보낸다. 오류는 항상 `{ "error": "코드", "message": "사용자 안내" }` 형식이다. `DB` 또는 필수 비밀값 `HASH_SALT`가 빠지면 모든 `/api/*` 요청은 각각 `NO_DB` 또는 `NO_CONFIG`과 함께 `503`을 반환한다.

| 요청 | 입력 | 성공 응답 | 주요 오류 |
| --- | --- | --- | --- |
| `GET /api/comments?region=&limit=&before=` | `region`은 지역 키, `limit`은 0~30, `before`는 이전 글 ID | `200 { count, items }` | `400 REGION` |
| `POST /api/comments` | `{ region, text, tag? }` | `201 { item }` | `400 REGION`, `EMPTY`, `TOO_LONG`, `LINK`, `PHONE`, `BANNED`; `429 RATE` |
| `POST /api/comments/report` | `{ id }` | `200 { ok: true }` | `400 ID`; `404 NOT_FOUND` (없는 댓글) |
| `DELETE /api/comments/:id` | `x-admin-key` 헤더 | `200 { ok: true }` | `403 ADMIN`; `400 ID` |

지원하지 않는 메서드는 `405 METHOD`, 없는 API 경로는 `404 NOT_FOUND`를 반환한다. 신고는 같은 IP 해시와 댓글 ID 조합으로 한 번만 반영하며, 없는 ID의 신고는 저장하지 않는다.

## 1. Worker 프로젝트 (한 번)
- Cloudflare 대시보드 → Workers & Pages → 만들기 → Workers → Git 저장소 가져오기 → `rent-or-buy-kr`
- 프로젝트 이름 `buy-or-rent-kr` (wrangler.toml의 `name`과 같아야 함)
- 빌드 명령: 비움 / 배포 명령: `npx wrangler deploy` (기본값) / 루트 디렉터리: 비움
- 도메인: 설정 → 도메인 및 경로 → 사용자 지정 도메인 `rent-or-buy-kr.app`

## 2. D1 데이터베이스 (한 번)
- Workers & Pages → D1 → 만들기 → 이름 `buy-or-rent-kr`
- 만든 DB의 ID를 `wrangler.toml`의 `database_id`에 넣고 커밋 (연결 완료: 2026-10)
- DB 화면 → 콘솔에 `migrations/0001_comments.sql` 내용을 붙여 넣고 실행 (표 만들기)

## 3. 비밀값 (한 번)
- Worker 프로젝트 → 설정 → 변수 및 비밀 → 비밀(Secret)로 추가
  - `ADMIN_KEY`: 삭제용 비밀번호 (길게 아무 문자열)
  - `HASH_SALT`: **필수** IP 해시용 긴 무작위 문자열 (없으면 API는 503, 바꾸면 1분 제한·신고 기록이 초기화됨)
- 다시 배포하면 적용

## 4. 운영
- 내 브라우저에서 한 번 `https://도메인/?admin=ADMIN_KEY`로 열면, 그 브라우저에서만 코멘트마다 "삭제"가 보임
- 신고 3번이면 자동으로 숨김. 숨긴 글을 다시 보이게 하려면 D1 콘솔에서 `UPDATE comments SET hidden = 0, reports = 0 WHERE id = …`
- 무료 한도: D1 하루 읽기 500만 행·쓰기 10만 행, Worker 하루 10만 요청(/api/*만 셈, 정적 파일은 무제한). 넘으면 그날만 오류(요금 없음)

## 로컬 시험
```bash
npx wrangler d1 migrations apply buy-or-rent-kr --local
printf 'ADMIN_KEY=test\nHASH_SALT=local\n' > .dev.vars
npx wrangler dev              # http://localhost:8787 (D1 주석을 푼 설정으로)
```

## 규칙 (worker/rules.js)
- 100자, 로그인·닉네임 없음, 1분에 1개
- 주소·도메인·오픈채팅·전화번호(010-, 02-, 1588-) 막기, 금칙어 `BANNED`
- IP 원본은 저장하지 않고 소금 친 해시 앞 16자만 (1분 제한·신고 중복 확인용)
