import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { Spinner } from "../../ui/Spinner";
import { Toast, ToastPortal } from "../../ui/Toast";
import { distinguish, type PickerRow } from "../../web/workspace-picker";
import { webOrganizationDeps } from "./web-organization-deps";
import { openInOrganization, pinnedTarget } from "./web-organization-open";
import { MarcaDeWorkspace } from "./WorkspaceMarks";

/**
 * Los workspaces fijados de la persona en otras organizaciones o cuentas. Uno de otra organización
 * de la misma persona cambia la organización de la página y se abre; uno de otra cuenta dice cómo
 * entrar con ella. Solo se desactiva mientras la sesión está ocupada o incierta.
 */
export function WebPinnedWorkspaces(props: { shown: readonly { id: string }[] }) {
  const session = capabilities().webWorkspaces;
  const picker = capabilities().webWorkspacePicker;
  const [pinned, { refetch }] = createResource(async () => picker?.pinned().catch(() => []) ?? []);
  const [opening, setOpening] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<{ text: string; error: boolean } | null>(null);
  const update = () => { if (!document.hidden) void refetch(); };
  const stop = picker?.subscribe(update);
  window.addEventListener("focus", update);
  document.addEventListener("visibilitychange", update);
  onCleanup(() => { stop?.(); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); });
  const me = () => capabilities().webAccounts?.current.user_id;
  const targetOf = (row: PickerRow) => pinnedTarget(row, me(), session?.organization?.());
  const otherAccount = (row: PickerRow) => t("shell.workspaces.pinned_other_account", { email: row.email || row.sub });
  async function open(row: PickerRow) {
    if (opening()) return;
    setNotice(null);
    const target = targetOf(row);
    if (target === "here") { session?.choose(row.account_id); return; }
    if (target === "account") { setNotice({ text: otherAccount(row), error: false }); return; }
    setOpening(row.account_id);
    try { await openInOrganization({ account_id: row.account_id, org: row.org, row }, webOrganizationDeps()); return; } // La página recarga o va al login: el indicador sigue.
    catch { setNotice({ text: t("shell.workspaces.pinned_switch_failed"), error: true }); }
    setOpening(null);
  }
  return <>
    <For each={pinned()?.filter(row => targetOf(row) !== "here" || !props.shown.some(item => item.id === row.engine_workspace_id))}>{row => {
      const label = () => [row.name, distinguish(pinned() ?? [], row)].filter(Boolean).join(" · ");
      const title = () => targetOf(row) === "account" ? `${label()} · ${otherAccount(row)}` : label();
      return <button type="button" data-web-pinned-workspace={row.account_id} data-web-pinned-target={targetOf(row)} aria-label={label()} title={title()}
        aria-pressed={targetOf(row) === "here" && session?.active() === row.account_id} aria-busy={opening() === row.account_id}
        disabled={session?.busy() || session?.uncertain()}
        class="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface text-label font-semibold hover:bg-neutral-200"
        onClick={() => void open(row)}>
        <Show when={opening() === row.account_id} fallback={<MarcaDeWorkspace name={row.name} />}><Spinner size={14} label={t("shell.workspaces.pinned_switching")} /></Show>
      </button>;
    }}</For>
    <Show when={notice()}>{shown => <ToastPortal><Toast tone={shown().error ? "error" : "status"} data-web-pinned-notice="" onDismiss={() => setNotice(null)}>{shown().text}</Toast></ToastPortal>}</Show>
  </>;
}
