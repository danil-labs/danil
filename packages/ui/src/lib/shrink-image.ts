/**
 * Reduce la imagen del fondo de los chats antes de subirla: lado largo hasta
 * 2560 px, WebP (JPEG si el navegador no codifica WebP), y baja calidad y
 * luego tamaño hasta que pese 1,5 MB o menos. La usan la ventana y la web.
 * Sin dependencias de la ventana: las pruebas de Node la importan.
 */

/** Lo que se busca que pese el fondo. */
export const SHRINK_TARGET = 1_500_000;
/** El tope duro del fondo en el motor y en la cuenta. */
export const BACKGROUND_MAX = 6 * 1024 * 1024;

export type ShrinkStep = { side: number; quality: number };

/** Primero baja la calidad; si no alcanza, el lado largo. */
export const SHRINK_STEPS: readonly ShrinkStep[] = [2560, 1920].flatMap((side) => [0.82, 0.7, 0.6].map((quality) => ({ side, quality })));

export class ShrinkError extends Error {
  readonly code: "unreadable" | "too_big";
  constructor(code: "unreadable" | "too_big") {
    super(code);
    this.name = "ShrinkError";
    this.code = code;
  }
}

/** El tamaño que cabe en `side` sin agrandar ni deformar. */
export function fitWithin(width: number, height: number, side: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= side) return { width, height };
  const scale = side / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Recorre los pasos hasta el primero que pese `target` o menos. Si ninguno
 * llega, el más liviano mientras no pase de `BACKGROUND_MAX`.
 */
export async function shrinkLadder(
  encode: (step: ShrinkStep) => Promise<Blob | null>,
  target = SHRINK_TARGET,
  steps: readonly ShrinkStep[] = SHRINK_STEPS,
): Promise<Blob> {
  let lightest: Blob | null = null;
  for (const step of steps) {
    const blob = await encode(step);
    if (!blob) continue;
    if (blob.size <= target) return blob;
    if (!lightest || blob.size < lightest.size) lightest = blob;
  }
  if (!lightest) throw new ShrinkError("unreadable");
  if (lightest.size > BACKGROUND_MAX) throw new ShrinkError("too_big");
  return lightest;
}

type Canvas = HTMLCanvasElement | OffscreenCanvas;

function canvasOf(width: number, height: number): Canvas {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toBlob(canvas: Canvas, type: string, quality: number): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality }).catch(() => null);
  return new Promise((done) => canvas.toBlob(done, type, quality));
}

/**
 * La imagen elegida, lista para el fondo. `createImageBitmap` respeta la
 * orientación EXIF; WebP conserva la transparencia de un PNG.
 */
export async function shrinkImage(file: Blob, target = SHRINK_TARGET): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ShrinkError("unreadable");
  }
  // Un navegador que no codifica WebP devuelve PNG: desde ahí, JPEG.
  let type = "image/webp";
  try {
    return await shrinkLadder(async ({ side, quality }) => {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, side);
      const canvas = canvasOf(width, height);
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, width, height);
      let blob = await toBlob(canvas, type, quality);
      if (blob && blob.type !== type && type === "image/webp") {
        type = "image/jpeg";
        blob = await toBlob(canvas, type, quality);
      }
      return blob && blob.type === type ? blob : null;
    }, target);
  } finally {
    bitmap.close();
  }
}
