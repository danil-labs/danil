import { type Accessor, createMemo, createSignal, Show } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { KeyedList } from "../../../ui/src/KeyedList";
import { ITEM_DE_MENU, Popover, PopoverAnchor, PopoverContent } from "../../../ui/src/Popover";
import { contextAttentionStale } from "../../../features/machines/src/index";
import { cerrarConEscape as createEscapeCloser } from "../../../features/settings/src/index";
import { menuArrows } from "./AddWorkspaceMenu";
import { type TaskAttention, topState } from "./attention";
import { webOrganizationAttention } from "./GroupOrganizationWatch";
import { OrganizationAccountMenu } from "./OrganizationAccountMenu";
import { OrganizationPositionMenu } from "./OrganizationPositionMenu";
import { OrganizationStack } from "./OrganizationStack";
import { OrganizationWorkspaceTile } from "./OrganizationWorkspaceTile";
import { watchOrganizationCredits } from "./organization-credits-watch";
import type { OrgTile, RailOrganization } from "./organization-rail-model";
import { confirmEmailClose, emailContextCount } from "./session-close-confirm";
import { emptyReasonKey } from "./session-empty";
import type { sessionRail } from "./session-groups";
import { WebOrganizationStep } from "./WebOrganizationStep";
export type OrganizationRailActions = { sessions: Pick<ReturnType<typeof sessionRail>["sessions"], "sendOptional" | "families" | "close" | "closeEmail">; remove: ReturnType<typeof sessionRail>["remove"] };

import { AttentionBadge } from "./WorkspaceMarks";

