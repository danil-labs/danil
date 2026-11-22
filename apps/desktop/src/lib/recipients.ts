/**
 * Destinatarios: `@encargado` nombra a quién se le entrega el mensaje.
 *
 * Es otra especie que `@archivo` o `@tarea`, que son material que entra al
 * prompt. Viven en listas separadas y con tipos separados, y el compilador es
 * quien sostiene que un destinatario nunca se cuele como contexto
 * (`docs/specs/handler-mentions.md`).
 *
 * La aritmética de intervalos se importa de `taskMentions.ts`: las dos
 * gramáticas comparten convención de `start` y `end`.
 */
import type { AgentProfile, HandlerDefinition, HandlerStatus, HandlerStatusRow } from "./model.ts";
import type { Trigger } from "./mentions.ts";
import {
  editMentions,
  editSpans,
  insertReference,
  type MentionDraft,
  type MentionTarget,
  mentionLabel,
  shiftSpans,
  type TextEdit,
  trimOffset,
} from "./taskMentions.ts";

/**
 * Dónde se contesta un mensaje, cuando no es aquí (`sessions::ReplyTo`). Es del
 * sobre y no del texto: viaja con el mensaje y el reenvío la conserva.
 */
export type ReplyTo = { folder: string; task: string };

/**
 * La tarea que escribió un mensaje por el CLI (`sessions::SenderTask`), como era
 * al escribirlo: su título y su agente son la cara del globo.
 */
export type SenderTask = {
  folder: string;
  task: string;
  title: string;
  provider: string;
  model?: string | null;
  /** La computadora donde vive, si no es la que guardó el mensaje. */
  machine?: string | null;
};

/** El nombre del encargado, y el intervalo de su etiqueta en el texto de la caja. */
export type Recipient = { name: string; start: number; end: number; text: string };

/** Lo que hay escrito en la caja: un texto, el material referido y a quién va. */
export type RecipientDraft = MentionDraft & { recipients?: Recipient[] };

/** Espacio de ids del menú, sin choque con `task-`, `folder-`, `portfolio-` ni una ruta. */
export function recipientId(name: string): string {
  return `handler-${name}`;
}

export function recipientLabel(name: string): string {
  return mentionLabel(name, "handler");
}

function editRecipients(before: RecipientDraft, text: string, edit?: TextEdit): Recipient[] {
  return editSpans(before.text, before.recipients ?? [], text, edit);
}

/** Escribir alrededor desplaza las dos listas por igual, o una se queda atrás. */
export function editDraft(before: RecipientDraft, text: string, edit?: TextEdit): RecipientDraft {
  return {
    text,
    task_mentions: editMentions(before, text, edit),
    recipients: editRecipients(before, text, edit),
  };
}

export function trimDraft(before: RecipientDraft): RecipientDraft {
  const offset = trimOffset(before.text);
  return {
    text: before.text.trim(),
    task_mentions: shiftSpans(before.task_mentions ?? [], offset),
    recipients: shiftSpans(before.recipients ?? [], offset),
  };
}

export function insertRecipient(before: RecipientDraft, trigger: Trigger, name: string, label: string): RecipientDraft {
  const text = before.text.slice(0, trigger.from) + label + " " + before.text.slice(trigger.to);
  const edit = { start: trigger.from, end: trigger.to };
  return {
    text,
    task_mentions: editMentions(before, text, edit),
    recipients: [...editRecipients(before, text, edit), {
      name, start: trigger.from, end: trigger.from + label.length, text: label,
    }].sort((a, b) => a.start - b.start),
  };
}

/** Insertar material también corre a los destinatarios que quedaban detrás. */
export function insertMention(before: RecipientDraft, trigger: Trigger, target: MentionTarget, label: string): RecipientDraft {
  const next = insertReference(before, trigger, target, label);
  return {
    ...next,
    recipients: editRecipients(before, next.text, { start: trigger.from, end: trigger.to }),
  };
}

/**
 * Un encargado alcanzable desde la caja, tal como lo necesita el menú.
 *
 * Sale de la lista que el riel ya invoca (`list_agents`), con la presencia
 * que `list_agent_status` publica si está a mano: `undefined` no es un
 * estado, es «todavía no se sabe», y la cara se pinta despierta igual.
 */
export type RecipientCandidate = {
  name: string;
  description: string;
  status?: HandlerStatus;
  // Declarado por el repositorio de la carpeta: solo cambia con un PR.
  repository?: boolean;
};

/**
 * Los agentes que el menú ofrece en una carpeta. Los ocultos no salen, como
 * en el riel, ni los tuyos que el repositorio tapa: `@nombre` llega al suyo.
 */
export function recipientCandidatesOf(
  roster: readonly HandlerDefinition[],
  options: {
    profiles?: Record<string, AgentProfile>;
    statuses?: readonly HandlerStatusRow[];
  } = {},
): RecipientCandidate[] {
  return roster
    .filter(e => !options.profiles?.[e.name]?.hidden)
    .map(e => ({
      name: e.name,
      description: e.description,
      status: options.statuses?.find(r => r.name === e.name)?.status,
      repository: e.own_scope === null,
    }));
}

/**
 * Los encargados que casan con lo tecleado, el exacto primero.
 *
 * Mismo orden que `searchTasks` y `searchPlaces` —exacto, luego prefijo, luego
 * contiene—: tres criterios distintos en tres grupos del mismo menú se leen
 * como que el menú no tiene ninguno.
 */
export function searchRecipients(candidates: readonly RecipientCandidate[], query: string): RecipientCandidate[] {
  const rank = (c: RecipientCandidate) => {
    const name = c.name.toLowerCase();
    return name === query ? 0 : name.startsWith(query) ? 1 : 2;
  };
  return candidates.filter(c => c.name.toLowerCase().includes(query))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * Los mismos encargados en dos grupos: primero los del repositorio, luego los
 * tuyos, cada uno con el orden de `searchRecipients`.
 */
export function groupRecipients(candidates: readonly RecipientCandidate[], query: string): {
  repository: RecipientCandidate[];
  own: RecipientCandidate[];
} {
  const found = searchRecipients(candidates, query);
  return {
    repository: found.filter(c => c.repository),
    own: found.filter(c => !c.repository),
  };
}
