import ChevronRight from "lucide-solid/icons/chevron-right";
import Plus from "lucide-solid/icons/plus";
import { createMemo, createSignal, For, Show } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import type { AgentProfile } from "../../../ui/src/lib/model";
import { cn } from "../../../ui/src/lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../../../ui/src/ContextMenu";
import { KeyedList } from "../../../ui/src/KeyedList";
import { Pressable } from "../../../ui/src/Pressable";
import { SidebarCard } from "../../../ui/src/SidebarCard";
import { SignalDot } from "../../../ui/src/SignalDot";
import { AstroAvatar } from "../../../features/projects/src/screens/AstroAvatar";
import { displayName } from "../../../features/projects/src/queries/profiles";
import { agentFolder, type DockAgent } from "./dockLayout";

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

/**
 * Orca-style vertical list of agent `SidebarCard`s (subtle card surface, rounded-square
 * avatar, bold name, 1-line truncated description, chevron `>`, optional live search).
 */
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
  searchOpen?: boolean;
}) {
  const [menu, setMenu] = createSignal<string | null>(null);
  const [query, setQuery] = createSignal("");
  const label = (name: string) => displayName(name, props.profileOf?.(name));
  const agents = createMemo(() => {
    const visible = props.agents.filter((agent) => !props.profileOf?.(agent.name)?.hidden);
    const q = props.searchOpen ? query().trim().toLowerCase() : "";
    if (!q) return visible;
    return visible.filter((agent) =>
      `${label(agent.name)} ${agent.name} ${agent.description ?? ""}`.toLowerCase().includes(q),
    );
  });
  const agentTitle = (agent: DockAgent) => `${label(agent.name)} · ${dockStatusText(agent)}`;
  const destination = (name: string) => agentFolder(props.foldersOf(name).map((folder) => folder.id), props.currentFolder) ?? "";

  return (
    <div aria-label={props.embedded ? undefined : t("shell.agent_dock.team")} class={cn("flex min-w-0 shrink-0 flex-col gap-1.5", !props.embedded && "px-1 pt-1 pb-2")} data-agent-dock="">
      <Show when={!props.embedded}>
        <div class="flex h-7 items-center justify-between gap-2">
          <span class="text-caption font-medium text-neutral-700">{t("shell.agent_dock.team")}</span>
          <Pressable class={cn(ICON_BUTTON, "border-0")} aria-label={t("projects.agents.new_open")} title={t("projects.agents.new_open")} disabled={!props.onNewAgent} onClick={() => props.onNewAgent?.()}><Plus size={14} aria-hidden="true" /></Pressable>
        </div>
      </Show>
      <Show when={props.searchOpen}>
        <input
          type="search"
          value={query()}
          placeholder={t("chat.search.placeholder")}
          aria-label={t("chat.search.placeholder")}
          data-agent-dock-search=""
          class="h-7 w-full min-w-0 rounded-md border border-border bg-surface px-2 text-caption text-neutral-950 placeholder:text-neutral-500 focus-visible:border-primary focus-visible:outline-none"
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </Show>
      <Show
        when={props.agents.length > 0 || props.loading}
        fallback={<p class="m-0 px-2 py-1 text-caption text-neutral-500">{t("shell.agent_dock.empty")}</p>}
      >
        <Show
          when={props.agents.length > 0}
          fallback={
            <div class="flex min-w-0 flex-col gap-1.5" data-dock-loading="" aria-busy="true">
              <For each={[0, 1, 2]}>
                {() => (
                  <div class="flex items-center gap-2.5 rounded-lg border border-border/60 bg-surface-muted/60 px-2.5 py-2 motion-safe:animate-pulse">
                    <span class="size-8 shrink-0 rounded-lg bg-neutral-200/70" />
                    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span class="h-3 w-24 rounded bg-neutral-200/70" />
                      <span class="h-2.5 w-36 rounded bg-neutral-200/50" />
                    </div>
                  </div>
                )}
              </For>
            </div>
          }
        >
          <ContextMenu>
            <ContextMenuTrigger
              class="min-w-0"
              onContextMenu={(event: MouseEvent) => {
                const name = (event.target as HTMLElement).closest<HTMLElement>("[data-dock-agent]")?.dataset.dockAgent;
                if (!name) event.preventDefault();
                setMenu(name ?? null);
              }}
            >
              <div class="flex min-w-0 flex-col gap-1.5" data-dock-list="">
                <KeyedList each={agents()} by={(agent) => agent.name}>
                  {(agent) => (
                    <SidebarCard
                      data-sidebar-card="agent"
                      data-dock-agent={agent().name}
                      active={props.selected === agent().name}
                      ariaLabel={agentTitle(agent())}
                      titleAttr={agentTitle(agent())}
                      onClick={() => props.onTalk(destination(agent().name), agent().name)}
                      leading={
                        <span class="relative grid size-8 shrink-0 place-items-center rounded-lg border border-border/60 bg-surface-raised">
                          <AstroAvatar
                            name={agent().name}
                            status={agent().status ?? "asleep"}
                            body={props.profileOf?.(agent().name)?.body}
                            avatar={props.profileOf?.(agent().name)?.avatar}
                            size={24}
                          />
                          <Show when={agent().status === "working"}>
                            <SignalDot tone="working" class="absolute -right-0.5 -bottom-0.5 ring-2 ring-surface" />
                          </Show>
                        </span>
                      }
                      title={label(agent().name)}
                      subtitle={agent().description?.trim() || dockStatusText(agent())}
                      trailing={<ChevronRight size={14} aria-hidden="true" class="text-neutral-500 transition-transform group-hover/sidebar-card:translate-x-0.5" />}
                    />
                  )}
                </KeyedList>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <Show when={menu()}>
                {(name) => (
                  <>
                    <ContextMenuItem onSelect={() => props.onShowTasks(name())}>{t("shell.agent_dock.see_tasks")}</ContextMenuItem>
                    <ContextMenuItem onSelect={() => props.onProfile(destination(name()), name())}>{t("projects.agents.profile_open")}</ContextMenuItem>
                    <ContextMenuItem onSelect={props.onSeeAll}>{t("shell.agent_dock.see_all")}</ContextMenuItem>
                  </>
                )}
              </Show>
            </ContextMenuContent>
          </ContextMenu>
        </Show>
      </Show>
    </div>
  );
}
