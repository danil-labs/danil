/**
 * Máquina de estados de turno de agente (B-015).
 *
 * Preserva el orden causal de razonamiento (thinking), deltas de streaming y llamadas
 * a herramientas (tools).
 * Garantiza que los bloques de pensamiento (reasoning) nunca desaparezcan al terminar
 * el turno ni cuando una herramienta se emita antes de cerrar el pensamiento.
 */

export type TurnStatus = "idle" | "running" | "waiting_permission" | "settled" | "error";

export interface ReasoningPiece {
  id: string;
  kind: "reasoning";
  text: string;
  completed: boolean;
  durationMs?: number;
}

export interface DeltaPiece {
  id: string;
  kind: "delta";
  text: string;
  messageId?: string;
}

export interface ToolPiece {
  id: string;
  kind: "tool";
  name: string;
  target?: string;
  status: "running" | "completed" | "error";
  ok: boolean | null;
  detail?: unknown;
}

export interface ShellPiece {
  id: string;
  kind: "shell";
  command: string;
  output: string;
  status: "running" | "completed";
  exitCode?: number | null;
}

export interface PermissionPiece {
  id: string;
  kind: "permission";
  requestId: string;
  toolName: string;
  target?: string;
  status: "pending" | "allowed" | "denied";
}

export type TurnPiece = ReasoningPiece | DeltaPiece | ToolPiece | ShellPiece | PermissionPiece;

export interface TurnState {
  status: TurnStatus;
  turnId: string | null;
  model: string | null;
  pieces: TurnPiece[];
  activeReasoningId: string | null;
  activeDeltaId: string | null;
  error: string | null;
}

export type TurnEvent =
  | { type: "START"; turnId?: string; model?: string }
  | { type: "REASONING"; text: string; messageId?: string; durationMs?: number }
  | { type: "DELTA"; text: string; messageId?: string; startsMessage?: boolean }
  | { type: "TOOL_START"; id: string; name: string; target?: string; detail?: unknown }
  | { type: "TOOL_DONE"; id: string; ok: boolean | null; detail?: unknown }
  | { type: "SHELL_START"; id: string; command: string }
  | { type: "SHELL_OUTPUT"; id: string; text: string }
  | { type: "SHELL_DONE"; id: string; exitCode?: number | null }
  | { type: "PERMISSION_REQUEST"; requestId: string; toolName: string; target?: string }
  | { type: "PERMISSION_RESOLVE"; requestId: string; decision: "allow" | "deny" }
  | { type: "FINISH"; ok?: boolean }
  | { type: "ERROR"; error: string }
  | { type: "RESET" };

export function createInitialTurnState(): TurnState {
  return {
    status: "idle",
    turnId: null,
    model: null,
    pieces: [],
    activeReasoningId: null,
    activeDeltaId: null,
    error: null,
  };
}

