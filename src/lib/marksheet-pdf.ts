import { jsPDF } from "jspdf";
import { examCourses, marksheetResult, passingMark, validExamMarks } from "../../functions/api/_exam-courses.js";
import logoUrl from "@/assets/marksheet-logo.png";
import wordmarkUrl from "@/assets/marksheet-wordmark.png";
import { controllerSignatureData } from "@/assets/controller-signature-data";

export type PrintableMarksheet = {
  registration_no: string;
  student_name: string;
  father_name: string | null;
  issued_on: string;
  first_terminal: number | null;
  second_terminal: number | null;
  third_terminal: number | null;
  exam_course: keyof typeof examCourses;
  duration?: string | null;
};

const courseDurations: Partial<Record<PrintableMarksheet["exam_course"], string>> = { dca: "8 Months", cca: "4 Months", cdtp: "4 Months" };

const pageMargin = 0.72; // 0.01 inch in PDF points.
const outerFrame = { x: 56.5, y: 20.5, width: 508, height: 751, stroke: 2.5 };

async function imageBytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load the marksheet artwork.");
  return new Uint8Array(await response.arrayBuffer());
}

export async function createMarksheetPdf(sheet: PrintableMarksheet) {
  const [logo, wordmark] = await Promise.all([imageBytes(logoUrl), imageBytes(wordmarkUrl)]);
  const signature = controllerSignatureData;
  return drawMarksheetPdf(sheet, logo, wordmark, undefined, signature);
}

