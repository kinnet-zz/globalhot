-- 실시간 화제 랭킹: 커뮤니티 수동 등록 (X/인스타/스레드 등 공식 임베드 게시물)
-- 임베드 URL만 저장 (콘텐츠 복제 없음). 스팸 방지를 위해 IP 해시 + 일일 등록 한도.
CREATE TABLE IF NOT EXISTS rank_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  platform TEXT NOT NULL,          -- x | instagram | threads | youtube | other
  note TEXT,                       -- 등록자 한줄 메모 (선택, 200자)
  submitter_hash TEXT NOT NULL,    -- COMMENTS_SALT 기반 IP 해시
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rank_submissions_recent ON rank_submissions (status, id DESC);
CREATE INDEX IF NOT EXISTS idx_rank_submissions_hash ON rank_submissions (submitter_hash, created_at);