export function OrganizationRailGroup(props: { org: RailOrganization; web?: boolean; stacked: boolean; sessions: OrganizationRailActions; active: { workspace: string; context: string } | null; tasksOf: (id: string, context: string) => TaskAttention[]; staleOf?: (id: string, context: string) => boolean; stateLabel: (state: ReturnType<typeof topState>) => string; onOpen: (tile: OrgTile) => void; onManage: () => void; onChange: (action: "pin" | "up" | "down") => void; index: number; count: number; credits: ReturnType<typeof watchOrganizationCredits> }) {
  const [menu, setMenu] = createSignal<{ key: string; stack: boolean; target: HTMLElement; rect: DOMRect } | null>(null);
  const [promo, setPromo] = createSignal<string | null>(null);
  const [organizationPicker, setOrganizationPicker] = createSignal(false);
  let returnFocus: HTMLElement | undefined;
  const tile = () => props.org.tiles.find((row) => row.key === menu()?.key);
  const accountRows = createMemo(() => menu()?.stack ? props.org.contexts.map((context) => ({ ...(props.org.tiles.find((row) => row.context.context_id === context.context_id) ?? props.org.tiles[0]), context })) : tile() ? [tile()!] : []);
  const active = (row: OrgTile) => props.active?.workspace === row.id && props.active.context === row.context.context_id;
  const dismiss = () => { setMenu(null); setPromo(null); setOrganizationPicker(false); };
  const show = (row: OrgTile, target: HTMLElement, stack = false) => { setPromo(null); setOrganizationPicker(false); returnFocus = target; setMenu({ key: row.key, stack, target, rect: target.getBoundingClientRect() }); };
  const stale = () => props.org.tiles.some((row) => contextAttentionStale(row.context.context_id) || props.staleOf?.(row.id, row.context.context_id));
  const state = () => topState(props.org.tiles.flatMap((row) => props.tasksOf(row.id, row.context.context_id)));
  createEscapeCloser(() => menu() !== null, () => dismiss());
  const closeEmail = async (email: string | null, context: string) => {
    const group = props.org.contexts.find((row) => row.context_id === context);
    if (!group) return;
    if (!confirmEmailClose(emailContextCount(props.sessions.sessions.families(), email, group.family), (count) => t("shell.workspaces.close_email_confirm", { count, email: email ?? "" }), window.confirm.bind(window))) return;
    await props.sessions.sessions.closeEmail(email, group.family);
  };
  const render = (row: Accessor<OrgTile>) => <OrganizationWorkspaceTile stale={contextAttentionStale(row().context.context_id) || props.staleOf?.(row().id, row().context.context_id)} tile={row()} active={active(row())} state={topState(props.tasksOf(row().id, row().context.context_id))} stateLabel={props.stateLabel(topState(props.tasksOf(row().id, row().context.context_id)))} credits={props.credits} send={props.sessions.sessions.sendOptional} onOpen={() => props.onOpen(row())} onMenu={(target) => show(row(), target)} onMove={(step) => props.onChange(step === -1 ? "up" : "down")} />;
  return <>
    <Show when={props.stacked} fallback={<KeyedList each={props.org.tiles} by={(row) => row.key}>{render}</KeyedList>}>
      <OrganizationStack organization={props.org} stale={stale()} state={state()} stateLabel={stale() ? t("shell.rail.attention_stale") : props.stateLabel(state())} badge={AttentionBadge} render={render} onPin={() => props.onChange("pin")} onMove={(step) => props.onChange(step === -1 ? "up" : "down")} onContextMenu={(event) => { event.preventDefault(); const first = props.org.tiles[0]; if (first) show(first, event.currentTarget as HTMLElement, true); }} />
    </Show>
    <Popover open={!!menu() && !!tile()} onOpenChange={(open) => { if (!open) dismiss(); }} placement="right-start" gutter={4}>
      <PopoverAnchor style={{ position: "fixed", left: `${menu()?.rect.left ?? 0}px`, top: `${menu()?.rect.top ?? 0}px`, width: `${menu()?.rect.width ?? 0}px`, height: `${menu()?.rect.height ?? 0}px`, "pointer-events": "none" }} />
      <PopoverContent role={promo() || organizationPicker() ? undefined : "menu"} class="w-56 p-1" onKeyDown={promo() || organizationPicker() ? undefined : menuArrows} onCloseAutoFocus={(event: Event) => { event.preventDefault(); const target = returnFocus?.isConnected ? returnFocus : [...document.querySelectorAll<HTMLButtonElement>("[data-workspace-context]")].find((button) => props.org.tiles.some((row) => row.context.context_id === button.dataset.workspaceContext && row.id === button.dataset.workspaceTile)) ?? document.querySelector<HTMLButtonElement>("[data-add-workspace]"); target?.focus(); }}>
        <Show when={!organizationPicker()} fallback={<WebOrganizationStep onClose={dismiss} />}>
          <Show when={menu()?.stack && accountRows().length > 1 && !promo()}><OrganizationPositionMenu pinned={props.org.pinned} index={props.index} count={props.count} onPin={() => { props.onChange("pin"); dismiss(); }} onMove={(step) => props.onChange(step === -1 ? "up" : "down")} /></Show>
          <KeyedList each={accountRows().filter((row) => !promo() || row.context.context_id === promo())} by={(row) => row.context.context_id}>{(row) => <OrganizationAccountMenu
            web={props.web} stack={menu()?.stack} organizationControls={!menu()?.stack || accountRows().length === 1}
            group={{ context: row().context.context_id, org: props.org.id, name: props.org.name, plan: row().context.plan, role: row().context.role }}
            notice={<><Show when={row().context.empty_reason}>{(reason) => <p role="status" class="m-0 px-2 py-1 text-caption text-neutral-500">{t(emptyReasonKey(reason()))}</p>}</Show><Show when={props.web && webOrganizationAttention()}><p role="status" class="m-0 px-2 py-1 text-caption text-neutral-500">{t("shell.workspaces.web_organization_required")}</p><button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => setOrganizationPicker(true)}>{t("shell.workspaces.choose_organization")}</button></Show></>}
            email={row().context.email} workspace={row().name} canHide={!active(row())} pinned={props.org.pinned} index={props.index} count={props.count} promo={promo() === row().context.context_id}
            send={props.sessions.sessions.sendOptional} onPromo={() => setPromo(row().context.context_id)}
            onOpen={() => { props.onOpen(row()); dismiss(); }} onManage={() => { dismiss(); props.onManage(); }}
            onHide={() => { void props.sessions.remove(row().context.context_id, row().id); dismiss(); }}
            onPin={() => { props.onChange("pin"); dismiss(); }} onMove={(step) => props.onChange(step === -1 ? "up" : "down")}
            onCloseOrg={(context) => props.sessions.sessions.close({ context })} onCloseEmail={closeEmail} onDismiss={dismiss}
          />}</KeyedList>
        </Show>
      </PopoverContent>
    </Popover>
  </>;
}
