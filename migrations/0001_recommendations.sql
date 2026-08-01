CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  base_recommendations INTEGER NOT NULL DEFAULT 0 CHECK (base_recommendations >= 0),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recommendation_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
  UNIQUE (model_id, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_votes_model_id
  ON recommendation_votes(model_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_votes_voter_hash_created_at
  ON recommendation_votes(voter_hash, created_at);

INSERT OR IGNORE INTO models (id, display_name, category, base_recommendations, is_demo, status) VALUES
  ('luna-miro', 'Luna Miro', 'model', 284, 1, 'active'),
  ('hana-velvet', 'Hana Velvet', 'gravure', 231, 1, 'active'),
  ('aria-nova', 'Aria Nova', 'cosplay', 318, 1, 'active'),
  ('mio-rey', 'Mio Rey', 'model', 176, 1, 'active'),
  ('noa-citrine', 'Noa Citrine', 'gravure', 199, 1, 'active'),
  ('sora-ki', 'Sora Ki', 'cosplay', 267, 1, 'active');
