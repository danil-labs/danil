import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { ITEM_DE_MENU } from "../../../ui/src/Popover";
import type { PickerOrg, PickerRow, WorkspacePicker } from "../../../../apps/desktop/src/web/workspace-picker";

/**
 * Una sola lista (plan modelo Slack § 20): los workspaces de Danil que la persona ya puede abrir,
 * con la organización como subtítulo, y una fila por organización que todavía requiere admisión.
 * No hay una segunda pantalla de organizaciones: elegir una fila de organización admite solo esa y
 * la lista se relee. `catalog_state` separa «sin workspaces accesibles» de «no se pudo comprobar».
 */
export function WebWorkspacePicker(props: { picker: WorkspacePicker; close: () => void; add: (row: PickerRow) => Promise<void> }) {
  const [data, { refetch }] = createResource(() => props.picker.catalog());
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const refresh = () => { if (!document.hidden) void refetch(); };
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  onCleanup(() => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); });
  const nameOf = (org: PickerOrg) => org.organization || org.email || t("shell.workspaces.label");
  /** La organización como subtítulo; si dos correos comparten nombre, el correo la distingue. */
  const subtitleOf = (org: PickerOrg) => {
    const repeated = (data()?.organizations.filter(other => nameOf(other) === nameOf(org)).length ?? 0) > 1;
    return [nameOf(org), repeated && org.email ? org.email : ""].filter(Boolean).join(" · ");
  };
  const stateOf = (org: PickerOrg) => org.catalog_state === "empty" ? t("shell.workspaces.catalog_empty") : org.catalog_state === "unavailable" ? t("shell.workspaces.catalog_unavailable") : "";
  const rowsOf = (org: PickerOrg) => data()?.rows.filter(row => row.session === org.session && row.org === org.org) ?? [];
  async function choose(row?: PickerRow) {
    if (busy()) return;
    setError(""); setBusy(true);
    try {
      if (row) { await props.picker.add(row, props.add); props.close(); }
      else await props.picker.connect();
    } catch { setError(row ? "shell.workspaces.add_failed" : "shell.workspaces.connect_failed"); void refetch(); }
    finally { setBusy(false); }
  }
  async function admit(org: PickerOrg) {
    if (busy()) return;
    setError(""); setBusy(true);
    try { await props.picker.admit(org); void refetch(); }
    catch { setError("shell.workspaces.admission_failed"); void refetch(); }
    finally { setBusy(false); }
  }
  return <div data-web-workspace-picker="">
    <p class="m-0 px-2 py-1.5 text-label font-semibold">{t("shell.workspaces.add")}</p>
    <Show when={data.loading}><p role="status">{t("shell.workspaces.danil_loading")}</p></Show>
    <Show when={data.error || (!data.loading && data()?.partial)}>
      <p role="alert">{t("shell.workspaces.catalog_error")}</p>
      <button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => void refetch()}>{t("common.part.retry")}</button>
    </Show>
    <Show when={!data.loading && !data.error && data()}>{result => <>
      <Show when={!result().organizations.length}><p role="status">{t("shell.workspaces.no_accessible")}</p></Show>
      <div class="max-h-64 overflow-y-auto">
        <For each={result().organizations}>{org =>
          <Show when={org.admission_required && org.catalog_state !== "empty"} fallback={
            <Show when={rowsOf(org).length} fallback={
              <p data-picker-state={org.catalog_state} class="m-0 px-2 py-1.5 text-caption text-neutral-500">{nameOf(org)}<span class="block truncate">{stateOf(org)}</span></p>
            }>
              <For each={rowsOf(org)}>{row =>
                <button type="button" role="menuitem" data-picker-workspace="" data-picker-org={org.org} disabled={busy()} class={ITEM_DE_MENU} onClick={() => void choose(row)}>
                  <span class="flex min-w-0 flex-col text-left"><span class="truncate">{row.name}</span>
                    <span class="truncate text-caption text-neutral-500">{subtitleOf(org)}</span></span>
                </button>
              }</For>
            </Show>
          }>
            <button type="button" role="menuitem" data-picker-organization={org.org} aria-label={t("shell.workspaces.admit") + " " + nameOf(org)} disabled={busy()} class={ITEM_DE_MENU} onClick={() => void admit(org)}>
              <span class="flex min-w-0 flex-col text-left"><span class="truncate">{nameOf(org)}</span>
                <span class="truncate text-caption text-neutral-500">{t("shell.workspaces.admission_required")}{stateOf(org) ? " · " + stateOf(org) : ""}</span></span>
            </button>
          </Show>
        }</For>
      </div>
    </>}</Show>
    <Show when={error()}>{key => <p role="alert">{t(key())}</p>}</Show>
    <Show when={props.picker.canConnect}><button type="button" role="menuitem" data-picker-account="" disabled={busy()} class={ITEM_DE_MENU} onClick={() => void choose()}>{t("shell.workspaces.connect_account")}</button></Show>
  </div>;
}
