-- model_comments 에서 models(id) 외래키를 제거한다.
-- 사유: 댓글은 models.json 의 모든 게시 모델 ID에 허용되어야 하지만,
-- D1 은 외래키를 기본 강제하므로 models 테이블에 없는 ID 의 INSERT 가 차단된다.
-- SQLite 는 ALTER TABLE ... DROP CONSTRAINT 를 지원하지 않으므로 테이블을 재구축한다.

CREATE TABLE IF NOT EXISTS model_comments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  commenter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO model_comments_new (id, model_id, author_name, content, commenter_hash, created_at)
  SELECT id, model_id, author_name, content, commenter_hash, created_at FROM model_comments;

DROP TABLE model_comments;

ALTER TABLE model_comments_new RENAME TO model_comments;

CREATE INDEX IF NOT EXISTS idx_model_comments_model_id_created_at
  ON model_comments(model_id, created_at);

CREATE INDEX IF NOT EXISTS idx_model_comments_model_id_id
  ON model_comments(model_id, id);
