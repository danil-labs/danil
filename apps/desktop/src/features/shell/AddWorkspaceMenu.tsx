import Eye from "lucide-solid/icons/eye";
import Plus from "lucide-solid/icons/plus";
import { type Component, createEffect, For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { capabilities } from "../../lib/platform";
import { WebWorkspacePicker } from "./WebWorkspacePicker";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { SEPARADOR_DE_MENU, TITULO_DE_GRUPO } from "../../ui/ContextMenu";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import { AccountReturnFeedback } from "./AccountReturnFeedback";
import { createAddWorkspaceMenuState } from "./add-workspace-menu-state";
import { type AttentionState, type TaskAttention, topState } from "./attention";
import { DanilAddEntry, type DanilMenu, DanilStep, DanilSwitchRows } from "./DanilAddMenu";
import { matchesName } from "./hidden-workspaces";
import { menuArrows, showKeepingFocus } from "./menu-focus";
import { SessionAddEntries, SessionAddStep, usesSessionMenu } from "./SessionAddMenu";
import { SessionEmptyNotice } from "./SessionEmptyNotice";
import type { sessionRail } from "./session-groups";
import { openRequestedSessionMenu } from "./session-menu-open";
import WorkspaceSearch, { SEARCH_FROM } from "./WorkspaceSearch";

export { menuArrows };

type Hidden = { id: string; name: string };
/** El «+» del riel: agregar uno de Danil y, debajo, los ocultos para abrirlos o devolverlos a la barra. */
export default function AddWorkspaceMenu(props: {
  danil: DanilMenu;
  sessions: ReturnType<typeof sessionRail>;
  hidden: Hidden[];
  open: string | null;
  tasksOf: (id: string) => TaskAttention[];
  badge: Component<{ state: AttentionState; class?: string }>;
  /** Cómo se dice un estado junto al nombre, para quien no ve el distintivo. */
  labelOf: (state: AttentionState) => string;
  onOpen: (id: string, context?: string) => void;
  onShow: (id: string) => void;
}) {
  const picker = () => capabilities().webWorkspacePicker;
  const resume = picker()?.resume() ?? null;
  const { open, setOpen, step, setStep, context, setContext, query, setQuery, close } = createAddWorkspaceMenuState();
  if (resume) setOpen(true);
  createEffect(() => openRequestedSessionMenu(props.sessions, { context: setContext, step: setStep, open: setOpen }));
  /** Del «+» web: lo agrega a `added` de su contexto y lo abre con su sesión, sin escribir nada global. */
  async function addPicked(row: { context: string; engine_workspace_id?: string | null }) {
    if (!row.engine_workspace_id) throw new Error("workspace_not_available");
    await props.sessions.addAdmitted(row.context, row.engine_workspace_id);
    props.onOpen(row.engine_workspace_id, row.context);
  }
  const rows = () => props.hidden.filter((w) => matchesName(w.name, query()));
  // El abierto ya enseña su distintivo en su cuadro; los de Danil sin agregar también avisan.
  const waiting = () => topState([...props.hidden, ...(props.danil.toAdd ?? [])].filter((w) => w.id !== props.open).flatMap((w) => props.tasksOf(w.id)));
  const label = () => {
    const state = waiting();
    return state ? t("shell.workspaces.add_hidden_state", { state: props.labelOf(state) }) : t("shell.workspaces.add");
  };
  return (<>
    <AccountReturnFeedback sessions={props.sessions} onOpen={props.onOpen} />
    <Popover
      open={open()}
      onOpenChange={(value) => (value ? setOpen(true) : close())}
      placement="right-start"
      gutter={4}
    >
      <PopoverTrigger
        type="button"
        data-add-workspace=""
        data-attention={waiting() ?? undefined}
        class="relative mt-1 grid size-8 shrink-0 place-items-center rounded-md border border-dashed border-neutral-500 text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label={label()}
        title={label()}
      >
        <Plus size={16} aria-hidden="true" />
        <Show when={waiting()}>{(s) => <Dynamic component={props.badge} state={s()} class="absolute -top-1 -right-1" />}</Show>
      </PopoverTrigger>
      <PopoverContent role="menu" class="w-64 p-1" onKeyDown={menuArrows}>
        <Show when={picker()} fallback={<>
        <SessionEmptyNotice sessions={props.sessions} />
        <Show
          when={step() === "menu"}
          fallback={props.sessions.groups() !== null ? <SessionAddStep sessions={props.sessions} context={context()} query={query()} onQuery={setQuery} onClose={close} onOpen={props.onOpen} /> : <DanilStep danil={props.danil} query={query()} onQuery={setQuery} tasksOf={props.tasksOf} badge={props.badge} onClose={close} />}
        >
          <Show when={usesSessionMenu(props.sessions, props.danil.signedIn)} fallback={<DanilAddEntry danil={props.danil} web={!!picker()} onStep={() => (setContext(null), setStep("danil"))} />}><SessionAddEntries sessions={props.sessions} signedIn={props.danil.signedIn} onStep={() => (setContext(null), setStep("danil"))} onClose={close} /></Show>
          <Show when={props.sessions.groups() === null}><DanilSwitchRows danil={props.danil} onClose={close} /></Show>
          <Show when={props.hidden.length > 0}>
            <span aria-hidden="true" class={cn(SEPARADOR_DE_MENU, "block")} />
            <p class={cn("m-0", TITULO_DE_GRUPO)}>{t("shell.workspaces.hidden_title")}</p>
            <Show when={props.hidden.length >= SEARCH_FROM}>
              <WorkspaceSearch value={query()} onInput={setQuery} />
            </Show>
            <div class="max-h-64 overflow-y-auto p-0.5" data-hidden-workspaces="">
              <For each={rows()}>
                {(w) => {
                  const state = () => (w.id === props.open ? null : topState(props.tasksOf(w.id)));
                  const name = () => w.name || t("shell.directory.unnamed");
                  return (
                    <div class="flex items-center gap-0.5" data-hidden-workspace={w.id}>
                      <button
                        type="button"
                        role="menuitem"
                        class={cn(ITEM_DE_MENU, "flex min-w-0 flex-1 items-center gap-2")}
                        aria-label={state() ? t("shell.workspaces.tile_with_state", { name: name(), state: props.labelOf(state() as AttentionState) }) : name()}
                        title={name()}
                        onClick={() => {
                          close();
                          props.onOpen(w.id);
                        }}
                      >
                        <span class="min-w-0 flex-1 truncate">{name()}</span>
                        <Show when={state()}>{(s) => <Dynamic component={props.badge} state={s()} />}</Show>
                      </button>
                      <button
                        type="button"
                        class="grid size-7 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
                        aria-label={t("shell.workspaces.show", { name: name() })}
                        title={t("shell.workspaces.show", { name: name() })}
                        data-show-workspace={w.id}
                        onClick={(e) => showKeepingFocus(e.currentTarget.closest<HTMLElement>("[data-hidden-workspace]") as HTMLElement, () => props.onShow(w.id))}
                      >
                        <Eye size={13} aria-hidden="true" />
                      </button>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>
        </>}>{web => <WebWorkspacePicker picker={web()} close={close} add={addPicked} />}</Show>
      </PopoverContent>
    </Popover></>
  );
}
