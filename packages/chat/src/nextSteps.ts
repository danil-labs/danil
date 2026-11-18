/**
 * Las respuestas rápidas que el agente deja al final de su mensaje, dentro de
 * `<NEXT_STEPS>`, como líneas `- [ ] <mensaje>`. Se leen del texto crudo; una
 * etiqueta dentro de un bloque de código es texto. La limpieza para lo que sale
 * del chat vive en `runtime/chat/next_steps.rs` y comparte `next-steps.cases.json` con esta.
 */

const OPEN_TAG = "<NEXT_STEPS>";
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const OPTION = /^\s*-\s*\[\s*\]\s*:?\s*(.*?)\s*$/;
const PREVIEW_LENGTH = 180;

export type NextStepOption = { id: string; prompt: string };

export type NextStepsPart =
  | { kind: "markdown"; id: string; markdown: string }
  | { kind: "next_steps"; id: string; prose: string; options: NextStepOption[]; complete: boolean };

/** Un bloque `<NEXT_STEPS>` localizado en el texto, por offsets. */
type Block = { from: number; to: number; bodyFrom: number; bodyTo: number; closed: boolean };

/** El mensaje partido en texto y bloques de opciones, en orden. */
export function splitNextSteps(markdown: string, streaming: boolean): NextStepsPart[] {
  const text = streaming ? withoutPartialOpenTag(markdown) : markdown;
  // Casi ninguna respuesta trae el bloque: sin la etiqueta no hay que leer línea por línea en cada token.
  if (!text.includes(OPEN_TAG)) return [{ kind: "markdown", id: "markdown:0", markdown: text }];
  const parts: NextStepsPart[] = [];
  const markdownPart = (chunk: string) => {
    if (chunk) parts.push({ kind: "markdown", id: `markdown:${parts.length}`, markdown: chunk });
  };
  let cursor = 0;
  for (const block of findBlocks(text)) {
    markdownPart(text.slice(cursor, block.from));
    const complete = block.closed || !streaming;
    const body = text.slice(block.bodyFrom, block.bodyTo);
    const read = readOptions(complete ? body : withoutPartialOption(body));
    if (read) {
      // Solo el inicio: el final crece con cada token y remontaría los botones.
      parts.push({ kind: "next_steps", id: `next:${block.from}`, ...read, complete });
    } else {
      markdownPart(trimBlankLines(complete ? body : withoutPartialOption(body)));
    }
    cursor = block.to;
  }
  markdownPart(text.slice(cursor));
  return parts.length ? parts : [{ kind: "markdown", id: "markdown:0", markdown: "" }];
}

/**
 * El mensaje sin las etiquetas ni las opciones; la prosa del bloque se queda.
 * Las opciones hablan con la voz de la persona: fuera de los botones, quien
 * las lee las toma por una orden de quien contestó.
 */
export function stripNextSteps(markdown: string): string {
  let out = "";
  let cursor = 0;
  for (const block of findBlocks(markdown)) {
    const body = markdown.slice(block.bodyFrom, block.bodyTo);
    const kept = readOptions(body)?.prose ?? trimBlankLines(body);
    out += markdown.slice(cursor, block.from) + (kept ? `${kept}\n` : "");
    cursor = block.to;
  }
  return out + markdown.slice(cursor);
}

/** La vista previa de un mensaje del agente; `sessions::preview_of` la calcula igual. */
export function previewOf(text: string): string {
  return summarize(stripNextSteps(text));
}

/**
 * La vista previa del último mensaje con texto de la persona o del agente.
 * Solo se limpia el del agente: un bloque que pega la persona es contenido.
 */
export function threadPreview(thread: readonly { role: string; text: string; meta?: string }[]): string | undefined {
  for (let i = thread.length - 1; i >= 0; i -= 1) {
    const message = thread[i];
    if ((message.role !== "user" && message.role !== "agent") || message.meta) continue;
    const preview = message.role === "agent" ? previewOf(message.text) : summarize(message.text);
    if (preview) return preview;
  }
  return undefined;
}

// Por caracteres y no por unidades UTF-16: así corta Rust, y un emoji no se parte.
function summarize(text: string): string {
  return Array.from(text.replace(/\s+/g, " ").trim()).slice(0, PREVIEW_LENGTH).join("").trimEnd();
}

