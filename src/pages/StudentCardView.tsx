import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Award, BookOpen, UserRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import CertificatePreview from "@/components/CertificatePreview";
import { createCertificatePDF } from "@/utils/pdfGenerator";
import { createMarksheetPdf, type PrintableMarksheet } from "@/lib/marksheet-pdf";
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
type Sheet = PrintableMarksheet & {
  id: string; certificate_ref?: string | null; exam_course: keyof typeof examCourses;
};
type RecordResponse = { data: { student: Student; registration_no: string; marksheets: Sheet[]; certificates: Certificate[] } };

const money = (value?: number | null) => value == null ? "Not set" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const field = (label: string, value?: string | number | null) => <div key={label} className="rounded-md border border-white/15 bg-white/5 p-3"><p className="text-xs text-gray-300">{label}</p><p className="mt-1 break-words font-medium text-white">{value || "—"}</p></div>;

function addVerificationWatermark(pdf: Awaited<ReturnType<typeof createMarksheetPdf>>) {
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    const width = pdf.internal.pageSize.getWidth();
    const height = pdf.internal.pageSize.getHeight();
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(27);
    pdf.setTextColor(210, 125, 125);
    pdf.text("FOR ONLINE VERIFICATION ONLY", width / 2, height / 2, {
      align: "center",
      angle: -32,
    });
  }
  return pdf;
}

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
  const [preview, setPreview] = useState("");
  const [notice, setNotice] = useState("");
  const course = examCourses[sheet.exam_course];
  const modules = course?.modules || [];

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    async function prepare() {
      try {
        if (!course) throw new Error("Unknown marksheet course.");
        const pdf = addVerificationWatermark(await createMarksheetPdf(sheet));
        objectUrl = URL.createObjectURL(pdf.output("blob"));
        if (active) setPreview(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      } catch {
        if (active) setNotice("Unable to prepare this marksheet preview.");
      }
    }
    void prepare();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sheet, course]);

  return <Card className="border-white/20 bg-white/10 text-white backdrop-blur-lg">
    <CardHeader><CardTitle className="text-white">{sheet.exam_course ? course?.name || sheet.exam_course : "Marksheet"}</CardTitle><CardDescription className="text-gray-200">Registration No. {sheet.registration_no} · {sheet.issued_on ? "Issued " + sheet.issued_on : "Result in progress"}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">{modules.map(([key, label, subject]) => {
        const value = sheet[key as keyof Sheet];
        return <div key={key} className="rounded-md border border-white/15 bg-white/5 p-3"><p className="text-xs text-gray-300">{label} · {subject}</p><p className="mt-1 font-semibold">{value == null ? "Result awaited" : value + " / 100"}</p></div>;
      })}</div>
      <p className="text-center text-xs font-semibold tracking-wider text-rose-200">FOR ONLINE VERIFICATION ONLY</p>
      {notice ? <p role="alert" className="text-sm text-amber-100">{notice}</p> : preview
        ? <iframe src={preview + "#toolbar=0&navpanes=0&scrollbar=0"} title={"Online verification marksheet " + sheet.registration_no} className="h-[75vh] min-h-96 w-full rounded-md border bg-slate-100" />
        : <p role="status" className="text-center text-sm text-gray-200">Preparing marksheet…</p>}
    </CardContent>
  </Card>;
}

function CertificateRecord({ certificate }: { certificate: Certificate }) {
  const source = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState("");
  const [notice, setNotice] = useState("");
  const data: CertificateData = {
    studentName: certificate.student_name, fatherName: certificate.father_name || "",
    courseName: certificate.course_name, duration: certificate.duration || "",
    completionDate: certificate.completion_date, grade: certificate.grade || "",
    studentCoordinator: certificate.student_coordinator || "", certificateId: certificate.certificate_id,
    rollNo: certificate.roll_no || "",
  };

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    async function prepare() {
      try {
        if (!source.current) throw new Error("Certificate preview is not ready.");
        const pdf = addVerificationWatermark(await createCertificatePDF(source.current));
        objectUrl = URL.createObjectURL(pdf.output("blob"));
        if (active) setPreview(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      } catch {
        if (active) setNotice("Unable to prepare this certificate preview.");
      }
    }
    void prepare();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [certificate.id]);

  return <Card className="border-white/20 bg-white/10 text-white backdrop-blur-lg">
    <CardHeader><CardTitle className="text-white">{certificate.course_name}</CardTitle><CardDescription className="text-gray-200">Certificate ID {certificate.certificate_id} · {certificate.completion_date}{certificate.grade ? " · " + certificate.grade : ""}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-center text-xs font-semibold tracking-wider text-rose-200">FOR ONLINE VERIFICATION ONLY</p>
      {notice ? <p role="alert" className="text-sm text-amber-100">{notice}</p> : preview
        ? <iframe src={preview + "#toolbar=0&navpanes=0&scrollbar=0"} title={"Online verification certificate " + certificate.certificate_id} className="h-[75vh] min-h-96 w-full rounded-md border bg-slate-100" />
        : <p role="status" className="text-center text-sm text-gray-200">Preparing certificate…</p>}
      <div ref={source} aria-hidden="true" className="fixed left-[-10000px] top-0"><CertificatePreview data={data} /></div>
    </CardContent>
  </Card>;
}
