import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import FileText from "lucide-solid/icons/file-text";
import Folder from "lucide-solid/icons/folder";
import LayoutGrid from "lucide-solid/icons/layout-grid";
import Plus from "lucide-solid/icons/plus";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { t } from "../../../ui/src/lib/i18n";
import type { AgentProfile } from "../../../ui/src/lib/model";
import { cn } from "../../../ui/src/lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../../../ui/src/ContextMenu";
import { KeyedList } from "../../../ui/src/KeyedList";
import { Pressable } from "../../../ui/src/Pressable";
import { SignalDot } from "../../../ui/src/SignalDot";
import { AstroAvatar } from "../../../features/projects/src/screens/AstroAvatar";
import { displayName } from "../../../features/projects/src/queries/profiles";
import { agentFolder, type DockAgent, orderDockAgents } from "./dockLayout";
import { pageDock } from "./dockPagination";

export type { DockAgent } from "./dockLayout";
type DockFolder = { id: string; name: string };
export type DockGroups = { workspace: string[]; project: string[]; repo: string[] };
type DockLevel = keyof DockGroups;

const LEVELS = ["workspace", "project", "repo"] as const;
const ICONS = { workspace: LayoutGrid, project: Folder, repo: FileText };
const LABELS = { workspace: "shell.agent_dock.workspace", project: "shell.agent_dock.project", repo: "shell.agent_dock.repository" };
const ICON_BUTTON = "relative grid size-6 shrink-0 place-items-center rounded-md bg-transparent p-0 text-neutral-500 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30 disabled:hover:bg-transparent";

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
  contextKey?: string;
  groups?: DockGroups;
  onTalk: (project: string, name: string) => void;
  onShowTasks: (name: string) => void;
  onProfile: (project: string, name: string) => void;
  onSeeAll: () => void;
  onNewAgent?: () => void;
  profileOf?: (name: string) => AgentProfile | undefined;
  loading?: boolean;
}) {
  const [position, setPosition] = createSignal<{ context: string; level: DockLevel | null; page: number }>({ context: "", level: null, page: 0 });
  const [menu, setMenu] = createSignal<string | null>(null);
  const context = () => `${props.contextKey ?? ""}\n${props.currentFolder ?? ""}`;
  // Una carpeta nueva empieza en Todos/página 1 sin escribir estado derivado.
  const navigation = () => position().context === context() ? position() : { level: null, page: 0 };
  const label = (name: string) => displayName(name, props.profileOf?.(name));
  const levels = createMemo(() => new Map<string, DockLevel>(LEVELS.flatMap(level =>
    (props.groups?.[level] ?? []).map(name => [name, level] as const))));
  const allowed = createMemo(() => new Set(props.groups ? [
    ...props.groups.workspace,
    ...(props.currentFolder ? [...props.groups.project, ...props.groups.repo] : []),
  ] : props.agents.map(agent => agent.name)));
  const agents = createMemo(() => orderDockAgents(props.agents.filter(agent => allowed().has(agent.name)), agent => label(agent.name), agent => props.profileOf?.(agent.name)?.hidden === true));
  const filtered = createMemo(() => agents().filter(agent => !navigation().level || levels().get(agent.name) === navigation().level));
  const page = createMemo(() => pageDock(filtered(), navigation().page));
  const workingIn = (level: DockLevel) => agents().filter(agent => levels().get(agent.name) === level && agent.status === "working");
  const levelTitle = (level: DockLevel) => {
    const names = workingIn(level).map(agent => label(agent.name));
    return names.length
      ? t("shell.agent_dock.level_working", { level: t(LABELS[level]), count: names.length, names: names.join(", ") })
      : t(LABELS[level]);
  };
  const agentTitle = (agent: DockAgent) => {
    const level = levels().get(agent.name);
    return `${label(agent.name)} · ${dockStatusText(agent)}${level ? ` · ${t(LABELS[level])}` : ""}`;
  };
  const selectLevel = (level: DockLevel) => setPosition({ context: context(), level: navigation().level === level ? null : level, page: 0 });
  const turnPage = (offset: number) => setPosition({ context: context(), level: navigation().level, page: page().page + offset });
  const destination = (name: string) => agentFolder(props.foldersOf(name).map(folder => folder.id), props.currentFolder) ?? "";

  return <section aria-label={t("shell.agent_dock.team")} class="h-[132px] shrink-0 px-1 pt-1 pb-2" data-agent-dock="">
    <div class="flex h-7 items-center justify-between gap-2">
      <span class="text-caption font-medium text-neutral-700">{t("shell.agent_dock.team")}</span>
      <Pressable class={cn(ICON_BUTTON, "border-0")} aria-label={t("projects.agents.new_open")} title={t("projects.agents.new_open")} disabled={!props.onNewAgent} onClick={() => props.onNewAgent?.()}><Plus size={14} aria-hidden="true" /></Pressable>
    </div>
    <div class="flex h-[62px] min-w-0 items-center" aria-busy={props.loading}>
      <Show when={agents().length} fallback={<Show when={props.loading} fallback={<span class="text-caption text-neutral-500">{t("shell.agent_dock.empty")}</span>}>
        <div class="grid w-full grid-cols-5 justify-items-center" data-dock-loading=""><For each={[0, 1, 2, 3, 4]}>{() => <span class="size-7 rounded-full bg-neutral-200 motion-safe:animate-pulse" />}</For></div>
      </Show>}>
        <ContextMenu>
          <ContextMenuTrigger class="w-full" onContextMenu={(event: MouseEvent) => {
            const name = (event.target as HTMLElement).closest<HTMLElement>("[data-dock-agent]")?.dataset.dockAgent;
            if (!name) event.preventDefault();
            setMenu(name ?? null);
          }}>
            <div class="grid h-[62px] w-full grid-cols-5 items-center gap-1" data-dock-page={page().page + 1}>
              <KeyedList each={page().shown} by={agent => agent.name}>{agent => <Pressable
                data-dock-agent={agent().name}
                aria-label={agentTitle(agent())}
                aria-current={props.selected === agent().name ? "true" : undefined}
                title={agentTitle(agent())}
                class={cn("flex min-w-0 flex-col items-center gap-1 rounded-md border-0 bg-transparent px-0.5 py-1 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-primary", props.selected === agent().name && "bg-neutral-100")}
                onClick={() => props.onTalk(destination(agent().name), agent().name)}
              >
                <span class="relative inline-flex">
                  <AstroAvatar name={agent().name} status={agent().status ?? "asleep"} body={props.profileOf?.(agent().name)?.body} avatar={props.profileOf?.(agent().name)?.avatar} size={30} />
                  <Show when={levels().get(agent().name)}>{level => <span class="absolute -right-1 -bottom-0.5 grid size-3.5 place-items-center rounded-full border border-border bg-surface text-neutral-500"><Dynamic component={ICONS[level()]} size={8} aria-hidden="true" /></span>}</Show>
                </span>
                <span class="w-full truncate text-center text-2xs leading-tight text-neutral-500">{label(agent().name)}</span>
              </Pressable>}</KeyedList>
              <Show when={filtered().length === 0}><span class="col-span-5 text-caption text-neutral-500">{t("shell.agent_dock.filter_empty")}</span></Show>
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
    <div class="flex h-7 items-center justify-between gap-1 border-t border-border pt-1">
      <div role="group" aria-label={t("shell.agent_dock.pagination")} class="flex items-center gap-1">
        <Pressable class={cn(ICON_BUTTON, "border border-border bg-surface")} aria-label={t("shell.agent_dock.previous")} disabled={page().page === 0} onClick={() => turnPage(-1)}>
          <ChevronLeft size={12} aria-hidden="true" /><SignalDot tone="working" class={cn("absolute -top-0.5 -right-0.5", !page().workingBefore && "invisible")} />
        </Pressable>
        <span class="min-w-6 text-center text-2xs text-neutral-500 tabular-nums" role="status" aria-live="polite" aria-label={t("shell.agent_dock.page", { current: page().page + 1, total: page().pages })}>{page().page + 1}/{page().pages}</span>
        <Pressable class={cn(ICON_BUTTON, "border border-border bg-surface")} aria-label={t("shell.agent_dock.next")} disabled={page().page >= page().pages - 1} onClick={() => turnPage(1)}>
          <ChevronRight size={12} aria-hidden="true" /><SignalDot tone="working" class={cn("absolute -top-0.5 -right-0.5", !page().workingAfter && "invisible")} />
        </Pressable>
      </div>
      <div role="group" aria-label={t("shell.agent_dock.filter")} class="flex items-center gap-0.5 rounded-md border border-border p-0.5">
        <For each={LEVELS}>{level => <Pressable class={cn(ICON_BUTTON, "h-5 border-0", navigation().level === level && "bg-neutral-100 text-neutral-950")} data-dock-level={level} aria-label={levelTitle(level)} title={levelTitle(level)} aria-pressed={navigation().level === level} onClick={() => selectLevel(level)}>
          <Dynamic component={ICONS[level]} size={12} aria-hidden="true" />
          <SignalDot tone="working" pulse={workingIn(level).length > 0} class={cn("absolute -top-0.5 -right-0.5 motion-reduce:animate-none", workingIn(level).length === 0 && "invisible")} />
        </Pressable>}</For>
      </div>
    </div>
  </section>;
}
