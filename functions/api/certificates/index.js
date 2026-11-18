
import { requireAdmin, sameOrigin } from "../_admin.js";

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const result = await env.DB.prepare(
      "SELECT * FROM certificates ORDER BY created_at DESC"
    ).all();

    return Response.json(
      { data: result.results || [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json({ error: "Unable to load certificates" }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!sameOrigin(request))
      return Response.json({ error: "Forbidden" }, { status: 403 });

    const auth = await requireAdmin(request, env);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const size = Number(request.headers.get("Content-Length") || 0);
    if (size > 16384)
      return Response.json({ error: "Request too large" }, { status: 413 });

    const raw = await request.text();
    if (raw.length > 16384)
      return Response.json({ error: "Request too large" }, { status: 413 });

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!data || typeof data !== "object" || Array.isArray(data))
      return Response.json({ error: "Invalid certificate" }, { status: 400 });

    const fields = [
      "certificate_id", "student_name", "father_name",
      "course_name", "duration", "completion_date", "grade",
      "student_coordinator", "roll_no", "batch_number", "qr_code_data"
    ];

    const values = {};
    for (const field of fields) {
      const value = data[field];
      if (value != null && typeof value !== "string")
        return Response.json({ error: "Invalid " + field }, { status: 400 });

      values[field] = value?.trim() || null;
      if (values[field] && values[field].length > 4096)
        return Response.json({ error: "Field too long: " + field }, { status: 400 });
    }

    for (const field of [
      "certificate_id", "student_name", "course_name",
      "completion_date", "qr_code_data"
    ]) {
      if (!values[field])
        return Response.json({ error: "Missing " + field }, { status: 400 });
    }

    // Accept YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY and ISO timestamps.
    const normalizeDate = (input) => {
      if (!input) return null;

      let match = input.match(/^(\\d{4})-(\\d{2})-(\\d{2})(?:T.*)?$/);
      if (match) {
        const [, year, month, day] = match;
        return validDate(year, month, day) ? `${year}-${month}-${day}` : null;
      }

      match = input.match(/^(\\d{2})[/-](\\d{2})[/-](\\d{4})$/);
      if (match) {
        const [, day, month, year] = match;
        return validDate(year, month, day) ? `${year}-${month}-${day}` : null;
      }

      return null;
    };

    const validDate = (year, month, day) => {
      const date = new Date(Date.UTC(+year, +month - 1, +day));
      return date.getUTCFullYear() === +year &&
        date.getUTCMonth() === +month - 1 &&
        date.getUTCDate() === +day;
    };

    values.completion_date = normalizeDate(values.completion_date);

    if (!values.completion_date)
      return Response.json({ error: "Invalid completion date" }, { status: 400 });

    let qr;
    try {
      qr = JSON.parse(values.qr_code_data);
    } catch {
      return Response.json({ error: "Invalid QR data" }, { status: 400 });
    }

    if (qr?.certificateId !== values.certificate_id)
      return Response.json({ error: "Certificate ID mismatch" }, { status: 400 });

    const id = crypto.randomUUID();
    const columns = ["id", ...fields, "created_by"];
    const placeholders = columns.map(() => "?").join(", ");

    await env.DB.prepare(
      `INSERT INTO certificates (${columns.join(", ")})
       VALUES (${placeholders})`
    ).bind(id, ...fields.map(field => values[field]), auth.adminId).run();

    return Response.json({ success: true, id }, { status: 201 });
  } catch {
    return Response.json({ error: "Unable to create certificate" }, { status: 500 });
  }
}
