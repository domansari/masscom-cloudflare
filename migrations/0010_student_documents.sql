CREATE TABLE IF NOT EXISTS student_documents (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('photo', 'certificate10', 'certificate12', 'aadhaar_card', 'other')),
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 5242880),
  uploaded_by TEXT NOT NULL REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_student_documents_student
ON student_documents(student_id);
