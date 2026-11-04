import { type ComponentProps, createEffect, createSignal, on, Show } from "solid-js";
import GitBranch from "lucide-solid/icons/git-branch";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { HEADER_HEIGHT } from "../../lib/window";
import type { SenderTask } from "../../lib/recipients";
import { Button } from "../../ui/Button";
import { asFailure, FailureNote } from "../../ui/Failure";
import Sessions, { type SessionRow } from "../projects/Sessions";
import { DelegatedSkeleton } from "./DelegatedSkeleton";
import { delegatedRailRows } from "./delegatedRail";
import { type TaskTreeRow, taskDescendants } from "@terminus/tasks";
import { taskPriority } from "@terminus/design";
import { delegatedAttention } from "./delegatedRail";

export { delegatedAttention } from "./delegatedRail";
export { delegatedFamilies } from "@terminus/tasks";

export type DelegatedListProps = Omit<ComponentProps<typeof Sessions>, "sessions" | "flat" | "card" | "hoverCardPlacement" | "includeArchived" | "groupByAuthor" | "groupByHandler">;

export function delegatedDescendants(rows: SessionRow[], root: TaskTreeRow): SessionRow[] {
  return taskDescendants(rows, [root]);
}

/**
 * Las delegadas con la tarjeta del riel (`taskCard`): estado y título; proveedor, máquina, agente y PR.
 *
 * Sin carpeta: viven en la de su madre. No se pasa `carpetaDe` (aunque la traiga la lista) y se pide `hideFolder`.
 */
export function DelegatedTaskList(props: {
  rows: SessionRow[];
  list: (folder: string) => DelegatedListProps;
  readOnly?: boolean;
  hoverCardPlacement?: "left-start" | "right-start";
}) {
  const folderOf = (id: string) => props.rows.find(row => row.id === id)?.folder ?? "";
  const base = (): DelegatedListProps => ({ ...props.list(props.rows[0]?.folder ?? ""), carpetaDe: undefined });
  return <Sessions {...base()} card hoverCardPlacement={props.hoverCardPlacement} sessions={props.rows} includeArchived readOnly={props.readOnly}
    groupByAuthor={false} groupByHandler={false} hideFolder
    projectOf={row => row.folder ?? ""}
    destinosDe={row => props.list(row.folder ?? "").destinos}
    onPick={id => props.list(folderOf(id)).onPick(id)}
    onDelete={id => props.list(folderOf(id)).onDelete(id)}
    onMove={(id, to) => props.list(folderOf(id)).onMove(id, to)}
    onEtapa={(id, stage) => props.list(folderOf(id)).onEtapa(id, stage)}
    onRenombrar={(id, title) => props.list(folderOf(id)).onRenombrar(id, title)}
    onPin={base().onPin ? (id, pinned) => props.list(folderOf(id)).onPin?.(id, pinned) : undefined} />;
}

export function DelegatedLaunch(props: {
  reference: SenderTask;
  rows: SessionRow[];
  list: (folder: string) => DelegatedListProps;
  loading: boolean;
  error?: unknown;
}) {
  const row = () => props.rows.find(row => row.id === props.reference.task);
  const referenceRow = (): SessionRow => ({
    id: props.reference.task, folder: props.reference.folder, title: props.reference.title,
    provider: props.reference.provider, model: props.reference.model ?? null, refs: [],
    created_at: 0, updated_at: 0, turns: 0, parent: null, subagent: null,
    esperando: false, stage: null, agent: null, parent_agent: null, chat_de_agente: false,
  });
  return <div data-delegated-launch={props.reference.task} class="my-2 min-w-0 border-l border-border pl-2">
    <Show when={row() || !props.loading} fallback={<DelegatedSkeleton />}>
      <DelegatedTaskList rows={[row() ?? referenceRow(), ...taskDescendants(props.rows, [row() ?? referenceRow()])]} list={props.list} readOnly={!row()} />
      <Show when={!row()}><p class="m-0 px-2 pt-1 text-xs text-neutral-500">
        {props.error ? t("chat.delegation.failed") : t("chat.delegation.unavailable")}
      </p></Show>
    </Show>
  </div>;
}

