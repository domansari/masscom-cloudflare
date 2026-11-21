CREATE TABLE IF NOT EXISTS marksheets (
  id TEXT PRIMARY KEY,
  registration_no TEXT NOT NULL UNIQUE COLLATE NOCASE,
  student_name TEXT NOT NULL,
  first_terminal INTEGER NOT NULL CHECK (first_terminal BETWEEN 0 AND 100),
  second_terminal INTEGER NOT NULL CHECK (second_terminal BETWEEN 0 AND 100),
  issued_on TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES admin_users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
