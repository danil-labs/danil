import { delimiterFor } from "@terminus/chat/table";
import { mediaKindOf } from "@terminus/protocol";

/**
 * Cómo se ve un archivo en el visor del teléfono, por su nombre. El motor dice
 * después si los bytes alcanzan (`tree_show`: `text`, `image`, `pdf`, `binary`).
 * `typst`, `markdown` y `html` tienen dos lados, código y vista, como en la web.
 */
export type FileKind = "image" | "pdf" | "typst" | "markdown" | "html" | "table" | "video" | "audio" | "office" | "text";

const IMAGE = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif", "heic"];
const OFFICE = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"];

export const extensionOf = (path: string) => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

export function fileKindOf(path: string): FileKind {
  const ext = extensionOf(path);
  const media = mediaKindOf(path);
  if (media) return media;
  if (IMAGE.includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "typ") return "typst";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  if (delimiterFor(path)) return "table";
  if (OFFICE.includes(ext)) return "office";
  return "text";
}

/** Los que se miran de dos formas: el código y lo que el código pinta. */
export const hasTwoSides = (kind: FileKind) => kind === "typst" || kind === "markdown" || kind === "html";
