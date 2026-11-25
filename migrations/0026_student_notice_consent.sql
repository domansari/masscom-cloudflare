CREATE TABLE IF NOT EXISTS student_notice_consent (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES admin_users(id)
);
