import Pin from "lucide-solid/icons/pin";
import { type Accessor, type Component, createSignal, type JSX, onCleanup, Show, untrack } from "solid-js";
import { t } from "../../lib/i18n";
import { KeyedList } from "../../ui/KeyedList";
import { Popover, PopoverAnchor, PopoverContent } from "../../ui/Popover";
import type { AttentionState } from "./attention";
import type { OrgTile, RailOrganization } from "./organization-rail-model";
import "./organization-stack.css";

export function OrganizationStack(props: { organization: RailOrganization; state: AttentionState | null; stateLabel: string; badge: Component<{ state: AttentionState; class?: string }>; render: (tile: Accessor<OrgTile>) => JSX.Element; onPin: () => void; onContextMenu: (event: MouseEvent | KeyboardEvent) => void; onMove?: (step: -1 | 1) => void }) {
  const [open, setOpen] = createSignal(false);
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const [reduced, setReduced] = createSignal(motion.matches);
  const motionChanged = () => setReduced(motion.matches);
  motion.addEventListener("change", motionChanged);
  onCleanup(() => motion.removeEventListener("change", motionChanged));
  let trigger: HTMLButtonElement | undefined;
  let panel: HTMLDivElement | undefined;
  let opening: ReturnType<typeof setTimeout> | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;
  let restoring = false;
  const cancel = () => { clearTimeout(opening); clearTimeout(closing); };
  const close = (focus = false) => {
    cancel(); setOpen(false);
    if (focus) { restoring = true; trigger?.focus(); queueMicrotask(() => { restoring = false; }); }
  };
  const leave = () => { cancel(); closing = setTimeout(() => { if (document.activeElement !== trigger && !panel?.contains(document.activeElement)) close(); }, 300); };
  const buttons = () => [...(panel?.querySelectorAll<HTMLButtonElement>('button[data-workspace-tile], button[data-org-pin]') ?? [])];
  const enter = () => { cancel(); setOpen(true); queueMicrotask(() => buttons()[0]?.focus()); };
  const arrows = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const rows = buttons(); const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    rows[(at + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length]?.focus();
  };
  onCleanup(cancel);
  return <Popover modal={false} open={open()} onOpenChange={setOpen} placement="bottom-start" flip={false} slide overlap fitViewport gutter={4}>
    <PopoverAnchor class="w-full"><button ref={trigger} type="button" data-org-stack={props.organization.id} class="relative grid h-10 w-full place-items-center outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary" aria-haspopup="menu" aria-expanded={open()} aria-label={`${t("shell.rail.stack_label", { org: props.organization.name, n: props.organization.tiles.length })}: ${props.stateLabel}`} onPointerEnter={() => { cancel(); opening = setTimeout(() => setOpen(true), 150); }} onPointerLeave={leave} onFocus={() => { if (!restoring) { cancel(); setOpen(true); } }} onBlur={() => { queueMicrotask(() => { if (!panel?.contains(document.activeElement) && document.activeElement !== trigger) close(); }); }} onClick={() => { cancel(); setOpen(true); }} onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); props.onContextMenu(event); return; } if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); props.onMove?.(event.key === "ArrowUp" ? -1 : 1); return; } if (["ArrowDown", "Enter", " "].includes(event.key)) { event.preventDefault(); enter(); } }} onContextMenu={(event) => props.onContextMenu(event)}>
      <span aria-hidden="true" class="organization-stack-mark danil-mark relative grid size-8 place-items-center rounded-md border border-border bg-surface text-label font-semibold text-neutral-700">{[...props.organization.name.trim()][0]?.toUpperCase() ?? "?"}<Show when={props.state}>{(state) => <props.badge state={state()} class="absolute -top-1 -right-1" />}</Show></span>
    </button></PopoverAnchor>
    <PopoverContent ref={panel} role="menu" class="flex w-12 flex-col items-center gap-1 overflow-y-auto p-1" data-org-stack-panel={props.organization.id} data-reduced-motion={reduced() ? "" : undefined} onInteractOutside={(event: CustomEvent<{ originalEvent: Event }>) => { if (trigger?.contains(event.detail.originalEvent.target as Node | null)) event.preventDefault(); }} onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()} onEscapeKeyDown={(event: KeyboardEvent) => { event.preventDefault(); close(true); }} onKeyDown={arrows} onPointerEnter={cancel} onPointerLeave={leave} onBlur={(event: FocusEvent) => { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) close(); }}>
      <KeyedList each={props.organization.tiles} by={(tile) => tile.key}>{(tile) => { const contents = untrack(() => props.render(tile)); return <div class="organization-stack-row w-10" data-row-context={tile().context.context_id} style={{ "--org-row-index": props.organization.tiles.findIndex((row) => row.key === tile().key) }} onClick={() => close()}>{contents}</div>; }}</KeyedList>
      <button type="button" role="menuitem" data-org-pin={props.organization.id} class="grid size-8 place-items-center rounded-md text-neutral-500 outline-none hover:bg-neutral-200 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary" aria-label={t("shell.rail.pin_named", { name: props.organization.name })} onClick={() => { close(true); props.onPin(); }}><Pin size={14} aria-hidden="true" /></button>
    </PopoverContent>
  </Popover>;
}
