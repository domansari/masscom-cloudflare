ALTER TABLE marksheets ADD COLUMN undeclared_exams INTEGER NOT NULL DEFAULT 0
  CHECK (undeclared_exams BETWEEN 0 AND 7);
