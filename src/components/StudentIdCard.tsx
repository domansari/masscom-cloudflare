import { useEffect, useState } from "react";
import QRCode from "qrcode";

export type StudentIdCardRecord = {
  id: string;
  student_id: string;
  registration_no: string;
  card_created_at: string;
  student_active: number;
  student_name: string;
  father_name: string | null;
  course_name: string | null;
  session_year: string | null;
  date_of_birth: string | null;
  phone: string | null;
  institute_name: string | null;
};

export default function StudentIdCard({ card, photoUrl }: { card: StudentIdCardRecord; photoUrl: string }) {
  const [qrImage, setQrImage] = useState("");
  useEffect(() => {
    let active = true;
    const target = window.location.origin + "/student-record?regNo=" + encodeURIComponent(card.registration_no);
    QRCode.toDataURL(target, { width: 300, margin: 1, errorCorrectionLevel: "M" })
      .then(value => { if (active) setQrImage(value); })
      .catch(() => { if (active) setQrImage(""); });
    return () => { active = false; };
  }, [card.registration_no]);

  return <div className="id-card-print-surface mx-auto aspect-[1.586] w-full max-w-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
    <div className="flex h-[19%] items-center justify-between bg-gradient-to-r from-blue-900 via-indigo-800 to-violet-800 px-5 text-white">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-100">Masscom Infotech Education</p><p className="mt-0.5 text-base font-bold leading-tight">STUDENT ID CARD</p></div>
      <span className="rounded-full border border-white/40 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider">{card.student_active ? "Active" : "Archived"}</span>
    </div>
    <div className="grid h-[81%] grid-cols-[24%_1fr_23%] gap-3 p-4">
      <div className="flex items-start justify-center"><img src={photoUrl} alt={card.student_name + " photo"} className="h-28 w-24 rounded-lg border-2 border-indigo-100 bg-slate-100 object-cover" onError={event => { event.currentTarget.style.visibility = "hidden"; }} /></div>
      <div className="min-w-0 space-y-1.5 pt-1">
        <p className="truncate text-lg font-bold leading-tight text-slate-900">{card.student_name}</p>
        <p className="truncate text-xs text-slate-600">Father: {card.father_name || "—"}</p>
        <p className="truncate text-xs text-slate-600">Course: {card.course_name || "—"}</p>
        <p className="truncate text-xs text-slate-600">Session: {card.session_year || "—"}</p>
        <div className="pt-1"><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-indigo-700">Registration No.</p><p className="break-all text-base font-extrabold leading-tight text-indigo-950">{card.registration_no}</p></div>
        <p className="truncate text-[9px] text-slate-500">Phone: {card.phone || "—"}</p>
      </div>
      <div className="flex flex-col items-center justify-center gap-1">
        {qrImage ? <img src={qrImage} alt={"QR code for registration " + card.registration_no} className="h-20 w-20" /> : <div className="h-20 w-20 rounded border border-slate-200" />}
        <span className="max-w-full break-all text-center text-[8px] font-semibold text-slate-600">SCAN TO VERIFY</span>
      </div>
    </div>
  </div>;
}
