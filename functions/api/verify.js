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

    return Response.json({ certificate });
  } catch (error) {
    console.error("Certificate verification failed:", error);
    return Response.json(
      { error: "Unable to verify certificate" },
      { status: 500 }
    );
  }
}
