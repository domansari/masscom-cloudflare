import { requireAdmin, sameOrigin } from "./_admin.js";
import { ensureStudentFeePlan, getStudentFeePlan, todayInIndia } from "./_student-fee-plan.js";

const json = (data, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store, max-age=0", "Pragma": "no-cache" },
});

export async function onRequest({ request, env }) {
  const method = request.method;
  if (!["GET", "POST"].includes(method)) return json({ error: "Method not allowed" }, 405);
  if (method !== "GET" && !sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const url = new URL(request.url);
  try {
    if (method === "GET") {
      const studentId = url.searchParams.get("student_id") || "";
      const registrationNo = url.searchParams.get("regNo") || "";
      let student;
      if (studentId) {
        const account = await requireAdmin(request, env);
        if (account.error) return json({ error: account.error }, account.status);
        if (studentId.length > 128) return json({ error: "Invalid student ID" }, 400);
        student = await env.DB.prepare("SELECT * FROM students WHERE id = ? LIMIT 1").bind(studentId).first();
      } else if (registrationNo) {
        if (registrationNo.length > 64) return json({ error: "Invalid Enrollment No." }, 400);
        student = await env.DB.prepare(
          `SELECT s.* FROM student_id_cards c JOIN students s ON s.id = c.student_id
           WHERE lower(trim(c.registration_no)) = lower(trim(?)) LIMIT 1`
        ).bind(registrationNo).first();
      } else return json({ error: "Provide a student ID or Enrollment No." }, 400);
      if (!student) return json({ error: "Student record not found" }, 404);
      await ensureStudentFeePlan(env, student);
      const plan = await getStudentFeePlan(env, student, { ensure: false });
      return json({ data: plan });
    }

    const account = await requireAdmin(request, env);
    if (account.error) return json({ error: account.error }, account.status);
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: "Request too large" }, 413);
    const data = JSON.parse(raw);
    if (data?.action !== "activate_reexam_fee") return json({ error: "Invalid fee plan action" }, 400);
    const studentId = typeof data.student_id === "string" ? data.student_id.trim() : "";
    const amount = Number(data.amount);
    if (!studentId || studentId.length > 128 || !Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
      return json({ error: "Select a student and enter a valid re-exam fee amount." }, 400);
    }
    const student = await env.DB.prepare("SELECT * FROM students WHERE id = ? LIMIT 1").bind(studentId).first();
    if (!student) return json({ error: "Student not found." }, 404);
    await ensureStudentFeePlan(env, student);
    const existing = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM student_fee_plan_items WHERE student_id = ? AND fee_category = 'Reexam Fee' AND is_active = 1"
    ).bind(studentId).first();
    const attempt = Number(existing?.count || 0) + 1;
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO student_fee_plan_items
       (id, student_id, fee_category, amount, due_date, period, is_waived, is_active, description, created_by)
       VALUES (?, ?, 'Reexam Fee', ?, ?, ?, 0, 1, ?, ?)`
    ).bind(id, studentId, amount, todayInIndia(), "Re-exam " + attempt, "Re-exam Fee " + attempt, account.adminId).run();
    const plan = await getStudentFeePlan(env, student, { ensure: false });
    return json({ success: true, data: plan }, 201);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid request" }, 400);
    const message = String(error?.message || "");
    if (/no such table: student_fee_plan_items/i.test(message)) {
      return json({ error: "Fee plan database update is required. Apply migrations/0016_fee_plan.sql in D1." }, 503);
    }
    return json({ error: "Unable to load or update the student fee plan." }, 500);
  }
}
