import { confirmDeletePassword } from "./_delete-password.js";
import { requireAdmin, sameOrigin } from "./_admin.js";
import { buildEnrollmentNo } from "./_student-enrollment.js";

const categories = ["Monthly Fee", "Admission Fee", "Reexam Fee", "Certificate Issue Fee", "Other"];
const methods = ["Cash", "UPI"];
const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "no-store" },
});

function normalize(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const category = typeof data.fee_category === "string" ? data.fee_category.trim() : "";
  const method = typeof data.payment_method === "string" ? data.payment_method.trim() : "";
  const amount = Number(data.amount);
  const date = typeof data.payment_date === "string" ? data.payment_date.trim() : "";
  const period = typeof data.period === "string" ? data.period.trim() : "";
  const notes = typeof data.notes === "string" ? data.notes.trim() : "";
  const upiReference = typeof data.upi_reference_number === "string" ? data.upi_reference_number.trim() : "";
  if (!categories.includes(category) || !methods.includes(method) ||
      !Number.isFinite(amount) || amount <= 0 || amount > 100000000 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || period.length > 40 || notes.length > 500 || upiReference.length > 120 || (method === "UPI" && !upiReference)) return null;
  const parsed = new Date(date + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return { fee_category: category, payment_method: method, upi_reference_number: method === "UPI" ? upiReference : null, amount, payment_date: date, period: period || null, notes: notes || null };
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
        "SELECT * FROM fee_payments ORDER BY payment_date DESC, created_at DESC"
      ).all();
      return json({ data: result.results || [] });
    }

    const id = new URL(request.url).searchParams.get("id");
    if (method !== "POST" && (!id || id.length > 128)) return json({ error: "Invalid fee record ID" }, 400);

    if (method === "DELETE") {
      const passwordError = await confirmDeletePassword(request, env, account);
      if (passwordError) return passwordError;
      const result = await env.DB.prepare("DELETE FROM fee_payments WHERE id = ?").bind(id).run();
      return result.meta.changes ? json({ success: true }) : json({ error: "Fee record not found" }, 404);
    }

    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "Request too large" }, 413);
    const data = JSON.parse(raw);
    const payment = normalize(data);
    if (!payment) return json({ error: "Enter a valid amount, date, fee type, and payment method." }, 400);

    if (method === "POST") {
      const studentId = typeof data.student_id === "string" ? data.student_id.trim() : "";
      if (!studentId || studentId.length > 128) return json({ error: "Select a valid student." }, 400);
      const student = await env.DB.prepare(
        "SELECT id, student_name, roll_no, batch_code, section_batch, session_year, is_active FROM students WHERE id = ? LIMIT 1"
      ).bind(studentId).first();
      if (!student) return json({ error: "Student not found." }, 404);
      if (!student.is_active) return json({ error: "Restore this student before collecting a fee." }, 409);
      const id = crypto.randomUUID();
      const receiptNo = "FEE-" + new Date().getFullYear() + "-" + id.slice(0, 8).toUpperCase();
      await env.DB.prepare(
        `INSERT INTO fee_payments
         (id, receipt_no, student_id, student_name, enrollment_no, fee_category, amount, payment_date,
          payment_method, upi_reference_number, period, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, receiptNo, student.id, student.student_name, buildEnrollmentNo(student), payment.fee_category,
        payment.amount, payment.payment_date, payment.payment_method, payment.upi_reference_number, payment.period, payment.notes, account.adminId).run();
      return json({ success: true, id, receipt_no: receiptNo }, 201);
    }

    await env.DB.prepare(
      `UPDATE fee_payments SET fee_category = ?, amount = ?, payment_date = ?,
       payment_method = ?, upi_reference_number = ?, period = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(payment.fee_category, payment.amount, payment.payment_date, payment.payment_method,
      payment.upi_reference_number, payment.period, payment.notes, id).run();
    const updated = await env.DB.prepare("SELECT id FROM fee_payments WHERE id = ?").bind(id).first();
    return updated ? json({ success: true, id }) : json({ error: "Fee record not found" }, 404);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid request" }, 400);
    const message = String(error?.message || "");
    if (/no such table: fee_payments/i.test(message)) return json({ error: "Fee database update is required. Apply migrations/0013_fee_payments.sql in D1, then try again." }, 503);
    return json({ error: "Unable to complete the fee request" }, 500);
  }
}
