import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { ITEM_DE_MENU } from "../../ui/Popover";
import { distinguish, type PickerRow, type WorkspacePicker } from "../../web/workspace-picker";

export function WebWorkspacePicker(props: { picker: WorkspacePicker; close: () => void }) {
  const [data, { refetch }] = createResource(() => props.picker.catalog());
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const refresh = () => { if (!document.hidden) void refetch(); };
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  onCleanup(() => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); });
  async function choose(row?: PickerRow) {
    if (busy()) return;
    setError(""); setBusy(true);
    try {
      if (row) { await props.picker.add(row); props.close(); }
      else await props.picker.connect();
    } catch { setError(row ? "shell.workspaces.add_failed" : "shell.workspaces.connect_failed"); void refetch(); }
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
      <Show when={!result().rows.length && !result().partial}><p role="status">{t("shell.workspaces.no_accessible")}</p></Show>
      <div class="max-h-64 overflow-y-auto"><For each={result().rows}>{row =>
        <button type="button" role="menuitem" data-picker-workspace="" disabled={busy()} class={ITEM_DE_MENU} onClick={() => void choose(row)}>
          <span class="flex min-w-0 flex-col text-left"><span class="truncate">{row.name}</span>
          <Show when={distinguish(result().rows, row)}>{label => <span class="text-caption text-neutral-500">{label()}</span>}</Show></span>
        </button>
      }</For></div>
    </>}</Show>
    <Show when={error()}>{key => <p role="alert">{t(key())}</p>}</Show>
    <Show when={props.picker.canConnect}><button type="button" role="menuitem" data-picker-account="" disabled={busy()} class={ITEM_DE_MENU} onClick={() => void choose()}>{t("shell.workspaces.connect_account")}</button></Show>
  </div>;
}
