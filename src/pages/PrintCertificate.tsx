import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import CertificatePreview from "@/components/CertificatePreview";
import QRCodeGenerator from "@/components/QRCodeGenerator";
import { createCertificatePDF } from "@/utils/pdfGenerator";
import { formatIndianDate } from "@/lib/date-format";

interface Certificate {
  id: string;
  certificate_id: string;
  student_name: string;
  father_name: string;
  course_name: string;
  duration: string;
  completion_date: string;
  grade: string;
  student_coordinator: string;
  roll_no?: string;
  batch_number?: string;
}

export default function PrintCertificate() {
  const { id } = useParams<{ id: string }>();
  return <CertificatePage key={id} id={id} />;
}

function CertificatePage({ id }: { id?: string }) {
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    async function loadCertificate() {
      try {
        const response = await fetch(`/api/certificates/${encodeURIComponent(id)}`, {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (response.status === 404) return;
        if (!response.ok) throw new Error("Failed to load certificate");
        const { data } = await response.json() as { data: Certificate };
        if (!controller.signal.aborted) setCertificate(data);
      } catch {
        if (!controller.signal.aborted) setError("Unable to load the certificate. Reload the page to try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadCertificate();
    return () => controller.abort();
  }, [id]);

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <Button asChild variant="outline">
        <Link to="/manage"><ArrowLeft className="mr-2 h-4 w-4" />Back to Manage Certificates</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Certificate Preview</CardTitle>
          {certificate && <CardDescription>Certificate for {certificate.student_name}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p role="status">Loading certificate…</p> : error ? <p role="alert">{error}</p> : certificate
            ? <CertificatePdf certificate={certificate} />
            : <p>Certificate not found.</p>}
        </CardContent>
      </Card>
    </main>
  );
}

function CertificatePdf({ certificate }: { certificate: Certificate }) {
  const certificateRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ url: string; pdf: Awaited<ReturnType<typeof createCertificatePDF>> } | null>(null);
  const [error, setError] = useState("");
  const [printNotice, setPrintNotice] = useState("");
  const filename = `${certificate.student_name.replace(/\s+/g, "_")}_${certificate.certificate_id}`;
  const data = {
    studentName: certificate.student_name,
    fatherName: certificate.father_name || "",
    courseName: certificate.course_name,
    duration: certificate.duration || "",
    completionDate: certificate.completion_date,
    grade: certificate.grade || "",
    studentCoordinator: certificate.student_coordinator || "",
    certificateId: certificate.certificate_id,
    rollNo: certificate.roll_no || "",
  };

  useEffect(() => {
    const source = certificateRef.current;
    if (!source) return;
    let active = true;
    let url = "";
    createCertificatePDF(source).then(pdf => {
      if (!active) return;
      url = URL.createObjectURL(pdf.output("blob"));
      pdf.autoPrint();
      setPreview({ url, pdf });
    }).catch(() => {
      if (active) setError("Unable to prepare the certificate PDF. Reload the page to try again.");
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  function print() {
    if (!preview) return;
    setPrintNotice("");
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setPrintNotice("Allow pop-ups for this site to print the certificate.");
      return;
    }
    try {
      const url = URL.createObjectURL(preview.pdf.output("blob"));
      window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
      printWindow.opener = null;
      printWindow.location.replace(url);
    } catch {
      printWindow.close();
      setPrintNotice("Unable to print the certificate PDF. Please try again.");
    }
  }

  return (
    <>
      {!preview && !error && (
        <div ref={certificateRef} aria-hidden="true" className="invisible fixed left-[-10000px] top-0">
          <CertificatePreview data={data} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {preview && <>
          <Button variant="outline" onClick={print}><Printer className="mr-2 h-4 w-4" />Print</Button>
          <Button asChild variant="outline">
            <a href={preview.url} download={`${filename}_Certificate_v1.0.pdf`}><Download className="mr-2 h-4 w-4" />Download PDF</a>
          </Button>
        </>}
        <Button asChild variant="outline">
          <Link to={`/marksheets/manage?certificate=${encodeURIComponent(certificate.id)}`}>View Marksheet</Link>
        </Button>
      </div>
      {printNotice && <p role="status">{printNotice}</p>}
      {error ? <p role="alert">{error}</p> : preview
        ? <iframe src={preview.url} title="Certificate PDF" className="h-[75vh] min-h-96 w-full rounded-md border bg-slate-100" />
        : <p role="status">Preparing the certificate PDF…</p>}
      <details>
        <summary className="cursor-pointer text-sm font-medium">Certificate details and verification QR code</summary>
        <div className="mt-4 flex flex-wrap items-start gap-6 text-sm">
          <div className="space-y-2">
            <div><strong>Student:</strong> {certificate.student_name}</div>
            <div><strong>Course:</strong> {certificate.course_name}</div>
            <div><strong>Completion Date:</strong> {formatIndianDate(certificate.completion_date)}</div>
            {certificate.roll_no && <div><strong>Roll No:</strong> {certificate.roll_no}</div>}
            {certificate.batch_number && <div><strong>Batch:</strong> {certificate.batch_number}</div>}
            <div><strong>Certificate ID:</strong> {certificate.certificate_id}</div>
          </div>
          <QRCodeGenerator data={`${window.location.origin}/verify?id=${encodeURIComponent(certificate.certificate_id)}`} filename={filename} />
        </div>
      </details>
    </>
  );
}
