import { requireAdmin, requireCertificateUser, sameOrigin } from "./_admin.js";

const json = (data, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store" }
});

export async function onRequest({ request, env }) {
  try {
    const method = request.method;
    if (!["GET", "POST", "PUT", "DELETE"].includes(method)) return json({ error: "Method not allowed" }, 405);
    if (method !== "GET" && !sameOrigin(request)) return json({ error: "Forbidden" }, 403);
    const account = await (method === "DELETE" ? requireAdmin : requireCertificateUser)(request, env);
    if (account.error) return json({ error: account.error }, account.status);

    if (method === "GET") {
      const result = await env.DB.prepare(
        "SELECT id, registration_no, student_name, first_terminal, second_terminal, issued_on, certificate_ref FROM marksheets ORDER BY updated_at DESC, id"
      ).all();
      return json({ data: result.results });
    }
    const id = new URL(request.url).searchParams.get("id");
    if (method !== "POST" && !/^[a-f0-9-]{36}$/.test(id || "")) return json({ error: "Invalid mark sheet ID" }, 400);
    if (method === "DELETE") {
      const result = await env.DB.prepare("DELETE FROM marksheets WHERE id = ?").bind(id).run();
      return result.meta.changes ? json({ success: true }) : json({ error: "Mark sheet not found" }, 404);
    }

    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "Request too large" }, 413);
    const data = JSON.parse(raw);
    const parts = [data?.roll_no, data?.batch_code, data?.year].map(value => typeof value === "string" ? value.trim() : "");
    const [roll, batch, year] = parts;
    const registration = parts.join("/");
    const certificateRef = data?.certificate_ref || null;
    const student = typeof data?.student_name === "string" ? data.student_name.trim() : "";
    const date = data?.issued_on;
    const first = data?.first_terminal;
    const second = data?.second_terminal;
    const parsedDate = typeof date === "string" ? new Date(date) : new Date(NaN);
    if (!roll || !batch || !/^\d{4}$/.test(year) || !parts.every(part => /^[^/\x00-\x1f]+$/.test(part)) ||
        registration.length > 100 || !student || student.length > 150 ||
        !Number.isInteger(first) || first < 0 || first > 100 ||
        !Number.isInteger(second) || second < 0 || second > 100 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+parsedDate) ||
        parsedDate.toISOString().slice(0, 10) !== date) {
      return json({ error: "Enter roll number, batch code, four-digit year, student name, issue date, and both terminal marks." }, 400);
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
          !["dca", "diploma in computer application", "diploma in computer applications"].includes(normalize(certificate.course_name))) {
        return json({ error: "Choose a DCA certificate with the same roll number, batch code, and student name." }, 400);
      }
    }
    const values = [registration, student, first, second, date, certificateRef];
    const result = method === "POST"
      ? await env.DB.prepare(
        "INSERT INTO marksheets (registration_no, student_name, first_terminal, second_terminal, issued_on, certificate_ref, id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(...values, crypto.randomUUID(), account.id).run()
      : await env.DB.prepare(
        "UPDATE marksheets SET registration_no = ?, student_name = ?, first_terminal = ?, second_terminal = ?, issued_on = ?, certificate_ref = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(...values, id).run();
    return result.meta.changes ? json({ success: true }, method === "POST" ? 201 : 200) : json({ error: "Mark sheet not found" }, 404);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid request" }, 400);
    if (String(error).includes("UNIQUE constraint failed")) return json({ error: "A mark sheet already exists for that registration number or certificate." }, 409);
    return json({ error: "Unable to complete the mark sheet request" }, 500);
  }
}