export function turnReducer(state: TurnState, event: TurnEvent): TurnState {
  switch (event.type) {
    case "START": {
      return {
        ...state,
        status: "running",
        turnId: event.turnId ?? state.turnId ?? `turn_${Date.now()}`,
        model: event.model ?? state.model,
        error: null,
      };
    }

    case "REASONING": {
      const currentPieces = [...state.pieces];
      let activeId = state.activeReasoningId;
      const existingIdx = activeId ? currentPieces.findIndex((p) => p.id === activeId) : -1;

      if (existingIdx >= 0 && currentPieces[existingIdx].kind === "reasoning") {
        const existing = currentPieces[existingIdx] as ReasoningPiece;
        currentPieces[existingIdx] = {
          ...existing,
          text: existing.text + event.text,
          durationMs: event.durationMs ?? existing.durationMs,
        };
      } else {
        activeId = `reasoning_${Date.now()}_${currentPieces.length}`;
        currentPieces.push({
          id: activeId,
          kind: "reasoning",
          text: event.text,
          completed: false,
          durationMs: event.durationMs,
        });
      }

      return {
        ...state,
        status: "running",
        pieces: currentPieces,
        activeReasoningId: activeId,
      };
    }

    case "DELTA": {
      const currentPieces = [...state.pieces];
      let activeReasoningId = state.activeReasoningId;
      if (activeReasoningId) {
        const rIdx = currentPieces.findIndex((p) => p.id === activeReasoningId);
        if (rIdx >= 0 && currentPieces[rIdx].kind === "reasoning") {
          currentPieces[rIdx] = { ...currentPieces[rIdx], completed: true } as ReasoningPiece;
        }
        activeReasoningId = null;
      }

      let activeDeltaId = state.activeDeltaId;
      const canAppend = !event.startsMessage && activeDeltaId;
      const dIdx = canAppend ? currentPieces.findIndex((p) => p.id === activeDeltaId) : -1;

      if (dIdx >= 0 && currentPieces[dIdx].kind === "delta") {
        const existing = currentPieces[dIdx] as DeltaPiece;
        currentPieces[dIdx] = {
          ...existing,
          text: existing.text + event.text,
        };
      } else {
        activeDeltaId = `delta_${Date.now()}_${currentPieces.length}`;
        currentPieces.push({
          id: activeDeltaId,
          kind: "delta",
          text: event.text,
          messageId: event.messageId,
        });
      }

      return {
        ...state,
        status: "running",
        pieces: currentPieces,
        activeReasoningId,
        activeDeltaId,
      };
    }

    case "TOOL_START": {
      const currentPieces = [...state.pieces];
      let activeReasoningId = state.activeReasoningId;
      if (activeReasoningId) {
        const rIdx = currentPieces.findIndex((p) => p.id === activeReasoningId);
        if (rIdx >= 0 && currentPieces[rIdx].kind === "reasoning") {
          currentPieces[rIdx] = { ...currentPieces[rIdx], completed: true } as ReasoningPiece;
        }
        activeReasoningId = null;
      }

      currentPieces.push({
        id: event.id,
        kind: "tool",
        name: event.name,
        target: event.target,
        status: "running",
        ok: null,
        detail: event.detail,
      });

      return {
        ...state,
        status: "running",
        pieces: currentPieces,
        activeReasoningId,
        activeDeltaId: null,
      };
    }

    case "TOOL_DONE": {
      const currentPieces = state.pieces.map((p) => {
        if (p.id === event.id && p.kind === "tool") {
          return {
            ...p,
            status: event.ok === false ? ("error" as const) : ("completed" as const),
            ok: event.ok,
            detail: event.detail ?? p.detail,
          };
        }
        return p;
      });

      return {
        ...state,
        pieces: currentPieces,
      };
    }

    case "SHELL_START": {
      const currentPieces = [...state.pieces];
      currentPieces.push({
        id: event.id,
        kind: "shell",
        command: event.command,
        output: "",
        status: "running",
        exitCode: null,
      });
      return {
        ...state,
        pieces: currentPieces,
        activeDeltaId: null,
      };
    }

    case "SHELL_OUTPUT": {
      const currentPieces = state.pieces.map((p) => {
        if (p.id === event.id && p.kind === "shell") {
          return { ...p, output: p.output + event.text };
        }
        return p;
      });
      return { ...state, pieces: currentPieces };
    }

    case "SHELL_DONE": {
      const currentPieces = state.pieces.map((p) => {
        if (p.id === event.id && p.kind === "shell") {
          return { ...p, status: "completed" as const, exitCode: event.exitCode ?? 0 };
        }
        return p;
      });
      return { ...state, pieces: currentPieces };
    }

    case "PERMISSION_REQUEST": {
      const currentPieces = [...state.pieces];
      currentPieces.push({
        id: `perm_${event.requestId}`,
        kind: "permission",
        requestId: event.requestId,
        toolName: event.toolName,
        target: event.target,
        status: "pending",
      });
      return {
        ...state,
        status: "waiting_permission",
        pieces: currentPieces,
      };
    }

    case "PERMISSION_RESOLVE": {
      const currentPieces = state.pieces.map((p) => {
        if (p.kind === "permission" && p.requestId === event.requestId) {
          return {
            ...p,
            status: event.decision === "allow" ? ("allowed" as const) : ("denied" as const),
          };
        }
        return p;
      });
      return {
        ...state,
        status: "running",
        pieces: currentPieces,
      };
    }

    case "FINISH": {
      const currentPieces = state.pieces.map((p) => {
        if (p.kind === "reasoning" && !p.completed) {
          return { ...p, completed: true };
        }
        return p;
      });
      return {
        ...state,
        status: "settled",
        pieces: currentPieces,
        activeReasoningId: null,
        activeDeltaId: null,
      };
    }

    case "ERROR": {
      return {
        ...state,
        status: "error",
        error: event.error,
        activeReasoningId: null,
        activeDeltaId: null,
      };
    }

    case "RESET": {
      return createInitialTurnState();
    }

    default:
      return state;
  }
}
