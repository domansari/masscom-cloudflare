import { requireAdmin, sameOrigin } from "./_admin.js";

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "no-store" },
});

const fields = ["student_name", "father_name", "roll_no", "batch_code", "course_name", "admission_date", "date_of_birth", "phone", "email", "address", "notes", "first_name", "last_name", "mother_name", "gender", "category", "aadhaar_last4", "institute_name", "session_year", "section_batch", "referred_by"];
const limits = {
  student_name: 150, father_name: 150, roll_no: 64, batch_code: 64,
  course_name: 150, admission_date: 10, date_of_birth: 10, phone: 32,
  email: 254, address: 1000, notes: 1000,
  first_name: 100, last_name: 100, mother_name: 150, gender: 16, category: 32,
  aadhaar_last4: 4, institute_name: 180, session_year: 16, section_batch: 64, referred_by: 64,
};
const feeFields = ["one_time_fee", "monthly_fee"];

function validDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalize(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const student = {};
  for (const field of fields) {
    const value = data[field];
    if (value != null && typeof value !== "string") return null;
    const trimmed = value?.trim() || "";
    if (trimmed.length > limits[field]) return null;
    student[field] = trimmed || null;
  }
  for (const field of feeFields) {
    const value = data[field];
    if (value == null || value === "") student[field] = null;
    else {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) return null;
      student[field] = amount;
    }
  }
  if (student.aadhaar_last4 && !/^\d{4}$/.test(student.aadhaar_last4)) return null;
  if (student.gender && !["Male", "Female", "Other"].includes(student.gender)) return null;
  const first = student.first_name || student.student_name;
  const fullName = [first, student.last_name].filter(Boolean).join(" ").trim();
  student.student_name = fullName;
  student.first_name = first || null;
  student.roll_no = student.roll_no || `MIE-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  if (!student.student_name || !student.father_name || !student.course_name || !student.date_of_birth || !validDate(student.admission_date) || !validDate(student.date_of_birth)) return null;
  if (student.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) return null;
  return student;
}

export async function onRequest({ request, env }) {
  try {
    const method = request.method;
    if (!["GET", "POST", "PUT", "DELETE"].includes(method)) return json({ error: "Method not allowed" }, 405);
    if (method !== "GET" && !sameOrigin(request)) return json({ error: "Forbidden" }, 403);
    const account = await requireAdmin(request, env);
    if (account.error) return json({ error: account.error }, account.status);

    if (method === "GET") {
      const result = await env.DB.prepare(
        "SELECT * FROM students ORDER BY updated_at DESC, student_name COLLATE NOCASE"
      ).all();
      return json({ data: result.results || [] });
    }

    const id = new URL(request.url).searchParams.get("id");
    if (method !== "POST" && (!id || id.length > 128)) return json({ error: "Invalid student ID" }, 400);
    if (method === "DELETE") {
      const result = await env.DB.prepare(
        "UPDATE students SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_active = 1"
      ).bind(id).run();
      return result.meta.changes ? json({ success: true }) : json({ error: "Active student not found" }, 404);
    }

    const raw = await request.text();
    if (raw.length > 8192) return json({ error: "Request too large" }, 413);
    const data = JSON.parse(raw);
    const student = normalize(data);
    if (!student) return json({ error: "Enter a student name, valid dates, and check that each field is within its length limit." }, 400);
    const isActive = data.is_active === 0 ? 0 : 1;
    const writeFields = [...fields, ...feeFields];
    const values = writeFields.map(field => student[field]);
    const recordId = method === "POST" ? crypto.randomUUID() : id;
    const result = method === "POST"
      ? await env.DB.prepare(
        `INSERT INTO students (${["id", ...writeFields, "is_active", "created_by"].join(", ")}) VALUES (${Array(writeFields.length + 3).fill("?").join(", ")})`
      ).bind(recordId, ...values, isActive, account.adminId).run()
      : await env.DB.prepare(
        `UPDATE students SET ${writeFields.map(field => `${field} = ?`).join(", ")}, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(...values, isActive, id).run();
    if (method === "PUT" && !result.meta.changes) return json({ error: "Student not found" }, 404);
    return json({ success: true, id: recordId }, method === "POST" ? 201 : 200);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid request" }, 400);
    const message = String(error?.message || "");
    if (/no such column|has no column/i.test(message)) return json({ error: "Student enrollment database update is required. Apply migrations/0009_student_enrollment_fields.sql in D1, then try again." }, 503);
    return json({ error: "Unable to complete the student request" }, 500);
  }
}