/**
 * En qué posición del hilo mandó la persona cada texto por última vez,
 * recortado; lo que espera en la cola cuenta como mandado al final. Una opción
 * se pinta usada si su texto se mandó después del mensaje que la propuso.
 */
export function lastSentAt(
  thread: readonly { role: string; text: string }[],
  queue: readonly string[],
): Map<string, number> {
  const at = new Map<string, number>();
  thread.forEach((message, i) => {
    if (message.role === "user") at.set(message.text.trim(), i);
  });
  for (const text of queue) at.set(text.trim(), Number.POSITIVE_INFINITY);
  return at;
}

export function usedSince(at: ReadonlyMap<string, number>, text: string, since: number): boolean {
  return (at.get(text) ?? -1) > since;
}

/**
 * Los bloques del texto, fuera de cercas de código. Una apertura cuenta solo al
 * principio de su línea; el cierre, al final de una línea. Un bloque sin
 * cierre llega hasta el final del texto.
 */
function findBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let fence: string | null = null;
  let open: { from: number; bodyFrom: number } | null = null;
  for (const line of text.matchAll(/[^\n]*\n?/g)) {
    const from = line.index;
    const to = from + line[0].length;
    const content = line[0].replace(/\r?\n$/, "").replace(/\r$/, "");
    const fenced = fence !== null;
    fence = fenceAfter(fence, content);
    if (fenced) continue;
    if (open === null) {
      const tag = /^[\t ]*<NEXT_STEPS>[\t ]*/.exec(content);
      if (tag) open = { from, bodyFrom: tag[0].length < content.length ? from + tag[0].length : to };
    } else {
      // El modelo a veces pega el cierre al final de la última opción: también cierra.
      const close = /[\t ]*<\/NEXT_STEPS>[\t ]*$/.exec(content);
      if (close) {
        blocks.push({ from: open.from, bodyFrom: open.bodyFrom, bodyTo: from + close.index, to, closed: true });
        open = null;
      }
    }
  }
  if (open) blocks.push({ from: open.from, bodyFrom: Math.min(open.bodyFrom, text.length), bodyTo: text.length, to: text.length, closed: false });
  return blocks;
}

// La cerca abierta tras esta línea: la misma marca, igual o más larga, la cierra.
function fenceAfter(fence: string | null, line: string): string | null {
  const mark = FENCE.exec(line)?.[1];
  if (!mark) return fence;
  if (fence === null) return mark;
  return mark[0] === fence[0] && mark.length >= fence.length ? null : fence;
}

// Las opciones son las últimas líneas del cuerpo; lo de arriba es prosa.
function readOptions(body: string): { prose: string; options: NextStepOption[] } | null {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const options: NextStepOption[] = [];
  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1];
    if (!line.trim()) {
      end -= 1;
      continue;
    }
    const prompt = OPTION.exec(line)?.[1];
    if (!prompt) break;
    // El índice de línea no cambia mientras el texto de la última opción crece.
    options.unshift({ id: `option:${end - 1}`, prompt });
    end -= 1;
  }
  return options.length ? { prose: trimBlankLines(lines.slice(0, end).join("\n")), options } : null;
}

// Mientras llega, `<NEXT_ST` al final se pintaría crudo un cuadro antes de ocultarse.
function withoutPartialOpenTag(markdown: string): string {
  const lineStart = markdown.lastIndexOf("\n") + 1;
  const tail = markdown.slice(lineStart).trimStart();
  const partial = tail.length > 0 && tail.length < OPEN_TAG.length && OPEN_TAG.startsWith(tail);
  if (!partial || insideFence(markdown.slice(0, lineStart))) return markdown;
  return markdown.slice(0, lineStart);
}

function insideFence(text: string): boolean {
  let fence: string | null = null;
  for (const line of text.split("\n")) fence = fenceAfter(fence, line.replace(/\r$/, ""));
  return fence !== null;
}

// Mientras llega, `- [` al final todavía no es una opción: leída, el bloque
// entero caería a markdown un cuadro y volvería a botones con el siguiente token.
function withoutPartialOption(body: string): string {
  const lineStart = body.lastIndexOf("\n") + 1;
  return OPTION.exec(body.slice(lineStart))?.[1] ? body : body.slice(0, lineStart);
}

function trimBlankLines(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/(?:\n[ \t]*)+$/, "");
}

