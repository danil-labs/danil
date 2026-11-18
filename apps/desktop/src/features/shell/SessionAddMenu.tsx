import { createSignal, For, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { cn } from "../../lib/utils";
import { TITULO_DE_GRUPO } from "../../ui/ContextMenu";
import { ITEM_DE_MENU } from "../../ui/Popover";
import { matchesName } from "./hidden-workspaces";
import { emptyReasonKey, refusalEmptyReason } from "./session-empty";
import type { sessionRail } from "./session-groups";
import { freeSessionRow } from "./session-rail-view";
import WorkspaceSearch, { SEARCH_FROM } from "./WorkspaceSearch";

type Rail = ReturnType<typeof sessionRail>;
const NOTE = "m-0 px-2 py-1.5 text-caption text-neutral-500";
const isError = (key: string) => ["danil.error.too_many_contexts", "shell.workspaces.sessions_auth", "shell.workspaces.sessions_failed"].includes(key);
const errorKey = (e: unknown) => {
  const empty = refusalEmptyReason(e);
  if (empty) return emptyReasonKey(empty);
  const detail = (e as { detail?: string } | null)?.detail;
  return detail === "too_many_contexts" ? "danil.error.too_many_contexts" : detail === "organization_auth_required" ? "shell.workspaces.sessions_auth" : detail === "cancelled" ? "shell.workspaces.sessions_cancelled" : "shell.workspaces.sessions_failed";
};

export function SessionAddEntries(props: { sessions: Rail; signedIn: boolean; onStep: () => void }) {
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const run = async (action: () => Promise<unknown>) => {
    if (busy()) return;
    setBusy(true);
    setError(null);
    try { await action(); } catch (e) {
      setError(errorKey(e));

    }
    finally { setBusy(false); }
  };
  return <>
    <button type="button" role="menuitem" class={ITEM_DE_MENU} disabled={busy()} data-add-danil-step="" onClick={() => {
      if (props.sessions.groups()?.length || props.signedIn) { props.onStep(); props.sessions.refresh(); }
      else void run(props.sessions.sessions.addAccount);
    }}>{t("shell.workspaces.add_danil")}</button>
    <Show when={props.sessions.groups()?.some((g) => (g.available_contexts ?? 0) > 0)}><p role="status" class={NOTE}>{t("shell.workspaces.new_available")}</p></Show>
    <Show when={(props.sessions.groups()?.length ?? 0) > 0}>
      <button type="button" role="menuitem" class={ITEM_DE_MENU} disabled={busy()} onClick={() => void run(props.sessions.sessions.addAccount)}>{t("shell.workspaces.add_session")}</button>
    </Show>
    <Show when={error()}>{(key) => <p role={isError(key()) ? "alert" : "status"} class={cn(NOTE, isError(key()) && "text-error-strong")}>{t(key())}</p>}</Show>
  </>;
}

export function SessionAddStep(props: { sessions: Rail; context?: string | null; query: string; onQuery: (s: string) => void; onClose: () => void; onOpen: (id: string) => void }) {
  const [error, setError] = createSignal<string | null>(null);
  const [creating, setCreating] = createSignal(false);
  const createFree = async (context: string) => {
    if (creating()) return;
    setCreating(true); setError(null);
    try { const id = await props.sessions.createFree(context); props.onClose(); props.onOpen(id); }
    catch (e) { setError(errorKey(e)); }
    finally { setCreating(false); }
  };
  const groups = () => (props.sessions.groups() ?? []).filter((g) => !props.context || g.context_id === props.context);
  const size = () => groups().reduce((n, g) => n + (g.available?.length ?? 0), 0);
  return <div data-danil-workspaces="">
    <Show when={error()}>{(key) => <p role="alert" class="m-0 px-2 py-1.5 text-caption text-error-strong">{t(key())}</p>}</Show>
    <Show when={size() >= SEARCH_FROM}><WorkspaceSearch value={props.query} onInput={props.onQuery} /></Show>
    <div class="max-h-64 overflow-y-auto p-0.5">
      <For each={groups()}>{(g) => <div data-session-context={g.context_id}>
        <p class={cn("m-0", TITULO_DE_GRUPO)}>{g.email} · {g.org_name ?? g.org}</p>
        <Show when={g.empty_reason}>{(reason) => <p role="status" class={NOTE}>{t(emptyReasonKey(reason()))}</p>}</Show>
        <Show when={!g.added?.has(g.free?.id ?? "") && freeSessionRow(g)}><button type="button" role="menuitem" class={ITEM_DE_MENU} disabled={creating()} onClick={() => void createFree(g.context_id)}>{t("shell.workspaces.free_workspace")}</button></Show>
        <Show when={g.available} fallback={<p class={NOTE}>{t("shell.workspaces.danil_loading")}</p>}>
          <For each={(g.available ?? []).filter((w) => w.id !== freeSessionRow(g)?.id && !g.added?.has(w.id) && matchesName(w.name, props.query))}>{(w) => <button type="button" role="menuitem" class={cn(ITEM_DE_MENU, "flex min-w-0 items-center gap-2")} aria-label={t("shell.workspaces.add_named", { name: w.name })} data-add-danil={w.id} onClick={() => { props.sessions.add(g.context_id, w.id); props.onClose(); props.onOpen(w.id); }}><span class="min-w-0 flex-1 truncate">{w.name}</span><span class="shrink-0 text-caption text-neutral-500">{t("shell.workspaces.add_row")}</span></button>}</For>
        </Show>
      </div>}</For>
    </div>
  </div>;
}

export const usesSessionMenu = (rail: Rail, signedIn: boolean) => capabilities().nativeWindow && (rail.groups() !== null || !signedIn);
