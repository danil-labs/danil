import { createSignal, Show } from "solid-js";
import type { GroupSend } from "../../../../apps/desktop/src/lib/group-account";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../../ui/src/Tooltip";
import type { AttentionState } from "./attention";
import { NewAccountTile } from "./NewAccountTile";
import { OrganizationWorkspaceTooltip } from "./OrganizationWorkspaceTooltip";
import type { watchOrganizationCredits } from "./organization-credits-watch";
import { organizationLogo } from "./organization-logo";
import type { OrgTile } from "./organization-rail-model";
import { AttentionBadge, MarcaDeWorkspace } from "./WorkspaceMarks";

export function OrganizationWorkspaceTile(props: { tile: OrgTile; stale?: boolean; active: boolean; state: AttentionState | null; stateLabel: string; send: GroupSend; credits: ReturnType<typeof watchOrganizationCredits>; onOpen: () => void; onMenu: (target: HTMLElement) => void; onMove: (step: -1 | 1) => void }) {
  const [hover, setHover] = createSignal(false);
  return <NewAccountTile id={props.tile.id}><TooltipRoot openDelay={RETARDO_TOOLTIP} placement="right" gutter={6} onOpenChange={setHover}>
    <TooltipTrigger as="button" type="button" data-workspace-tile={props.tile.id} data-workspace-context={props.tile.context.context_id} data-attention={props.state ?? undefined} data-attention-stale={props.stale ? "" : undefined} aria-current={props.active ? "true" : undefined} aria-label={`${props.tile.name}, ${props.tile.context.email ?? ""}${props.stale ? `: ${t("shell.rail.attention_stale")}` : props.stateLabel ? `: ${props.stateLabel}` : ""}`} class="marca-seleccion group relative grid h-10 w-full shrink-0 place-items-center outline-none select-none" onClick={() => props.onOpen()} onContextMenu={(event: MouseEvent) => { event.preventDefault(); props.onMenu(event.currentTarget as HTMLElement); }} onKeyDown={(event: KeyboardEvent) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); props.onMenu(event.currentTarget as HTMLElement); } else if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); props.onMove(event.key === "ArrowUp" ? -1 : 1); } }}>
      <span aria-hidden="true" data-active={props.active ? "" : undefined} class={cn("danil-mark relative grid size-8 place-items-center rounded-md border text-label font-semibold group-focus-visible:outline-solid group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary", props.active ? "border-border-strong bg-surface-raised text-neutral-950" : "border-border bg-surface text-neutral-700 group-hover:bg-neutral-200 group-hover:text-neutral-950")}>
        <span class="absolute inset-0 overflow-hidden rounded-[inherit]"><span class="relative grid size-full place-items-center"><MarcaDeWorkspace id={props.tile.id} name={props.tile.name} logo={props.tile.logo} load={() => organizationLogo(props.tile.context.context_id, props.tile.id, props.tile.logo)} /></span></span>
        <Show when={props.state}>{(state) => <AttentionBadge state={state()} class="absolute -top-1 -right-1" />}</Show>
      </span>
    </TooltipTrigger>
    <TooltipContent><OrganizationWorkspaceTooltip stale={props.stale} tile={props.tile} active={hover()} send={props.send} credits={props.credits} /></TooltipContent>
  </TooltipRoot></NewAccountTile>;
}
