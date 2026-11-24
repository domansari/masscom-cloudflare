CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  student_name TEXT NOT NULL,
  father_name TEXT,
  roll_no TEXT,
  batch_code TEXT,
  course_name TEXT,
  admission_date TEXT,
  date_of_birth TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_students_name ON students(student_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_students_roll_batch ON students(roll_no COLLATE NOCASE, batch_code COLLATE NOCASE);
