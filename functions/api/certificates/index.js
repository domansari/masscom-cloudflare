
import { examCourseCode, examCourseNames, marksheetResult, passingMark, validExamMarks } from "../_exam-courses.js";
import { requireCertificateUser, sameOrigin } from "../_admin.js";

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireCertificateUser(request, env);
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

    const auth = await requireCertificateUser(request, env);
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

    // Accept valid YYYY-MM-DD dates from the certificate form.
    const dateValue = String(values.completion_date || "").trim();
    const dateMatch = dateValue.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);

    if (!dateMatch) {
      return Response.json(
        { error: "Invalid completion date: " + dateValue },
        { status: 400 }
      );
    }

    const [, year, month, day] = dateMatch;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

    if (
      parsed.getUTCFullYear() !== Number(year) ||
      parsed.getUTCMonth() !== Number(month) - 1 ||
      parsed.getUTCDate() !== Number(day)
    ) {
      return Response.json(
        { error: "Invalid completion date: " + dateValue },
        { status: 400 }
      );
    }

    values.completion_date = dateValue;

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

    const markSheetId = data.marksheet_id;
    const examCode = examCourseCode(values.course_name);
    if (markSheetId != null) {
      if (typeof markSheetId !== "string" || !/^[a-f0-9-]{36}$/.test(markSheetId)) {
        return Response.json({ error: "Invalid mark sheet ID" }, { status: 400 });
      }
      const sheet = await env.DB.prepare(
        "SELECT registration_no, student_name, father_name, COALESCE(publishing_course, exam_course) AS exam_course, first_terminal, second_terminal, third_terminal FROM marksheets WHERE id = ? AND certificate_ref IS NULL"
      ).bind(markSheetId).first();
      const parts = sheet?.registration_no.split("/");
      if (!sheet || parts.length !== 3 || !parts[0] || !parts[1] || !/^\d{4}$/.test(parts[2]) ||
          values.student_name !== sheet.student_name || values.roll_no !== parts[0] ||
          values.batch_number !== parts[1] || examCode !== sheet.exam_course || !validExamMarks(examCode, sheet, passingMark)) {
        return Response.json({ error: "Use an unlinked marksheet with matching student details and at least 33 marks in each required exam." }, { status: 409 });
      }

      // Recheck eligibility inside the transaction and link only the newly inserted certificate.
      values.grade = marksheetResult(sheet).grade;
      values.father_name ??= sheet.father_name;
      const courseNames = examCourseNames(examCode);
      const [created] = await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO certificates (${columns.join(", ")})
           SELECT ${placeholders} FROM marksheets
           WHERE id = ? AND registration_no = ? AND student_name = ? AND certificate_ref IS NULL
             AND COALESCE(publishing_course, exam_course) = ? AND first_terminal = ? AND second_terminal = ? AND third_terminal IS ?
             AND NOT EXISTS (
               SELECT 1 FROM certificates WHERE lower(trim(roll_no)) = lower(?)
                 AND lower(trim(batch_number)) = lower(?) AND lower(trim(student_name)) = lower(?)
                 AND lower(trim(course_name)) IN (${courseNames.map(() => "?").join(", ")})
             )`
        ).bind(id, ...fields.map(field => values[field]), auth.id, markSheetId, sheet.registration_no, sheet.student_name,
          examCode, sheet.first_terminal, sheet.second_terminal, sheet.third_terminal, parts[0], parts[1], sheet.student_name, ...courseNames),
        env.DB.prepare(
          "UPDATE marksheets SET certificate_ref = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND EXISTS (SELECT 1 FROM certificates WHERE id = ?)"
        ).bind(id, markSheetId, id),
      ]);
      return created.meta.changes
        ? Response.json({ success: true, id }, { status: 201 })
        : Response.json({ error: "A matching certificate already exists or the mark sheet changed. Refresh and link an existing certificate if available." }, { status: 409 });
    }

    await env.DB.prepare(
      `INSERT INTO certificates (${columns.join(", ")})
       VALUES (${placeholders})`
    ).bind(id, ...fields.map(field => values[field]), auth.id).run();

    return Response.json({ success: true, id }, { status: 201 });
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) {
      return Response.json({ error: "This certificate ID or marksheet registration number already exists." }, { status: 409 });
    }
    return Response.json({ error: "Unable to create certificate" }, { status: 500 });
  }
}
