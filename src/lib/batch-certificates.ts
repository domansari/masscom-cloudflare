import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createElement } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import CertificateHeader from "@/components/certificate/CertificateHeader";
import CertificateBody from "@/components/certificate/CertificateBody";
import CertificateFooter from "@/components/certificate/CertificateFooter";
import type { CertificateData } from "@/types/certificate";

export type BatchCertificate = {
  certificate_id: string;
  student_name: string;
  father_name?: string;
  course_name: string;
  duration?: string;
  completion_date: string;
  grade?: string;
  student_coordinator?: string;
  roll_no?: string;
  batch_number?: string;
};

const background = "/lovable-uploads/7ab347ae-d0be-4f64-ae7e-c4bfd0378ac4.png";

export async function downloadCertificateBatch(certificates: BatchCertificate[], batch: string) {
  if (!certificates.length) throw new Error("No certificates in the selected batch.");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const holder = document.createElement("div");
  Object.assign(holder.style, {
    position: "fixed", left: "-10000px", top: "0", width: "794px", height: "1123px",
    background: "white", zIndex: "-1"
  });
  document.body.appendChild(holder);
  const root = createRoot(holder);
  try {
    for (let index = 0; index < certificates.length; index++) {
      const cert = certificates[index];
      const data: CertificateData = {
        studentName: cert.student_name, fatherName: cert.father_name || "",
        courseName: cert.course_name, duration: cert.duration || "",
        completionDate: cert.completion_date, grade: cert.grade || "",
        studentCoordinator: cert.student_coordinator || "",
        certificateId: cert.certificate_id, rollNo: cert.roll_no
      };
      const qr = await QRCode.toDataURL(`${window.location.origin}/verify?id=${encodeURIComponent(cert.certificate_id)}`, { width: 100, margin: 1 });
      flushSync(() => root.render(createElement("div", {
        style: { position: "relative", width: "794px", height: "1123px", overflow: "hidden",
          backgroundImage: `url('${background}')`, backgroundSize: "100% 100%",
          fontFamily: "Times, serif" }
      }, [
        createElement("img", { key: "qr", src: qr, alt: "Verification QR", style: {
          position: "absolute", top: "16px", right: "16px", width: "80px", height: "80px", zIndex: 10
        }}),
        createElement("div", { key: "content", className: "flex flex-col h-full" }, [
          createElement(CertificateHeader, { key: "header", data }),
          createElement(CertificateBody, { key: "body", data }),
          createElement(CertificateFooter, { key: "footer", data })
        ])
      ])));
      const canvas = await html2canvas(holder, {
        scale: 1.7, useCORS: true, backgroundColor: "#ffffff", width: 794, height: 1123, logging: false
      });
      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297);
    }
    pdf.save(`Certificates_Batch_${batch.replace(/[^a-z0-9_-]/gi, "-")}.pdf`);
  } finally {
    root.unmount();
    holder.remove();
  }
}
