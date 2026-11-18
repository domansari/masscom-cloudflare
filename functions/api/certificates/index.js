
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


    // Accept Indian DD/MM/YYYY dates and convert to ISO format.
    const normalizeDate = (value) => {
      if (typeof value !== "string") return value;
      const text = value.trim();

      let match = text.match(/^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})$/);
      if (match) {
        const [, day, month, year] = match;
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }

      return text;
    };

    if (typeof data.completion_date === "string") {
      data.completion_date = normalizeDate(data.completion_date);
    }


    // Support both frontend camelCase and database snake_case.
    if (!data.completion_date && data.completionDate) {
      data.completion_date = data.completionDate;
    }

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


    // Normalize and validate completion date.
    const dateValue = String(values.completion_date || "").trim();

    let dateMatch = dateValue.match(
      /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/
    );

    if (!dateMatch) {
      const indianDate = dateValue.match(
        /^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{4})$/
      );

      if (indianDate) {
        const [, day, month, year] = indianDate;
        dateMatch = [
          null,
          year,
          month.padStart(2, "0"),
          day.padStart(2, "0")
        ];
      }
    }

    if (!dateMatch) {
      return Response.json(
        { error: "Invalid completion date" },
        { status: 400 }
      );
    }

    const [, year, month, day] = dateMatch;
    const parsed = new Date(Date.UTC(+year, +month - 1, +day));

    if (
      parsed.getUTCFullYear() !== +year ||
      parsed.getUTCMonth() !== +month - 1 ||
      parsed.getUTCDate() !== +day
    ) {
      return Response.json(
        { error: "Invalid completion date" },
        { status: 400 }
      );
    }

    values.completion_date = `${year}-${month}-${day}`;

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
