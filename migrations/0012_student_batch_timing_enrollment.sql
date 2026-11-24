ALTER TABLE students ADD COLUMN batch_timing TEXT;

-- Normalize existing academic sessions to a single YYYY value.
UPDATE students
SET session_year = substr(trim(session_year), 1, 4)
WHERE session_year IS NOT NULL
  AND length(trim(session_year)) >= 4
  AND substr(trim(session_year), 1, 4) GLOB '[0-9][0-9][0-9][0-9]';

-- Rebuild saved ID-card enrollments as Roll/Batch/Year. If duplicates exist,
-- OR IGNORE keeps the existing card row so this migration can complete safely.
UPDATE OR IGNORE student_id_cards
SET registration_no = (
  SELECT upper(trim(s.roll_no)) || '/' ||
         upper(trim(coalesce(nullif(trim(s.section_batch), ''), nullif(trim(s.batch_code), '')))) || '/' ||
         substr(trim(s.session_year), 1, 4)
  FROM students s
  WHERE s.id = student_id_cards.student_id
),
updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM students s
  WHERE s.id = student_id_cards.student_id
    AND trim(coalesce(s.roll_no, '')) <> ''
    AND trim(coalesce(nullif(trim(s.section_batch), ''), nullif(trim(s.batch_code), ''), '')) <> ''
    AND length(trim(s.roll_no)) + 1 + length(trim(coalesce(nullif(trim(s.section_batch), ''), nullif(trim(s.batch_code), '')))) + 1 + 4 <= 64
    AND substr(trim(coalesce(s.session_year, '')), 1, 4) GLOB '[0-9][0-9][0-9][0-9]'
);
