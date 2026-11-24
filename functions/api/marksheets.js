import { confirmDeletePassword } from "./_delete-password.js";
import { examCourseCode, examCourses, validMarksheetEntries } from "./_exam-courses.js";
import { requireAdmin, requireCertificateUser, sameOrigin } from "./_admin.js";

const json = (data, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store" }
});

export async function onRequest({ request, env, allowLegacyRegistration = false }) {
  try {
    const method = request.method;
    if (!["GET", "POST", "PUT", "DELETE"].includes(method)) return json({ error: "Method not allowed" }, 405);
    if (method !== "GET" && !sameOrigin(request)) return json({ error: "Forbidden" }, 403);
    const account = await (method === "DELETE" ? requireAdmin : requireCertificateUser)(request, env);
    if (account.error) return json({ error: account.error }, account.status);

    if (method === "GET") {
      const result = await env.DB.prepare(
        `SELECT id, registration_no, student_name, father_name,
          CASE WHEN undeclared_exams & 1 = 0 THEN first_terminal END AS first_terminal,
          CASE WHEN undeclared_exams & 2 = 0 THEN second_terminal END AS second_terminal,
          CASE WHEN undeclared_exams & 4 = 0 THEN third_terminal END AS third_terminal,
          COALESCE(publishing_course, exam_course) AS exam_course, issued_on, certificate_ref,
          (SELECT duration FROM certificates WHERE certificates.id = marksheets.certificate_ref) AS duration
          FROM marksheets ORDER BY updated_at DESC, id`
      ).all();
      return json({ data: result.results });
    }
    const id = new URL(request.url).searchParams.get("id");
    if (method !== "POST" && (!id || id.length > 128)) return json({ error: "Invalid mark sheet ID" }, 400);
    if (method === "DELETE") {
      const passwordError = await confirmDeletePassword(request, env, account);
      if (passwordError) return passwordError;
      const result = await env.DB.prepare("DELETE FROM marksheets WHERE id = ?").bind(id).run();
      return result.meta.changes ? json({ success: true }) : json({ error: "Mark sheet not found" }, 404);
    }

    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "Request too large" }, 413);
    const data = JSON.parse(raw);
    const parts = [data?.roll_no, data?.batch_code, data?.year].map(value => typeof value === "string" ? value.trim().toUpperCase() : "");
    const [roll, batch, year] = parts;
    const legacyRegistration = allowLegacyRegistration && typeof data?.registration_no === "string" ? data.registration_no.trim() : "";
    const registration = legacyRegistration || parts.join("/");
    const certificateRef = data?.certificate_ref || null;
    const student = typeof data?.student_name === "string" ? data.student_name.trim() : "";
    const date = data?.issued_on;
    const existing = method === "PUT"
      ? await env.DB.prepare("SELECT COALESCE(publishing_course, exam_course) AS exam_course, father_name FROM marksheets WHERE id = ?").bind(id).first()
      : null;
    if (method === "PUT" && !existing) return json({ error: "Mark sheet not found" }, 404);
    const examCode = existing?.exam_course ?? data?.exam_course ?? "dca";
    const father = typeof data?.father_name === "string" ? data.father_name.trim() : existing?.father_name ?? "";
    if ((!legacyRegistration && (!roll || !batch || !/^\d{4}$/.test(year) || !parts.every(part => /^[^/\x00-\x1f]+$/.test(part)))) ||
        /[\x00-\x1f]/.test(registration) ||
        registration.length > 100 || !student || student.length > 150 || father.length > 150 ||
        !validMarksheetEntries(examCode, data)) {
      return json({ error: "Enter the Enrollment No. and student details. For each exam, enter marks or choose Not Declared." }, 400);
    }
    const modules = examCourses[examCode].modules;
    const undeclared = modules.reduce((flags, [field], index) => flags | (data[field] === null ? 1 << index : 0), 0);
    const parsedDate = typeof date === "string" ? new Date(date) : new Date(NaN);
    if (undeclared ? Boolean(date) :
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+parsedDate) || parsedDate.toISOString().slice(0, 10) !== date) {
      return json({ error: undeclared ? "Set the issue date after all marks are declared." : "Enter a valid issue date." }, 400);
    }
    if (certificateRef) {
      if (typeof certificateRef !== "string" || certificateRef.length > 128) return json({ error: "Invalid certificate" }, 400);
      const certificate = await env.DB.prepare(
        "SELECT roll_no, batch_number, student_name, course_name FROM certificates WHERE id = ?"
      ).bind(certificateRef).first();
      const normalize = value => String(value ?? "").trim().toLowerCase();
      if (!certificate || normalize(certificate.roll_no) !== normalize(roll) ||
          normalize(certificate.batch_number) !== normalize(batch) ||
          normalize(certificate.student_name) !== normalize(student) ||
          examCourseCode(certificate.course_name) !== examCode) {
        return json({ error: "Choose a certificate for the same course with the same Roll No., Batch, and student name." }, 400);
      }
    }
    // The existing required mark columns retain their numeric constraints. The mask records pending marks separately from a real zero.
    const first = data.first_terminal ?? 0;
    const second = modules.length >= 2 ? data.second_terminal ?? 0 : 0;
    const third = modules.length >= 3 ? data.third_terminal : null;
    const publishingCourse = ["cdtp", "adtp"].includes(examCode) ? examCode : null;
    const sheetId = method === "POST" ? crypto.randomUUID() : id;
    const values = [registration, student, father || null, first, second, third, undeclared ? "" : date, certificateRef, undeclared];
    const result = method === "POST"
      ? await env.DB.prepare(
        "INSERT INTO marksheets (registration_no, student_name, father_name, first_terminal, second_terminal, third_terminal, issued_on, certificate_ref, undeclared_exams, id, created_by, exam_course, publishing_course) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(...values, sheetId, account.id, publishingCourse ? "dca" : examCode, publishingCourse).run()
      : await env.DB.prepare(
        "UPDATE marksheets SET registration_no = ?, student_name = ?, father_name = ?, first_terminal = ?, second_terminal = ?, third_terminal = ?, issued_on = ?, certificate_ref = ?, undeclared_exams = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(...values, id).run();
    return result.meta.changes ? json({ success: true, id: sheetId }, method === "POST" ? 201 : 200) : json({ error: "Mark sheet not found" }, 404);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid request" }, 400);
    if (String(error).includes("UNIQUE constraint failed")) return json({ error: "A mark sheet already exists for that Enrollment No. or certificate." }, 409);
    return json({ error: "Unable to complete the mark sheet request" }, 500);
  }
}
