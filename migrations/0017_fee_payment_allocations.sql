CREATE TABLE student_fee_payment_allocations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES fee_payments(id) ON DELETE CASCADE,
  fee_plan_item_id TEXT NOT NULL REFERENCES student_fee_plan_items(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (payment_id, fee_plan_item_id)
);

CREATE INDEX idx_fee_payment_allocations_plan_item
ON student_fee_payment_allocations(fee_plan_item_id);
