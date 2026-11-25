import { createSignal, onCleanup, onMount, untrack } from "solid-js";
import { callShellEngine } from "../../../session/src/shell-queries.ts";
import { listen } from "../../../host/src/serviceEvents.ts";
import { machineOf } from "../../../features/machines/src/queries/store";
import { contextAttentionOf, mergeContextAttention } from "./context-attention";

/** Espejo de `workspace/attention.rs`. El orden es la prioridad. */
const ATTENTION_STATES = ["approving", "asked", "failed", "unseen"] as const;
export type AttentionState = (typeof ATTENTION_STATES)[number];

export type TaskAttention = { session: string; project: string; state: AttentionState };
export type WorkspaceAttention = { context?: string; stale?: boolean; workspace: string; tasks: TaskAttention[] };

/** Un servicio más nuevo puede mandar un estado que esta ventana no sabe pintar. */
const known = (list: WorkspaceAttention[]) =>
  list.map((w) => ({ ...w, tasks: w.tasks.filter((task) => ATTENTION_STATES.includes(task.state)) }));

/** El estado más urgente de un workspace, o `null` si nada lo espera. */
export function topState(tasks: TaskAttention[]): AttentionState | null {
  return ATTENTION_STATES.find((state) => tasks.some((task) => task.state === state)) ?? null;
}

/**
 * Lo que espera a la persona en cada workspace. Se pide al montar, al mudarse
 * de workspace y al reponerse el servicio (`harness:service-resync`): un
 * evento emitido con el transporte caído no llega.
 */
export function createAttention() {
  const [list, setList] = createSignal<WorkspaceAttention[]>([]);
  let asked = 0;
  const reload = () => {
    const mine = ++asked;
    void callShellEngine<WorkspaceAttention[]>("list_workspace_attention")
      .then((next) => { if (mine === asked) setList(known(next)); })
      .catch(() => {});
  };

  onMount(() => {
    reload();
    const unlisten = listen<WorkspaceAttention[]>("attention", (e) => {
      asked++;
      // La lista entera reemplaza; una entrada suelta solo cambia su workspace.
      setList((now) => mergeContextAttention(now, known(e.payload)));
    });
    onCleanup(() => void unlisten.then((stop) => stop()));
    window.addEventListener("harness:workspace", reload);
    window.addEventListener("harness:service-resync", reload);
    onCleanup(() => {
      window.removeEventListener("harness:workspace", reload);
      window.removeEventListener("harness:service-resync", reload);
    });
  });

  const of = (workspace: string | null) => contextAttentionOf(list(), workspace);

  return {
    list,
    of,
    unseen: (workspace: string | null) =>
      new Set(of(workspace).filter((task) => task.state === "unseen" || task.state === "failed").map((task) => task.session)),
    markSeen(workspace: string, session: string) {
      void callShellEngine("mark_task_seen", { workspace, session }, untrack(() => machineOf(session))).catch(() => {});
    },
  };
}
