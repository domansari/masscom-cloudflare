CREATE TABLE IF NOT EXISTS student_id_cards (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  registration_no TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_student_id_cards_student
ON student_id_cards(student_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_id_cards_registration
ON student_id_cards(registration_no COLLATE NOCASE);
