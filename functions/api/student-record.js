const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "no-store, max-age=0", "Pragma": "no-cache" },
});

const norm = value => String(value || "").trim().toLowerCase();

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const registrationNo = (url.searchParams.get("regNo") || "").trim();
  if (!registrationNo || registrationNo.length > 64) return json({ error: "Invalid registration number" }, 400);

  try {
    const card = await env.DB.prepare(
      `SELECT c.student_id, c.registration_no, s.id, s.student_name, s.first_name, s.last_name,
        s.father_name, s.mother_name, s.gender, s.category, s.roll_no, s.batch_code, s.section_batch,
        s.course_name, s.institute_name, s.session_year, s.admission_date, s.date_of_birth,
        s.phone, s.email, s.address, s.aadhaar_last4, s.notes, s.one_time_fee, s.monthly_fee, s.is_active
       FROM student_id_cards c JOIN students s ON s.id = c.student_id
       WHERE lower(trim(c.registration_no)) = lower(trim(?)) LIMIT 1`
    ).bind(registrationNo).first();

    if (!card) return json({ error: "Student record not found" }, 404);

    if (url.searchParams.get("photo") === "1") {
      const stored = await env.DB.prepare(
        "SELECT object_key, content_type, file_size FROM student_documents WHERE student_id = ? AND document_type = 'photo' LIMIT 1"
      ).bind(card.student_id).first();
      if (!stored) return json({ error: "Student photo not found" }, 404);
      if (!env.STUDENT_FILES) return json({ error: "Student photo storage is unavailable" }, 503);
      const object = await env.STUDENT_FILES.get(stored.object_key);
      if (!object) return json({ error: "Student photo not found" }, 404);
      const mime = ["image/jpeg", "image/png", "image/webp"].includes(stored.content_type) ? stored.content_type : "application/octet-stream";
      return new Response(object.body, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Content-Type": mime,
          "Content-Disposition": "inline",
          "Content-Length": String(stored.file_size),
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const studentBatch = card.section_batch || card.batch_code;
    const [certResult, sheetResult] = await Promise.all([
      env.DB.prepare(
        `SELECT id, certificate_id, student_name, father_name, course_name, duration, completion_date,
          grade, student_coordinator, roll_no, batch_number, instructor_name
         FROM certificates WHERE lower(trim(student_name)) = lower(trim(?))
         ORDER BY created_at DESC, certificate_id`
      ).bind(card.student_name).all(),
      env.DB.prepare(
        `SELECT id, registration_no, student_name, father_name,
          CASE WHEN undeclared_exams & 1 = 0 THEN first_terminal END AS first_terminal,
          CASE WHEN undeclared_exams & 2 = 0 THEN second_terminal END AS second_terminal,
          CASE WHEN undeclared_exams & 4 = 0 THEN third_terminal END AS third_terminal,
          COALESCE(publishing_course, exam_course) AS exam_course, issued_on, certificate_ref,
          (SELECT duration FROM certificates WHERE certificates.id = marksheets.certificate_ref) AS duration
         FROM marksheets WHERE lower(trim(student_name)) = lower(trim(?))
         ORDER BY updated_at DESC, id`
      ).bind(card.student_name).all(),
    ]);

    const certificates = (certResult.results || []).filter(item =>
      norm(item.student_name) === norm(card.student_name) &&
      (!card.roll_no || norm(item.roll_no) === norm(card.roll_no)) &&
      (!studentBatch || norm(item.batch_number) === norm(studentBatch))
    );
    const marksheets = (sheetResult.results || []).filter(item => {
      const parts = String(item.registration_no || "").split("/");
      return norm(item.student_name) === norm(card.student_name) &&
        (!card.roll_no || norm(parts[0]) === norm(card.roll_no)) &&
        (!studentBatch || norm(parts[1]) === norm(studentBatch));
    });

    return json({
      data: {
        student: {
          id: card.id, student_name: card.student_name, first_name: card.first_name, last_name: card.last_name,
          father_name: card.father_name, mother_name: card.mother_name, gender: card.gender, category: card.category,
          roll_no: card.roll_no, batch_code: card.batch_code, section_batch: card.section_batch,
          course_name: card.course_name, institute_name: card.institute_name, session_year: card.session_year,
          admission_date: card.admission_date, date_of_birth: card.date_of_birth, phone: card.phone,
          email: card.email, address: card.address, aadhaar_last4: card.aadhaar_last4, notes: card.notes,
          one_time_fee: card.one_time_fee, monthly_fee: card.monthly_fee, is_active: card.is_active,
        },
        registration_no: card.registration_no,
        marksheets,
        certificates,
      },
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (/no such table: student_id_cards/i.test(message)) {
      return json({ error: "Student ID card database setup is required." }, 503);
    }
    if (/no such table: student_documents/i.test(message)) {
      return json({ error: "Student photo database setup is required." }, 503);
    }
    return json({ error: "Unable to load the student record" }, 500);
  }
}
