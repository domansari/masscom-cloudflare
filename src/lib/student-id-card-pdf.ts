import jsPDF from "jspdf";
import QRCode from "qrcode";
import type { StudentIdCardRecord } from "@/components/StudentIdCard";
import { formatIndianDate } from "@/lib/date-format";

function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  return image.decode().then(() => image);
}

export async function createStudentIdCardPdf(card: StudentIdCardRecord, preview: HTMLElement) {
  const logo = preview.querySelector<HTMLImageElement>('img[src="/favicon.ico"]');
  const photo = preview.querySelector<HTMLImageElement>('img[alt$=" photo"]');
  const barcode = preview.querySelector<SVGSVGElement>('svg[aria-label^="Attendance barcode"]');
  const target = window.location.origin + "/student-card-view?regNo=" + encodeURIComponent(card.registration_no);
  const [qr, readyLogo, readyPhoto] = await Promise.all([
    QRCode.toDataURL(target, { width: 320, margin: 1, errorCorrectionLevel: "M" }).then(loadImage),
    logo?.decode().then(() => logo).catch(() => null),
    photo?.decode().then(() => photo).catch(() => null),
  ]);

  const width = 360;
  const height = width * 86 / 54;
  const scale = 4;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the ID card canvas.");
  ctx.scale(scale, scale);

  const green = "#065f46";
  const yellow = "#fbbf24";
  const ink = "#0f172a";
  const muted = "#475569";
  const white = "#fff";
  function rect(x: number, y: number, w: number, h: number, color: string, radius = 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  }
  function circle(x: number, y: number, radius: number) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  }
  function imageAt(image: HTMLImageElement, x: number, y: number, w: number, h: number, cover = false) {
    const ratio = (cover ? Math.max : Math.min)(w / image.naturalWidth, h / image.naturalHeight);
    const drawnWidth = image.naturalWidth * ratio;
    const drawnHeight = image.naturalHeight * ratio;
    ctx.drawImage(image, x + (w - drawnWidth) / 2, y + (h - drawnHeight) / 2, drawnWidth, drawnHeight);
  }
  function text(value: string, x: number, y: number, maxWidth: number, size: number, color: string, align: CanvasTextAlign = "left", weight = 700) {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(value, x, y, maxWidth);
  }
  function twoLines(value: string, x: number, y: number, maxWidth: number, size: number, color: string, align: CanvasTextAlign = "left") {
    ctx.font = `700 ${size}px Arial, sans-serif`;
    if (ctx.measureText(value).width <= maxWidth) {
      text(value, x, y, maxWidth, size, color, align);
      return;
    }
    const words = value.split(/\s+/);
    let split = 0;
    let bestWidth = Infinity;
    for (let index = 1; index < words.length; index++) {
      const longest = Math.max(ctx.measureText(words.slice(0, index).join(" ")).width,
        ctx.measureText(words.slice(index).join(" ")).width);
      if (longest < bestWidth) { bestWidth = longest; split = index; }
    }
    if (!split) {
      text(value, x, y, maxWidth, size, color, align);
      return;
    }
    text(words.slice(0, split).join(" "), x, y - size / 2, maxWidth, size, color, align);
    text(words.slice(split).join(" "), x, y + size / 2 + 1, maxWidth, size, color, align);
  }

  rect(0, 0, width, height, white);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(2, 2, width - 4, height - 4, 23);
  ctx.clip();
  rect(0, 0, width, 168, green);
  ctx.fillStyle = "#087454";
  circle(27, 24, 65);
  ctx.fill();
  circle(333, 29, 78);
  ctx.fill();
  rect(0, 166, width, 5, yellow);
  for (let y = 184; y < 492; y += 20) {
    for (let x = 12; x < width; x += 20) rect(x, y, 2, 2, "#e8f3ed");
  }
  rect(0, 493, width, height - 493, green);
  ctx.restore();
  ctx.strokeStyle = green;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(2, 2, width - 4, height - 4, 23);
  ctx.stroke();

  rect(156, 14, 48, 48, white, 4);
  if (readyLogo) imageAt(readyLogo, 160, 18, 40, 40);
  text("Masscom Infotech Education", 180, 79, 326, 18, white, "center", 800);
  text("S T U D E N T   I D E N T I T Y   C A R D", 180, 99, 320, 8, "#d1fae5", "center");
  ctx.fillStyle = yellow;
  circle(180, 191, 67);
  ctx.fill();
  ctx.fillStyle = white;
  circle(180, 191, 62);
  ctx.fill();
  ctx.save();
  circle(180, 191, 58);
  ctx.clip();
  rect(122, 133, 116, 116, "#f1f5f9");
  if (readyPhoto) imageAt(readyPhoto, 122, 133, 116, 116, true);
  ctx.restore();
  twoLines(card.student_name.toUpperCase(), 180, 278, 320, 16, "#064e3b", "center");
  rect(120, 296, 120, 18, yellow, 9);
  text("S T U D E N T", 180, 305, 108, 9, white, "center");

  const rows = [
    ["Enrollment No.", card.registration_no, 333],
    ["Father’s Name", card.father_name || "—", 355],
    ["Course", card.course_name || "—", 382],
    ["DOB", formatIndianDate(card.date_of_birth), 409],
    ["Mobile", card.phone || "—", 426],
  ] as const;
  for (const [label, value, y] of rows) {
    text(label, 24, y, 69, 10, muted);
    if (label === "Course" || label === "Father’s Name") twoLines(value, 98, y, 145, 11, ink);
    else text(value, 98, y, 145, 11, ink);
  }

  rect(252, 324, 84, 84, "#d1fae5", 8);
  rect(254, 326, 80, 80, white, 6);
  ctx.imageSmoothingEnabled = false;
  imageAt(qr, 258, 330, 72, 72);
  text("SCAN FOR STUDENT RECORD", 294, 414, 88, 7, muted, "center");
  rect(253, 422, 82, 1, "#94a3b8");
  text("Director", 294, 430, 82, 7, muted, "center");

  text("ATTENDANCE BARCODE · ENROLLMENT NO.", 180, 443, 310, 7, green, "center");
  rect(27, 450, 306, 28, white);
  if (barcode) {
    const barcodeScale = 306 / barcode.viewBox.baseVal.width;
    for (const bar of barcode.querySelectorAll<SVGRectElement>('rect[fill="#111827"]')) {
      rect(27 + bar.x.baseVal.value * barcodeScale, 450, bar.width.baseVal.value * barcodeScale, 28, ink);
    }
  } else {
    text("Barcode unavailable for this enrollment number", 180, 464, 306, 8, muted, "center");
  }
  text(card.registration_no.toUpperCase(), 180, 485, 306, 8, ink, "center");
  text("1st Floor, Mohsin Market, Yusufpur, Mohammadabad, Ghazipur (U.P.) 233227", 180, 528, 324, 9, white, "center");
  text("info@masscom.co.in · www.masscom.co.in", 180, 541, 324, 9, white, "center");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [54, 86] });
  pdf.addImage(canvas, "PNG", 0, 0, 54, 86, undefined, "FAST");
  return pdf;
}