/** El sitio del botón de delegadas cuando no hay ninguna: apagado, para que la barra no cambie de forma. */
export function DelegatedNone() {
  return <Button type="button" variant="chrome" size="iconCompact"
    class="relative size-[30px] cursor-default text-neutral-500 opacity-60 hover:bg-transparent"
    data-delegated-trigger="toolbar" aria-disabled="true"
    aria-label={t("chat.delegation.none")} title={t("chat.delegation.none")}>
    <GitBranch size={14} aria-hidden="true" />
  </Button>;
}

export type DelegatedPanelModel = {
  context: string;
  rows: SessionRow[];
  list: (folder: string) => DelegatedListProps;
  live: string[];
  approvals: string[];
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
  onDismiss: () => void;
};

export function DelegatedToolbar(props: { model: DelegatedPanelModel; pressed: boolean; onClick: () => void }) {
  const rows = () => delegatedRailRows(props.model.rows, true, props.model.live, props.model.approvals);
  return <Show when={rows().length || props.model.error} fallback={<DelegatedNone />}>
    <Button type="button" variant={props.pressed ? "secondary" : "chrome"} size="iconCompact"
      class="relative size-[30px] text-neutral-500"
      data-delegated-trigger="toolbar"
      aria-pressed={props.pressed}
      aria-label={t("chat.delegation.open", { count: rows().length })}
      title={t("chat.delegation.open", { count: rows().length })}
      onClick={props.onClick}>
      <GitBranch size={14} aria-hidden="true" />
      <span class="absolute -right-0.5 -bottom-0.5 min-w-3 rounded bg-surface-raised px-0.5 text-[9px] leading-3 tabular-nums">{rows().length}</span>
    </Button>
  </Show>;
}

/** La lista de delegadas, en la ventana de la tarea: filtros en la caja de 30 px. */
export function DelegatedPanel(props: { model: () => DelegatedPanelModel | undefined }) {
  const [all, setAll] = createSignal(false);
  const data = () => props.model();
  createEffect(on(() => data()?.context, () => setAll(false)));
  const rows = () => {
    const model = data();
    return model ? delegatedRailRows(model.rows, true, model.live, model.approvals) : [];
  };
  const active = () => rows().filter(row => taskPriority(delegatedAttention([row], data()?.live ?? [], data()?.approvals ?? [])));
  // «Activas» son solo las que te necesitan o siguen trabajando, sin sus madres de contexto.
  const shown = () => all() ? rows() : active();
  return <>
    <div class={cn("flex shrink-0 items-center justify-between gap-2 border-b border-border px-2", HEADER_HEIGHT)} aria-label={t("chat.delegation.heading")}>
      <span class="min-w-0 truncate text-xs font-medium">{t("chat.delegation.total", { count: rows().length })}</span>
      <div class="flex shrink-0 gap-1" role="group" aria-label={t("chat.delegation.filter")}>
        <Button size="sm" variant="ghost" class="h-6 px-2 text-xs aria-pressed:bg-surface-muted aria-pressed:text-neutral-950" aria-pressed={!all()} onClick={() => setAll(false)}>{t("chat.delegation.activity")}</Button>
        <Button size="sm" variant="ghost" class="h-6 px-2 text-xs aria-pressed:bg-surface-muted aria-pressed:text-neutral-950" aria-pressed={all()} onClick={() => setAll(true)}>{t("chat.delegation.all")}</Button>
      </div>
    </div>
    <div data-delegated-list class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
      <Show when={data()?.error}>{error => <><FailureNote f={asFailure(error())} /><Button variant="ghost" size="sm" onClick={() => data()?.onRetry()}>{t("chat.delegation.retry")}</Button></>}</Show>
      <Show when={shown().length} fallback={data()?.loading ? <DelegatedSkeleton /> : <p class="m-0 px-2 py-3 text-xs text-neutral-500">{t("chat.delegation.idle")}</p>}>
        <DelegatedTaskList rows={shown()} hoverCardPlacement="left-start" list={folder => {
          const model = data();
          return { ...model!.list(folder), onPick: id => {
            model!.onDismiss();
            model!.list(folder).onPick(id);
          } };
        }} />
      </Show>
    </div>
  </>;
}
