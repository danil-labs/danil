import ChevronUp from "lucide-solid/icons/chevron-up";
import List from "lucide-solid/icons/list";
import Plus from "lucide-solid/icons/plus";
import { createMemo, createSignal, For, Show } from "solid-js";
import { t } from "../../lib/i18n";
import type { AgentProfile } from "../../lib/model";
import { cn } from "../../lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../../ui/ContextMenu";
import { Popover, PopoverContent } from "../../ui/Popover";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../ui/Tooltip";
import { AstroAvatar } from "../projects/AstroAvatar";
import { displayName } from "../projects/profiles";
import { agentFolder, type DockAgent, orderDockAgents } from "./dockLayout";

export type { DockAgent } from "./dockLayout";
export type NivelDeAgente = "workspace" | "project" | "repo";

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

/** Botón pequeño de la cabecera: nombres y desplegar. */
const ICONO =
  "grid size-6 place-items-center rounded-md border border-border bg-transparent text-neutral-500 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-primary aria-pressed:bg-neutral-100 aria-pressed:text-neutral-950";

type DockFolder = { id: string; name: string };

/**
 * La banda de agentes al pie del sidebar: el equipo del workspace en una
 * cuadrícula, con sus nombres opcionales y un panel que despliega arriba los
 * tres niveles —workspace, proyecto y repositorio—. Pulsar una cara abre su
 * chat; el clic derecho filtra sus tareas o abre su perfil.
 */
