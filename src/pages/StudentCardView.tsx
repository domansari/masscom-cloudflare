import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Award, BookOpen, UserRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import CertificatePreview from "@/components/CertificatePreview";
import { examCourses } from "../../functions/api/_exam-courses.js";
import type { CertificateData } from "@/types/certificate";

type Student = {
  id: string; student_name: string; first_name?: string | null; last_name?: string | null;
  father_name?: string | null; mother_name?: string | null; gender?: string | null; category?: string | null;
  roll_no?: string | null; batch_code?: string | null; section_batch?: string | null; course_name?: string | null;
  institute_name?: string | null; session_year?: string | null; admission_date?: string | null; date_of_birth?: string | null;
  phone?: string | null; email?: string | null; address?: string | null; aadhaar_last4?: string | null;
  notes?: string | null; one_time_fee?: number | null; monthly_fee?: number | null; is_active: number;
};
type Certificate = {
  id: string; certificate_id: string; student_name: string; father_name?: string | null;
  course_name: string; duration?: string | null; completion_date: string; grade?: string | null;
  student_coordinator?: string | null; roll_no?: string | null; batch_number?: string | null;
  instructor_name?: string | null;
};
type Sheet = {
  id: string; registration_no: string; student_name: string; father_name: string | null;
  issued_on: string; first_terminal: number | null; second_terminal: number | null;
  third_terminal: number | null; exam_course: keyof typeof examCourses;
  certificate_ref?: string | null;
};
type RecordResponse = { data: { student: Student; registration_no: string; marksheets: Sheet[]; certificates: Certificate[] } };

const money = (value?: number | null) => value == null ? "Not set" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const field = (label: string, value?: string | number | null) => <div key={label} className="rounded-md border border-white/15 bg-white/5 p-3"><p className="text-xs text-gray-300">{label}</p><p className="mt-1 break-words font-medium text-white">{value || "—"}</p></div>;

