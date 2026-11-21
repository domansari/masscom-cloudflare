import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export default function MarksheetCanvasPreview({ bytes }: { bytes: Uint8Array }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const canvases: HTMLCanvasElement[] = [];
    const loading = getDocument({ data: bytes.slice() });

    (async () => {
      try {
        const pdf = await loading.promise;
        if (cancelled) return;
        const container = containerRef.current;
        if (!container) return;
        container.replaceChildren();
        const availableWidth = Math.max(240, container.clientWidth - 16);
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(2, availableWidth / baseViewport.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas unavailable");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.width = "100%";
          canvas.style.maxWidth = baseViewport.width + "px";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          canvas.style.margin = "0 auto 12px";
          canvas.style.background = "white";
          container.appendChild(canvas);
          canvases.push(canvas);
          await page.render({ canvasContext: context, viewport }).promise;
        }
      } catch (e) {
        if (!cancelled) setError("Marksheet could not be displayed. Please try again.");
      }
    })();

    return () => {
      cancelled = true;
      void loading.destroy();
      canvases.forEach(canvas => canvas.remove());
    };
  }, [bytes]);

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-gray-100 p-2">
      {error && <p role="alert" className="p-4 text-red-700">{error}</p>}
      <div ref={containerRef} />
    </div>
  );
}