export function drawMarksheetPdf(sheet: PrintableMarksheet, logo: Uint8Array, wordmark: Uint8Array, existingPdf?: jsPDF, signature?: string) {
  const pdf = existingPdf || new jsPDF({ unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
  if (existingPdf) pdf.addPage("a4", "portrait");
  const course = examCourses[sheet.exam_course];
  const score = validExamMarks(sheet.exam_course, sheet) ? marksheetResult(sheet) : null;
  const left = 87.5;
  const right = 531.5;
  const columns = [left, 129, 372, 454, right];
  const tableTop = 220;
  const headerEnd = 241;
  const totalTop = 594;
  const tableEnd = 622;
  const center = (index: number) => (columns[index] + columns[index + 1]) / 2;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sheet.issued_on)
    ? sheet.issued_on.split("-").reverse().join("/") : sheet.issued_on;

  pdf.setProperties({ title: "Statement of Marks", author: "Masscom Infotech Education" });
  const font = (style: string, size: number) => {
    pdf.setFont("times", style);
    pdf.setFontSize(size);
  };
  const fit = (text: string, x: number, y: number, width: number) => {
    const initial = pdf.getFontSize();
    const measured = pdf.getTextWidth(text);
    if (measured > width) pdf.setFontSize(initial * width / measured);
    pdf.text(text, x, y);
    pdf.setFontSize(initial);
  };
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const frameLeft = outerFrame.x - outerFrame.stroke / 2;
  const frameTop = outerFrame.y - outerFrame.stroke / 2;
  const transform = pdf.unitMatrix.clone();
  transform.sx = (pageWidth - 2 * pageMargin) / (outerFrame.width + outerFrame.stroke);
  transform.sy = (pageHeight - 2 * pageMargin) / (outerFrame.height + outerFrame.stroke);
  transform.tx = pageMargin - transform.sx * frameLeft;
  // The PDF matrix uses a bottom-left origin, while jsPDF drawing coordinates start at the top left.
  transform.ty = pageHeight - pageMargin - transform.sy * (pageHeight - frameTop);
  pdf.saveGraphicsState();
  pdf.setCurrentTransformationMatrix(transform);
  pdf.setLineWidth(outerFrame.stroke);
  pdf.rect(outerFrame.x, outerFrame.y, outerFrame.width, outerFrame.height);
  pdf.setLineWidth(0.55);
  pdf.rect(60, 24, 501, 744);
  pdf.addImage(wordmark, "PNG", 110, 39.3, 302.33, 14.33);
  pdf.addImage(logo, "PNG", 468.7, 42.3, 82, 79);

  font("bold", 10);
  pdf.text("Society Reg.No.463", 550, 34, { align: "right" });
  font("normal", 8);
  pdf.text("[An Autonomous institution registered under Public Trust Act.]", 260, 65, { align: "center" });
  font("bolditalic", 15);
  pdf.text("Statement of Marks", 256, 83, { align: "center" });

  const details = [
    ["Enrollment No.", sheet.registration_no],
    ["This Marksheet is awarded to", sheet.student_name],
    ["Father's Name", sheet.father_name || ""],
    ["Course", course.name],
    ["Of Duration", sheet.duration?.trim() || courseDurations[sheet.exam_course] || ""],
  ];
  details.forEach(([label, value], index) => {
    const y = 123 + 19 * index;
    font("italic", 13.5);
    pdf.text(label, 89, y);
    pdf.text(":", 267, y);
    font("bold", 12.5);
    fit(value, 280, y, index === 0 ? 184 : 249);
  });

  pdf.setLineWidth(1.8);
  pdf.rect(left, tableTop, right - left, tableEnd - tableTop);
  pdf.line(left, headerEnd, right, headerEnd);
  pdf.line(left, totalTop, right, totalTop);
  columns.slice(1, -1).forEach(x => pdf.line(x, tableTop, x, totalTop));

  font("bold", 10.5);
  ["Sl.No.", "Course/Subject/Module", "Max. Marks", "Marks Secured"].forEach((label, index) => {
    pdf.text(label, center(index), 233, { align: "center" });
  });

  course.modules.forEach(([field, label, modules], index) => {
    const y = 312 + index * 57;
    font("normal", 11.5);
    pdf.text(String(index + 1), center(0), y, { align: "center" });
    pdf.text("100", center(2), y, { align: "center" });
    if (sheet[field] == null) font("normal", 10);
    pdf.text(sheet[field] == null ? "Not Declared" : String(sheet[field]), center(3), y, { align: "center" });
    font("bold", 12);
    pdf.text(label, 141, y - 4);
    font("normal", 10.5);
    pdf.text(pdf.splitTextToSize(modules, 215), 141, y + 11);
  });

  font("bold", 12);
  pdf.text("TOTAL :", 370, 612, { align: "right" });
  pdf.text(String(course.modules.length * 100), center(2), 612, { align: "center" });
  pdf.text(score ? String(score.total) : "-", center(3), 612, { align: "center" });
  font("italic", 13);
  pdf.text("Percentage :", 89, 640);
  pdf.text("Grade :", 405, 640);
  font("bold", 13);
  pdf.text(score ? `${score.percentage}%` : "-", 169, 640);
  pdf.text(score?.grade ?? "Pending", 452, 640);

  pdf.setLineWidth(0.8);
  const signatures = [[70, 169, "Prepared By"], [244, 342, "Date of Issue"], [400, 534, "Controller of Examination"]] as const;
  font("normal", 10.5);
  pdf.text(date, 293, 682, { align: "center" });
  font("italic", 12.5);
  signatures.forEach(([start, end, label]) => {
    pdf.line(start, 687, end, 687);
    pdf.text(label, (start + end) / 2, 703, { align: "center" });
  });
  if (signature) pdf.addImage(signature, "PNG", 445, 611, 67, 88);
  pdf.line(61, 712, 560, 712);
  font("normal", 8.5);
  pdf.text("Grade: >75% Excellent | >50% to 75% Good | up to 50% Satisfactory (when passed)", 310, 724, { align: "center" });
  pdf.text(`Pass: at least ${passingMark}/100 in every required exam.`, 310, 735, { align: "center" });
  font("normal", 10.5);
  pdf.text("1st Floor, Mohsin Market, Yusufpur, Mohammadabad, Ghazipur (U.P.) 233227", 310, 749, { align: "center" });
  pdf.text("info@masscom.co.in  |  www.masscom.co.in", 310, 762, { align: "center" });
  pdf.restoreGraphicsState();
  return pdf;
}

export async function downloadMarksheetBatch(sheets: PrintableMarksheet[], batch: string) {
  if (!sheets.length) throw new Error("No marksheets in the selected batch.");
  const [logo, wordmark] = await Promise.all([imageBytes(logoUrl), imageBytes(wordmarkUrl)]);
  const signature = controllerSignatureData;
  let combined: jsPDF | undefined;
  for (const sheet of sheets) {
    combined = drawMarksheetPdf(sheet, logo, wordmark, combined, signature);
  }
  combined!.save(`Marksheets_Batch_${batch.replace(/[^a-z0-9_-]/gi, "-")}.pdf`);
}
