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

const code39: Record<string, string> = {
  "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn",
  "4":"nnnwwnnnw","5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw",
  "8":"wnnwnnwnn","9":"nnwwnnwnn","A":"wnnnnwnnw","B":"nnwnnwnnw",
  "C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn","F":"nnwnwwnnn",
  "G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn",
  "K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww",
  "O":"wnnnwnnwn","P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn",
  "S":"nnwnnnwwn","T":"nnnnwnwwn","U":"wwnnnnnnw","V":"nwwnnnnnw",
  "W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn","Z":"nwwnwnnnn",
  "-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn","$":"nwnwnwnnn",
  "/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn",
};

function Code39Barcode({ value }: { value: string }) {
  const encodedValue = value.toUpperCase();
  if (!encodedValue || [...encodedValue].some(char => !code39[char] || char === "*")) {
    return <div className="flex h-10 items-center justify-center text-[8px] text-red-700">Use A–Z, 0–9, space, - . / $ + % for the barcode</div>;
  }

  const chars = "*" + encodedValue + "*";
  const unit = 1.3;
  const barHeight = 38;
  let x = 10 * unit;
  const bars: Array<{ x: number; width: number }> = [];
  for (const char of chars) {
    const pattern = code39[char];
    for (let index = 0; index < pattern.length; index++) {
      const width = (pattern[index] === "w" ? 3 : 1) * unit;
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    }
    x += unit;
  }
  x += 10 * unit;

  return <div className="w-full">
    <svg viewBox={`0 0 ${x} ${barHeight}`} role="img" aria-label={"Attendance barcode for " + value} className="h-10 w-full" preserveAspectRatio="none" shapeRendering="crispEdges">
      <rect width={x} height={barHeight} fill="#fff" />
      {bars.map((bar, index) => <rect key={index} x={bar.x} y="0" width={bar.width} height={barHeight} fill="#111827" />)}
    </svg>
    <p className="mt-0.5 text-center font-mono text-[9px] font-bold tracking-[0.16em] text-slate-900">{encodedValue}</p>
  </div>;
}

export default function StudentIdCard({ card, photoUrl }: { card: StudentIdCardRecord; photoUrl: string }) {
  const [qrImage, setQrImage] = useState("");
  useEffect(() => {
    let active = true;
    const target = window.location.origin + "/student-record?regNo=" + encodeURIComponent(card.registration_no);
    QRCode.toDataURL(target, { width: 320, margin: 1, errorCorrectionLevel: "M" })
      .then(value => { if (active) setQrImage(value); })
      .catch(() => { if (active) setQrImage(""); });
    return () => { active = false; };
  }, [card.registration_no]);

  return <div className="relative mx-auto aspect-[0.628] w-full max-w-[360px] overflow-hidden rounded-[24px] border-[3px] border-emerald-800 bg-white text-slate-900 shadow-2xl">
    <div className="absolute inset-x-0 top-0 h-[29%] overflow-hidden bg-emerald-800">
      <div className="absolute -left-8 -top-8 h-28 w-28 rounded-full bg-emerald-700/80" />
      <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-emerald-700/80" />
      <div className="relative flex h-full flex-col items-center px-4 pt-3 text-center text-white">
        <img src="/favicon.ico" alt="Masscom logo" className="h-12 w-12 rounded-sm bg-white p-1 object-contain" />
        <p className="mt-2 text-[15px] font-extrabold leading-tight">Masscom Infotech Education</p>
        <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.28em] text-emerald-100">Student Identity Card</p>
      </div>
    </div>
    <div className="absolute inset-x-0 top-[28.5%] h-[5px] bg-amber-400" />
    <div className="absolute inset-x-0 bottom-0 top-[30%]" style={{ backgroundImage: "radial-gradient(#e8f3ed 1.2px, transparent 1.2px)", backgroundSize: "20px 20px" }} />
    <div className="absolute left-1/2 top-[22%] h-[22%] aspect-square -translate-x-1/2 rounded-full border-[5px] border-amber-400 bg-white p-1 shadow-lg">
      <img src={photoUrl} alt={card.student_name + " photo"} className="h-full w-full rounded-full bg-slate-100 object-cover" onError={event => { event.currentTarget.style.visibility = "hidden"; }} />
    </div>
    <div className="absolute inset-x-3 top-[44.5%] text-center">
      <p className="truncate text-[18px] font-extrabold uppercase leading-tight text-emerald-900">{card.student_name}</p>
      <span className="mt-1 inline-flex rounded-full bg-amber-400 px-8 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-white">Student</span>
    </div>
    <div className="absolute inset-x-6 top-[54%] grid grid-cols-[1fr_88px] gap-2">
      <div className="space-y-1.5 text-[10px] leading-tight">
        <div className="flex gap-1"><span className="w-[70px] shrink-0 font-bold text-slate-500">Enroll No.</span><span className="font-extrabold text-slate-900">{card.registration_no}</span></div>
        <div className="flex gap-1"><span className="w-[70px] shrink-0 font-bold text-slate-500">Father</span><span className="truncate font-semibold text-slate-800">{card.father_name || "—"}</span></div>
        <div className="flex gap-1"><span className="w-[70px] shrink-0 font-bold text-slate-500">Course</span><span className="font-semibold text-slate-800">{card.course_name || "—"}</span></div>
        <div className="flex gap-1"><span className="w-[70px] shrink-0 font-bold text-slate-500">DOB</span><span className="font-semibold text-slate-800">{card.date_of_birth || "—"}</span></div>
        <div className="flex gap-1"><span className="w-[70px] shrink-0 font-bold text-slate-500">Mobile</span><span className="font-semibold text-slate-800">{card.phone || "—"}</span></div>
      </div>
      <div className="flex flex-col items-center">
        <div className="flex h-[82px] w-[82px] items-center justify-center rounded-lg border-2 border-emerald-100 bg-white p-1">
          {qrImage ? <img src={qrImage} alt={"QR code for registration " + card.registration_no} className="h-full w-full" /> : null}
        </div>
        <span className="mt-1 text-[7px] font-bold text-slate-600">SCAN FOR STUDENT RECORD</span>
        <div className="mt-3 w-full text-center"><div className="border-t border-slate-400" /><span className="text-[7px] font-semibold text-slate-600">Director</span></div>
      </div>
    </div>
    <div className="absolute inset-x-8 top-[76%]">
      <p className="mb-1 text-center text-[7px] font-bold uppercase tracking-[0.18em] text-emerald-800">Attendance Barcode · Registration No.</p>
      <Code39Barcode value={card.registration_no} />
    </div>
    <div className="absolute inset-x-0 bottom-0 flex min-h-[7%] items-center justify-center bg-emerald-800 px-3 py-1 text-center text-[7px] font-medium leading-tight text-white">
      1st Floor Mohsin Market, Phatak Yusufpur, Mohammadabad, Ghazipur, Uttar Pradesh – 233227
    </div>
  </div>;
}
