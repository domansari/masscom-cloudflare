ALTER TABLE students ADD COLUMN first_name TEXT;
ALTER TABLE students ADD COLUMN last_name TEXT;
ALTER TABLE students ADD COLUMN mother_name TEXT;
ALTER TABLE students ADD COLUMN gender TEXT;
ALTER TABLE students ADD COLUMN category TEXT;
ALTER TABLE students ADD COLUMN aadhaar_last4 TEXT;
ALTER TABLE students ADD COLUMN institute_name TEXT;
ALTER TABLE students ADD COLUMN session_year TEXT;
ALTER TABLE students ADD COLUMN section_batch TEXT;
ALTER TABLE students ADD COLUMN one_time_fee REAL;
ALTER TABLE students ADD COLUMN monthly_fee REAL;
ALTER TABLE students ADD COLUMN referred_by TEXT;

UPDATE students
SET first_name = student_name
WHERE first_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_students_session_course
ON students(session_year, course_name COLLATE NOCASE);
