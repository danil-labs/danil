import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronUp from "lucide-solid/icons/chevron-up";
import List from "lucide-solid/icons/list";
import Plus from "lucide-solid/icons/plus";
import SquarePen from "lucide-solid/icons/square-pen";
import { createMemo, createSignal, For, type JSX, onCleanup, Show } from "solid-js";
import { t } from "../../lib/i18n";
import type { AgentProfile } from "../../lib/model";
import { cn } from "../../lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../../ui/ContextMenu";
import { Popover, PopoverContent } from "../../ui/Popover";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../ui/Tooltip";
import { AstroAvatar } from "../projects/AstroAvatar";
import { displayName } from "../projects/profiles";
import { agentFolder, type DockAgent, orderDockAgents, planDock } from "./dockLayout";

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

/** Botón pequeño de la cabecera: nombres y desplegar. */
const ICONO =
  "grid size-6 place-items-center rounded-md border border-border bg-transparent text-neutral-500 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-primary aria-pressed:bg-neutral-100 aria-pressed:text-neutral-950";

/** Caras que caben en la fila del dock: una sola fila, de alto fijo. */
const CARAS = 5;

type DockFolder = { id: string; name: string };

/** Los nombres de cada nivel: workspace, instalados en la carpeta abierta y detectados en su repositorio. */
export type DockGroups = { workspace: string[]; project: string[]; repo: string[] };

/**
 * La banda de agentes al pie del sidebar. Plegada es una sola fila de caras,
 * de alto fijo; al pasar el cursor asoma encima la cabecera con «Tus agentes»,
 * los nombres y la flecha. La flecha desliza el panel hacia arriba hasta cubrir
 * el riel entero, con los agentes repartidos en workspace, instalados en la
 * carpeta abierta y detectados en su repositorio. Pulsar una cara abre su chat;
 * el clic derecho filtra sus tareas o abre su perfil.
 */
