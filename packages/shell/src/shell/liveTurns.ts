import { invoke } from "@tauri-apps/api/core";
import { createSignal } from "solid-js";
import { invoke as routedInvoke } from "../../../engine-client/src/client.ts";
import { t } from "../../../ui/src/lib/i18n";

export type LiveTurn = {
  session: string;
  workspace: string;
  project: string;
  started_at: number;
  shell?: { id: string; command: string };
};
type Pending = { questions: unknown[]; permissions: unknown[] };
/** `named` es falso cuando el título es el genérico «Tarea sin título». */
export type ShownTurn = LiveTurn & { title: string; named: boolean; waiting: boolean };
type Call = (cmd: string, args?: Record<string, unknown>, options?: { headers: Record<string, string> }) => Promise<unknown>;

/** Los turnos viven en el workspace que los lanzó, no en el que mira la ventana. */
const scope = (workspace: string) => ({ headers: { "x-terminus-workspace": workspace } });

export async function stopTurns(turns: LiveTurn[], call: Call = routedInvoke) {
  return await Promise.allSettled(
    turns.map((turn) =>
      turn.shell
        ? call("stop_shell_command", { session: turn.session }, scope(turn.workspace))
        : call("stop_turn", { project: turn.project, session: turn.session }, scope(turn.workspace)),
    ),
  );
}

/** El título de una tarea sale de las filas del sidebar; `CloseGuard` lo conecta al montarse. */
let titleOf: (session: string) => string | undefined = () => undefined;
export function setTurnTitles(resolve: (session: string) => string | undefined) {
  titleOf = resolve;
}

export async function titled(turns: LiveTurn[], call: Call = invoke): Promise<ShownTurn[]> {
  return Promise.all(turns.map(async (turn) => {
    const pending = (await call("pending_requests", { session: turn.session }, scope(turn.workspace)).catch(() => null)) as Pending | null;
    const title = titleOf(turn.session) ?? turn.shell?.command;
    return {
      ...turn,
      title: title ?? t("shell.close.untitled"),
      named: !!title,
      waiting: !!pending && pending.questions.length + pending.permissions.length > 0,
    };
  }));
}

export type AfterWait = "restart" | "quit";

/** La espera vive aquí para que el aviso sepa pintarse; quien la conduce es `restartWait.tsx`, que se carga al elegirla. */
export const [waitingThen, setWaitingThen] = createSignal<AfterWait | null>(null);
export const [waitRows, setWaitRows] = createSignal<ShownTurn[]>([]);
