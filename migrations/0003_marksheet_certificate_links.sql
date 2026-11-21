ALTER TABLE marksheets ADD COLUMN certificate_ref TEXT REFERENCES certificates(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marksheets_certificate_ref ON marksheets(certificate_ref);
