/**
 * The kinds of file a message can carry and the limit the transport imposes.
 * The engine extension `attachment_documents_v1` accepts them through
 * `guardar_adjunto`; `guardar_imagen_pegada` keeps accepting only images, which
 * is the path for a machine that does not announce the extension yet.
 */

import {
  ATTACHMENT_MIMES,
  DOCUMENT_MIMES,
  EXTENSION_MIME,
  IMAGE_MIMES,
  mimeOfAttachment,
  type AttachmentMime,
} from "../../ui/src/lib/attachment-mime.ts";

/** Announced by the engine that knows `guardar_adjunto` (`attachment_documents_v1`). */
export const ATTACHMENT_DOCUMENTS_FEATURE = "attachment_documents_v1";

export { ATTACHMENT_MIMES, DOCUMENT_MIMES, IMAGE_MIMES, mimeOfAttachment, type AttachmentMime };

/** The engine cuts at 16 MiB per message; in base64 that is about 11 MB of file. */
export const MAX_UPLOAD_BYTES = 11 * 1024 * 1024;

export function isImageMime(mime: string): boolean {
  return (IMAGE_MIMES as readonly string[]).includes(mime);
}

export function acceptsDocuments(features?: readonly string[] | null): boolean {
  return features?.includes(ATTACHMENT_DOCUMENTS_FEATURE) === true;
}

/** The picker's `accept`: types and extensions, because browsers read one or the other. */
export function attachmentAccept(documents: boolean): string {
  const mimes = documents ? ATTACHMENT_MIMES : IMAGE_MIMES;
  const extensions = Object.entries(EXTENSION_MIME)
    .filter(([, mime]) => (mimes as readonly string[]).includes(mime))
    .map(([ext]) => `.${ext}`);
  return [...extensions, ...mimes].join(",");
}
