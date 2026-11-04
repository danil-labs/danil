/**
 * The raw bytes of a file of a task tree, read in parts with `tree_read_part`.
 * The engine extension `tree_parts_v1` announces it; it sits outside the
 * compatibility hash, like `artifact_parts_v1`. A video, an audio file or a
 * download crosses the relay this way: `tree_show` only carries text, images
 * and PDFs, and says "binary" for everything else.
 */

/** Announced by the engine that knows `tree_read_part`. */
export const TREE_PARTS_FEATURE = "tree_parts_v1";

/** Each part: a short call, also through the relay, like `chat_visual_part` and `work_read_part`. */
export const TREE_PART_BYTES = 512 * 1024;

/** Above this the client does not assemble the file in memory. */
export const MAX_TREE_FILE_BYTES = 200 * 1024 * 1024;

/** `tree_read_part`: `data` is base64; `revision` changes when the file on disk does. */
export type TreePart = { data: string; eof: boolean; total: number; revision: string; mime: string };

export type TreeFileFailure = "tree_file_too_large" | "tree_file_invalid" | "file_changed";

export class TreeFileError extends Error {
  readonly detail: TreeFileFailure;

  constructor(detail: TreeFileFailure) {
    super(detail);
    this.detail = detail;
  }
}

const VIDEO = ["mp4", "m4v", "mov", "webm", "ogv"];
const AUDIO = ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac"];

const extensionOf = (path: string) => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/** What a player can do with the file, from its name: the same rule on every client. */
export function mediaKindOf(path: string): "video" | "audio" | null {
  const ext = extensionOf(path);
  if (VIDEO.includes(ext)) return "video";
  if (AUDIO.includes(ext)) return "audio";
  return null;
}

function bytesOf(data: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(data);
  } catch {
    throw new TreeFileError("tree_file_invalid");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The whole file, part after part. If it changes on disk between parts the
 * engine refuses with `file_changed`, and the read starts over once.
 */
export async function readTreeFile(
  part: (offset: number, size: number, revision?: string) => Promise<TreePart>,
  options: { max?: number; onProgress?: (done: number, total: number) => void; signal?: { aborted: boolean } } = {},
): Promise<{ bytes: Uint8Array; mime: string }> {
  const max = options.max ?? MAX_TREE_FILE_BYTES;
  for (let attempt = 0; ; attempt++) {
    try {
      const first = await part(0, TREE_PART_BYTES);
      const { total, revision, mime } = first;
      if (!Number.isSafeInteger(total) || total < 0) throw new TreeFileError("tree_file_invalid");
      if (total > max) throw new TreeFileError("tree_file_too_large");
      const file = new Uint8Array(total);
      let offset = 0;
      for (let current = first; ; current = await part(offset, TREE_PART_BYTES, revision)) {
        if (options.signal?.aborted) throw new DOMException("aborted", "AbortError");
        if (current.total !== total) throw new TreeFileError("file_changed");
        const chunk = bytesOf(current.data);
        if (offset + chunk.byteLength > total) throw new TreeFileError("tree_file_invalid");
        file.set(chunk, offset);
        offset += chunk.byteLength;
        options.onProgress?.(offset, total);
        if (current.eof) break;
        if (chunk.byteLength === 0) throw new TreeFileError("tree_file_invalid");
      }
      if (offset !== total) throw new TreeFileError("tree_file_invalid");
      return { bytes: file, mime: mime || "application/octet-stream" };
    } catch (error) {
      const detail = error && typeof error === "object" && "detail" in error ? (error as { detail: unknown }).detail : null;
      if (detail !== "file_changed" || attempt > 0) throw error;
    }
  }
}
