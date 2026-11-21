import { unknownCommand } from "../../../../../apps/desktop/src/lib/errorCode.ts";
import type { VersionRef } from "../queries/history.ts";

export type DownloadFailure = "too_large" | "incomplete" | "timeout" | "remote_outdated";
export class ArtifactDownloadError extends Error {
  readonly reason: DownloadFailure;
  constructor(reason: DownloadFailure) { super(reason); this.reason = reason; }
}

type Reader = {
  part: (reference: VersionRef, offset: number, size: number) => Promise<{ data: string; eof: boolean }>;
  text: (reference: VersionRef) => Promise<string>;
};

/** Solo transporta bytes de la versión sellada; nunca vuelve al archivo mutable. */
export async function readArtifactDownload(reference: VersionRef, expectedBytes: number, textOnly: boolean, reader: Reader,
  limits = { maxBytes: 256 * 1024 * 1024, partBytes: 2 * 1024 * 1024, timeoutMs: 120_000 }): Promise<Blob> {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0) throw new ArtifactDownloadError("incomplete");
  if (expectedBytes > limits.maxBytes) throw new ArtifactDownloadError("too_large");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ArtifactDownloadError("timeout")), limits.timeoutMs);
  });
  const parts: Uint8Array<ArrayBuffer>[] = [];
  try {
    for (let offset = 0; ; ) {
      let part;
      try {
        part = await Promise.race([reader.part(reference, offset, limits.partBytes), deadline]);
      } catch (error) {
        if (offset !== 0 || !unknownCommand(error)) throw error;
        if (!textOnly) throw new ArtifactDownloadError("remote_outdated");
        const text = await Promise.race([reader.text(reference), deadline]);
        const blob = new Blob([text]);
        if (blob.size !== expectedBytes) throw new ArtifactDownloadError("incomplete");
        return blob;
      }
      if (typeof part.data !== "string" || typeof part.eof !== "boolean" || part.data.length > 4 * Math.ceil(limits.partBytes / 3)) {
        throw new ArtifactDownloadError("incomplete");
      }
      const bytes = Uint8Array.from(atob(part.data), character => character.charCodeAt(0));
      if (bytes.length > limits.partBytes || offset + bytes.length > expectedBytes || (!part.eof && bytes.length === 0)) {
        throw new ArtifactDownloadError("incomplete");
      }
      parts.push(bytes);
      offset += bytes.length;
      if (part.eof) {
        if (offset !== expectedBytes) throw new ArtifactDownloadError("incomplete");
        return new Blob(parts);
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
