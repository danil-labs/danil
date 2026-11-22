/**
 * La directiva de una visualización del chat, `::terminus-visual{file="x.html"
 * title="…"}`, sola en su línea. Cada cliente decide dónde está en su markdown
 * (fuera de código); aquí está qué línea cuenta y qué archivo se puede pedir.
 */
export const VISUAL_DIRECTIVE = /^::terminus-visual\{file=("(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*")(?: title=("(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"))?\}$/;
export const MAX_CHAT_VISUALS = 8;
/** Lo que el motor guarda en el árbol `terminus-chat-visuals` de la tarea. */
export const VISUAL_TREE = "terminus-chat-visuals";
/** La página armada con sus imágenes: el tope del motor (`chat_visuals.rs`, el de t3code). */
export const MAX_VISUAL_BYTES = 25 * 1024 * 1024;
/** Lo que cabe de una vez en `tree_show`: el tope de los motores sin `chat_visual_part`. */
export const MAX_VISUAL_WHOLE_BYTES = 512 * 1024;
/** Cada parte de `chat_visual_part`: una llamada corta también por el relay, como `carry`. */
export const VISUAL_PART_BYTES = 512 * 1024;
export const VISUAL_FILE = /^[a-z0-9][a-z0-9._-]*\.html$/i;

/** El archivo y el título de una línea de directiva, o `null` si no lo es. */
export function parseVisualDirective(line: string): { file: string; title: string } | null {
  const match = VISUAL_DIRECTIVE.exec(line);
  if (!match) return null;
  const file: string = JSON.parse(match[1]);
  const title: string = match[2] ? JSON.parse(match[2]) : "";
  if (file.length === 0 || file.length > 128 || title.length > 240) return null;
  return { file, title };
}

/** Una parte de `chat_visual_part`: `data` en base64 de la página armada. */
export type VisualPart = { data: string; eof: boolean; total: number; revision: string };
/** Lo que contesta `tree_show` con el selector de visuales. */
export type VisualWhole = { kind: string; text: string; bytes: number; truncated: boolean };
export type VisualFailure = "invalid_visual_file" | "visual_too_large" | "visual_read_failed";

/** Los fallos del visual mismo; cualquier otro de la primera parte es un motor sin `chat_visual_part`. */
const VISUAL_DETAILS = new Set(["invalid_visual_file", "visual_too_large", "visual_read_failed", "visual_changed"]);

export class VisualError extends Error {
  readonly detail: VisualFailure | "visual_changed";

  constructor(detail: VisualFailure | "visual_changed") {
    super(detail);
    this.detail = detail;
  }
}

const detailOf = (error: unknown): unknown =>
  error && typeof error === "object" && "detail" in error ? (error as { detail: unknown }).detail : null;

function bytesOf(data: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(data);
  } catch {
    throw new VisualError("invalid_visual_file");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function wholeText(content: VisualWhole): string {
  if (!content || typeof content !== "object") throw new VisualError("invalid_visual_file");
  if (content.truncated || content.bytes > MAX_VISUAL_WHOLE_BYTES) throw new VisualError("visual_too_large");
  if (content.kind !== "text" || typeof content.text !== "string" ||
    !Number.isFinite(content.bytes) || content.bytes < 0 ||
    new TextEncoder().encode(content.text).byteLength !== content.bytes) {
    throw new VisualError("invalid_visual_file");
  }
  return content.text;
}

async function byParts(part: (offset: number, revision?: string) => Promise<VisualPart>, first: VisualPart): Promise<string> {
  if (!first || typeof first !== "object") throw new VisualError("invalid_visual_file");
  const { total, revision } = first;
  if (!Number.isSafeInteger(total) || total < 0) throw new VisualError("invalid_visual_file");
  if (total > MAX_VISUAL_BYTES) throw new VisualError("visual_too_large");
  const page = new Uint8Array(total);
  let offset = 0;
  for (let current = first; ; current = await part(offset, revision)) {
    if (!current || typeof current !== "object") throw new VisualError("invalid_visual_file");
    if (current.total !== total || current.revision !== revision) throw new VisualError("visual_changed");
    const chunk = bytesOf(current.data);
    if (offset + chunk.byteLength > total) throw new VisualError("invalid_visual_file");
    page.set(chunk, offset);
    offset += chunk.byteLength;
    if (current.eof) break;
    if (chunk.byteLength === 0) throw new VisualError("invalid_visual_file");
  }
  if (offset !== total) throw new VisualError("invalid_visual_file");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(page);
  } catch {
    throw new VisualError("invalid_visual_file");
  }
}

/**
 * El HTML de un visual, de cualquier máquina: por partes con `chat_visual_part`
 * (hasta 25 MiB, con sus imágenes ya incrustadas por el motor) o, con un motor
 * que no lo tiene, de una vez con `tree_show` (hasta 512 KiB). Si la página
 * cambia entre partes, vuelve a empezar una vez.
 */
export async function readVisualHtml(read: {
  part: (offset: number, size: number, revision?: string) => Promise<VisualPart>;
  whole: () => Promise<VisualWhole>;
}): Promise<string> {
  const part = (offset: number, revision?: string) => read.part(offset, VISUAL_PART_BYTES, revision);
  for (let attempt = 0; ; attempt++) {
    let first: VisualPart;
    try {
      first = await part(0);
    } catch (error) {
      if (VISUAL_DETAILS.has(detailOf(error) as string)) throw error;
      return wholeText(await read.whole());
    }
    try {
      return await byParts(part, first);
    } catch (error) {
      if (detailOf(error) !== "visual_changed") throw error;
      if (attempt > 0) throw new VisualError("visual_read_failed");
    }
  }
}