export default function AgentDock(props: {
  agents: DockAgent[];
  /** El agente del filtro del riel: su cara nunca queda escondida. */
  selected: string | null;
  /** Carpetas donde está cada agente, en el orden del riel. */
  foldersOf: (name: string) => DockFolder[];
  /** La carpeta de lo que se mira ahora, que gana si el agente está en ella. */
  currentFolder: string | null;
  /** De dónde viene cada agente, para agrupar el panel. */
  nivelDe?: (name: string) => NivelDeAgente | null;
  onTalk: (project: string, name: string) => void;
  onShowTasks: (name: string) => void;
  onProfile: (project: string, name: string) => void;
  onSeeAll: () => void;
  onNewAgent?: () => void;
  /** Perfil del agente: nombre visible, cara, imagen propia y si está oculto. */
  profileOf?: (name: string) => AgentProfile | undefined;
}) {
  const [nombres, setNombres] = createSignal(false);
  const [desplegado, setDesplegado] = createSignal(false);

  const label = (name: string) => displayName(name, props.profileOf?.(name));
  const ordenados = createMemo(() =>
    orderDockAgents(props.agents, (a) => label(a.name), (a) => props.profileOf?.(a.name)?.hidden === true),
  );

  // Los tres grupos del panel, en el orden: workspace, proyecto, repositorio.
  const grupos = createMemo(() => {
    const workspace: DockAgent[] = [];
    const proyecto: DockAgent[] = [];
    const repo: DockAgent[] = [];
    for (const a of ordenados()) {
      const n = props.nivelDe?.(a.name);
      if (n === "workspace") workspace.push(a);
      else if (n === "repo") repo.push(a);
      else proyecto.push(a);
    }
    return { workspace, proyecto, repo };
  });

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

  const filaPanel = (a: DockAgent, esRepo: boolean) => (
    <button
      type="button"
      class="flex min-w-0 items-center gap-2.5 rounded-md border-0 bg-transparent px-1.5 py-1 text-left outline-none hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
      data-dock-agent={a.name}
      onClick={(e: MouseEvent) => hablar(a.name, e.currentTarget as HTMLElement)}
    >
      <AstroAvatar
        name={a.name}
        status={a.status ?? "asleep"}
        body={props.profileOf?.(a.name)?.body}
        avatar={props.profileOf?.(a.name)?.avatar}
        size={22}
      />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-neutral-950">{label(a.name)}</span>
        <span class="block truncate text-caption text-neutral-500">{dockStatusText(a)}</span>
      </span>
      <Show when={esRepo}>
        <span class="rounded-full border border-dashed border-neutral-300 px-1.5 text-[0.625rem] text-neutral-500">
          {t("shell.agent_dock.repo")}
        </span>
      </Show>
      <Show when={props.onNewAgent}>
        <Plus size={12} class="text-neutral-400" />
      </Show>
    </button>
  );

  return (
    <div class="relative flex flex-col gap-1.5 border-t border-border px-2 pt-1.5 pb-2" role="group" aria-label={t("shell.agent_dock.title")}>
      <Show when={desplegado()}>
        <div class="absolute inset-x-2 bottom-full z-30 mb-1 max-h-[18rem] overflow-auto rounded-lg border border-border bg-surface-raised p-1.5 shadow-lg">
          <div class="px-1.5 pt-0.5 pb-1 text-caption font-medium text-neutral-500">{t("shell.agent_dock.workspace")}</div>
          <For each={grupos().workspace}>{(a) => filaPanel(a, false)}</For>
          <Show when={grupos().proyecto.length > 0}>
            <div class="px-1.5 pt-2 pb-1 text-caption font-medium text-neutral-500">{t("shell.agent_dock.project")}</div>
            <For each={grupos().proyecto}>{(a) => filaPanel(a, false)}</For>
          </Show>
          <Show when={grupos().repo.length > 0}>
            <div class="px-1.5 pt-2 pb-1 text-caption font-medium text-neutral-500">{t("shell.agent_dock.repository")}</div>
            <For each={grupos().repo}>{(a) => filaPanel(a, true)}</For>
          </Show>
          <button
            type="button"
            class="mt-1 flex w-full items-center gap-1.5 rounded-md border-0 bg-transparent px-1.5 py-1 text-left text-caption text-neutral-500 hover:text-neutral-950"
            onClick={() => props.onSeeAll()}
          >
            {t("shell.agent_dock.see_all")}
          </button>
        </div>
      </Show>

      <div class="flex items-center">
        <span class="text-caption font-medium text-neutral-500">{t("shell.agent_dock.team")}</span>
        <div class="ml-auto flex items-center gap-1">
          <button
            type="button"
            class={ICONO}
            aria-pressed={nombres()}
            aria-label={t("shell.agent_dock.names")}
            title={t("shell.agent_dock.names")}
            onClick={() => setNombres((v) => !v)}
          >
            <List size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            class={ICONO}
            aria-expanded={desplegado()}
            aria-label={t("shell.agent_dock.expand")}
            title={t("shell.agent_dock.expand")}
            onClick={() => setDesplegado((v) => !v)}
          >
            <ChevronUp size={13} aria-hidden="true" class={cn("transition-transform", desplegado() && "rotate-180")} />
          </button>
        </div>
      </div>

      <Show
        when={props.agents.length > 0}
        fallback={<p class="m-0 truncate px-0.5 pb-1 text-caption text-neutral-500">{t("shell.agent_dock.empty")}</p>}
      >
        <ContextMenu onOpenChange={(abierto) => { if (!abierto) setMenuDe(null); }}>
          <ContextMenuTrigger
            class="grid grid-cols-4 gap-1"
            onContextMenu={(e: MouseEvent) => {
              const cara = (e.target as HTMLElement).closest<HTMLElement>("[data-dock-agent]");
              if (!cara) e.preventDefault();
              setMenuDe(cara?.dataset.dockAgent ?? null);
            }}
          >
            <For each={ordenados()}>
              {(agente) => {
                const texto = () => `${label(agente.name)} · ${dockStatusText(agente)}`;
                return (
                  <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="top" gutter={6}>
                    <TooltipTrigger
                      as="button"
                      type="button"
                      class={cn("relative flex min-w-0 flex-col items-center gap-0.5 rounded-lg border border-transparent bg-transparent px-0.5 py-1 hover:bg-neutral-100", nombres() && "py-1.5")}
                      data-dock-agent={agente.name}
                      aria-label={texto()}
                      onClick={(e: MouseEvent) => hablar(agente.name, e.currentTarget as HTMLElement)}
                    >
                      <span class="relative grid place-items-center">
                        <AstroAvatar
                          name={agente.name}
                          status={agente.status ?? "asleep"}
                          body={props.profileOf?.(agente.name)?.body}
                          avatar={props.profileOf?.(agente.name)?.avatar}
                          size={24}
                        />
                        <Show when={agente.liveTasks > 0}>
                          <span
                            aria-hidden="true"
                            class="absolute -right-[3px] -bottom-[3px] rounded-full bg-neutral-950 px-[3px] text-[9px] leading-3 font-bold text-surface"
                          >
                            {agente.liveTasks}
                          </span>
                        </Show>
                      </span>
                      <Show when={nombres()}>
                        <span class="max-w-full truncate text-caption leading-none text-neutral-500">{label(agente.name)}</span>
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
      </Show>

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
                    class="flex w-full items-center gap-2 truncate rounded-md border-0 bg-transparent px-2 py-1 text-left text-sm hover:bg-neutral-100"
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
