import { examCourses, marksheetResult, validExamMarks } from "./_exam-courses.js";

const websiteOrigins = new Set(["https://www.masscom.co.in", "https://masscom.co.in"]);

export async function onRequestGet({ request, env }) {
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  const origin = request.headers.get("Origin");
  if (websiteOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  const json = (body, status = 200) => Response.json(body, { status, headers });

  const roll = new URL(request.url).searchParams.get("roll")?.trim() ?? "";
  if (!roll || roll.length > 100 || /[\x00-\x1f\x7f]/.test(roll)) {
    return json({ status: "invalid" }, 400);
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT registration_no, student_name, issued_on, first_terminal, second_terminal, third_terminal,
              COALESCE(publishing_course, exam_course) AS exam_course
       FROM marksheets
       WHERE issued_on <= date('now', '+5 hours', '+30 minutes')
         AND (registration_no = ? COLLATE NOCASE
           OR (instr(?, '/') = 0 AND substr(registration_no, 1, instr(registration_no, '/') - 1) = ? COLLATE NOCASE))
       LIMIT 2`
    ).bind(roll, roll, roll).all();

    if (results.length > 1) return json({ status: "ambiguous" });
    const sheet = results[0];
    if (!sheet || !validExamMarks(sheet.exam_course, sheet)) return json({ status: "not_declared" });

    const course = examCourses[sheet.exam_course];
    return json({
      status: "declared",
      result: {
        studentName: sheet.student_name,
        registrationNo: sheet.registration_no,
        courseName: course.name,
        issuedOn: sheet.issued_on,
        exams: course.modules.map(([field, title, topics]) => ({ title, topics, maximum: 100, secured: sheet[field] })),
        ...marksheetResult(sheet),
      },
    });
  } catch (error) {
    console.error("Result lookup failed:", error);
    return json({ status: "unavailable" }, 500);
  }
}
