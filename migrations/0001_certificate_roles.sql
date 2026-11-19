ALTER TABLE admin_users
  ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'
  CHECK (role IN ('admin', 'verifier', 'disabled'));
