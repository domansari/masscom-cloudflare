import { requireAdmin, sameOrigin } from "./_admin.js";

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "no-store" },
});

function phoneNumber(value) {
  const digits = (value || "").trim().replace(/[ +()-]/g, "").replace(/^0(?=\d{10}$)/, "");
  const phone = /^\d{10}$/.test(digits) ? "91" + digits : digits;
  return /^[1-9]\d{9,14}$/.test(phone) ? phone : "";
}

const roster = `
  SELECT s.id, s.student_name, s.roll_no,
         COALESCE(NULLIF(TRIM(s.section_batch), ''), NULLIF(TRIM(s.batch_code), '')) AS batch_code,
         s.phone,
         c.phone AS consent_phone, c.granted_at
  FROM students s LEFT JOIN student_notice_consent c ON c.student_id = s.id
  WHERE s.is_active = 1
`;

export async function onRequest({ request, env }) {
  if (!["GET", "PUT"].includes(request.method)) return json({ error: "Method not allowed." }, 405);
  if (request.method === "PUT" && !sameOrigin(request)) return json({ error: "Forbidden." }, 403);

  try {
    const account = await requireAdmin(request, env);
    if (account.error) return json({ error: account.error }, account.status);

    if (request.method === "GET") {
      const { results } = await env.DB.prepare(roster + " ORDER BY s.student_name COLLATE NOCASE").all();
      return json({ data: results.map(({ consent_phone, granted_at, ...student }) => {
        const phone = phoneNumber(student.phone);
        return { ...student, phone, consent_at: phone && phone === consent_phone ? granted_at : null };
      }) });
    }

    const data = await request.json().catch(() => null);
    if (typeof data?.id !== "string" || typeof data.granted !== "boolean") {
      return json({ error: "Select a student and a consent action." }, 400);
    }
    const student = await env.DB.prepare(roster + " AND s.id = ?").bind(data.id).first();
    if (!student) return json({ error: "Active student not found." }, 404);
    if (!data.granted) {
      await env.DB.prepare("DELETE FROM student_notice_consent WHERE student_id = ?").bind(data.id).run();
      return json({ consent_at: null });
    }

    const phone = phoneNumber(student.phone);
    if (!phone || phone !== data.phone) return json({ error: "The student phone number changed. Refresh and try again." }, 409);
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO student_notice_consent (student_id, phone, granted_at, recorded_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(student_id) DO UPDATE SET phone = excluded.phone,
        granted_at = excluded.granted_at, recorded_by = excluded.recorded_by
    `).bind(student.id, phone, now, account.adminId).run();
    return json({ consent_at: now });
  } catch (error) {
    if (/no such table: student_notice_consent/i.test(String(error?.message))) {
      return json({ error: "Apply the Student Notices migration to the production D1 database." }, 503);
    }
    return json({ error: "Unable to load or update Student Notices." }, 500);
  }
}
