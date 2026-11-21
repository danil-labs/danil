/**
 * Modelos de vista para el chat y la conversación con agentes.
 * Derivados de los tipos del motor y eventos RPC1.
 */

import type {
  TurnPiece,
  ReasoningPiece,
  DeltaPiece,
  ToolPiece,
  ShellPiece,
  PermissionPiece,
  TurnStatus,
  TurnState,
} from "./turns/machine.ts";

export type {
  TurnPiece,
  ReasoningPiece,
  DeltaPiece,
  ToolPiece,
  ShellPiece,
  PermissionPiece,
  TurnStatus,
  TurnState,
};

/** Rol de un participante en el turno de conversación. */
export type ChatRole = "user" | "agent" | "system";

/** Representación normalizada de un turno en el historial. */
export interface ChatTurnView {
  id: string;
  role: ChatRole;
  text: string;
  pieces: TurnPiece[];
  timestamp?: number | null;
  durationMs?: number | null;
  model?: string | null;
  reportedModel?: string | null;
  author?: {
    kind?: string;
    label?: string;
  } | null;
  status: "completed" | "streaming" | "error";
  error?: string | null;
}

/** Historial completo de una sesión de chat. */
export interface ChatHistoryView {
  sessionId: string;
  turns: ChatTurnView[];
}

/** Evento deserializado de streaming procedente del evento push 'chat'. */
export interface ChatStreamEvent {
  session: string;
  kind:
    | "started"
    | "delta"
    | "reasoning"
    | "tool"
    | "tool_done"
    | "shell_started"
    | "shell_output"
    | "shell_done"
    | "permission"
    | "permission_resolved"
    | "notice"
    | "done";
  text: string;
  meta?: string | null;
  starts_message?: boolean;
  message_id?: string;
  segment_id?: string;
  id?: string;
  target?: string;
  detail?: unknown;
  ok?: boolean | null;
  request_id?: string | null;
  duration_ms?: number | null;
  model?: string | null;
}

/** Transforma el payload crudo del evento push 'chat' en ChatStreamEvent tipado. */
export function parseChatEvent(raw: unknown): ChatStreamEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const ev = raw as Record<string, unknown>;
  if (typeof ev.session !== "string" || typeof ev.kind !== "string") {
    return null;
  }
  return {
    session: ev.session,
    kind: ev.kind as ChatStreamEvent["kind"],
    text: typeof ev.text === "string" ? ev.text : "",
    meta: typeof ev.meta === "string" ? ev.meta : null,
    starts_message: Boolean(ev.starts_message),
    message_id: typeof ev.message_id === "string" ? ev.message_id : undefined,
    segment_id: typeof ev.segment_id === "string" ? ev.segment_id : undefined,
    id: typeof ev.id === "string" ? ev.id : undefined,
    target: typeof ev.target === "string" ? ev.target : undefined,
    detail: ev.detail,
    ok: typeof ev.ok === "boolean" ? ev.ok : null,
    request_id: typeof ev.request_id === "string" ? ev.request_id : null,
    duration_ms: typeof ev.duration_ms === "number" ? ev.duration_ms : null,
    model: typeof ev.model === "string" ? ev.model : null,
  };
}

/** Adapta la respuesta cruda de load_session o task_history a ChatTurnView[]. */
export function transcribeSessionTurns(rawSession: unknown): ChatTurnView[] {
  if (!rawSession || typeof rawSession !== "object") return [];
  const s = rawSession as { turns?: Array<Record<string, unknown>> };
  if (!Array.isArray(s.turns)) return [];

  return s.turns.map((t, idx) => {
    const id = typeof t.id === "string" ? t.id : `turn_${idx}`;
    const role: ChatRole = t.role === "user" ? "user" : t.role === "system" ? "system" : "agent";
    const text = typeof t.text === "string" ? t.text : "";
    const pieces: TurnPiece[] = [];

    // Hidratar bloques de razonamiento guardados
    if (Array.isArray(t.reasoning)) {
      t.reasoning.forEach((r, rIdx) => {
        if (r && typeof r === "object") {
          const rObj = r as { text?: string; duration_ms?: number };
          pieces.push({
            id: `reasoning_${id}_${rIdx}`,
            kind: "reasoning",
            text: rObj.text ?? "",
            completed: true,
            durationMs: rObj.duration_ms,
          });
        }
      });
    }

    // Hidratar herramientas guardadas
    if (Array.isArray(t.tools)) {
      t.tools.forEach((h, hIdx) => {
        if (h && typeof h === "object") {
          const hObj = h as { name?: string; target?: string; ok?: boolean };
          pieces.push({
            id: `tool_${id}_${hIdx}`,
            kind: "tool",
            name: hObj.name ?? "tool",
            target: hObj.target,
            status: hObj.ok === false ? "error" : "completed",
            ok: hObj.ok ?? null,
          });
        }
      });
    }

    // Agregar delta principal de texto
    if (text) {
      pieces.push({
        id: `delta_${id}_main`,
        kind: "delta",
        text,
      });
    }

    return {
      id,
      role,
      text,
      pieces,
      timestamp: typeof t.at === "number" ? t.at : null,
      durationMs: typeof t.duration_ms === "number" ? t.duration_ms : null,
      model: typeof t.model === "string" ? t.model : null,
      reportedModel: typeof t.reported_model === "string" ? t.reported_model : null,
      author: t.author && typeof t.author === "object" ? (t.author as ChatTurnView["author"]) : null,
      status: "completed",
      error: typeof t.meta === "string" && t.meta === "fallo" ? "Error en turno" : null,
    };
  });
}
