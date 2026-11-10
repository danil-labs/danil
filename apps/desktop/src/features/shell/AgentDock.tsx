import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronUp from "lucide-solid/icons/chevron-up";
import List from "lucide-solid/icons/list";
import Plus from "lucide-solid/icons/plus";
import SquarePen from "lucide-solid/icons/square-pen";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { t } from "../../lib/i18n";
import type { AgentProfile } from "../../lib/model";
import { cn } from "../../lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../../ui/ContextMenu";
import { AstroAvatar } from "../projects/AstroAvatar";
import { displayName } from "../projects/profiles";
import { agentFolder, type DockAgent, orderDockAgents } from "./dockLayout";

export type { DockAgent } from "./dockLayout";

/** Mismas palabras que la fila del agente en `AgentRows`. */
export function dockStatusText(agent: DockAgent): string {
  if (!agent.status || agent.status === "asleep") return t("projects.sessions.agent_asleep");
  if (agent.status === "working") {
    return agent.liveTasks > 0
      ? t("projects.sessions.agent_working", { count: agent.liveTasks })
      : t("projects.sessions.agent_working_alone");
  }
  return agent.minutesSinceLastTurn != null
    ? t("projects.sessions.agent_awake_since", { minutes: agent.minutesSinceLastTurn })
    : t("projects.sessions.agent_awake");
}

const ICONO = "grid size-7 place-items-center rounded-md border-0 bg-transparent text-neutral-500 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-primary";
const ADD = "grid size-8 shrink-0 place-items-center rounded-full border-0 bg-neutral-200 p-0 text-neutral-700 hover:bg-neutral-300 focus-visible:outline-2 focus-visible:outline-primary";
type DockFolder = { id: string; name: string };
export type DockGroups = { workspace: string[]; project: string[]; repo: string[] };

