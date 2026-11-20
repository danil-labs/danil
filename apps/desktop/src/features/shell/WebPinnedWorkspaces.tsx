import { createResource, For, onCleanup } from "solid-js";
import { capabilities } from "../../lib/platform";
import { distinguish } from "../../web/workspace-picker";
import { MarcaDeWorkspace } from "./WorkspaceMarks";

export function WebPinnedWorkspaces(props: { shown: readonly { id: string }[] }) {
  const session = capabilities().webWorkspaces;
  const picker = capabilities().webWorkspacePicker;
  const [pinned, { refetch }] = createResource(async () => picker?.pinned().catch(() => []) ?? []);
  const update = () => { if (!document.hidden) void refetch(); };
  const stop = picker?.subscribe(update);
  window.addEventListener("focus", update);
  document.addEventListener("visibilitychange", update);
  onCleanup(() => { stop?.(); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); });
  const current = (sub: string, org: string) => sub === capabilities().webAccounts?.current.user_id && org === session?.organization?.();
  return <For each={pinned()?.filter(row => !current(row.sub, row.org) || !props.shown.some(item => item.id === row.engine_workspace_id))}>{row => {
    const label = () => [row.name, distinguish(pinned() ?? [], row)].filter(Boolean).join(" · ");
    return <button type="button" data-web-pinned-workspace={row.engine_workspace_id} aria-label={label()} title={label()}
      aria-pressed={current(row.sub, row.org) && session?.active() === row.account_id}
      disabled={!current(row.sub, row.org) || session?.busy() || session?.uncertain()}
      class="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface text-label font-semibold hover:bg-neutral-200"
      onClick={() => session?.choose(row.account_id)}><MarcaDeWorkspace name={row.name} /></button>;
  }}</For>;
}
