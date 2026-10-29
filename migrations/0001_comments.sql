-- 지역별 한 줄 코멘트. 로그인 없음, IP는 원본 대신 해시(앞 16자)만
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region TEXT NOT NULL,          -- 계산기 지역 키 (시군구 코드 11350, 묶음 sido:11 등)
  text TEXT NOT NULL,            -- 최대 100자
  tag TEXT,                      -- 쓴 사람의 계산 조건 (예: 아파트 34평형 · 6년 · 매매 이득), 선택
  ip_hash TEXT NOT NULL,         -- 연속 작성·신고 중복 막기용
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL    -- 유닉스 초
);
CREATE INDEX IF NOT EXISTS idx_comments_region ON comments (region, hidden, id DESC);
CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS comment_reports (
  comment_id INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  PRIMARY KEY (comment_id, ip_hash)
);
