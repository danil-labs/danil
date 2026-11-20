import { createResource, For } from "solid-js";
import { capabilities } from "../../lib/platform";
import { MarcaDeWorkspace } from "./WorkspaceMarks";

/** Una preferencia del riel se guarda por id del motor. La selección web usa la cuenta del catálogo. */
export function WebPinnedWorkspaces(props: { shown: readonly { id: string }[] }) {
  const session = capabilities().webWorkspaces;
  const picker = capabilities().webWorkspacePicker;
  const [pinned] = createResource(() => {
    const org = session?.organization?.();
    const rows = session?.rows();
    return picker && org && rows?.length ? { org, rows } : null;
  }, async ({ org, rows }) => picker!.pinned(org, rows).catch(() => []));
  return <For each={pinned()?.filter(row => !props.shown.some(item => item.id === row.engine_workspace_id))}>{row =>
    <button type="button" data-web-pinned-workspace={row.engine_workspace_id} aria-label={row.name} title={row.name}
      aria-pressed={session?.active() === row.id} disabled={session?.busy() || session?.uncertain()}
      class="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface text-label font-semibold hover:bg-neutral-200"
      onClick={() => session?.choose(row.id)}><MarcaDeWorkspace name={row.name} /></button>
  }</For>;
}
