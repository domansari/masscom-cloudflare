CREATE TABLE IF NOT EXISTS fee_payments (
  id TEXT PRIMARY KEY,
  receipt_no TEXT NOT NULL UNIQUE,
  student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
  student_name TEXT NOT NULL,
  enrollment_no TEXT,
  fee_category TEXT NOT NULL CHECK (fee_category IN ('Admission Fee', 'Monthly Fee', 'Exam Fee', 'Other')),
  amount REAL NOT NULL CHECK (amount > 0),
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque')),
  period TEXT,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fee_payments_date
ON fee_payments(payment_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fee_payments_student
ON fee_payments(student_id, payment_date DESC);
