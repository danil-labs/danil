/**
 * Lo que el agente hizo en un turno, como en la ventana (`apps/desktop/src/lib/steps.ts`
 * y `features/chat/transcript.ts`): sus avances, las herramientas que usó (qué leyó,
 * qué ejecutó) y la respuesta. Sin React Native: se prueba en Node.
 */
import { bareCommand, classify, fileName, isQuestionFile, joinSteps, type StepKind } from "@terminus/chat/steps";
import type { HistoryRef, Turn, TurnTool } from "@terminus/protocol";
import { quotaResolves, type QuotaChange, type TurnFailure } from "./failureNotice.ts";

export type { StepKind };

/** Una herramienta, o una decisión de permiso: negar no es fallar, por eso `allowed` va aparte de `ok`. */
export type Step = { kind: StepKind | "permission"; name: string; target: string | null; ok: boolean | null; running: boolean; allowed?: boolean; by?: string | null };

/** Una fila: uno o varios pasos seguidos de la misma clase, que se leen como un acto. */
export type StepRow = { kind: Step["kind"]; steps: Step[] };

/**
 * Quién escribió un input que no es de la persona: un encargado o una tarea por
 * el CLI. Como en la ventana, va a la izquierda con su cara y su firma.
 */
export type Sender = { agent: string | null; task: string | null; provider: string | null };

export function senderOf(turn: Turn): Sender | null {
  if (turn.role !== "user" || (!turn.agent && !turn.from_task)) return null;
  return { agent: turn.agent ?? null, task: turn.from_task?.title ?? null, provider: turn.from_task?.provider ?? null };
}

/** Un renglón de la conversación. */
export type Line =
  | {
      key: string;
      kind: "message";
      role: string;
      text: string;
      images: string[];
      attachments: string[];
      from?: Sender | null;
      refs?: readonly HistoryRef[];
      turnId?: string;
      /** `fallo` o `cupo`: la frase se arma al pintar, con la lengua de quien mira. */
      meta?: string | null;
      fallo?: TurnFailure | null;
      quota?: QuotaChange | null;
    }
  /** Lo que el agente dijo antes de su respuesta, mientras trabajaba. */
  | { key: string; kind: "progress"; text: string }
  | { key: string; kind: "steps"; rows: StepRow[] }
  /** Lo que el agente pensó en el turno (`Turn.reasoning`), plegado en una fila. */
  | { key: string; kind: "reasoning"; text: string; durationMs: number | null; live: boolean }
  /** Un `!` de la persona con su salida. */
  | { key: string; kind: "shell"; command: string; output: string; exitCode: number | null };

export const stepOf = (name: string, target: string | null, ok: boolean | null = null, running = false): Step => ({ kind: classify(name), name, target, ok, running });

export const groupSteps = (steps: readonly Step[]): StepRow[] => joinSteps(steps, (step) => step.kind);

export { bareCommand, classify, fileName };

/** La pregunta que el agente deja escrita no es un paso que enseñar. */
const visible = (tool: TurnTool | undefined): tool is TurnTool => tool !== undefined && !isQuestionFile(tool.target);
const toStep = (tool: TurnTool) => stepOf(tool.name ?? "", tool.target ?? null, tool.ok ?? null);

/**
 * El razonamiento del turno en una sola fila: el teléfono no pinta su estructura
 * interna. `live` lo enciende `deriveRun` mientras el turno sigue corriendo.
 */
function reasoningOf(turn: Turn, key: string): Line | null {
  const blocks = (turn.reasoning ?? []).filter((block) => block.text.trim());
  if (!blocks.length) return null;
  const timed = blocks.some((block) => typeof block.duration_ms === "number");
  return {
    key: `${key}:reasoning`,
    kind: "reasoning",
    text: blocks.map((block) => block.text).join("\n\n"),
    durationMs: timed ? blocks.reduce((total, block) => total + (block.duration_ms ?? 0), 0) : null,
    live: false,
  };
}

/** Lo pensado va encima de la respuesta del turno, no repartido por sus mensajes. */
function folded(lines: Line[], reasoning: Line | null): Line[] {
  if (!reasoning) return lines;
  const at = lines.findIndex((line) => line.kind === "message");
  return at < 0 ? [...lines, reasoning] : [...lines.slice(0, at), reasoning, ...lines.slice(at)];
}

