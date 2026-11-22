import { getTaskHistory, recreateTaskWork } from "../queries";
import { listen } from "../../../../../apps/desktop/src/lib/serviceEvents";
import { Show, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { FailureNote, asFailure, type Failure } from "../../../../ui/src/Failure";
import BaseBranchPicker from "./BaseBranchPicker";

export function createTaskWork(
  scope: () => { project: string; id: string } | undefined,
  onFailure?: (failure: Failure) => void,
) {
  const target = createMemo(scope, undefined, {
    equals: (a, b) => a?.project === b?.project && a?.id === b?.id,
  });
  const result = createResource(target, (value) =>
    getTaskHistory(value)
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
      await recreateTaskWork(props.project, props.id);
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
