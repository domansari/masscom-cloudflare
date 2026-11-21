export const examCourses = {
  dca: {
    name: "Diploma in Computer Application",
    modules: [
      ["first_terminal", "1st Terminal", "Computer Fundamentals, MS-DOS, MS-Windows 7"],
      ["second_terminal", "2nd Terminal", "MS Word, MS Excel, MS Access, MS PowerPoint, Internet"],
    ],
  },
  cca: {
    name: "Certificate Course in Computer Accountancy",
    modules: [["first_terminal", "Module 1", "Basics of Accountancy & Tally.ERP 9 With (GST & PAYROLL)"]],
  },
  adca: {
    name: "Advance Diploma in Computer Accountancy",
    modules: [
      ["first_terminal", "1st Terminal", "Computer Fundamentals, MS-DOS, MS-Windows 7"],
      ["second_terminal", "2nd Terminal", "MS Word, MS Excel, MS Access, MS PowerPoint, Internet"],
      ["third_terminal", "Module 3", "Basics of Accountancy & Tally.ERP 9 With (GST & PAYROLL)"],
    ],
  },
};

export const passingMark = 33;

export function examCourseNames(code) {
  if (!Object.hasOwn(examCourses, code)) return [];
  const names = [examCourses[code].name.toLowerCase(), code];
  if (code === "dca") names.push("diploma in computer applications");
  if (code === "cca") names.push("computer accountancy tally & gst");
  return names;
}

export function examCourseCode(name) {
  const normalized = String(name ?? "").trim().toLowerCase();
  return Object.keys(examCourses).find(code => examCourseNames(code).includes(normalized));
}

export function validExamMarks(code, marks, minimum = 0) {
  if (!Object.hasOwn(examCourses, code)) return false;
  return examCourses[code].modules.every(([field]) =>
    Number.isInteger(marks?.[field]) && marks[field] >= minimum && marks[field] <= 100
  );
}

export function examResult(marks) {
  const total = marks.reduce((sum, mark) => sum + mark, 0);
  const maximum = marks.length * 100;
  const percentage = total / marks.length;
  const pass = marks.every(mark => mark >= passingMark);
  return { total, maximum, percentage: percentage.toFixed(2), pass,
    grade: !pass ? "Fail" : percentage > 75 ? "Excellent" : percentage > 50 ? "Good" : "Satisfactory" };
}

export function marksheetResult(sheet) {
  return examResult(examCourses[sheet.exam_course].modules.map(([field]) => sheet[field]));
}
