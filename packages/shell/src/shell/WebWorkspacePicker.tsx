import LoaderCircle from "lucide-solid/icons/loader-circle";
import LogIn from "lucide-solid/icons/log-in";
import { Pressable } from "../../../ui/src/Pressable";
import type { WorkspaceAddLink } from "../../../session/src/workspace-add-link";
import { createEffect, createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { cn } from "../../../ui/src/lib/utils";
import { RAIL_MENU_ITEM } from "./rail-menu";
import type { PickerOrg, PickerRow, WorkspacePicker } from "../../../session/src/workspace-picker";

const rowClass = cn(RAIL_MENU_ITEM, "flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 disabled:cursor-default");
const sectionLabel = "m-0 px-1 pb-1 text-caption font-semibold text-neutral-600";
const markClass = "grid size-8 shrink-0 place-items-center rounded-md text-label font-semibold";
const pillClass = "ml-auto shrink-0 rounded-full px-2.5 py-1 text-caption font-semibold";

export function WebWorkspacePicker(props: { picker: WorkspacePicker; fromHarness?: WorkspaceAddLink | null; onHarnessAttempt?: () => void; close: () => void; add: (row: PickerRow) => Promise<void> }) {
  const [catalogFailed, setCatalogFailed] = createSignal(false);
  const [data, { refetch }] = createResource<Awaited<ReturnType<WorkspacePicker["catalog"]>> | undefined>(async (_, { value }) => {
    try {
      const result = await props.picker.catalog();
      setCatalogFailed(false);
      return result;
    } catch {
      setCatalogFailed(true);
      return value;
    }
  });
  const [admittingOrg, setAdmittingOrg] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const refresh = () => { if (!document.hidden) void refetch(); };
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  onCleanup(() => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); });
  const nameOf = (org: PickerOrg) => org.organization || org.email || t("shell.workspaces.label");
  const subtitleOf = (org: PickerOrg) => {
    const repeated = (data.latest?.organizations.filter(other => nameOf(other) === nameOf(org)).length ?? 0) > 1;
    return [nameOf(org), repeated && org.email ? org.email : ""].filter(Boolean).join(" · ");
  };
  const stateOf = (org: PickerOrg) => org.catalog_state === "empty" ? t("shell.workspaces.catalog_empty") : org.catalog_state === "unavailable" ? t("shell.workspaces.catalog_unavailable") : "";
  const sections = createMemo(() => {
    const result = data.latest;
    const ready: { org: PickerOrg; rows: PickerRow[] }[] = [];
    const pending: PickerOrg[] = [];
    const empty: PickerOrg[] = [];
    for (const org of result?.organizations ?? []) {
      const rows = result?.rows.filter(row => row.session === org.session && row.org === org.org) ?? [];
      if (org.catalog_state === "empty") empty.push(org);
      else if (org.admission_required) pending.push(org);
      else if (rows.length) ready.push({ org, rows });
      else empty.push(org);
    }
    return { ready, pending, empty };
  });
  async function choose(row?: PickerRow) {
    if (busy()) return;
    setError(""); setBusy(true);
    try {
      if (row) { await props.picker.add(row, props.add); props.close(); }
      else await props.picker.connect();
    } catch { setError(row ? "shell.workspaces.add_failed" : "shell.workspaces.connect_failed"); void refetch(); }
    finally { setBusy(false); }
  }
  createEffect(() => {
    const target = props.fromHarness;
    const result = data();
    if (!target || !result) return;
    props.onHarnessAttempt?.();
    const matches = result.rows.filter((row) => row.org === target.organization && row.account_id === target.accountId
      && (!target.person || row.sub === target.person) && (!target.workspace || row.engine_workspace_id === target.workspace));
    if (matches.length === 1 && matches[0].engine_workspace_id) void choose(matches[0]);
  });
  async function admit(org: PickerOrg) {
    if (busy()) return;
    setError("");
    setBusy(true);
    setAdmittingOrg(org.org);
    try {
      if (await props.picker.admit(org) === "redirected") return;
      void refetch();
    } catch {
      setError("shell.workspaces.admission_failed");
    }
    setAdmittingOrg(undefined);
    setBusy(false);
  }
  const catalogError = () => catalogFailed() || data.latest?.partial;
  return <div data-web-workspace-picker="">
    <p class="m-0 border-b border-border px-3 py-2.5 text-label font-semibold">{t("shell.workspaces.add")}</p>
    <div class="max-h-64 space-y-2 overflow-y-auto p-3">
      <Show when={!data.latest && data.loading}>
        <div class="animate-pulse space-y-2" role="status" aria-label={t("shell.workspaces.danil_loading")}>
          <For each={[0, 1]}>{() => <div class="space-y-1">
            <div aria-hidden="true" class="h-2.5 w-24 rounded bg-surface-muted" />
            <div aria-hidden="true" class="flex items-center gap-2.5 rounded-lg border border-border p-2.5">
              <div class="size-8 shrink-0 rounded-md bg-surface-muted" />
              <div class="flex-1 space-y-1.5">
                <div class="h-2.5 w-3/4 rounded bg-surface-muted" />
                <div class="h-2 w-1/2 rounded bg-surface-muted" />
              </div>
              <div class="h-5 w-14 shrink-0 rounded-full bg-surface-muted" />
            </div>
          </div>}</For>
        </div>
      </Show>
      <Show when={error() || catalogError()}>
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-error/25 bg-error/10 px-2.5 py-2 text-caption text-error-strong">
          <p role="alert" class="m-0">{t(error() || "shell.workspaces.catalog_error")}</p>
          <Show when={catalogError()}>
            <Pressable role="menuitem" class="rounded px-1.5 py-1 font-semibold hover:bg-error/10 focus-visible:outline-error" disabled={busy() || data.loading} onClick={() => void refetch()}>
              {t("common.part.retry")}
            </Pressable>
          </Show>
        </div>
      </Show>
      <Show when={data.latest?.organizations.length === 0}>
        <p role="status" class="m-0 text-caption text-neutral-600">{t("shell.workspaces.no_accessible")}</p>
      </Show>
      <For each={sections().ready}>{({ org, rows }) => <section>
        <p class={sectionLabel}>{subtitleOf(org)}</p>
        <div class="space-y-1">
          <For each={rows}>{row =>
            <Pressable role="menuitem" data-picker-workspace="" data-picker-org={org.org} disabled={busy()} class={rowClass} onClick={() => void choose(row)}>
              <span aria-hidden="true" class={cn(markClass, "bg-primary/10 text-primary")}>{row.name.slice(0, 1).toUpperCase()}</span>
              <span class="min-w-0 flex-1 truncate font-medium">{row.name}</span>
              <span class={cn(pillClass, "bg-surface-muted text-neutral-800")}>{t("shell.workspaces.picker_add")}</span>
            </Pressable>
          }</For>
        </div>
      </section>}</For>
      <Show when={sections().pending.length}>
        <section>
          <p class={sectionLabel}>{t("shell.workspaces.picker_requires_access")}</p>
          <div class="space-y-1">
            <For each={sections().pending}>{org =>
              <Pressable role="menuitem" data-picker-organization={org.org} aria-label={t("shell.workspaces.admit") + " " + subtitleOf(org)} aria-busy={admittingOrg() === org.org} disabled={busy()} class={rowClass} onClick={() => void admit(org)}>
                <span aria-hidden="true" class={cn(markClass, "border border-dashed border-border-strong bg-surface-muted text-neutral-700")}>{nameOf(org).slice(0, 1).toUpperCase()}</span>
                <span class="flex min-w-0 flex-1 flex-col text-left">
                  <span class="truncate font-medium">{subtitleOf(org)}</span>
                  <span class="truncate text-caption text-neutral-600">{admittingOrg() === org.org
                    ? t("shell.workspaces.picker_opening_access")
                    : stateOf(org) || t("shell.workspaces.picker_enable_access")}</span>
                </span>
                <span class={cn(pillClass, "bg-primary/10 text-primary")}>
                  <Show when={admittingOrg() === org.org} fallback={t("shell.workspaces.admit")}>
                    <LoaderCircle size={14} class="animate-spin" aria-hidden="true" />
                  </Show>
                </span>
              </Pressable>
            }</For>
          </div>
        </section>
      </Show>
      <For each={sections().empty}>{org =>
        <p data-picker-state={org.catalog_state} class="m-0 flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2 text-caption text-neutral-600">
          <span class="min-w-0 truncate">{subtitleOf(org)}</span><span class="shrink-0">{stateOf(org) || t("shell.workspaces.catalog_empty")}</span>
        </p>
      }</For>
    </div>
    <Show when={props.picker.canConnect}>
      <div class="border-t border-border p-2">
        <Pressable role="menuitem" data-picker-account="" disabled={busy()} class={cn(RAIL_MENU_ITEM, "flex items-center gap-2")} onClick={() => void choose()}>
          <LogIn size={15} aria-hidden="true" />
          {t("shell.workspaces.connect_account")}
        </Pressable>
      </div>
    </Show>
  </div>;
}
