export const batchTimings = [
  "09:00 AM - 10:00 AM",
  "10:00 AM - 11:00 AM",
  "11:00 AM - 12:00 PM",
  "02:00 PM - 03:00 PM",
  "03:00 PM - 04:00 PM",
  "04:00 PM - 05:00 PM",
  "05:00 PM - 06:00 PM",
];

export function normalizeSessionYear(value) {
  const match = /^(\d{4})(?:-(?:\d{2}|\d{4}))?$/.exec(String(value || "").trim());
  return match ? match[1] : null;
}

export function buildEnrollmentNo(student) {
  const roll = String(student?.roll_no || "").trim().toUpperCase();
  const batch = String(student?.section_batch || student?.batch_code || "").trim().toUpperCase();
  const year = normalizeSessionYear(student?.session_year);
  if (!roll || !batch || !year || /[\x00-\x1f/]/.test(roll) || /[\x00-\x1f/]/.test(batch)) return null;
  const enrollment = `${roll}/${batch}/${year}`;
  return enrollment.length <= 64 ? enrollment : null;
}
