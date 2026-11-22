import { type Accessor, createSignal, Show } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { KeyedList } from "../../../ui/src/KeyedList";
import { Popover, PopoverAnchor, PopoverContent } from "../../../ui/src/Popover";
import { contextAttentionStale } from "../../../features/machines/src/index";
import { cerrarConEscape as createEscapeCloser } from "../../../features/settings/src/index";
import type { RailWorkspaceTarget } from "./remove-rail-workspace";
import { menuArrows } from "./menu-focus";
import { type TaskAttention, topState } from "./attention";
import { OrganizationAccountMenu } from "./OrganizationAccountMenu";
import { OrganizationStack } from "./OrganizationStack";
import { OrganizationWorkspaceTile } from "./OrganizationWorkspaceTile";
import { watchOrganizationCredits } from "./organization-credits-watch";
import type { OrgTile, RailOrganization } from "./organization-rail-model";
import type { sessionRail } from "./session-groups";
export type OrganizationRailActions = { sessions: Pick<ReturnType<typeof sessionRail>["sessions"], "sendOptional"> };

import { AttentionBadge } from "./WorkspaceMarks";

export function OrganizationRailGroup(props: { org: RailOrganization; stacked: boolean; sessions: OrganizationRailActions; active: { workspace: string; context: string } | null; tasksOf: (id: string, context: string) => TaskAttention[]; staleOf?: (id: string, context: string) => boolean; stateLabel: (state: ReturnType<typeof topState>) => string; onOpen: (tile: OrgTile) => void; onHide: (workspace: RailWorkspaceTarget) => void; onRemove: (workspace: RailWorkspaceTarget) => void; onChange: (action: "pin" | "up" | "down") => void; index: number; count: number; credits: ReturnType<typeof watchOrganizationCredits> }) {
  const [menu, setMenu] = createSignal<{ key: string; rect: DOMRect } | null>(null);
  const [promo, setPromo] = createSignal(false);
  let returnFocus: HTMLElement | undefined;
  const tile = () => props.org.tiles.find((row) => row.key === menu()?.key);
  const active = (row: OrgTile) => props.active?.workspace === row.id && props.active.context === row.context.context_id;
  const dismiss = () => { setMenu(null); setPromo(false); };
  const show = (row: OrgTile, target: HTMLElement) => { setPromo(false); returnFocus = target; setMenu({ key: row.key, rect: target.getBoundingClientRect() }); };
  const stale = () => props.org.tiles.some((row) => contextAttentionStale(row.context.context_id) || props.staleOf?.(row.id, row.context.context_id));
  const state = () => topState(props.org.tiles.flatMap((row) => props.tasksOf(row.id, row.context.context_id)));
  createEscapeCloser(() => menu() !== null, () => dismiss());
  const move = (step: -1 | 1) => props.onChange(step === -1 ? "up" : "down");
  const targetOf = (row: OrgTile) => ({ id: row.id, name: row.name, context: row.context.context_id });
  const render = (row: Accessor<OrgTile>) => <OrganizationWorkspaceTile stale={contextAttentionStale(row().context.context_id) || props.staleOf?.(row().id, row().context.context_id)} tile={row()} active={active(row())} state={topState(props.tasksOf(row().id, row().context.context_id))} stateLabel={props.stateLabel(topState(props.tasksOf(row().id, row().context.context_id)))} credits={props.credits} send={props.sessions.sessions.sendOptional} onOpen={() => props.onOpen(row())} onMenu={(target) => show(row(), target)} onMove={(step) => props.onChange(step === -1 ? "up" : "down")} />;
  return <>
    <Show when={props.stacked} fallback={<KeyedList each={props.org.tiles} by={(row) => row.key}>{render}</KeyedList>}>
      <OrganizationStack organization={props.org} stale={stale()} state={state()} stateLabel={stale() ? t("shell.rail.attention_stale") : props.stateLabel(state())} badge={AttentionBadge} render={render} onPin={() => props.onChange("pin")} onMove={(step) => props.onChange(step === -1 ? "up" : "down")} />
    </Show>
    <Popover open={!!menu() && !!tile()} onOpenChange={(open) => { if (!open) dismiss(); }} placement="right-start" gutter={4}>
      <PopoverAnchor style={{ position: "fixed", left: `${menu()?.rect.left ?? 0}px`, top: `${menu()?.rect.top ?? 0}px`, width: `${menu()?.rect.width ?? 0}px`, height: `${menu()?.rect.height ?? 0}px`, "pointer-events": "none" }} />
      <PopoverContent role={promo() ? undefined : "menu"} class="w-56 p-1" onKeyDown={promo() ? undefined : menuArrows} onCloseAutoFocus={(event: Event) => { event.preventDefault(); const target = returnFocus?.isConnected ? returnFocus : [...document.querySelectorAll<HTMLButtonElement>("[data-workspace-context]")].find((button) => props.org.tiles.some((row) => row.context.context_id === button.dataset.workspaceContext && row.id === button.dataset.workspaceTile)) ?? document.querySelector<HTMLButtonElement>("[data-add-workspace]"); target?.focus(); }}>
        <Show when={tile()}>{(row) => <OrganizationAccountMenu
          group={{ context: row().context.context_id, org: props.org.id, name: props.org.name, plan: row().context.plan, role: row().context.role }}
          email={row().context.email} workspace={row().name} promo={promo()}
          send={props.sessions.sessions.sendOptional} onPromo={() => setPromo(true)}
          canMoveUp={props.index > 0} canMoveDown={props.index < props.count - 1}
          onOpen={() => { props.onOpen(row()); dismiss(); }}
          onHide={() => { props.onHide(targetOf(row())); dismiss(); }}
          onRemove={() => { props.onRemove(targetOf(row())); dismiss(); }}
          onMove={move} onDismiss={dismiss}
        />}</Show>
      </PopoverContent>
    </Popover>
  </>;
}
