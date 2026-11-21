ALTER TABLE marksheets ADD COLUMN exam_course TEXT NOT NULL DEFAULT 'dca'
  CHECK (exam_course IN ('dca', 'cca', 'adca'));
ALTER TABLE marksheets ADD COLUMN third_terminal INTEGER
  CHECK (third_terminal BETWEEN 0 AND 100);
