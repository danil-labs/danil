import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Plus from "lucide-solid/icons/plus";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import type { AgentProfile } from "../../../ui/src/lib/model";
import { cn } from "../../../ui/src/lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../../../ui/src/ContextMenu";
import { KeyedList } from "../../../ui/src/KeyedList";
import { Pressable } from "../../../ui/src/Pressable";
import { SignalDot } from "../../../ui/src/SignalDot";
import { AstroAvatar } from "../../../features/projects/src/screens/AstroAvatar";
import { displayName } from "../../../features/projects/src/queries/profiles";
import { agentFolder, type DockAgent } from "./dockLayout";
import { DOCK_CELL, DOCK_CELL_GAP, dockColumns } from "./dockPagination";

import { createGrabScroll } from "./grabScroll";

export type { DockAgent } from "./dockLayout";
type DockFolder = { id: string; name: string };
const ICON_BUTTON = "relative grid size-4 shrink-0 place-items-center rounded-md bg-transparent p-0 text-neutral-500 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30 disabled:hover:bg-transparent";

/** Mismas palabras que la fila del agente en AgentRows. */
function dockStatusText(agent: DockAgent): string {
  if (!agent.status || agent.status === "asleep") return t("projects.sessions.agent_asleep");
  if (agent.status === "working") return agent.liveTasks > 0
    ? t("projects.sessions.agent_working", { count: agent.liveTasks })
    : t("projects.sessions.agent_working_alone");
  return agent.minutesSinceLastTurn != null
    ? t("projects.sessions.agent_awake_since", { minutes: agent.minutesSinceLastTurn })
    : t("projects.sessions.agent_awake");
}

