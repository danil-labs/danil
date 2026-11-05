import { machineOf } from "../machines/store";
import { invoke } from "../../lib/invoke.ts";
import { listen } from "../../lib/serviceEvents";
import { Show, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { FailureNote, asFailure, type Failure } from "../../ui/Failure";
import BaseBranchPicker from "./BaseBranchPicker";

export type TaskWork = {
  history: {
    archived: boolean;
    events: { kind: string; when: number; commit: string | null }[];
    recovery: { commit: string; when: number } | null;
  };
  branch: string | null;
  alias: string | null;
  path: string;
  available: boolean;
  owned: boolean;
  restorable: boolean;
  recreatable: boolean;
  incomplete: boolean;
};

export function createTaskWork(
  scope: () => { project: string; id: string } | undefined,
  onFailure?: (failure: Failure) => void,
) {
  const target = createMemo(scope, undefined, {
    equals: (a, b) => a?.project === b?.project && a?.id === b?.id,
  });
  const result = createResource(target, (value) =>
    invoke<TaskWork>("task_history", value, machineOf(value.id))
      // Sin historial no es el estado de una tarea: una falla que llegó como valor.
      .then((work) => (work && typeof work === "object" && "history" in work ? work : undefined))
      .catch((e) => {
        onFailure?.(asFailure(e));
        return undefined;
      }),
  );
  onMount(() => {
    const stop = listen<{ project: string; session: string }>("session", (e) => {
      const current = target();
      if (current && e.payload.project === current.project && e.payload.session === current.id) void result[1].refetch();
    });
    onCleanup(() => void stop.then((f) => f()));
    const tasksChanged = (event: Event) => {
      const project = (event as CustomEvent<{ project: string }>).detail?.project;
      if (target()?.project === project) void result[1].refetch();
    };
    window.addEventListener("harness:tasks-changed", tasksChanged);
    onCleanup(() => window.removeEventListener("harness:tasks-changed", tasksChanged));
  });
  return result;
}

export function ResumeTask(props: { project: string; id: string; onChanged: () => void }) {
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  async function resume() {
    if (busy()) return;
    setBusy(true);
    setFailure(null);
    try {
      await invoke("recreate_task_work", { project: props.project, id: props.id }, machineOf(props.id));
      props.onChanged();
    } catch (e) {
      setFailure(asFailure(e));
    } finally {
      setBusy(false);
    }
  }
  return <div class="grid w-full gap-2 p-3 text-sm">
    <p class="m-0 text-neutral-500">{t("history.resume_description")}</p>
    <BaseBranchPicker project={props.project} preference disabled={busy()} />
    <Button variant="outline" disabled={busy()} onClick={() => void resume()}>{t("history.resume")}</Button>
    <Show when={failure()}>{(f) => <FailureNote f={f()} />}</Show>
  </div>;
}
