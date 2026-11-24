import type { PrintableMarksheet } from "@/lib/marksheet-pdf";
import { examCourses, marksheetResult, passingMark } from "../../functions/api/_exam-courses.js";
import logoUrl from "@/assets/marksheet-logo.png";
import wordmarkUrl from "@/assets/marksheet-wordmark.png";
import { formatIndianDate } from "@/lib/date-format";

const durations: Record<string, string> = { dca: "8 Months", cca: "4 Months", cdtp: "4 Months" };

export default function MarksheetCanvasPreview({ sheet }: { sheet: PrintableMarksheet }) {
  const course = examCourses[sheet.exam_course];
  if (!course) return <p className="p-4 text-red-700">Unsupported marksheet course.</p>;
  const score = marksheetResult(sheet);
  const date = formatIndianDate(sheet.issued_on);

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-gray-100 p-2 sm:p-4">
      <div className="relative mx-auto max-w-[612px] bg-white text-black border-[3px] border-black p-3 sm:p-7 shadow-md"
           style={{ fontFamily: "Times New Roman, serif", minHeight: 760 }}>
        <div className="absolute inset-1 border border-black pointer-events-none" />
        <div className="relative z-10">
          <header className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <img src={wordmarkUrl} alt="Masscom Infotech Education" className="w-full max-w-[320px] object-contain" />
              <p className="text-[10px] text-center mt-2">[An Autonomous institution registered under Public Trust Act.]</p>
              <h2 className="text-center text-lg font-bold italic mt-1">Statement of Marks</h2>
            </div>
            <div className="w-20 sm:w-24 shrink-0 text-right">
              <p className="text-[10px] font-bold">Society Reg.No.463</p>
              <img src={logoUrl} alt="Masscom logo" className="w-full object-contain" />
            </div>
          </header>
          <dl className="my-6 space-y-2 text-xs sm:text-sm">
            {([
              ["Enrollment No.", sheet.registration_no],
              ["This Marksheet is awarded to", sheet.student_name],
              ["Father's Name", sheet.father_name || ""],
              ["Course", course.name],
              ["Of Duration", sheet.duration?.trim() || durations[sheet.exam_course] || ""]
            ] as const).map(([label, value]) => (
              <div key={label} className="grid grid-cols-[42%_1fr] gap-2">
                <dt className="italic">{label} :</dt><dd className="font-bold break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <table className="w-full border-collapse border-2 border-black text-[10px] sm:text-xs">
            <thead><tr className="border-b border-black">
              <th className="border-r border-black p-1">Sl.No.</th>
              <th className="border-r border-black p-1">Course/Subject/Module</th>
              <th className="border-r border-black p-1">Max. Marks</th>
              <th className="p-1">Marks Secured</th>
            </tr></thead>
            <tbody>
              {course.modules.map(([field, label, description], index) => (
                <tr key={field} className="align-top">
                  <td className="border-r border-black p-2 text-center">{index + 1}</td>
                  <td className="border-r border-black p-2 h-24"><b>{label}</b><p className="mt-1">{description}</p></td>
                  <td className="border-r border-black p-2 text-center">100</td>
                  <td className="p-2 text-center">{sheet[field]}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-black font-bold">
                <td colSpan={2} className="p-2 text-right border-r border-black">TOTAL :</td>
                <td className="p-2 text-center border-r border-black">{score.maximum}</td>
                <td className="p-2 text-center">{score.total}</td>
              </tr>
            </tbody>
          </table>
          <div className="flex justify-between mt-4 text-sm">
            <p>Percentage : <b>{score.percentage}%</b></p>
            <p>Grade : <b>{score.grade}</b></p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-xs mt-12">
            <div className="border-t border-black pt-1 italic">Prepared By</div>
            <div className="border-t border-black pt-1 italic">Date of Issue<br />{date}</div>
            <div className="border-t border-black pt-1 italic">Controller of Examination</div>
          </div>
          <footer className="text-center text-[10px] mt-8 border-t border-black pt-2 space-y-1">
            <p>Grade: &gt;75% Excellent | &gt;50% to 75% Good | up to 50% Satisfactory (when passed)</p>
            <p>Pass: at least {passingMark}/100 in every required exam.</p>
            <p>1st Floor, Mohsin Market, Yusufpur, Mohammadabad, Ghazipur (U.P.) 233227</p>
            <p>info@masscom.co.in | www.masscom.co.in</p>
          </footer>
        </div>
        <div aria-label="Online verification watermark" className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center overflow-hidden">
          <span className="text-gray-500/30 text-2xl sm:text-4xl font-bold whitespace-nowrap -rotate-45 select-none">ONLINE VERIFICATION</span>
        </div>
      </div>
    </div>
  );
}
