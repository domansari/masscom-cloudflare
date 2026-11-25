import { certificateArtworkBounds, certificateArtworkUrl, certificateLogoArtworkAtHeight } from "@/lib/certificate-artwork";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const captureWidth = 794;
const a4CaptureHeight = 1123;
const footerClearance = 12; // CSS pixels inside the artwork.

export async function createCertificatePDF(certificateElement: HTMLElement) {
  const certificate = certificateElement.querySelector<HTMLElement>("#certificate-element");
  if (!certificate) throw new Error("Certificate element not found");

  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed", left: "-10000px", top: "0",
    width: `${captureWidth}px`, height: `${a4CaptureHeight}px`,
    overflow: "hidden",
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
    const artwork = new Image();
    artwork.src = certificateArtworkUrl;
    await Promise.all([document.fonts.ready, artwork.decode()]);
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
    const logo = copy.querySelector<HTMLElement>("[data-certificate-logo-artwork]");
    if (logo) {
      const { top, height, ...background } = certificateLogoArtworkAtHeight(captureHeight);
      Object.assign(logo.style, background, { top: `${top}px`, height: `${height}px` });
    }
    const canvas = await html2canvas(container, {
      scale: 3, useCORS: true, backgroundColor: null,
      width: captureWidth, height: captureHeight, logging: false, imageTimeout: 15000,
    });
    if (!canvas.width || !canvas.height) throw new Error("Certificate capture is empty");

    // Draw the artwork behind the transparent capture at its full measured height.
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to draw the certificate artwork");
    const bounds = certificateArtworkBounds(captureHeight);
    const scaleX = canvas.width / captureWidth;
    const scaleY = canvas.height / captureHeight;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "destination-over";
    context.drawImage(artwork, bounds.left * scaleX, bounds.top * scaleY,
      bounds.width * scaleX, bounds.height * scaleY);
    context.restore();

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
    pdf.addImage(imageBytes, "JPEG", 0, 0, width, height);
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
