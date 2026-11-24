ALTER TABLE students ADD COLUMN course_duration_months INTEGER;
ALTER TABLE students ADD COLUMN waive_last_two_months INTEGER NOT NULL DEFAULT 0 CHECK (waive_last_two_months IN (0, 1));
ALTER TABLE fee_payments ADD COLUMN fee_plan_item_id TEXT;

UPDATE students
SET course_duration_months = CASE lower(trim(course_name))
  WHEN 'diploma in computer application' THEN 8
  WHEN 'advance diploma in computer application' THEN 12
  WHEN 'certificate course in computer accountancy' THEN 4
  WHEN 'advance diploma in computer accountancy' THEN 12
  WHEN 'certificate course in desktop publishing' THEN 4
  WHEN 'advance diploma in desktop publishing' THEN 12
  WHEN 'diploma in dtp' THEN 4
  ELSE course_duration_months
END
WHERE course_duration_months IS NULL;

CREATE TABLE student_fee_plan_items (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_category TEXT NOT NULL CHECK (fee_category IN ('Admission Fee', 'Monthly Fee', 'Certificate Issue Fee', 'Reexam Fee')),
  amount REAL NOT NULL CHECK (amount > 0),
  due_date TEXT NOT NULL,
  period TEXT NOT NULL DEFAULT '',
  is_waived INTEGER NOT NULL DEFAULT 0 CHECK (is_waived IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  description TEXT,
  created_by TEXT REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, fee_category, period)
);

CREATE INDEX idx_student_fee_plan_student_due
ON student_fee_plan_items(student_id, is_active, due_date);

CREATE INDEX idx_fee_payments_plan_item
ON fee_payments(fee_plan_item_id);
