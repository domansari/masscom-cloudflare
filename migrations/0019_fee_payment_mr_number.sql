ALTER TABLE fee_payments ADD COLUMN mr_number TEXT;

CREATE INDEX idx_fee_payments_mr_number
ON fee_payments(mr_number);