export default function AgentDock(props: {
  agents: DockAgent[];
  /** El agente del filtro del riel: su cara nunca queda escondida. */
  selected: string | null;
  /** Carpetas donde está cada agente, en el orden del riel. */
  foldersOf: (name: string) => DockFolder[];
  /** La carpeta de lo que se mira ahora, que gana si el agente está en ella. */
  currentFolder: string | null;
  currentFolderName?: string | null;
  /** De dónde viene cada agente, para el panel. Sin carpeta abierta, solo workspace. */
  groups?: DockGroups;
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
  const deGrupo = (names: readonly string[] | undefined) => {
    const set = new Set(names ?? []);
    return ordenados().filter((a) => set.has(a.name));
  };
  const grupos = createMemo(() => ({
    workspace: deGrupo(props.groups?.workspace),
    project: deGrupo(props.groups?.project),
    repo: deGrupo(props.groups?.repo),
  }));

  // La fila: primero los de aquí (workspace y carpeta abierta) y, si no hay, cualquiera.
  const fila = createMemo(() => {
    const g = grupos();
    const aqui = [...g.workspace, ...g.project, ...g.repo];
    const candidatos = aqui.length > 0 ? ordenados().filter((a) => aqui.includes(a)) : ordenados();
    return planDock(candidatos, CARAS, { selected: props.selected }).shown;
  });
  const sobran = () => Math.max(0, ordenados().length - fila().length);

  const cerrarConEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape" && desplegado()) setDesplegado(false);
  };
  window.addEventListener("keydown", cerrarConEscape);
  onCleanup(() => window.removeEventListener("keydown", cerrarConEscape));

  // Un agente en varias carpetas sin ninguna obvia: se pregunta dónde, junto a su cara.
  const [eligiendo, setEligiendo] = createSignal<{ name: string; anchor: HTMLElement; folders: DockFolder[] } | null>(null);
  const hablar = (name: string, anchor: HTMLElement) => {
    const folders = props.foldersOf(name);
    const id = agentFolder(folders.map((f) => f.id), props.currentFolder);
    if (id) {
      setDesplegado(false);
      props.onTalk(id, name);
    } else if (folders.length > 0) setEligiendo({ name, anchor, folders });
  };
  const [menuDe, setMenuDe] = createSignal<string | null>(null);
  const perfil = (name: string) => {
    const folders = props.foldersOf(name);
    const id = agentFolder(folders.map((f) => f.id), props.currentFolder) ?? folders[0]?.id;
    if (id) props.onProfile(id, name);
  };

  const cara = (a: DockAgent, size: number) => (
    <span class="relative grid shrink-0 place-items-center">
      <AstroAvatar
        name={a.name}
        status={a.status ?? "asleep"}
        body={props.profileOf?.(a.name)?.body}
        avatar={props.profileOf?.(a.name)?.avatar}
        size={size}
      />
      <Show when={a.liveTasks > 0}>
        <span
          aria-hidden="true"
          class="absolute -right-[3px] -bottom-[3px] rounded-full bg-neutral-950 px-[3px] text-[9px] leading-3 font-bold text-surface"
        >
          {a.liveTasks}
        </span>
      </Show>
    </span>
  );

  const filaPanel = (a: DockAgent, esRepo: boolean) => (
    <button
      type="button"
      class="group/fila flex w-full min-w-0 items-center gap-2.5 rounded-md border-0 bg-transparent px-2 py-1.5 text-left outline-none hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
      data-dock-agent={a.name}
      onClick={(e: MouseEvent) => hablar(a.name, e.currentTarget as HTMLElement)}
    >
      {cara(a, 24)}
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-neutral-950">{label(a.name)}</span>
        <span class="block truncate text-caption text-neutral-500">{dockStatusText(a)}</span>
      </span>
      <Show when={esRepo}>
        <span class="rounded-full border border-dashed border-neutral-300 px-1.5 text-2xs text-neutral-500">
          {t("shell.agent_dock.repo")}
        </span>
      </Show>
      <SquarePen size={14} aria-hidden="true" class="shrink-0 text-neutral-400 group-hover/fila:text-neutral-950" />
    </button>
  );

  const seccion = (titulo: string, agentes: DockAgent[], esRepo: boolean, vacio?: string) => (
    <section class="flex flex-col gap-0.5">
      <h3 class="m-0 px-2 pt-3 pb-1 text-caption font-medium text-neutral-500">{titulo}</h3>
      <Show
        when={agentes.length > 0}
        fallback={<Show when={vacio}><p class="m-0 px-2 pb-1 text-caption text-neutral-400">{vacio}</p></Show>}
      >
        <For each={agentes}>{(a) => filaPanel(a, esRepo)}</For>
      </Show>
    </section>
  );

  const botones = (): JSX.Element => (
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
        aria-label={desplegado() ? t("shell.agent_dock.collapse") : t("shell.agent_dock.expand")}
        title={desplegado() ? t("shell.agent_dock.collapse") : t("shell.agent_dock.expand")}
        onClick={() => setDesplegado((v) => !v)}
      >
        <Show when={desplegado()} fallback={<ChevronUp size={13} aria-hidden="true" />}>
          <ChevronDown size={13} aria-hidden="true" />
        </Show>
      </button>
    </div>
  );

  return (
    // Sin `relative` en la raíz: el panel desplegado se posiciona contra el riel y lo cubre entero.
    <div role="group" aria-label={t("shell.agent_dock.title")}>
      <div
        class={cn(
          "absolute inset-0 z-50 flex flex-col bg-surface transition-[translate,opacity,visibility] duration-300 ease-out",
          desplegado() ? "visible translate-y-0 opacity-100" : "invisible pointer-events-none translate-y-full opacity-0",
        )}
        aria-hidden={!desplegado()}
        inert={!desplegado()}
        data-dock-panel=""
      >
        <div class="flex items-center border-b border-border px-3 py-2.5">
          <span class="text-sm font-medium text-neutral-950">{t("shell.agent_dock.team")}</span>
          {botones()}
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {seccion(t("shell.agent_dock.workspace"), grupos().workspace, false, t("shell.agent_dock.workspace_empty"))}
          <Show
            when={props.currentFolder}
            fallback={<p class="m-0 px-2 pt-3 text-caption text-neutral-400">{t("shell.agent_dock.no_folder")}</p>}
          >
            {seccion(
              props.currentFolderName
                ? t("shell.agent_dock.project_in", { folder: props.currentFolderName })
                : t("shell.agent_dock.project"),
              grupos().project,
              false,
              t("shell.agent_dock.project_empty"),
            )}
            {seccion(t("shell.agent_dock.repository"), grupos().repo, true, t("shell.agent_dock.repo_empty"))}
          </Show>
        </div>
        <div class="flex items-center gap-1 border-t border-border px-2 py-2">
          <button
            type="button"
            class="rounded-md border-0 bg-transparent px-2 py-1 text-caption text-neutral-500 hover:text-neutral-950"
            onClick={() => { setDesplegado(false); props.onSeeAll(); }}
          >
            {t("shell.agent_dock.see_all")}
          </button>
          <Show when={props.onNewAgent}>
            <button
              type="button"
              class="ml-auto flex items-center gap-1 rounded-md border-0 bg-transparent px-2 py-1 text-caption text-neutral-500 hover:text-neutral-950"
              onClick={() => props.onNewAgent?.()}
            >
              <Plus size={12} aria-hidden="true" />
              {t("projects.agents.new_open")}
            </button>
          </Show>
        </div>
      </div>

      {/* La banda: una fila de caras de alto fijo. La cabecera asoma encima al pasar el cursor. */}
      <div class="group/dock relative border-t border-border px-2">
        <div
          class={cn(
            "pointer-events-none absolute inset-x-0 bottom-full flex translate-y-1 items-center border-t border-border bg-surface px-3 py-1.5 opacity-0 transition-[opacity,translate] duration-150",
            "group-hover/dock:pointer-events-auto group-hover/dock:translate-y-0 group-hover/dock:opacity-100",
            "group-focus-within/dock:pointer-events-auto group-focus-within/dock:translate-y-0 group-focus-within/dock:opacity-100",
          )}
          data-dock-header=""
        >
          <span class="text-caption font-medium text-neutral-500">{t("shell.agent_dock.team")}</span>
          <Show when={sobran() > 0}>
            <span class="ml-1.5 text-caption text-neutral-400">+{sobran()}</span>
          </Show>
          {botones()}
        </div>

        <Show
          when={props.agents.length > 0}
          fallback={<p class="m-0 flex h-16 items-center truncate px-1 text-caption text-neutral-500">{t("shell.agent_dock.empty")}</p>}
        >
          <ContextMenu onOpenChange={(abierto) => { if (!abierto) setMenuDe(null); }}>
            <ContextMenuTrigger
              class="grid h-16 grid-cols-5 items-center gap-1"
              onContextMenu={(e: MouseEvent) => {
                const el = (e.target as HTMLElement).closest<HTMLElement>("[data-dock-agent]");
                if (!el) e.preventDefault();
                setMenuDe(el?.dataset.dockAgent ?? null);
              }}
            >
              <For each={fila()}>
                {(agente) => {
                  const texto = () => `${label(agente.name)} · ${dockStatusText(agente)}`;
                  return (
                    <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="top" gutter={6}>
                      <TooltipTrigger
                        as="button"
                        type="button"
                        class="relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-transparent bg-transparent px-0.5 py-1.5 hover:bg-neutral-100"
                        data-dock-agent={agente.name}
                        aria-label={texto()}
                        onClick={(e: MouseEvent) => hablar(agente.name, e.currentTarget as HTMLElement)}
                      >
                        {cara(agente, 24)}
                        <span
                          class={cn(
                            "max-w-full truncate text-2xs leading-none text-neutral-500 transition-[opacity,max-height] duration-200",
                            nombres() ? "max-h-3 opacity-100" : "max-h-0 opacity-0",
                          )}
                        >
                          {label(agente.name)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent class="pointer-events-none">
                        <span class="block">{label(agente.name)}</span>
                        <span class="block font-normal opacity-80">{dockStatusText(agente)}</span>
                      </TooltipContent>
                    </TooltipRoot>
                  );
                }}
              </For>
              <Show when={props.onNewAgent && fila().length < CARAS}>
                <button
                  type="button"
                  class={cn(SLOT, "justify-self-center")}
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
      </div>

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
