CREATE TABLE IF NOT EXISTS quiz_answers (
  quiz_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  choice_index INTEGER NOT NULL CHECK (choice_index BETWEEN 0 AND 2),
  created_at TEXT NOT NULL,
  PRIMARY KEY (quiz_id, question_id, visitor_hash)
);

CREATE INDEX IF NOT EXISTS idx_quiz_answers_question_choice
  ON quiz_answers (quiz_id, question_id, choice_index);

CREATE INDEX IF NOT EXISTS idx_quiz_answers_created_at
  ON quiz_answers (created_at);
