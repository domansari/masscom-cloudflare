import { confirmDeletePassword } from "./_delete-password.js";
import { requireAdmin, sameOrigin } from "./_admin.js";

const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const barcodeValueAllowed = value => [...value].every(character => character === "/" || /^[A-Za-z0-9 .$+%-]$/.test(character));
const selectCards = `SELECT c.id, c.student_id, c.registration_no, c.created_at AS card_created_at,
  s.student_name, s.father_name, s.course_name, s.session_year, s.date_of_birth, s.phone,
  s.institute_name, s.roll_no AS student_roll_no, s.is_active AS student_active
  FROM student_id_cards c JOIN students s ON s.id = c.student_id`;

export async function onRequest({ request, env }) {
  try {
    const method = request.method;
    if (!["GET", "POST", "PUT", "DELETE"].includes(method)) return json({ error: "Method not allowed" }, 405);
    if (method !== "GET" && !sameOrigin(request)) return json({ error: "Forbidden" }, 403);
    const account = await requireAdmin(request, env);
    if (account.error) return json({ error: account.error }, account.status);

    const url = new URL(request.url);
    if (method === "GET") {
      const registrationNo = url.searchParams.get("regNo");
      const studentId = url.searchParams.get("student_id");
      if (registrationNo || studentId) {
        const clause = registrationNo ? "c.registration_no = ?" : "c.student_id = ?";
        const value = registrationNo ? registrationNo.trim() : studentId;
        const result = await env.DB.prepare(`${selectCards} WHERE ${clause} LIMIT 1`).bind(value).first();
        return json({ data: result ? [result] : [] });
      }
      const result = await env.DB.prepare(`${selectCards} ORDER BY c.created_at DESC, s.student_name COLLATE NOCASE`).all();
      return json({ data: result.results || [] });
    }

    const id = url.searchParams.get("id");
    if (method !== "POST" && (!id || id.length > 128)) return json({ error: "Invalid ID card ID" }, 400);
    if (method === "DELETE") {
      const passwordError = await confirmDeletePassword(request, env, account);
      if (passwordError) return passwordError;
      const result = await env.DB.prepare("DELETE FROM student_id_cards WHERE id = ?").bind(id).run();
      return result.meta.changes ? json({ success: true }) : json({ error: "ID card not found" }, 404);
    }

    const raw = await request.text();
    if (raw.length > 2048) return json({ error: "Request too large" }, 413);
    const data = JSON.parse(raw);
    if (method === "POST") {
      const studentId = typeof data?.student_id === "string" ? data.student_id.trim() : "";
      if (!studentId || studentId.length > 128) return json({ error: "Choose a valid student." }, 400);
      const student = await env.DB.prepare("SELECT id, roll_no, is_active FROM students WHERE id = ? LIMIT 1").bind(studentId).first();
      if (!student) return json({ error: "Student not found." }, 404);
      if (!student.is_active) return json({ error: "Restore this student before creating an ID card." }, 409);
      if (!student.roll_no) return json({ error: "Add a registration number to this student before creating an ID card." }, 400);
      const registrationNo = student.roll_no.trim().toUpperCase();
      if (!barcodeValueAllowed(registrationNo)) return json({ error: "The registration number must use letters, digits, spaces, hyphens, periods, slashes, $, + or % so the attendance barcode can encode it." }, 400);
      const cardId = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO student_id_cards (id, student_id, registration_no, created_by)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(student_id) DO UPDATE SET registration_no = excluded.registration_no, updated_at = CURRENT_TIMESTAMP`)
        .bind(cardId, studentId, registrationNo, account.adminId).run();
      const saved = await env.DB.prepare(`${selectCards} WHERE c.student_id = ? LIMIT 1`).bind(studentId).first();
      return json({ success: true, data: saved }, 201);
    }

    const registrationNo = typeof data?.registration_no === "string" ? data.registration_no.trim().toUpperCase() : "";
    if (!registrationNo || registrationNo.length > 64 || !barcodeValueAllowed(registrationNo)) return json({ error: "Enter a registration number up to 64 characters using letters, digits, spaces, hyphens, periods, slashes, $, + or %." }, 400);
    const result = await env.DB.prepare("UPDATE student_id_cards SET registration_no = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(registrationNo, id).run();
    if (!result.meta.changes) return json({ error: "ID card not found." }, 404);
    const saved = await env.DB.prepare(`${selectCards} WHERE c.id = ? LIMIT 1`).bind(id).first();
    return json({ success: true, data: saved });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid request" }, 400);
    if (/UNIQUE constraint failed/i.test(String(error?.message || ""))) return json({ error: "That registration number is already assigned to another ID card." }, 409);
    if (/no such table: student_id_cards/i.test(String(error?.message || ""))) return json({ error: "Apply migrations/0011_student_id_cards.sql to the production D1 database, then try again." }, 503);
    return json({ error: "Unable to complete the ID card request." }, 500);
  }
}
