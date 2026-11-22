import { createSignal, For, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { TITULO_DE_GRUPO } from "../../ui/ContextMenu";
import { KeyedList } from "../../ui/KeyedList";
import { RAIL_MENU_ITEM } from "./rail-menu";
import { matchesName } from "./hidden-workspaces";
import { emptyReasonKey } from "./session-empty";
import { freeSessionRow } from "./session-rail-view";
import type { sessionRail } from "./session-groups";
import WorkspaceSearch, { SEARCH_FROM } from "./WorkspaceSearch";
import { WorkspaceSourceStatus } from "./WorkspaceSourceStatus";

type Rail = ReturnType<typeof sessionRail>;
const NOTE = "m-0 px-2 py-1.5 text-caption text-neutral-500";
export function SessionAddStep(props: { sessions: Rail; context?: string | null; query: string; onQuery: (s: string) => void; onClose: () => void; onOpen: (id: string, context?: string) => void }) {
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  async function add(context: string, workspace: string, materialize = false) {
    if (busy()) return;
    setBusy(true);
    setError(null);
    try {
      if (materialize) await props.sessions.materializeFree(context);
      else await props.sessions.addAdmitted(context, workspace);
      props.onClose();
      props.onOpen(workspace, context);
    } catch {
      setError("shell.workspaces.add_failed");
    } finally {
      setBusy(false);
    }
  }
  const groups = () => (props.sessions.groups() ?? []).filter((g) => !props.context || g.context_id === props.context);
  const size = () => groups().reduce((n, g) => n + (g.available?.length ?? 0), 0);
  return <div data-danil-workspaces="">
    <Show when={error()}>{(key) => <p role="alert" class="m-0 px-2 py-1.5 text-caption text-error-strong">{t(key())}</p>}</Show>
    <Show when={size() >= SEARCH_FROM}><WorkspaceSearch value={props.query} onInput={props.onQuery} /></Show>
    <div class="max-h-64 overflow-y-auto p-0.5">
      <KeyedList each={groups()} by={(g) => g.context_id}>{(g) => <div data-session-context={g().context_id}>
        <p class={cn("m-0", TITULO_DE_GRUPO)}>{g().email} · {g().org_name ?? g().org}</p>
        <Show when={g().empty_reason}>{(reason) => <p role="status" class={NOTE}>{t(emptyReasonKey(reason()))}</p>}</Show>
        <Show when={freeSessionRow(g()) && !g().added?.has(g().free?.id ?? "") && !g().available?.some((w) => w.id === g().free?.id) ? freeSessionRow(g()) : null}>{(workspace) =>
          <button type="button" role="menuitem" class={RAIL_MENU_ITEM} disabled={busy()} data-add-danil={workspace().id} onClick={() => void add(g().context_id, workspace().id, true)}>{workspace().name}</button>
        }</Show>
        <Show when={g().available} fallback={<WorkspaceSourceStatus organization={g().org_name ?? g().org} available={g().available} onRetry={() => props.sessions.refreshContext(g().context_id)} />}>
          <For each={(g().available ?? []).filter((w) => !g().added?.has(w.id) && matchesName(w.name, props.query))}>{(w) => <button type="button" role="menuitem" class={cn(RAIL_MENU_ITEM, "flex min-w-0 items-center gap-2")} aria-label={t("shell.workspaces.add_named", { name: w.name })} data-add-danil={w.id} disabled={busy()} onClick={() => void add(g().context_id, w.id)}><span class="min-w-0 flex-1 truncate">{w.name}</span><span class="shrink-0 text-caption text-neutral-500">{t("shell.workspaces.add_row")}</span></button>}</For>
        </Show>
      </div>}</KeyedList>
    </div>
  </div>;
}
