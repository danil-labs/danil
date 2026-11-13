/**
 * La persona de la cuenta de Danil: nombre, correo y foto, y cambiar o quitar
 * la foto. La foto vive en la cuenta, así que se ve igual en Danil, en la web y
 * en cada computadora. En el escritorio la trae el motor (`account-engine.ts`); en
 * la web, el plano de control con la sesión de la persona (`capabilities().accountProfile`).
 * Sin dependencias de la ventana: la web y las pruebas de Node lo importan.
 */

export type AccountProfile = {
  name: string | null;
  email: string | null;
  /** La foto ya como `data:` URI; null = iniciales. */
  photo: string | null;
  /** `danil` (subida a la cuenta) o `provider` (la de Google o GitHub). */
  source: "danil" | "provider" | null;
};

/** Quien lee y cambia la persona donde corre el front. */
export type AccountProfileSource = {
  readonly?: boolean;
  read(): Promise<AccountProfile | null>;
  setPhoto(photo: PreparedPhoto): Promise<AccountProfile | null>;
  removePhoto(): Promise<AccountProfile | null>;
};

export type PreparedPhoto = { dataUrl: string; blob: Blob; type: string };

/** Evento de ventana tras cambiar o quitar la foto: el pie de la web vuelve a leer. */
export const PROFILE_CHANGED = "terminus:account-profile";

/** El mismo límite que la cuenta: el plano de control rechaza más. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
/** Lado del cuadrado que se sube: basta para el pie y Configuración, y pesa poco. */
const PHOTO_SIDE = 256;

/** Hasta dos iniciales del nombre o, sin él, la primera letra del correo. */
export function initials(name: string | null | undefined, email?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length) return words.slice(0, 2).map((w) => w.charAt(0)).join("").toUpperCase();
  return (email ?? "").trim().charAt(0).toUpperCase();
}

export class PhotoError extends Error {
  readonly code: "unsupported_image" | "image_too_large";
  constructor(code: "unsupported_image" | "image_too_large") {
    super(code);
    this.code = code;
  }
}

/** `data:` URI de una imagen (con su tipo). */
export async function blobToDataUrl(blob: Blob, type = blob.type): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(binary)}`;
}

/** Recorte cuadrado al centro, re-codificado a PNG: quita metadatos (EXIF, ubicación). */
async function reencode(file: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_SIDE;
    canvas.height = PHOTO_SIDE;
    const ctx = canvas.getContext("2d");
    if (!ctx || !side) return null;
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIDE, PHOTO_SIDE);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    return null;
  }
}

/**
 * La foto elegida, lista para subir: solo PNG, JPEG o WebP. Se re-codifica a
 * PNG cuadrado; si el navegador no puede, va el archivo tal cual si no pasa de 2 MB.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!PHOTO_TYPES.includes(file.type)) throw new PhotoError("unsupported_image");
  const blob = (await reencode(file)) ?? file;
  if (blob.size > PHOTO_MAX_BYTES) throw new PhotoError("image_too_large");
  const type = blob.type || file.type;
  return { dataUrl: await blobToDataUrl(blob, type), blob, type };
}
