ALTER TABLE students ADD COLUMN fee_waiver_amount REAL CHECK (fee_waiver_amount >= 0);
