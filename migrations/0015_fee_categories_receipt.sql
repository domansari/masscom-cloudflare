CREATE TABLE fee_payments_final (
  id TEXT PRIMARY KEY,
  receipt_no TEXT NOT NULL UNIQUE,
  student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
  student_name TEXT NOT NULL,
  enrollment_no TEXT,
  fee_category TEXT NOT NULL CHECK (fee_category IN ('Monthly Fee', 'Admission Fee', 'Reexam Fee', 'Certificate Issue Fee', 'Other')),
  amount REAL NOT NULL CHECK (amount > 0),
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque')),
  period TEXT,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO fee_payments_final (
  id, receipt_no, student_id, student_name, enrollment_no, fee_category, amount, payment_date,
  payment_method, period, notes, created_by, created_at, updated_at
)
SELECT
  id, receipt_no, student_id, student_name, enrollment_no,
  CASE
    WHEN lower(trim(fee_category)) IN ('exam fee', 're-exam fee', 'reexam fee') THEN 'Reexam Fee'
    WHEN lower(trim(fee_category)) IN ('certificate fee', 'issue fee', 'certificate issue fee') THEN 'Certificate Issue Fee'
    ELSE fee_category
  END,
  amount, payment_date, payment_method, period, notes, created_by, created_at, updated_at
FROM fee_payments;

DROP TABLE fee_payments;
ALTER TABLE fee_payments_final RENAME TO fee_payments;

CREATE INDEX IF NOT EXISTS idx_fee_payments_date
ON fee_payments(payment_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fee_payments_student
ON fee_payments(student_id, payment_date DESC);
