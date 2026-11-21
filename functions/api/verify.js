export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const certificateId = url.searchParams.get("id")?.trim();

    if (!certificateId) {
      return Response.json(
        { error: "Certificate ID is required" },
        { status: 400 }
      );
    }

    const certificate = await context.env.DB
      .prepare(
        `SELECT certificate_id, student_name, course_name,
                duration, completion_date, grade,
                instructor_name, father_name,
                student_coordinator, roll_no, batch_number
         FROM certificates
         WHERE certificate_id = ?`
      )
      .bind(certificateId)
      .first();

    if (!certificate) {
      return Response.json(
        { error: "Certificate not found" },
        { status: 404 }
      );
    }

    const marksheet = await context.env.DB.prepare(
      `SELECT m.registration_no, m.student_name, m.father_name, m.first_terminal,
              m.second_terminal, m.third_terminal,
              COALESCE(m.publishing_course, m.exam_course) AS exam_course,
              m.issued_on, c.duration
       FROM marksheets m
       JOIN certificates c ON c.id = m.certificate_ref
       WHERE c.certificate_id = ?`
    ).bind(certificateId).first();

    return Response.json({ certificate, marksheet: marksheet || null }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Certificate verification failed:", error);
    return Response.json(
      { error: "Unable to verify certificate" },
      { status: 500 }
    );
  }
}
