import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { WEB_BASE } from "../../lib/alpha-mode";
import { t } from "../../lib/i18n";
import { useTheme } from "../theme";

/**
 * El worker de pdf.js, servido junto a la app (`scripts/pdf-worker.mjs` lo copia
 * a `public/`): Metro no empaqueta workers, y la política solo deja `'self'`.
 */
const WORKER = process.env.EXPO_PUBLIC_TERMINUS_WEB_BASE ? `${WEB_BASE}m/pdf.worker.min.mjs` : "/pdf.worker.min.mjs";

/** Más que esto no se nota en un teléfono y cada página es un lienzo en memoria. */
const MAX_DENSITY = 2;

function bytesOf(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Un PDF en el navegador del teléfono, con pdf.js como la ventana: las páginas a
 * lo ancho, una debajo de otra, y cada una se dibuja al acercarse a la vista.
 * `onPage` dice cuál se está leyendo, para «Página 2 de 8».
 */
export function PdfView({ base64, onPage }: { base64: string; onPage?: (page: number, pages: number) => void }) {
  const theme = useTheme();
  const box = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let destroy = () => {};
    const observers: IntersectionObserver[] = [];
    setFailed(false);
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
      const task = pdfjs.getDocument({ data: bytesOf(base64) });
      destroy = () => void task.destroy();
      const doc = await task.promise;
      const host = box.current;
      if (!alive || !host) return;
      host.replaceChildren();
      const width = Math.max(200, host.clientWidth - 16);
      const density = Math.min(MAX_DENSITY, window.devicePixelRatio || 1);
      const first = (await doc.getPage(1)).getViewport({ scale: 1 });
      const sheets: HTMLDivElement[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const sheet = document.createElement("div");
        sheet.dataset.page = String(n);
        Object.assign(sheet.style, { width: `${width}px`, aspectRatio: `${first.width} / ${first.height}`, margin: "0 auto 8px", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.25)" });
        host.append(sheet);
        sheets.push(sheet);
      }
      onPage?.(1, doc.numPages);
      const drawn = new Set<number>();
      const draw = async (n: number) => {
        if (drawn.has(n)) return;
        drawn.add(n);
        const page = await doc.getPage(n);
        if (!alive) return;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width / base.width) * density });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        Object.assign(canvas.style, { width: "100%", height: "auto", display: "block" });
        const sheet = sheets[n - 1];
        sheet.style.aspectRatio = `${base.width} / ${base.height}`;
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
        if (alive) sheet.replaceChildren(canvas);
      };
      const near = new IntersectionObserver(
        (entries) => entries.forEach((e) => e.isIntersecting && void draw(Number((e.target as HTMLElement).dataset.page))),
        { root: host, rootMargin: "100% 0px" },
      );
      const reading = new IntersectionObserver(
        (entries) => {
          const seen = entries.find((e) => e.isIntersecting);
          if (seen) onPage?.(Number((seen.target as HTMLElement).dataset.page), doc.numPages);
        },
        { root: host, threshold: 0.5 },
      );
      observers.push(near, reading);
      sheets.forEach((sheet) => {
        near.observe(sheet);
        reading.observe(sheet);
      });
    })().catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      observers.forEach((o) => o.disconnect());
      destroy();
    };
  }, [base64]);

  if (failed) return <Text style={{ color: theme.textMuted, padding: 20, textAlign: "center" }}>{t("task.files.pdf_failed")}</Text>;
  return (
    <View style={{ flex: 1 }}>
      <div ref={box} style={{ flex: 1, overflowY: "auto", padding: "8px 0", WebkitOverflowScrolling: "touch" }} />
    </View>
  );
}
