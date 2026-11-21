export type BackupType = "certificates" | "marksheets";
export type BackupRow = Record<string, string | number>;
type Column = { key: string; label: string; required?: boolean; number?: boolean; date?: boolean };

export const backupColumns: Record<BackupType, Column[]> = {
  certificates: [
    { key: "certificate_id", label: "Certificate ID" },
    { key: "student_name", label: "Student Name", required: true },
    { key: "father_name", label: "Father’s Name" },
    { key: "course_name", label: "Course", required: true },
    { key: "duration", label: "Duration" },
    { key: "completion_date", label: "Completion Date", required: true, date: true },
    { key: "grade", label: "Grade" },
    { key: "student_coordinator", label: "Student Coordinator" },
    { key: "instructor_name", label: "Instructor" },
    { key: "roll_no", label: "Roll No." },
    { key: "batch_number", label: "Batch Code" },
  ],
  marksheets: [
    { key: "roll_no", label: "Roll No." },
    { key: "batch_code", label: "Batch Code" },
    { key: "year", label: "Registration Year" },
    { key: "registration_no", label: "Saved Registration No." },
    { key: "student_name", label: "Student Name", required: true },
    { key: "father_name", label: "Father’s Name" },
    { key: "exam_course", label: "Course Code", required: true },
    { key: "issued_on", label: "Issue Date", required: true, date: true },
    { key: "first_terminal", label: "Exam 1 Marks", required: true, number: true },
    { key: "second_terminal", label: "Exam 2 Marks", number: true },
    { key: "third_terminal", label: "Exam 3 Marks", number: true },
    { key: "linked_certificate_id", label: "Linked Certificate ID" },
  ],
};

export const workbookTitle: Record<BackupType, string> = { certificates: "Certificates", marksheets: "Marksheets" };

export function formatBackupValue(value: unknown, column: Column) {
  if (value == null || value === "") return undefined;
  if (column.date && value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${column.label} must be plain text or a number.`);
  const text = String(value).trim();
  if (!text) return undefined;
  if (column.number) {
    if (!/^\d{1,3}$/.test(text) || Number(text) > 100) throw new Error(`${column.label} must be a whole number from 0 to 100.`);
    return Number(text);
  }
  if (column.date && !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${column.label} must use YYYY-MM-DD.`);
  return column.key === "exam_course" ? text.toLowerCase() : text;
}
