import { examCourses, marksheetResult, validMarksheetEntries } from "./_exam-courses.js";

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
      `SELECT registration_no, student_name, issued_on,
              CASE WHEN undeclared_exams & 1 = 0 THEN first_terminal END AS first_terminal,
              CASE WHEN undeclared_exams & 2 = 0 THEN second_terminal END AS second_terminal,
              CASE WHEN undeclared_exams & 4 = 0 THEN third_terminal END AS third_terminal,
              COALESCE(publishing_course, exam_course) AS exam_course
       FROM marksheets
       WHERE ((issued_on <> '' AND issued_on <= date('now', '+5 hours', '+30 minutes'))
          OR (issued_on = '' AND undeclared_exams <> 0 AND
            undeclared_exams <> CASE COALESCE(publishing_course, exam_course)
              WHEN 'cca' THEN 1 WHEN 'cdtp' THEN 1 WHEN 'dca' THEN 3 ELSE 7 END))
         AND (registration_no = ? COLLATE NOCASE
           OR (instr(?, '/') = 0 AND substr(registration_no, 1, instr(registration_no, '/') - 1) = ? COLLATE NOCASE))
       LIMIT 2`
    ).bind(roll, roll, roll).all();

    if (results.length > 1) return json({ status: "ambiguous" });
    const sheet = results[0];
    if (!sheet || !validMarksheetEntries(sheet.exam_course, sheet)) return json({ status: "not_declared" });

    const course = examCourses[sheet.exam_course];
    const exams = course.modules.map(([field, title, topics]) => ({ title, topics, maximum: 100, secured: sheet[field] }));
    const declared = exams.filter(exam => exam.secured !== null);
    const partial = declared.length !== exams.length;
    if (!declared.length) return json({ status: "not_declared" });
    const score = partial ? {
      maximum: declared.length * 100,
      total: declared.reduce((sum, exam) => sum + exam.secured, 0),
    } : marksheetResult(sheet);
    return json({
      status: partial ? "partial" : "declared",
      result: {
        studentName: sheet.student_name,
        registrationNo: sheet.registration_no,
        courseName: course.name,
        issuedOn: sheet.issued_on,
        exams,
        ...score,
      },
    });
  } catch (error) {
    console.error("Result lookup failed:", error);
    return json({ status: "unavailable" }, 500);
  }
}
