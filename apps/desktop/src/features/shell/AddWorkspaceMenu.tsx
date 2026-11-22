import { watchWorkspaceAddLinks } from "../../lib/native-workspace-add-link";
import Eye from "lucide-solid/icons/eye";
import FolderPlus from "lucide-solid/icons/folder-plus";
import LogIn from "lucide-solid/icons/log-in";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
import { type Component, createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { canRedeemPromo } from "../../lib/promo-role";
import { capabilities } from "../../lib/platform";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { SEPARADOR_DE_MENU, TITULO_DE_GRUPO } from "../../ui/ContextMenu";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import { CreateWorkspaceProDialog } from "./CreateWorkspaceProDialog";
import { AccountReturnFeedback } from "./AccountReturnFeedback";
import { createAddWorkspaceMenuState } from "./add-workspace-menu-state";
import { type AttentionState, type TaskAttention, topState } from "./attention";
import { menuArrows, showKeepingFocus } from "./menu-focus";
import { openHarnessWorkspaces, RAIL_MENU_ICON, RAIL_MENU_ITEM } from "./rail-menu";
import { SessionAddStep } from "./SessionAddMenu";
import type { sessionRail } from "./session-groups";
import { openRequestedSessionMenu } from "./session-menu-open";
import { WebWorkspacePicker } from "./WebWorkspacePicker";

import type { RailWorkspaceTarget } from "./remove-rail-workspace";

export default function AddWorkspaceMenu(props: {
  sessions: ReturnType<typeof sessionRail>;
  hidden: RailWorkspaceTarget[];
  open: string | null;
  activeContext?: string | null;
  tasksOf: (id: string) => TaskAttention[];
  badge: Component<{ state: AttentionState; class?: string }>;
  labelOf: (state: AttentionState) => string;
  onOpen: (id: string, context?: string) => void;
  onShow: (workspace: RailWorkspaceTarget) => void;
  onRemove: (workspace: RailWorkspaceTarget) => void;
}) {
  const picker = capabilities().webWorkspacePicker;
  const { open, setOpen, step, setStep, context, setContext, query, setQuery, close } = createAddWorkspaceMenuState();
  const [proOpen, setProOpen] = createSignal(false);
  const [fromHarness, setFromHarness] = createSignal(picker?.takeHarnessWorkspace());
  if (picker?.resume() || fromHarness()) { setStep("danil"); setOpen(true); }
  createEffect(() => openRequestedSessionMenu(props.sessions, { context: setContext, step: setStep, open: setOpen }));
  function add() {
    if (picker) { setStep("danil"); return; }
    close();
    void props.sessions.sessions.addAccount().catch(() => {});
  }
  if (capabilities().nativeWindow) {
    let mounted = true;
    const stop = watchWorkspaceAddLinks((link) => {
      if (!mounted) return;
      void props.sessions.addFromHarness(link).then((target) => {
        if (target) props.onOpen(target.id, target.context);
        else add();
      }).catch(() => add());
    }).catch(() => undefined);
    onCleanup(() => { mounted = false; void stop.then((unsubscribe) => unsubscribe?.()); });
  }
  async function addPicked(row: { context: string; engine_workspace_id?: string | null }) {
    if (!row.engine_workspace_id) throw new Error("workspace_not_available");
    await props.sessions.addAdmitted(row.context, row.engine_workspace_id);
    props.onOpen(row.engine_workspace_id, row.context);
  }
  const waiting = () => topState(props.hidden.filter((w) => w.id !== props.open).flatMap((w) => props.tasksOf(w.id)));
  const label = () => {
    const state = waiting();
    return state ? t("shell.workspaces.add_hidden_state", { state: props.labelOf(state) }) : t("shell.workspaces.add");
  };
  const createOrganization = () => {
    const eligible = (props.sessions.groups() ?? []).filter((group) =>
      (group.plan === "pro" || group.plan === "team" || group.plan === "enterprise")
      && !group.empty_reason && canRedeemPromo(group.role));
    return (eligible.find((group) => group.context_id === props.activeContext) ?? eligible[0])?.org;
  };
  const canUpsell = () => !createOrganization() && props.sessions.groups()?.some((group) => group.plan === "free" && !group.empty_reason);
  const entry = cn(RAIL_MENU_ITEM, "flex items-center gap-2");
  return <>
    <CreateWorkspaceProDialog open={proOpen()} close={() => setProOpen(false)} />
    <AccountReturnFeedback sessions={props.sessions} onOpen={props.onOpen} />
    <Popover open={open()} onOpenChange={(value) => value ? setOpen(true) : close()} placement="right-start" gutter={4}>
      <PopoverTrigger type="button" data-add-workspace="" data-attention={waiting() ?? undefined}
        class="relative mt-1 grid size-8 shrink-0 place-items-center rounded-md border border-dashed border-neutral-500 text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:bg-neutral-200"
        aria-label={label()} title={label()}>
        <Plus size={16} aria-hidden="true" />
        <Show when={waiting()}>{(s) => <Dynamic component={props.badge} state={s()} class="absolute -top-1 -right-1" />}</Show>
      </PopoverTrigger>
      <PopoverContent role="menu" class="w-64 p-1" onKeyDown={menuArrows}>
        <Show when={step() === "menu"} fallback={picker
          ? <WebWorkspacePicker picker={picker} fromHarness={fromHarness()} onHarnessAttempt={() => setFromHarness(null)} close={close} add={addPicked} />
          : <SessionAddStep sessions={props.sessions} context={context()} query={query()} onQuery={setQuery} onClose={close} onOpen={props.onOpen} />}>
          <button type="button" role="menuitem" class={entry} data-add-danil-step="" onClick={add}>
            <LogIn size={15} aria-hidden="true" />
            <span>{t("shell.workspaces.add_danil")}<small class="block text-caption text-neutral-500">{t("shell.workspaces.add_subtitle")}</small></span>
          </button>
          <Show when={createOrganization()}>{(organization) =>
            <button type="button" role="menuitem" class={entry} onClick={() => { const org = organization(); close(); void openHarnessWorkspaces(org, true); }}>
              <FolderPlus size={15} aria-hidden="true" />
              <span>{t("shell.workspaces.create_in_harness")}<small class="block text-caption text-neutral-500">{t("shell.workspaces.harness_subtitle")}</small></span>
            </button>
          }</Show>
          <Show when={canUpsell()}>
            <button type="button" role="menuitem" class={entry} onClick={() => { close(); setProOpen(true); }}>
              <FolderPlus size={15} aria-hidden="true" />
              <span>{t("shell.workspaces.create_in_harness")}</span>
              <span class="ml-auto rounded-full bg-primary/20 px-2 text-caption">{t("shell.workspaces.pro_badge")}</span>
            </button>
          </Show>
          <Show when={props.hidden.length}>
            <span aria-hidden="true" class={cn(SEPARADOR_DE_MENU, "block")} />
            <p class={cn("m-0", TITULO_DE_GRUPO)}>{t("shell.workspaces.hidden_title")}</p>
            <div class="max-h-64 overflow-y-auto p-0.5" data-hidden-workspaces="">
              <For each={props.hidden}>{(workspace) => {
                const name = () => workspace.name || t("shell.directory.unnamed");
                return <div class="flex items-center gap-0.5 px-2 py-0.5" data-hidden-workspace={workspace.id}>
                  <span class="min-w-0 flex-1 truncate text-ui" title={name()}>{name()}</span>
                  <button type="button" role="menuitem" class={RAIL_MENU_ICON} aria-label={t("shell.workspaces.show", { name: name() })}
                    title={t("shell.workspaces.show_in_rail")} data-show-workspace={workspace.id}
                    onClick={(event) => {
                      const row = event.currentTarget.parentElement;
                      if (row) showKeepingFocus(row, () => props.onShow(workspace));
                    }}><Eye size={13} aria-hidden="true" /></button>
                  <button type="button" role="menuitem" class={cn(RAIL_MENU_ICON, "text-error-strong")} aria-label={t("shell.workspaces.remove_named", { name: name() })}
                    title={t("shell.workspaces.remove_workspace")} onClick={() => { close(); props.onRemove(workspace); }}>
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>;
              }}</For>
            </div>
          </Show>
        </Show>
      </PopoverContent>
    </Popover>
  </>;
}
