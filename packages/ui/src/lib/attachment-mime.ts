export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export const DOCUMENT_MIMES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/rtf",
] as const;

export const ATTACHMENT_MIMES = [...IMAGE_MIMES, ...DOCUMENT_MIMES] as const;

export type AttachmentMime = (typeof ATTACHMENT_MIMES)[number];

export const EXTENSION_MIME: Record<string, AttachmentMime> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
};

/**
 * The mime of a browser or phone file. Some systems send an empty type or
 * `application/octet-stream` even for a known extension; then the extension
 * decides.
 */
export function mimeOfAttachment(type: string, name: string): AttachmentMime | null {
  const clean = type.split(";")[0].trim().toLowerCase();
  if ((ATTACHMENT_MIMES as readonly string[]).includes(clean)) return clean as AttachmentMime;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME[ext] ?? null;
}