/**
 * Los renglones de un turno. Con su orden registrado (`pieces`): los avances y los
 * pasos donde ocurrieron, y la respuesta (lo dicho tras la última herramienta) al
 * final; sin él, los pasos delante del texto.
 */
export function linesOfTurn(turn: Turn, key: string, images: string[]): Line[] {
  const from = senderOf(turn);
  const refs = turn.history_refs?.filter((ref) => ref.pointer !== "/tools");
  const message = (text: string): Line => ({
    key,
    kind: "message",
    role: turn.role,
    text,
    images,
    attachments: turn.attachments ?? [],
    from,
    ...(refs?.length ? { refs, turnId: turn.id } : {}),
    ...(turn.meta ? { meta: turn.meta } : {}),
    ...(turn.fallo ? { fallo: turn.fallo } : {}),
    ...(turn.quota ? { quota: turn.quota } : {}),
  });
  if (turn.shell) return [{ key, kind: "shell", command: turn.text ?? "", output: turn.shell.output ?? "", exitCode: turn.shell.exit_code ?? null }];
  const reasoning = reasoningOf(turn, key);
  const tools = turn.tools ?? [];
  const pieces = turn.pieces ?? [];
  if (!pieces.length) {
    const steps = tools.filter(visible).map(toStep);
    return folded([...(steps.length ? [{ key: `${key}:steps`, kind: "steps", rows: groupSteps(steps) } as Line] : []), message(turn.text ?? "")], reasoning);
  }
  const lastText = pieces.reduce((at, p, i) => ("text" in p ? i : at), -1);
  let firstFinal = lastText;
  while (firstFinal > 0 && "text" in pieces[firstFinal - 1]) firstFinal--;
  const answer = pieces
    .slice(firstFinal, lastText + 1)
    .map((p) => ("text" in p ? p.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
  const out: Line[] = [];
  let steps: Step[] = [];
  const flush = (i: number) => {
    if (steps.length) out.push({ key: `${key}:steps${i}`, kind: "steps", rows: groupSteps(steps) });
    steps = [];
  };
  pieces.forEach((piece, i) => {
    if ("tool" in piece) {
      const tool = tools[piece.tool];
      if (visible(tool)) steps.push(toStep(tool));
      return;
    }
    if (i >= firstFinal && i !== lastText) return;
    flush(i);
    if (i === lastText) out.push(message(answer || turn.text || ""));
    else if (piece.text.trim()) out.push({ key: `${key}:p${i}`, kind: "progress", text: piece.text.trim() });
  });
  flush(pieces.length);
  if (lastText < 0) out.push(message(turn.text ?? ""));
  return folded(out, reasoning);
}

/** Si tras este evento lo que llegó en vivo ya está guardado: la lectura lo reemplaza (`liveAfterRead`). */
export const savesLive = (name: string, kind?: string) => name === "question" || (name === "chat" && (kind === "done" || kind === "segment_saved"));

/** Lo que llega en vivo de un turno en marcha: texto y pasos, en orden. */
export type LivePiece = { text: string } | { step: Step };

/** Un evento `chat` del turno en marcha, sobre lo que ya se ve. */
export function applyLive(live: readonly LivePiece[], event: { kind: string; text: string; target?: string | null; ok?: boolean | null; starts_message?: boolean }): readonly LivePiece[] {
  if (event.kind === "delta") {
    const last = live.at(-1);
    if (last && "text" in last && !event.starts_message) return [...live.slice(0, -1), { text: last.text + event.text }];
    return [...live, { text: event.text }];
  }
  if (event.kind === "tool") return [...live, { step: stepOf(event.text, event.target ?? null, null, true) }];
  if (event.kind === "tool_done") {
    const i = live.findLastIndex((p) => "step" in p && p.step.running && p.step.name === event.text);
    const done = (step: Step): Step => ({ ...step, running: false, ok: event.ok ?? null });
    if (i < 0) return [...live, { step: done(stepOf(event.text, event.target ?? null)) }];
    return live.map((p, j) => (j === i && "step" in p ? { step: done(p.step) } : p));
  }
  return live;
}

/**
 * Lo vivo después de releer la tarea. `before` es lo vivo cuando empezó la lectura.
 * - El turno ya no corre: lo guardado lo trae todo.
 * - `resync` (terminó, guardó un tramo —`segment_saved`—, se perdieron eventos, volvió al
 *   frente): lo que había al empezar ya está guardado; queda solo lo que llegó durante la
 *   lectura, con el pedazo de texto que se siguió escribiendo sobre el último.
 * - Si no (el foco, un aviso, la máquina que cambia), lo que se escribe en vivo se queda:
 *   releer no borra la respuesta a medias.
 */
export function liveAfterRead(now: readonly LivePiece[], before: readonly LivePiece[], read: { running: boolean; resync: boolean }): readonly LivePiece[] {
  if (!read.running) return now.length ? [] : now;
  if (!read.resync || !before.length) return now;
  // Lo vivo empezó de nuevo durante la lectura (no es continuación de `before`): se queda.
  if (now.length < before.length) return now;
  const rest = now.slice(before.length);
  const last = before.length - 1;
  const was = before[last];
  const is = now[last];
  if (was && is && "text" in was && "text" in is && is.text.length > was.text.length && is.text.startsWith(was.text)) {
    return [{ text: is.text.slice(was.text.length) }, ...rest];
  }
  return rest;
}

/** Los renglones de lo que llega en vivo: el último texto es la respuesta que se está escribiendo. */
export function linesOfLive(live: readonly LivePiece[]): Line[] {
  const out: Line[] = [];
  let steps: Step[] = [];
  const lastText = live.findLastIndex((p) => "text" in p);
  live.forEach((piece, i) => {
    if ("step" in piece) return void steps.push(piece.step);
    if (steps.length) out.push({ key: `live:steps${i}`, kind: "steps", rows: groupSteps(steps) });
    steps = [];
    if (!piece.text.trim()) return;
    out.push(i === lastText && i === live.length - 1 ? { key: "live", kind: "message", role: "agent", text: piece.text, images: [], attachments: [] } : { key: `live:p${i}`, kind: "progress", text: piece.text.trim() });
  });
  if (steps.length) out.push({ key: `live:steps${live.length}`, kind: "steps", rows: groupSteps(steps) });
  return out;
}

/** Una entrada de la hoja, en su orden. `id` sobrevive a que la fila cambie de posición al guardarse. */
export type WorkItem = { kind: "note"; id: string; at: number; text: string } | { kind: "row"; id: string; at: number; row: StepRow };

/**
 * Una ejecución: de un mensaje que abre trabajo al siguiente. El motor la guarda
 * como varios turnos, cada uno con su id (`segment_saved`, preguntas, lanzamientos),
 * así que su identidad es el turno que la abrió, igual en vivo y guardada.
 */
export type WorkRun = {
  key: string;
  /** Cuándo se abrió; el reloj no empieza antes. */
  at: number | null;
  live: boolean;
  steps: Step[];
  items: WorkItem[];
  /** La suma de sus tramos; `null` si ninguno la guardó. */
  durationMs: number | null;
};

/** El destino de Buscar: un avance puede compartir `at` con el paso que viene después. */
export function workFocus(items: readonly WorkItem[], at: number, find: string): WorkItem | undefined {
  const needle = find.toLowerCase();
  if (needle) {
    const hit = items.find((item) => item.kind === "note"
      ? item.at === at && item.text.toLowerCase().includes(needle)
      : at >= item.at && at < item.at + item.row.steps.length && (item.row.steps[at - item.at].target ?? "").toLowerCase().includes(needle));
    if (hit) return hit;
  }
  return items.findLast((item) => item.kind === "row" && item.at <= at);
}

/** Algo que Buscar puede encontrar dentro de un grupo. `at` es el paso más cercano de su ejecución. */
export type WorkHit = { at: number; text: string };

/** Un grupo en el chat: un resumen que abre su ejecución en la hoja. */
export type WorkLine = { key: string; kind: "work"; run: string; at: number; steps: Step[]; durationMs: number | null; live: boolean; hits: WorkHit[] };

export type ChatLine = Exclude<Line, { kind: "steps" }> | WorkLine;

export type WorkThread = { lines: ChatLine[]; live: ChatLine[]; runs: WorkRun[] };

const opensRun = (turn: Turn) => turn.role === "user" && !turn.permission && !turn.answers?.length && !turn.shell;
const isSegment = (turn: Turn) => turn.role !== "user" && turn.role !== "system" && turn.role !== "shell";
const isEmpty = (line: Line) =>
  line.kind === "message" && !line.text && !line.images.length && !line.attachments.length && !line.refs?.length && line.meta !== "fallo" && line.meta !== "cupo" && !line.fallo;

function decisionOf(turn: Turn): Step | null {
  if (!turn.permission) return null;
  const { tool, target, allow } = turn.permission;
  return { kind: "permission", name: tool, target: target ?? null, ok: null, running: false, allowed: allow, by: turn.agent ?? turn.from_task?.title ?? null };
}

/** Los pasos y notas de una ejecución, con la identidad de cada fila: clase, objetivo y n.º de aparición. */
function itemsOf(flow: readonly (Step | { note: string })[]): WorkItem[] {
  const items: WorkItem[] = [];
  const seen = new Map<string, number>();
  const idOf = (step: Step) => {
    const base = `${step.kind}\n${step.target ?? ""}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}\n${n}`;
  };
  let notes = 0;
  let at = 0;
  let pending: Step[] = [];
  const flush = () => {
    for (const row of groupSteps(pending)) {
      items.push({ kind: "row", id: row.steps.map(idOf)[0], at, row });
      at += row.steps.length;
    }
    pending = [];
  };
  for (const entry of flow) {
    if ("note" in entry) {
      flush();
      items.push({ kind: "note", id: `note\n${notes++}`, at, text: entry.note });
    } else pending.push(entry);
  }
  flush();
  return items;
}

type Stretch = { key: string; at: number | null; turns: readonly { turn: Turn; index: number }[] };

/**
 * Una ejecución en renglones. Cerrada, sus avances entran al grupo y queda un resumen
 * por respuesta; abierta, cada tramo es un grupo y los avances siguen a la vista. Una
 * decisión guardada no parte nada: entra al grupo de lo que sigue, aunque siga vivo.
 */
function deriveRun(stretch: Stretch, pieces: readonly LivePiece[], open: boolean, imagesOf: (turn: Turn) => string[]) {
  const live = open || pieces.length > 0;
  const lines: ChatLine[] = [];
  const tail: ChatLine[] = [];
  const steps: Step[] = [];
  const flow: (Step | { note: string })[] = [];
  let answers: string[] = [];
  let target = lines;
  let groups = 0;
  let workedMs = 0;
  let worked = false;
  let group: { at: number; steps: Step[]; notes: { line: ChatLine; hit: WorkHit }[]; hits: WorkHit[] } | null = null;

  const seal = (ending = false) => {
    if (!group) return;
    const { at, steps: shown, notes, hits } = group;
    group = null;
    if (!shown.length) return void target.push(...notes.map((n) => n.line));
    target.push({ key: `${stretch.key}:w${groups++}`, kind: "work", run: stretch.key, at, steps: shown, durationMs: worked ? workedMs : null, live: ending && open, hits });
    workedMs = 0;
    worked = false;
  };
  const opened = () => (group ??= { at: steps.length, steps: [], notes: [], hits: [] });
  const keep = () => {
    flow.push(...answers.map((note) => ({ note })));
    answers = [];
  };
  const addStep = (step: Step) => {
    keep();
    const now = opened();
    if (step.target) now.hits.push({ at: steps.length, text: step.target });
    steps.push(step);
    now.steps.push(step);
    flow.push(step);
  };
  const addNote = (line: Extract<Line, { kind: "progress" }>) => {
    keep();
    flow.push({ note: line.text });
    const hit = { at: steps.length, text: line.text };
    if (live) {
      seal();
      target.push(line);
    } else {
      const now = opened();
      now.notes.push({ line, hit });
      now.hits.push(hit);
    }
  };
  const addLine = (line: Line, segment: boolean) => {
    if (line.kind === "steps") return line.rows.forEach((row) => row.steps.forEach(addStep));
    if (line.kind === "progress") return addNote(line);
    if (isEmpty(line)) return;
    seal();
    // La línea del cupo cierra el fallo que ya resolvió: la tarea siguió.
    if (line.kind === "message" && line.meta === "cupo") {
      const previous = target.at(-1);
      if (previous?.kind === "message" && quotaResolves(previous.fallo?.clase)) target.pop();
    }
    target.push(line);
    if (segment && line.kind === "message" && line.text) answers.push(line.text);
  };

  const lastTurn = stretch.turns.at(-1)?.index;
  for (const { turn, index } of stretch.turns) {
    const decision = decisionOf(turn);
    if (decision) {
      addStep(decision);
      continue;
    }
    if (typeof turn.duration_ms === "number" && isSegment(turn)) {
      workedMs += turn.duration_ms;
      worked = true;
    }
    const key = turn.id ?? String(index);
    const stillRunning = open && index === lastTurn;
    for (const line of linesOfTurn(turn, key, imagesOf(turn))) addLine(line.kind === "reasoning" && stillRunning ? { ...line, live: true } : line, isSegment(turn));
  }
  if (pieces.length) target = tail;
  for (const line of linesOfLive(pieces)) {
    if (line.key === "live") {
      seal();
      tail.push(line as ChatLine);
    } else addLine(line, false);
  }
  seal(true);
  const durations = stretch.turns.flatMap(({ turn }) => (typeof turn.duration_ms === "number" && isSegment(turn) ? [turn.duration_ms] : []));
  const run: WorkRun = { key: stretch.key, at: stretch.at, live: open, steps, items: itemsOf(flow), durationMs: durations.length ? durations.reduce((a, b) => a + b, 0) : null };
  return { lines, tail, run };
}

function stretchesOf(turns: readonly Turn[], base: number): Stretch[] {
  const out: { key: string; at: number | null; turns: { turn: Turn; index: number }[] }[] = [];
  turns.forEach((turn, index) => {
    if (opensRun(turn)) out.push({ key: turn.id ?? String(base + index), at: turn.at ?? null, turns: [] });
    else if (!out.length) out.push({ key: "start", at: null, turns: [] });
    out.at(-1)!.turns.push({ turn, index: base + index });
  });
  return out;
}

type Sealed = { lines: ChatLine[]; runs: WorkRun[]; last: Stretch | null };
const sealedOf = new WeakMap<readonly Turn[], Sealed>();

/**
 * La conversación con sus ejecuciones: la única derivación que leen el chat y la hoja.
 * Solo la última ejecución cambia con lo vivo; las anteriores se calculan una vez por
 * lectura, porque esto corre con cada pedazo de texto que llega. `base`: la posición del
 * primer turno en la transcripción entera; identifica a los turnos sin `id` entre páginas.
 */
export function workRuns(turns: readonly Turn[], live: readonly LivePiece[], running: boolean, imagesOf: (turn: Turn) => string[] = () => [], base = 0): WorkThread {
  let sealed = sealedOf.get(turns);
  if (!sealed) {
    const stretches = stretchesOf(turns, base);
    const done = stretches.slice(0, -1).map((stretch) => deriveRun(stretch, [], false, imagesOf));
    sealed = { lines: done.flatMap((d) => d.lines), runs: done.map((d) => d.run), last: stretches.at(-1) ?? null };
    sealedOf.set(turns, sealed);
  }
  const last = deriveRun(sealed.last ?? { key: "start", at: null, turns: [] }, live, running, imagesOf);
  const empty = !sealed.last && !live.length && !running;
  return { lines: [...sealed.lines, ...last.lines], live: last.tail, runs: empty ? sealed.runs : [...sealed.runs, last.run] };
}

/** Si un renglón dice lo que se busca; `needle` ya en minúsculas. Un grupo busca en sus comandos, rutas y avances. */
export function lineMatches(line: ChatLine, needle: string): boolean {
  if (line.kind === "reasoning") return false;
  if (line.kind === "work") return hitOf(line, needle) !== null;
  return (line.kind === "shell" ? `${line.command}\n${line.output}` : line.text).toLowerCase().includes(needle);
}

export const hitOf = (line: WorkLine, needle: string): WorkHit | null => line.hits.find((hit) => hit.text.toLowerCase().includes(needle)) ?? null;

/** Lo último que sigue corriendo de una ejecución. */
export const runningStep = (run: WorkRun | undefined): Step | null => run?.steps.findLast((step) => step.running) ?? null;

/** Desde cuándo corre el turno: `started_at` de la máquina, nunca antes del mensaje que abrió la ejecución. */
export const runClock = (startedAt: number | null, runAt: number | null): number | null => (startedAt === null ? null : Math.max(startedAt, runAt ?? 0));

/** Lo que lleva, sin bajar de cero: el teléfono y la máquina pueden no coincidir. */
export const elapsed = (since: number, now: number) => Math.max(0, now - since);
