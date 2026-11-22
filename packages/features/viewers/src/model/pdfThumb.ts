import * as pdfjs from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

// El mismo trabajador que el visor: si `Pdf.tsx` ya lo puso, no se crea otro.
if (!pdfjs.GlobalWorkerOptions.workerPort) pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Pinta la primera página en `canvas` a `width` px de CSS. Devuelve cuántas páginas tiene. */
export async function renderFirstPage(base64: string, canvas: HTMLCanvasElement, width: number): Promise<number> {
  const task = pdfjs.getDocument({ data: bytesFromBase64(base64) });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const scale = width / page.getViewport({ scale: 1 }).width;
    const ratio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: scale * ratio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
    await page.render({ canvas, viewport }).promise;
    return doc.numPages;
  } finally {
    void task.destroy();
  }
}
