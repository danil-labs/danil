import ChevronRight from "lucide-solid/icons/chevron-right";
import Plus from "lucide-solid/icons/plus";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { t } from "../../lib/i18n";
import type { AgentProfile } from "../../lib/model";
import { cn } from "../../lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../../ui/ContextMenu";
import { ITEM_DE_MENU, Popover, PopoverContent } from "../../ui/Popover";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../ui/Tooltip";
import { AstroAvatar } from "../projects/AstroAvatar";
import { displayName } from "../projects/profiles";
import { agentFolder, DOCK_DEFAULT_CAPACITY, type DockAgent, dockCapacity, orderDockAgents, planDock } from "./dockLayout";

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

const SLOT =
  "relative grid size-[26px] shrink-0 place-items-center rounded-[7px] border border-transparent bg-transparent p-0 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-primary";

type DockFolder = { id: string; name: string };

/**
 * Dock de agentes al pie del sidebar: una sola fila de caras. Pulsar una abre
 * el chat con el agente; el clic derecho filtra sus tareas o abre su perfil.
 */
export default function AgentDock(props: {
  agents: DockAgent[];
  /** El agente del filtro del riel: su cara nunca queda escondida en «+k». */
  selected: string | null;
  /** Carpetas donde está cada agente, en el orden del riel. */
  foldersOf: (name: string) => DockFolder[];
  /** La carpeta de lo que se mira ahora, que gana si el agente está en ella. */
  currentFolder: string | null;
  onTalk: (project: string, name: string) => void;
  onShowTasks: (name: string) => void;
  onProfile: (project: string, name: string) => void;
  onSeeAll: () => void;
  onNewAgent?: () => void;
  /** Perfil del agente: nombre visible, cara, imagen propia y si está oculto. */
  profileOf?: (name: string) => AgentProfile | undefined;
}) {
  let fila: HTMLDivElement | undefined;
  const [capacidad, setCapacidad] = createSignal(DOCK_DEFAULT_CAPACITY);
  onMount(() => {
    if (!fila) return;
    const medir = () => setCapacidad(dockCapacity(fila?.clientWidth ?? 0));
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ojo = new ResizeObserver(medir);
    ojo.observe(fila);
    onCleanup(() => ojo.disconnect());
  });

  const label = (name: string) => displayName(name, props.profileOf?.(name));
  const ordenados = createMemo(() =>
    orderDockAgents(props.agents, (a) => label(a.name), (a) => props.profileOf?.(a.name)?.hidden === true),
  );
  const plan = createMemo(() =>
    planDock(ordenados(), capacidad(), { hasNew: !!props.onNewAgent, selected: props.selected }),
  );

  // Un agente en varias carpetas sin ninguna obvia: se pregunta dónde, junto a su cara.
  const [eligiendo, setEligiendo] = createSignal<{ name: string; anchor: HTMLElement; folders: DockFolder[] } | null>(null);
  const hablar = (name: string, anchor: HTMLElement) => {
    const folders = props.foldersOf(name);
    const id = agentFolder(folders.map((f) => f.id), props.currentFolder);
    if (id) props.onTalk(id, name);
    else if (folders.length > 0) setEligiendo({ name, anchor, folders });
  };
  const [menuDe, setMenuDe] = createSignal<string | null>(null);
  const perfil = (name: string) => {
    const folders = props.foldersOf(name);
    const id = agentFolder(folders.map((f) => f.id), props.currentFolder) ?? folders[0]?.id;
    if (id) props.onProfile(id, name);
  };

  // 10 px arriba y abajo, y 8 px entre el rótulo y las caras. El hueco de
  // 26 px y los 6 px entre caras no se tocan: de eso sale cuántas caben.
  return (
    <div class="flex flex-col gap-2 border-t border-border px-2 pt-2.5 pb-2.5" role="group" aria-label={t("shell.agent_dock.title")}>
      <div class="flex items-center text-caption text-neutral-500">
        <span>{t("shell.agent_dock.title")}</span>
        <button
          type="button"
          class="ml-auto flex items-center gap-0.5 rounded-sm border-0 bg-transparent p-0 text-caption text-neutral-500 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => props.onSeeAll()}
        >
          {t("shell.agent_dock.see_all")}
          <ChevronRight size={11} aria-hidden="true" />
        </button>
      </div>
      <Show when={props.agents.length === 0}>
        <p class="m-0 truncate px-0.5 pt-0.5 pb-1 text-caption text-neutral-500">
          {t("shell.agent_dock.empty")}
        </p>
      </Show>
      <ContextMenu onOpenChange={(abierto) => { if (!abierto) setMenuDe(null); }}>
      <ContextMenuTrigger
        ref={fila}
        class="flex min-w-0 items-center gap-1.5"
        onContextMenu={(e: MouseEvent) => {
          const cara = (e.target as HTMLElement).closest<HTMLElement>("[data-dock-agent]");
          if (!cara) e.preventDefault();
          setMenuDe(cara?.dataset.dockAgent ?? null);
        }}
      >
        <For each={plan().shown}>
          {(agente) => {
            const texto = () => `${label(agente.name)} · ${dockStatusText(agente)}`;
            return (
              <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="top" gutter={6}>
              <TooltipTrigger
                as="button"
                type="button"
                class={SLOT}
                data-dock-agent={agente.name}
                aria-label={texto()}
                onClick={(e: MouseEvent) => hablar(agente.name, e.currentTarget as HTMLElement)}
              >
                <AstroAvatar
                  name={agente.name}
                  status={agente.status ?? "asleep"}
                  body={props.profileOf?.(agente.name)?.body}
                  avatar={props.profileOf?.(agente.name)?.avatar}
                  size={20}
                />
                <Show when={agente.liveTasks > 0}>
                  <span
                    aria-hidden="true"
                    class="absolute -right-[3px] -bottom-[3px] rounded-full bg-neutral-950 px-[3px] text-[9px] leading-3 font-bold text-surface"
                  >
                    {agente.liveTasks}
                  </span>
                </Show>
              </TooltipTrigger>
              <TooltipContent class="pointer-events-none">
                <span class="block">{label(agente.name)}</span>
                <span class="block font-normal opacity-80">{dockStatusText(agente)}</span>
              </TooltipContent>
              </TooltipRoot>
            );
          }}
        </For>
        <Show when={plan().overflow > 0}>
          <button
            type="button"
            class={cn(SLOT, "text-caption font-semibold")}
            aria-label={t("shell.agent_dock.more", { count: plan().overflow })}
            title={t("shell.agent_dock.more", { count: plan().overflow })}
            onClick={() => props.onSeeAll()}
          >
            +{plan().overflow}
          </button>
        </Show>
        <Show when={props.onNewAgent}>
          <button
            type="button"
            class={SLOT}
            aria-label={t("projects.agents.new_open")}
            title={t("projects.agents.new_open")}
            onClick={() => props.onNewAgent?.()}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </Show>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <Show when={menuDe()}>
          {(name) => (
            <>
              <ContextMenuItem onSelect={() => props.onShowTasks(name())}>{t("shell.agent_dock.see_tasks")}</ContextMenuItem>
              <ContextMenuItem onSelect={() => perfil(name())}>{t("projects.agents.profile_open")}</ContextMenuItem>
            </>
          )}
        </Show>
      </ContextMenuContent>
      </ContextMenu>
      <Show when={eligiendo()}>
        {(e) => (
          <Popover open onOpenChange={(abierto) => { if (!abierto) setEligiendo(null); }} anchorRef={() => e().anchor} placement="top-start" gutter={6}>
            <PopoverContent role="menu" aria-label={t("shell.agent_dock.pick_folder", { name: label(e().name) })} class="w-56 p-1">
              <p class="m-0 truncate px-2 pt-1 pb-1 text-caption font-medium text-neutral-500">
                {t("shell.agent_dock.pick_folder", { name: label(e().name) })}
              </p>
              <For each={e().folders}>
                {(f) => (
                  <button
                    type="button"
                    role="menuitem"
                    class={cn(ITEM_DE_MENU, "truncate")}
                    data-dock-folder={f.id}
                    onClick={() => { setEligiendo(null); props.onTalk(f.id, e().name); }}
                  >
                    {f.name}
                  </button>
                )}
              </For>
            </PopoverContent>
          </Popover>
        )}
      </Show>
    </div>
  );
}
