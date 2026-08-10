CREATE TABLE IF NOT EXISTS model_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  commenter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_model_comments_model_id_created_at
  ON model_comments(model_id, created_at);

CREATE INDEX IF NOT EXISTS idx_model_comments_model_id_id
  ON model_comments(model_id, id);