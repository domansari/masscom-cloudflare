import { certificateArtwork } from "@/lib/certificate-artwork";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const captureWidth = 794;
const a4CaptureHeight = 1123;
const pageMargin = 0.72; // 0.01 inch in PDF points.
const footerClearance = 12; // CSS pixels inside the artwork.

export async function createCertificatePDF(certificateElement: HTMLElement) {
  const certificate = certificateElement.querySelector<HTMLElement>("#certificate-element");
  if (!certificate) throw new Error("Certificate element not found");

  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed", left: "-10000px", top: "0",
    width: `${captureWidth}px`, height: `${a4CaptureHeight}px`,
    overflow: "hidden", backgroundColor: "white",
    ...certificateArtwork,
  });

  const copy = certificate.cloneNode(true) as HTMLElement;
  Object.assign(copy.style, {
    transform: "none", width: "100%", height: `${a4CaptureHeight}px`, margin: "0", padding: "0",
    overflow: "visible", overflowWrap: "anywhere", background: "none",
  });

  // Cloning a canvas does not copy its pixels.
  const sourceQR = certificate.querySelector("canvas");
  const copiedQR = copy.querySelector("canvas");
  if (sourceQR && copiedQR) {
    copiedQR.width = sourceQR.width;
    copiedQR.height = sourceQR.height;
    copiedQR.getContext("2d")?.drawImage(sourceQR, 0, 0);
  }

  container.appendChild(copy);
  document.body.appendChild(container);
  try {
    await document.fonts.ready;
    for (const heading of copy.querySelectorAll<HTMLElement>("h2, h4")) {
      // Keep long student and course names within the template's title rows.
      heading.style.whiteSpace = "nowrap";
      const availableWidth = heading.clientWidth - 24;
      const textWidth = heading.scrollWidth;
      if (textWidth > heading.clientWidth) {
        const headingStyle = getComputedStyle(heading);
        const fontSize = parseFloat(headingStyle.fontSize);
        heading.style.lineHeight = headingStyle.lineHeight;
        heading.style.fontSize = `${Math.max(16, fontSize * availableWidth / textWidth)}px`;
      }
      if (heading.scrollWidth > heading.clientWidth) heading.style.whiteSpace = "";
    }
    // The footer can extend below the nominal A4 layout when certificate fields wrap.
    const captureHeight = Math.max(a4CaptureHeight, copy.scrollHeight + footerClearance);
    container.style.height = `${captureHeight}px`;
    const canvas = await html2canvas(container, {
      scale: 3, useCORS: true, backgroundColor: "#ffffff",
      width: captureWidth, height: captureHeight, logging: false, imageTimeout: 15000,
    });
    if (!canvas.width || !canvas.height) throw new Error("Certificate capture is empty");

    // Let the browser encode the capture without a base64 round trip or PNG recompression.
    const image = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("Unable to encode the certificate image"));
      }, "image/jpeg", 0.96);
    });
    const imageBytes = new Uint8Array(await image.arrayBuffer());
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
    const { width, height } = pdf.internal.pageSize;
    pdf.addImage(imageBytes, "JPEG", pageMargin, pageMargin,
      width - 2 * pageMargin, height - 2 * pageMargin);
    return pdf;
  } finally {
    container.remove();
  }
}

export async function generateCertificatePDF(certificateElement: HTMLElement, filename: string) {
  const pdf = await createCertificatePDF(certificateElement);
  pdf.save(`${filename}_v1.0.pdf`);
  return true;
}
