import type { Trigger } from "./mentions.ts";
import { slashTokens } from "@terminus/chat/slash";

/** Lo que la ventana vio de una tarea de otra máquina: el motor que no la tiene se la cuenta al agente con esto. */
export type TaskAbout = { machine_name?: string; title?: string; branch?: string; folder_name?: string };
/** `about` solo cuando la tarea vive en otra máquina que la que recibe el mensaje; el router lo vuelve `elsewhere`. */
export type TaskTarget = { kind: "task"; projectId: string; sessionId: string; about?: TaskAbout };
export type FolderTarget = { kind: "folder"; projectId: string };
export type PortfolioTarget = { kind: "portfolio"; portfolioId: string };
export type MentionTarget = TaskTarget | FolderTarget | PortfolioTarget;
export type TaskMention = { target: MentionTarget; start: number; end: number; text: string; elsewhere?: TaskAbout & { machine: string } };
export type PlaceCandidate = { target: FolderTarget; name: string; detail: string; updatedAt: number };
export type TaskCandidate = {
  target: TaskTarget;
  title: string;
  projectName: string;
  alias: string;
  branch: string;
  available: boolean;
  archived: boolean;
  updatedAt: number;
  /** La máquina de la fila si no es la de la ventana (`@terminus/fleet`). */
  machine?: string;
};
export type MentionDraft = { text: string; task_mentions?: TaskMention[] };

export function referenceId(target: MentionTarget): string {
  switch (target.kind) {
    case "task": return `task-${target.projectId.length}-${target.projectId}-${target.sessionId}`;
    case "folder": return `folder-${target.projectId}`;
    case "portfolio": return `portfolio-${target.portfolioId}`;
  }
}

// `task_mentions::validate` exige un solo token detrás de la arroba; con espacios el envío se rechaza.
export function mentionLabel(name: string, fallback: string): string {
  const token = name.trim().replace(/[\s@"]+/g, "-").replace(/[,;:!?)\]]+$/, "");
  return `@${token || fallback}`;
}

export type TextEdit = { start: number; end: number };
export type PendingEdit = TextEdit & { text: string; inputType: string };

/** Un intervalo marcado dentro del texto de la caja, con la etiqueta que lo ocupa. */
export type TextSpan = { start: number; end: number; text: string };

export function finishEdit(pending: PendingEdit | undefined, text: string): TextEdit | undefined {
  if (!pending) return undefined;
  let { start, end } = pending;
  const removed = pending.text.length - text.length;
  if (start === end && removed > 0 && pending.inputType.startsWith("delete")) {
    if (pending.inputType.endsWith("Backward")) start -= removed;
    else if (pending.inputType.endsWith("Forward")) end += removed;
    else return undefined;
  }
  const newEnd = end + text.length - pending.text.length;
  if (start < 0 || newEnd < start || pending.text.slice(0, start) !== text.slice(0, start) ||
    pending.text.slice(end) !== text.slice(newEnd)) return undefined;
  return { start, end };
}

// La aritmética de intervalos es la misma para el material y para el
// destinatario: dos copias divergen y la etiqueta se pinta donde no está.
export function editSpans<T extends TextSpan>(beforeText: string, spans: readonly T[], text: string, edit?: TextEdit): T[] {
  if (beforeText === text && (!edit || edit.start === edit.end)) return [...spans];
  let start = 0;
  while (start < beforeText.length && start < text.length && beforeText[start] === text[start]) start++;
  let oldEnd = beforeText.length;
  let newEnd = text.length;
  while (oldEnd > start && newEnd > start && beforeText[oldEnd - 1] === text[newEnd - 1]) { oldEnd--; newEnd--; }
  if (edit) {
    const proposedEnd = edit.end + text.length - beforeText.length;
    if (edit.start < 0 || proposedEnd < edit.start || edit.end > beforeText.length ||
      beforeText.slice(0, edit.start) !== text.slice(0, edit.start) || beforeText.slice(edit.end) !== text.slice(proposedEnd)) return [];
    start = edit.start;
    oldEnd = edit.end;
    newEnd = proposedEnd;
  }
  const delta = newEnd - oldEnd;
  return spans.flatMap(m => {
    if (!edit && delta !== 0 && spans.filter(other => other.text === m.text).length > 1) return [];
    const moved: T | null = oldEnd <= m.start ? { ...m, start: m.start + delta, end: m.end + delta }
      : start >= m.end ? m : null;
    if (!moved || text.slice(moved.start, moved.end) !== moved.text ||
      (moved.start > 0 && !/\s/.test(text[moved.start - 1])) ||
      (moved.end < text.length && !/[\s,;:!?).\]]/.test(text[moved.end]))) return [];
    return [moved];
  });
}

export function shiftSpans<T extends TextSpan>(spans: readonly T[], offset: number): T[] {
  return spans.map(s => ({ ...s, start: s.start - offset, end: s.end - offset }));
}

export function editMentions(before: MentionDraft, text: string, edit?: TextEdit): TaskMention[] {
  return editSpans(before.text, before.task_mentions ?? [], text, edit);
}

export function taskLabel(task: TaskCandidate): string {
  return mentionLabel(task.branch || task.alias || task.title, task.target.sessionId);
}

/**
 * La mención de `task`. Con varias máquinas (`machineName`) lleva lo que se ve
 * de ella aquí: la máquina del mensaje se sabe al mandarlo, y si es otra, el
 * router lo vuelve `elsewhere`; si es la suya, lo quita.
 */
export function taskTarget(task: TaskCandidate, machineName?: (id: string | null) => string | undefined): TaskTarget {
  if (!machineName) return task.target;
  const about: TaskAbout = {
    machine_name: machineName(task.machine ?? null),
    title: task.title || undefined,
    branch: task.branch || undefined,
    folder_name: task.projectName || undefined,
  };
  return { ...task.target, about };
}

