import { confirmDeletePassword } from "./_delete-password.js";
import { requireAdmin, sameOrigin } from "./_admin.js";
import { certificateCourseOptions } from "./_exam-courses.js";
import { batchTimings, buildEnrollmentNo, normalizeSessionYear } from "./_student-enrollment.js";
import { buildBaseFeePlan, courseDurationMonths, feePlanStatements, feeWaiverLimit } from "./_student-fee-plan.js";

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "no-store" },
});

const fields = ["student_name", "father_name", "roll_no", "batch_code", "course_name", "admission_date", "date_of_birth", "phone", "email", "address", "notes", "first_name", "last_name", "mother_name", "gender", "category", "aadhaar_last4", "session_year", "section_batch", "batch_timing"];
const limits = {
  student_name: 150, father_name: 150, roll_no: 64, batch_code: 64,
  course_name: 150, admission_date: 10, date_of_birth: 10, phone: 32,
  email: 254, address: 1000, notes: 1000,
  first_name: 100, last_name: 100, mother_name: 150, gender: 16, category: 32,
  aadhaar_last4: 4, session_year: 4, section_batch: 64, batch_timing: 32,
};
const feeFields = ["one_time_fee", "monthly_fee"];
const planFields = ["course_duration_months", "waive_last_two_months", "fee_waiver_amount"];

function validDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalize(data, existingCourse = "") {
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
  if (student.session_year) {
    const year = normalizeSessionYear(student.session_year);
    if (!year) return null;
    student.session_year = year;
  }
  if (student.batch_timing && !batchTimings.includes(student.batch_timing)) return null;
  if (student.gender && !["Male", "Female", "Other"].includes(student.gender)) return null;
  const first = student.first_name || student.student_name;
  const fullName = [first, student.last_name].filter(Boolean).join(" ").trim();
  student.student_name = fullName;
  student.first_name = first || null;
  student.roll_no = student.roll_no || `MIE-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  if (!student.student_name || !student.father_name || !student.course_name || !student.date_of_birth || !validDate(student.admission_date) || !validDate(student.date_of_birth)) return null;
  if (!certificateCourseOptions.includes(student.course_name) && student.course_name !== existingCourse) return null;
  const duration = Number(data.course_duration_months || courseDurationMonths(student.course_name) || 0);
  if (!Number.isInteger(duration) || duration < 1 || duration > 120) return null;
  student.course_duration_months = duration;
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
      const passwordError = await confirmDeletePassword(request, env, account);
      if (passwordError) return passwordError;
      const docs = await env.DB.prepare(
        "SELECT object_key FROM student_documents WHERE student_id = ?"
      ).bind(id).all();
      const result = await env.DB.prepare("DELETE FROM students WHERE id = ?").bind(id).run();
      if (!result.meta.changes) return json({ error: "Student not found" }, 404);
      if (env.STUDENT_FILES) {
        await Promise.all((docs.results || []).map(document => env.STUDENT_FILES.delete(document.object_key).catch(() => null)));
      }
      return json({ success: true });
    }

    const raw = await request.text();
    if (raw.length > 8192) return json({ error: "Request too large" }, 413);
    const data = JSON.parse(raw);
    const currentStudent = method === "PUT"
      ? await env.DB.prepare("SELECT * FROM students WHERE id = ? LIMIT 1").bind(id).first()
      : null;
    if (method === "PUT" && !currentStudent) return json({ error: "Student not found" }, 404);
    const student = normalize(data, currentStudent?.course_name || "");
    if (!student) return json({ error: "Enter a student name, valid dates, and check that each field is within its length limit." }, 400);
    const baseChanged = currentStudent && ["admission_date", ...feeFields, "course_duration_months"]
      .some(field => String(currentStudent[field] ?? "") !== String(student[field] ?? ""));
    const legacyWaiver = currentStudent?.waive_last_two_months === 1 && currentStudent.fee_waiver_amount == null;
    const previousWaiver = legacyWaiver
      ? Math.round(Number(currentStudent.monthly_fee || 0) * Math.min(2, Number(currentStudent.course_duration_months || 0)) * 100) / 100
      : Number(currentStudent?.fee_waiver_amount || 0);
    const supplied = data.fee_waiver_amount;
    const amount = supplied == null ? previousWaiver : supplied === "" ? 0 : Number(supplied);
    const paise = Math.round(amount * 100);
    if ((supplied != null && typeof supplied !== "number" && typeof supplied !== "string") ||
        !Number.isFinite(amount) || amount < 0 || Math.abs(amount - paise / 100) > 0.000001) {
      return json({ error: "Enter a valid fee waiver amount with up to two decimal places." }, 400);
    }
    const waiverChanged = paise !== Math.round(previousWaiver * 100);
    const limit = feeWaiverLimit(student.one_time_fee, student.monthly_fee, student.course_duration_months);
    if (paise / 100 > limit && (!currentStudent || waiverChanged || baseChanged)) {
      return json({ error: "Fee waiver cannot exceed ₹" + limit.toLocaleString("en-IN") + " (30% of the original fee plan, up to the monthly fee total)." }, 400);
    }
    student.waive_last_two_months = legacyWaiver && !waiverChanged && !baseChanged ? 1 : 0;
    student.fee_waiver_amount = student.waive_last_two_months ? null : paise / 100;
    const isActive = data.is_active === 0 ? 0 : 1;
    const writeFields = [...fields, ...feeFields, ...planFields];
    const values = writeFields.map(field => student[field]);
    const recordId = method === "POST" ? crypto.randomUUID() : id;
    let result;
    if (method === "POST") {
      const columns = ["id", ...writeFields, "is_active", "created_by"];
      const studentInsert = env.DB.prepare(
        "INSERT INTO students (" + columns.join(", ") + ") VALUES (" + Array(columns.length).fill("?").join(", ") + ")"
      ).bind(recordId, ...values, isActive, account.adminId);
      const plan = buildBaseFeePlan({ ...student, id: recordId });
      const statements = [studentInsert, ...await feePlanStatements(env, plan, account.adminId)];
      [result] = await env.DB.batch(statements);
    } else {
      const planChanged = baseChanged || waiverChanged;
      if (planChanged) {
        const priorPayment = await env.DB.prepare("SELECT p.id FROM fee_payments p WHERE p.student_id = ? AND (           p.fee_category IN ('Admission Fee', 'Monthly Fee') OR EXISTS (             SELECT 1 FROM student_fee_payment_allocations a             JOIN student_fee_plan_items i ON i.id = a.fee_plan_item_id             WHERE a.payment_id = p.id AND i.fee_category IN ('Admission Fee', 'Monthly Fee')           )         ) LIMIT 1").bind(id).first();
        if (priorPayment) return json({ error: "The fee plan cannot be changed after a payment is recorded. Update it before collecting a payment." }, 409);
      }
      const existingCard = await env.DB.prepare("SELECT id FROM student_id_cards WHERE student_id = ? LIMIT 1").bind(id).first();
      const enrollment = buildEnrollmentNo(student);
      if (existingCard && !enrollment) return json({ error: "Keep Roll No., Section / Batch, and Session Year filled so the Enrollment No. stays valid." }, 400);
      const updateStudent = env.DB.prepare(
        `UPDATE students SET ${writeFields.map(field => `${field} = ?`).join(", ")}, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(...values, isActive, id);
      const statements = [updateStudent];
      if (planChanged) {
        statements.push(env.DB.prepare("DELETE FROM student_fee_plan_items WHERE student_id = ? AND fee_category IN (?, ?)").bind(id, "Admission Fee", "Monthly Fee"));
        const plan = buildBaseFeePlan({ ...student, id });
        statements.push(...await feePlanStatements(env, plan, account.adminId));
      }
      if (existingCard && enrollment) {
        statements.push(env.DB.prepare("UPDATE student_id_cards SET registration_no = ?, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?").bind(enrollment, id));
      }
      [result] = await env.DB.batch(statements);
    }
    if (method === "PUT" && !result.meta.changes) return json({ error: "Student not found" }, 404);
    return json({ success: true, id: recordId }, method === "POST" ? 201 : 200);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid request" }, 400);
    const message = String(error?.message || "");
    if (/no such column|has no column/i.test(message)) return json({ error: "Student database update is required. Apply the latest student migration in D1, then try again." }, 503);
    if (/UNIQUE constraint failed/i.test(message)) return json({ error: "That Roll No. / Batch / Year is already assigned to another student." }, 409);
    return json({ error: "Unable to complete the student request" }, 500);
  }
}