export default function AgentDock(props: {
  agents: DockAgent[];
  selected: string | null;
  foldersOf: (name: string) => DockFolder[];
  currentFolder: string | null;
  currentFolderName?: string | null;
  groups?: DockGroups;
  onTalk: (project: string, name: string) => void;
  onShowTasks: (name: string) => void;
  onProfile: (project: string, name: string) => void;
  onSeeAll: () => void;
  onNewAgent?: () => void;
  profileOf?: (name: string) => AgentProfile | undefined;
  loading?: boolean;
}) {
  const [expanded, setExpanded] = createSignal(false);
  // El panel cerrado no se monta: abrir otra tarea no debe repintar su lista invisible.
  const [opened, setOpened] = createSignal(false);
  createEffect(() => { if (expanded()) setOpened(true); });
  const [names, setNames] = createSignal(false);
  const [menu, setMenu] = createSignal<string | null>(null);
  const label = (name: string) => displayName(name, props.profileOf?.(name));
  const allowed = createMemo(() => new Set(props.groups ? [
    ...props.groups.workspace,
    ...(props.currentFolder ? [...props.groups.project, ...props.groups.repo] : []),
  ] : props.agents.map(a => a.name)));
  const agents = createMemo(() => orderDockAgents(props.agents.filter(a => allowed().has(a.name)), a => label(a.name), a => props.profileOf?.(a.name)?.hidden === true));
  const faces = createMemo(() => {
    const shown = agents().slice(0, 5);
    const selected = agents().find(a => a.name === props.selected);
    if (selected && !shown.includes(selected)) shown[4] = selected;
    return shown;
  });
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
  window.addEventListener("keydown", escape);
  onCleanup(() => window.removeEventListener("keydown", escape));
  const destination = (name: string) => agentFolder(props.foldersOf(name).map(f => f.id), props.currentFolder) ?? "";
  const talk = (name: string) => { setExpanded(false); props.onTalk(destination(name), name); };
  const face = (agent: DockAgent, size: number) => <AstroAvatar name={agent.name} status={agent.status ?? "asleep"} body={props.profileOf?.(agent.name)?.body} avatar={props.profileOf?.(agent.name)?.avatar} size={size} />;
  const group = (title: string, members: string[] | undefined) => {
    const rows = () => agents().filter(a => members?.includes(a.name));
    return <Show when={rows().length}><section class="py-2">
      <h3 class="m-0 px-2 py-1 text-caption font-medium text-neutral-500">{title}</h3>
      <For each={rows()}>{agent => <button type="button" class="flex w-full items-center gap-3 rounded-md border-0 bg-transparent px-2 py-2 text-left hover:bg-neutral-100" onClick={() => talk(agent.name)}>
        {face(agent, 32)}<span class="min-w-0 flex-1 truncate text-ui">{label(agent.name)}</span><SquarePen size={14} class="text-neutral-500" />
      </button>}</For>
    </section></Show>;
  };
  return <div role="group" aria-label={t("shell.agent_dock.title")} class="h-[100px] shrink-0" data-dock-expanded={expanded() ? "" : undefined}>
    <div inert={!expanded()} aria-hidden={!expanded()} data-dock-panel=""
      class={cn("absolute inset-x-0 top-0 bottom-[100px] z-20 overflow-y-auto bg-surface px-2 motion-safe:transition-[transform,opacity,visibility] motion-safe:duration-[180ms] motion-safe:ease-out", expanded() ? "visible translate-y-0 opacity-100" : "invisible translate-y-full opacity-0")}>
      <Show when={opened()}>
        {group(t("shell.agent_dock.workspace"), props.groups?.workspace)}
        <Show when={props.currentFolder}>
          {group(t("shell.agent_dock.project"), props.groups?.project)}
          {group(t("shell.agent_dock.repository"), props.groups?.repo)}
        </Show>
        <button class="my-3 rounded-md border-0 bg-transparent px-2 py-1 text-caption text-neutral-500 hover:bg-neutral-100" onClick={() => { setExpanded(false); props.onSeeAll(); }}>{t("shell.agent_dock.see_all")}</button>
      </Show>
    </div>
    <div class="relative z-30 h-full border-t border-border bg-surface px-2" data-dock-header="">
      <div class="flex h-10 items-center gap-1 px-1">
        <span class="text-caption text-neutral-500">{t("shell.agent_dock.team")}</span>
        <Show when={agents().length > 5}><span class="text-caption text-neutral-500">+{agents().length - 5}</span></Show>
        <button type="button" class={cn(ICONO, "ml-auto")} aria-label={t("shell.agent_dock.names")} aria-pressed={names()} onClick={() => setNames(v => !v)}><List size={14} /></button>
        <button type="button" class={ICONO} aria-label={t(expanded() ? "shell.agent_dock.collapse" : "shell.agent_dock.expand")} aria-expanded={expanded()} onClick={() => setExpanded(v => !v)}><Show when={expanded()} fallback={<ChevronUp size={14} />}><ChevronDown size={14} /></Show></button>
      </div>
      <div class="flex h-[60px] items-center gap-1">
        <div class="min-w-0 flex-1">
          <Show when={agents().length} fallback={<Show when={props.loading} fallback={<span class="px-1 text-caption text-neutral-500">{t("shell.agent_dock.empty")}</span>}><div class="flex justify-around" aria-busy="true" data-dock-loading=""><For each={[0,1,2,3,4]}>{() => <span class="size-6 rounded-full bg-neutral-200 motion-safe:animate-pulse" />}</For></div></Show>}>
            <ContextMenu>
              <ContextMenuTrigger class="grid grid-cols-5 items-center gap-1" onContextMenu={(event: MouseEvent) => { const name = (event.target as HTMLElement).closest<HTMLElement>("[data-dock-agent]")?.dataset.dockAgent; if (!name) event.preventDefault(); setMenu(name ?? null); }}>
                <For each={faces()}>{agent => <button type="button" data-dock-agent={agent.name} aria-label={`${label(agent.name)} · ${dockStatusText(agent)}`} class="flex min-w-0 flex-col items-center gap-1 rounded-md border-0 bg-transparent p-1 hover:bg-neutral-100" onClick={() => talk(agent.name)}>
                  {face(agent, 28)}<Show when={names()}><span class="w-full truncate text-2xs text-neutral-500">{label(agent.name)}</span></Show>
                </button>}</For>
              </ContextMenuTrigger>
              <ContextMenuContent><Show when={menu()}>{name => <><ContextMenuItem onSelect={() => props.onShowTasks(name())}>{t("shell.agent_dock.see_tasks")}</ContextMenuItem><ContextMenuItem onSelect={() => props.onProfile(destination(name()), name())}>{t("projects.agents.profile_open")}</ContextMenuItem></>}</Show></ContextMenuContent>
            </ContextMenu>
          </Show>
        </div>
        <button type="button" class={ADD} aria-label={t("projects.agents.new_open")} title={t("projects.agents.new_open")} onClick={() => props.onNewAgent?.()}><Plus size={19} /></button>
      </div>
    </div>
  </div>;
}
