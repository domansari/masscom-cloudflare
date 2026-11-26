import { requireAdmin } from "./_admin.js";

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "no-store" },
});

function phoneNumber(value) {
  const digits = (value || "").trim().replace(/[ +()-]/g, "").replace(/^0(?=\d{10}$)/, "");
  const phone = /^\d{10}$/.test(digits) ? "91" + digits : digits;
  return /^[1-9]\d{9,14}$/.test(phone) ? phone : "";
}

export async function onRequestGet({ request, env }) {
  const account = await requireAdmin(request, env);
  if (account.error) return json({ error: account.error }, account.status);

  try {
    const { results } = await env.DB.prepare(`
      SELECT s.id, s.student_name, s.roll_no,
             COALESCE(NULLIF(TRIM(s.section_batch), ''), NULLIF(TRIM(s.batch_code), '')) AS batch_code,
             s.phone
      FROM students s
      WHERE s.is_active = 1
      ORDER BY s.student_name COLLATE NOCASE
    `).all();
    return json({ data: results.map(student => ({
      ...student,
      phone: phoneNumber(student.phone),
    })) });
  } catch {
    return json({ error: "Unable to load the student contact list." }, 500);
  }
}
