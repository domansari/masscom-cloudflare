-- Keep the original course constraint and existing records intact.
ALTER TABLE marksheets ADD COLUMN publishing_course TEXT
  CHECK (publishing_course IN ('cdtp', 'adtp'));