/** Sin router la mención va tal cual al motor de la ventana, que no conoce `about`. */
export function withoutAbout(args: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  let out = args;
  for (const key of ["taskMentions", "task_mentions"]) {
    const mentions = out?.[key];
    if (!Array.isArray(mentions) || !mentions.some(m => m?.target?.about)) continue;
    out = {
      ...out,
      [key]: mentions.map(m => {
        if (!m?.target?.about) return m;
        const { about: _, ...target } = m.target;
        return { ...m, target };
      }),
    };
  }
  return out;
}

/** El id de panel de la tarea de una mención guardada: la que dice `elsewhere` vive en esa máquina. */
export function mentionedSession(m: TaskMention, self: string | null): string | null {
  if (m.target.kind !== "task") return null;
  const home = m.elsewhere?.machine;
  return home && home !== self && !m.target.sessionId.startsWith(`${home}~`) ? `${home}~${m.target.sessionId}` : m.target.sessionId;
}

export function placeLabel(place: PlaceCandidate): string {
  return mentionLabel(place.name, place.target.projectId);
}

export function insertReference(before: MentionDraft, trigger: Trigger, target: MentionTarget, label: string): MentionDraft {
  const text = before.text.slice(0, trigger.from) + label + " " + before.text.slice(trigger.to);
  return {
    text,
    task_mentions: [...editMentions(before, text, { start: trigger.from, end: trigger.to }), {
      target, start: trigger.from, end: trigger.from + label.length, text: label,
    }].sort((a, b) => a.start - b.start),
  };
}

export function trimOffset(text: string): number {
  return text.length - text.trimStart().length;
}

export function trimMentions(before: MentionDraft): MentionDraft {
  return {
    text: before.text.trim(),
    task_mentions: shiftSpans(before.task_mentions ?? [], trimOffset(before.text)),
  };
}

export function searchTasks(tasks: TaskCandidate[], query: string, project: string, session?: string | null): TaskCandidate[] {
  const rank = (t: TaskCandidate) => {
    const names = [t.title, t.alias, t.branch].map(s => s.toLowerCase());
    return names.includes(query) ? 0 : names.some(s => s.startsWith(query)) ? 1 : 2;
  };
  return tasks.filter(t => !t.archived && (t.target.sessionId !== session || t.target.projectId !== project) &&
    [t.title, t.alias, t.branch].some(s => s.toLowerCase().includes(query)))
    .sort((a, b) => rank(a) - rank(b) || Number(b.target.projectId === project) - Number(a.target.projectId === project) ||
      b.updatedAt - a.updatedAt || a.target.sessionId.localeCompare(b.target.sessionId));
}

export function searchPlaces(places: PlaceCandidate[], query: string): PlaceCandidate[] {
  const names = (p: PlaceCandidate) => [p.name.toLowerCase(), placeLabel(p).slice(1).toLowerCase()];
  const rank = (p: PlaceCandidate) => names(p).includes(query) ? 0 : names(p).some(s => s.startsWith(query)) ? 1 : 2;
  return places.filter(p => names(p).some(s => s.includes(query)))
    .sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt || referenceId(a.target).localeCompare(referenceId(b.target)));
}

export type Span = { text: string; kind: "mention" | "recipient" | "command" | null };

// Un destinatario no es material, y la caja los pinta distinto: mezclarlos en
// una sola clase deja sin saber si se adjuntó algo o se llamó a alguien.
export function highlightSpans(
  text: string,
  mentions: readonly TaskMention[],
  commands: ReadonlySet<string>,
  recipients: readonly TextSpan[] = [],
  skills: ReadonlySet<string> = new Set(),
): Span[] {
  const spans: Span[] = [];
  let from = 0;
  const command = /^\/([\w:-]+)(?=\s|$)/.exec(text);
  if (command && commands.has(command[1])) {
    spans.push({ text: command[0], kind: "command" });
    from = command[0].length;
  }
  // En medio del texto solo una skill: el CLI no corre comandos ahí.
  const inlineSkills = slashTokens(text)
    .filter(t => t.inline && skills.has(t.name))
    .map(t => ({ span: { start: t.from, end: t.to, text: text.slice(t.from, t.to) }, kind: "command" as const }));
  const marked = [
    ...mentions.map(m => ({ span: m as TextSpan, kind: "mention" as const })),
    ...recipients.map(r => ({ span: r, kind: "recipient" as const })),
    ...inlineSkills,
  ].sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
  for (const { span, kind } of marked) {
    if (span.start < from || text.slice(span.start, span.end) !== span.text) continue;
    spans.push({ text: text.slice(from, span.start), kind: null }, { text: span.text, kind });
    from = span.end;
  }
  spans.push({ text: text.slice(from), kind: null });
  return spans;
}

/** Un mensaje enviado: su comando inicial y sus skills; las menciones las pinta `WithMentions`. */
export function tramosDelMensaje(text: string, commands: ReadonlySet<string>, skills: ReadonlySet<string> = new Set()): Span[] {
  return highlightSpans(text, [], commands, [], skills);
}

/** La clase de un tramo marcado, la misma en la caja y en el mensaje enviado. */
export function claseDelTramo(kind: NonNullable<Span["kind"]>, lugar: "caja" | "enviado" = "caja"): string {
  const color = kind === "recipient" ? "bg-primary/10 text-primary" : "bg-info/10 text-info-strong";
  return lugar === "enviado" ? `rounded-sm ${color} font-mono` : `rounded-sm ${color}`;
}