export default function StudentCardView() {
  const [searchParams] = useSearchParams();
  const registrationNo = searchParams.get("regNo") || "";
  const [record, setRecord] = useState<RecordResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setRecord(null);
    setPhotoError(false);
    if (!registrationNo) {
      setError("Registration number is missing.");
      setLoading(false);
      return () => controller.abort();
    }
    fetch("/api/student-record?regNo=" + encodeURIComponent(registrationNo), { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load student record.");
        return body as RecordResponse;
      })
      .then(result => { if (!controller.signal.aborted) setRecord(result.data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load student record."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [registrationNo]);

  if (loading) return <main className="min-h-screen bg-slate-900 p-8 text-white">Loading student record…</main>;
  if (error || !record) return <main className="min-h-screen bg-slate-900 p-8 text-white"><p role="alert">{error || "Student record not found."}</p></main>;

  const { student, marksheets, certificates } = record;
  const displayFields: Array<[string, string | number | null | undefined]> = [
    ["Father’s Name", student.father_name], ["Mother’s Name", student.mother_name],
    ["Registration No.", record.registration_no], ["Roll Number", student.roll_no],
    ["Batch", student.section_batch || student.batch_code], ["Course", student.course_name],
    ["Session", student.session_year], ["Date of Birth", student.date_of_birth],
    ["Admission Date", student.admission_date], ["Phone", student.phone], ["Email", student.email],
    ["Gender / Category", [student.gender, student.category].filter(Boolean).join(" · ")],
    ["Aadhaar (last 4)", student.aadhaar_last4], ["Institute", student.institute_name],
    ["Address", student.address], ["Notes", student.notes],
    ["One-time Fees", money(student.one_time_fee)], ["Monthly Fees", money(student.monthly_fee)],
  ];

  return <div className="relative min-h-screen overflow-hidden bg-cover bg-center" style={{ backgroundImage: "url('/lovable-uploads/1c1f036d-97eb-4825-9766-e1ddb31b3f55.png')" }}>
    <div className="absolute inset-0 bg-black/55" />
    <main className="relative mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-gray-200">Masscom Infotech Education</p><h1 className="text-2xl font-bold text-white">Student Record</h1></div>
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm text-white">{student.is_active ? "Active" : "Archived"}</span>
      </div>
      <Card className="border-white/20 bg-white/10 backdrop-blur-lg">
        <CardHeader><div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-40 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/25 bg-white/10">
            {!photoError ? <img src={"/api/student-record?regNo=" + encodeURIComponent(record.registration_no) + "&photo=1"} alt={student.student_name + " photo"} className="h-full w-full object-cover" onError={() => setPhotoError(true)} /> : <div className="flex flex-col items-center gap-2 text-gray-300"><UserRound className="h-12 w-12" /><span className="text-xs">Photo unavailable</span></div>}
          </div>
          <div><CardTitle className="flex items-center gap-2 text-2xl text-white"><UserRound className="h-6 w-6" />{student.student_name}</CardTitle><CardDescription className="mt-2 text-gray-200">Student profile and academic records</CardDescription></div>
        </div></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{displayFields.map(([label, value]) => field(label, value))}</CardContent>
      </Card>

      <section className="space-y-4">
        <div><h2 className="flex items-center gap-2 text-xl font-semibold text-white"><BookOpen className="h-5 w-5" />Marksheets</h2><p className="text-sm text-gray-200">Subject marks appear here as soon as they are entered.</p></div>
        {marksheets.length ? marksheets.map(sheet => <MarksheetRecord key={sheet.id} sheet={sheet} />) : <Card className="border-white/20 bg-white/10 text-white"><CardContent className="p-5">No marksheet or exam marks are available yet.</CardContent></Card>}
      </section>

      <section className="space-y-4">
        <div><h2 className="flex items-center gap-2 text-xl font-semibold text-white"><Award className="h-5 w-5" />Certificates</h2><p className="text-sm text-gray-200">Issued certificates appear below the marksheets.</p></div>
        {certificates.length ? certificates.map(certificate => <CertificateRecord key={certificate.id} certificate={certificate} />) : <Card className="border-white/20 bg-white/10 text-white"><CardContent className="p-5">No certificate has been issued.</CardContent></Card>}
      </section>
    </main>
  </div>;
}

function MarksheetRecord({ sheet }: { sheet: Sheet }) {
  const course = examCourses[sheet.exam_course];
  const modules = course?.modules || [];
  return <Card className="border-white/20 bg-white/10 text-white backdrop-blur-lg">
    <CardHeader><CardTitle className="text-white">{sheet.exam_course ? course?.name || sheet.exam_course : "Marksheet"}</CardTitle><CardDescription className="text-gray-200">Registration No. {sheet.registration_no} · {sheet.issued_on ? "Issued " + sheet.issued_on : "Result in progress"}</CardDescription></CardHeader>
    <CardContent>
      <div className="grid gap-2 sm:grid-cols-2">{modules.map(([key, label, subject]) => {
        const value = sheet[key as keyof Sheet];
        return <div key={key} className="rounded-md border border-white/15 bg-white/5 p-3"><p className="text-xs text-gray-300">{label} · {subject}</p><p className="mt-1 font-semibold">{value == null ? "Result awaited" : value + " / 100"}</p></div>;
      })}</div>
    </CardContent>
  </Card>;
}

function CertificateRecord({ certificate }: { certificate: Certificate }) {
  const previewBox = useRef<HTMLDivElement>(null);
  const data: CertificateData = {
    studentName: certificate.student_name, fatherName: certificate.father_name || "",
    courseName: certificate.course_name, duration: certificate.duration || "",
    completionDate: certificate.completion_date, grade: certificate.grade || "",
    studentCoordinator: certificate.student_coordinator || "", certificateId: certificate.certificate_id,
    rollNo: certificate.roll_no || "",
  };

  useLayoutEffect(() => {
    const box = previewBox.current;
    if (!box) return;
    const certificateElement = box.querySelector<HTMLElement>("#certificate-container");
    const certificateBody = box.querySelector<HTMLElement>("#certificate-element");
    const hiddenControls = box.querySelector<HTMLElement>(".no-print");
    if (hiddenControls) hiddenControls.style.display = "none";
    if (certificateBody && !certificateBody.querySelector("[data-verification-watermark]")) {
      const watermark = document.createElement("div");
      watermark.dataset.verificationWatermark = "true";
      Object.assign(watermark.style, {
        position: "absolute", inset: "0", zIndex: "50", pointerEvents: "none",
        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
      });
      const label = document.createElement("span");
      label.textContent = "FOR ONLINE VERIFICATION ONLY";
      Object.assign(label.style, {
        transform: "rotate(-32deg)", color: "rgba(176, 52, 52, 0.34)",
        fontFamily: "Arial, sans-serif", fontSize: "44px", fontWeight: "900",
        letterSpacing: "0.08em", textAlign: "center", whiteSpace: "nowrap",
      });
      watermark.appendChild(label);
      certificateBody.appendChild(watermark);
    }
    const resize = () => {
      if (!certificateElement) return;
      const scale = Math.min(0.4, Math.max(0.2, (box.clientWidth - 2) / 794));
      certificateElement.style.transform = `scale(${scale})`;
      box.style.height = `${Math.ceil(1123 * scale)}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    return () => observer.disconnect();
  }, [certificate.id]);

  return <Card className="border-white/20 bg-white/10 text-white backdrop-blur-lg">
    <CardHeader><CardTitle className="text-white">{certificate.course_name}</CardTitle><CardDescription className="text-gray-200">Certificate ID {certificate.certificate_id} · {certificate.completion_date}{certificate.grade ? " · " + certificate.grade : ""}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-center text-xs font-semibold tracking-wider text-rose-200">FOR ONLINE VERIFICATION ONLY</p>
      <div ref={previewBox} className="relative mx-auto h-[450px] w-full max-w-[317px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-inner">
        <CertificatePreview data={data} />
      </div>
    </CardContent>
  </Card>;
}