export default function AgentDock(props: {
  agents: DockAgent[];
  selected: string | null;
  foldersOf: (name: string) => DockFolder[];
  currentFolder: string | null;
  onTalk: (project: string, name: string) => void;
  onShowTasks: (name: string) => void;
  onProfile: (project: string, name: string) => void;
  onSeeAll: () => void;
  onNewAgent?: () => void;
  profileOf?: (name: string) => AgentProfile | undefined;
  loading?: boolean;
  /** Cuando `RailSection` ya dibuja la cabecera plegable y el botón «+». */
  embedded?: boolean;
}) {
  const [currentPage, setCurrentPage] = createSignal(0);
  const [menu, setMenu] = createSignal<string | null>(null);
  const label = (name: string) => displayName(name, props.profileOf?.(name));
  const agents = createMemo(() => props.agents.filter(agent => !props.profileOf?.(agent.name)?.hidden));
  // El hueco entre caras es fijo. Si el sidebar crece, caben más agentes; no se separan.
  const [medido, setMedido] = createSignal(0);
  const [fila, setFila] = createSignal<HTMLDivElement>();
  const grab = createGrabScroll(fila);
  createEffect(() => {
    const nodo = fila();
    if (!nodo || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => setMedido(nodo.clientWidth));
    obs.observe(nodo);
    onCleanup(() => obs.disconnect());
  });
  const columnas = () => dockColumns(medido());
  const pista = () => ({ "grid-auto-columns": `${DOCK_CELL}px`, gap: `${DOCK_CELL_GAP}px` });
  const pages = () => Math.max(1, Math.ceil(agents().length / columnas()));
  const page = () => Math.min(currentPage(), pages() - 1);
  const agentTitle = (agent: DockAgent) => `${label(agent.name)} · ${dockStatusText(agent)}`;
  const turnPage = (offset: number) => {
    const node = fila();
    if (!node) return;
    node.scrollTo({ left: Math.max(0, Math.min(pages() - 1, page() + offset)) * columnas() * (DOCK_CELL + DOCK_CELL_GAP) });
  };
  const workingBefore = () => agents().slice(0, page() * columnas()).some(agent => agent.status === "working");
  const workingAfter = () => agents().slice((page() + 1) * columnas()).some(agent => agent.status === "working");
  const destination = (name: string) => agentFolder(props.foldersOf(name).map(folder => folder.id), props.currentFolder) ?? "";

  return <div aria-label={props.embedded ? undefined : t("shell.agent_dock.team")} class={cn("flex min-w-0 shrink-0 flex-col", !props.embedded && "gap-1 px-1 pt-1 pb-2")} data-agent-dock="">
    <Show when={!props.embedded}>
      <div class="flex h-7 items-center justify-between gap-2">
        <span class="text-caption font-medium text-neutral-700">{t("shell.agent_dock.team")}</span>
        <Pressable class={cn(ICON_BUTTON, "border-0")} aria-label={t("projects.agents.new_open")} title={t("projects.agents.new_open")} disabled={!props.onNewAgent} onClick={() => props.onNewAgent?.()}><Plus size={14} aria-hidden="true" /></Pressable>
      </div>
    </Show>
    <Show
      when={agents().length > 0 || props.loading}
      fallback={<p class="m-0 px-2 py-1 text-caption text-neutral-500">{t("shell.agent_dock.empty")}</p>}
    >
      <div class="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-surface px-2 py-2">
        <div ref={setFila} class="scroll-visible flex min-h-[54px] min-w-0 items-center overflow-x-auto overscroll-x-contain" style={{ cursor: grab.dragging() ? "grabbing" : "grab", "user-select": "none" }} aria-busy={props.loading}
          onPointerDown={grab.start}
          onScroll={() => {
            const node = fila();
            if (node) setCurrentPage(node.scrollLeft >= node.scrollWidth - node.clientWidth - 1
              ? pages() - 1 : Math.floor(node.scrollLeft / (columnas() * (DOCK_CELL + DOCK_CELL_GAP))));
          }}>
          <Show
            when={agents().length}
            fallback={
              <div class="grid w-full justify-start justify-items-center py-1" style={pista()} data-dock-loading="">
                <For each={Array.from({ length: columnas() }, (_, i) => i)}>{() => <span class="size-7 rounded-full bg-neutral-200 motion-safe:animate-pulse" />}</For>
              </div>
            }
          >
            <ContextMenu>
              <ContextMenuTrigger class="min-w-full shrink-0" onContextMenu={(event: MouseEvent) => {
                const name = (event.target as HTMLElement).closest<HTMLElement>("[data-dock-agent]")?.dataset.dockAgent;
                if (!name) event.preventDefault();
                setMenu(name ?? null);
              }}>
                <div class="grid min-h-[54px] w-max min-w-full grid-flow-col items-center justify-start" style={pista()} data-dock-page={page() + 1} data-dock-columns={columnas()}>
                  <KeyedList each={agents()} by={agent => agent.name}>{agent => <Pressable
                    data-dock-agent={agent().name}
                    aria-label={agentTitle(agent())}
                    aria-current={props.selected === agent().name ? "true" : undefined}
                    title={agentTitle(agent())}
                    class={cn("flex min-w-0 flex-col items-center gap-1 rounded-md border-0 bg-transparent px-0.5 py-1 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-primary", props.selected === agent().name && "bg-neutral-100")}
                    onClick={() => props.onTalk(destination(agent().name), agent().name)}
                  >
                    <span class="relative inline-flex">
                      <AstroAvatar name={agent().name} status={agent().status ?? "asleep"} body={props.profileOf?.(agent().name)?.body} avatar={props.profileOf?.(agent().name)?.avatar} size={30} />
                    </span>
                    <span class="w-full truncate text-center text-2xs leading-tight text-neutral-500">{label(agent().name)}</span>
                  </Pressable>}</KeyedList>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent><Show when={menu()}>{name => <>
                <ContextMenuItem onSelect={() => props.onShowTasks(name())}>{t("shell.agent_dock.see_tasks")}</ContextMenuItem>
                <ContextMenuItem onSelect={() => props.onProfile(destination(name()), name())}>{t("projects.agents.profile_open")}</ContextMenuItem>
                <ContextMenuItem onSelect={props.onSeeAll}>{t("shell.agent_dock.see_all")}</ContextMenuItem>
              </>}</Show></ContextMenuContent>
            </ContextMenu>
          </Show>
        </div>
        <div class="flex items-center justify-end gap-1">
          <div role="group" aria-label={t("shell.agent_dock.pagination")} class="flex items-center gap-1">
            <Pressable class={cn(ICON_BUTTON, "border-0")} aria-label={t("shell.agent_dock.previous")} disabled={page() === 0} onClick={() => turnPage(-1)}>
              <ChevronLeft size={12} aria-hidden="true" /><SignalDot tone="working" class={cn("absolute -top-0.5 -right-0.5", !workingBefore() && "invisible")} />
            </Pressable>
            <span class="min-w-6 text-center text-2xs text-neutral-500 tabular-nums" role="status" aria-live="polite" aria-label={t("shell.agent_dock.page", { current: page() + 1, total: pages() })}>{page() + 1}/{pages()}</span>
            <Pressable class={cn(ICON_BUTTON, "border-0")} aria-label={t("shell.agent_dock.next")} disabled={page() >= pages() - 1} onClick={() => turnPage(1)}>
              <ChevronRight size={12} aria-hidden="true" /><SignalDot tone="working" class={cn("absolute -top-0.5 -right-0.5", !workingAfter() && "invisible")} />
            </Pressable>
          </div>

        </div>
      </div>
    </Show>
  </div>;
}
