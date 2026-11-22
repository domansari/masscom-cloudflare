import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function createCertificatePDF(certificateElement: HTMLElement) {
  const certificate = certificateElement.querySelector<HTMLElement>("#certificate-element");
  if (!certificate) throw new Error("Certificate element not found");

  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed", left: "-10000px", top: "0", width: "210mm", height: "297mm",
    backgroundColor: "white", overflow: "hidden",
  });

  const copy = certificate.cloneNode(true) as HTMLElement;
  Object.assign(copy.style, {
    transform: "none", width: "210mm", height: "297mm", margin: "0", padding: "0",
    overflow: "hidden", backgroundImage: "url('/lovable-uploads/7ab347ae-d0be-4f64-ae7e-c4bfd0378ac4.png')",
    backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat",
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
    const canvas = await html2canvas(container, {
      scale: 3, useCORS: true, backgroundColor: "#ffffff",
      width: 794, height: 1123, logging: false, imageTimeout: 15000,
    });
    if (!canvas.width || !canvas.height) throw new Error("Certificate capture is empty");

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297);
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
