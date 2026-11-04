import Inbox from "lucide-solid/icons/inbox";
import Globe from "lucide-solid/icons/globe";
import Monitor from "lucide-solid/icons/monitor";
import Plus from "lucide-solid/icons/plus";
import SquarePen from "lucide-solid/icons/square-pen";
import X from "lucide-solid/icons/x";
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js";
import { t } from "../../lib/i18n";
import type { AgentProfile } from "../../lib/model";
import { ariaDeAtajo, flechaDeLista, textoDeAtajo } from "../../lib/shortcuts";
import { corta } from "../../lib/sites";
import { type BatchCloseAction, isTaskTab, type Tab, tabsToClose } from "../../lib/tabs";
import { cn } from "../../lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../../ui/ContextMenu";
import { Atajo } from "../../ui/Shortcut";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/DropdownMenu";
import { MarcaAgente } from "../../ui/icons";
import { WithMentions } from "../chat/WithMentions";
import { IconoDeArchivo } from "../code/FileIcon";
import { colorDeMarca, describirEstado, localDe } from "../code/localStatus";
import { AstroAvatar } from "./AstroAvatar";
import { displayName, watchProfiles } from "./profiles";
import SessionGit, { sessionGitDescription } from "./SessionGit";
import { readableSessionTitle, type SessionRow, threadTitle } from "./Sessions";
import EstadoDeTarea, { taskLabel } from "./TaskStatus";
import { taskPriority } from "@terminus/design";
import { type GitStatus, watchSessionGit } from "./taskGit";

// Lo que asoma de la pestaña vecina y el padding de la tira, en px.
const PEEK = 56;
const EDGE = 6;

// El For de App vuelve a montar la tira al activar una pestaña; su scroll sobrevive aquí.
const scrollBySite = new Map<string, number>();

// Tira de pestañas; lib/tabs.ts determina su persistencia y el cierre en bloque.
// Cerrar una pestaña deja su tarea y su turno vivos.
export default function TabStrip(props: {
  tabs: Tab[];
  pinnedIds?: ReadonlySet<string>;
  onPin?: (id: string) => void;
  session: (id: string) => SessionRow | undefined;
  activeId: string | null;
  liveIds: string[];
  approvingIds: string[];
  waitingIds: string[];
  onPick: (id: string) => void;
  onClose: (id: string) => void;
  dirtyIds: ReadonlySet<string>;
  onCloseMany: (ids: string[]) => void;
  canReopen: boolean;
  onReopen: () => void;
  // El arrastre nativo de Tauri intercepta dragstart/drop; las pestañas usan eventos de puntero.
  onDrag?: (id: string, e: PointerEvent) => void;
  dropIndex?: number | null;
  // La tarea nueva sin lanzar no tiene pestaña en lib/tabs.ts; la tira la pinta delante.
  draftLabel?: string;
  // Sin él no hay a qué volver y la tarea nueva no se cierra.
  onCloseDraft?: () => void;
}) {
  let strip: HTMLDivElement | undefined;
  const [gitRows, setGitRows] = createSignal<Record<string, GitStatus>>({});
  const [profiles, setProfiles] = createSignal<Record<string, AgentProfile>>({});
  const projects = createMemo(() => JSON.stringify([...new Set(props.tabs.filter(isTaskTab).map(p => p.project))].sort()));
  createEffect(() => {
    const keys = projects();
    const watchers = (JSON.parse(keys) as string[]).map(project => {
      const watcher = watchSessionGit(project);
      createEffect(() => watcher.prioritize(props.tabs.filter(isTaskTab)
        .filter(p => p.project === project && p.id === props.activeId).map(p => p.session)));
      return watcher;
    });
    createEffect(() => setGitRows(Object.assign({}, ...watchers.map(w => w.rows()))));
    // Agentes del mismo nombre en distintos proyectos comparten la apariencia de la tira.
    const faces = (JSON.parse(keys) as string[]).map(watchProfiles);
    createEffect(() => setProfiles(Object.assign({}, ...faces.map((f) => f()))));
    onCleanup(() => watchers.forEach(w => w.release()));
  });

  // Calcular los grupos en cada pestaña las suscribiría individualmente a la tira entera.
  const separators = createMemo(() => {
    const out = new Set<string>();
    props.tabs.forEach((p, i) => {
      if (i === 0) return;
      const before = props.tabs[i - 1];
      if (p.session !== before.session || p.project !== before.project) out.add(p.id);
    });
    return out;
  });

  // Los nombres repetidos se distinguen con su carpeta dentro de esta tira.
  const labels = createMemo(() => {
    const path = (p: Tab) =>
      p.clase === "archivo" ? p.ruta : p.clase === "artefacto" ? p.rel : "";
    const name = (r: string) => r.slice(r.lastIndexOf("/") + 1);
    const count = new Map<string, number>();
    for (const p of props.tabs) {
      // Los sitios quedan fuera del recuento: no deben desambiguar nombres de archivo.
      if (isTaskTab(p) || p.clase === "sitio") continue;
      const n = name(path(p));
      count.set(n, (count.get(n) ?? 0) + 1);
    }
    return new Map(
      props.tabs
        .filter((p) => !isTaskTab(p))
        .map((p) => {
          if (p.clase === "sitio")
            return [p.id, p.url ? corta(p.url) : t("sites.new_tab")] as const;
          const r = path(p);
          const n = name(r);
          if ((count.get(n) ?? 0) < 2) return [p.id, n] as const;
          const remaining = r.slice(0, r.length - n.length - 1);
          const folder = remaining.slice(remaining.lastIndexOf("/") + 1);
          return [p.id, folder ? `${folder}/${n}` : n] as const;
        }),
    );
  });

  // Se revela el envoltorio, que incluye el botón de cerrar. Si hay que desplazar,
  // asoma también la vecina de ese lado para poder seguir avanzando con clics.
  function reveal(n: number) {
    revealElement(strip?.querySelector<HTMLElement>(`[data-envoltorio="${n}"]`), n > 0, n < props.tabs.length - 1);
  }
  function revealElement(element: HTMLElement | null | undefined, before: boolean, after: boolean) {
    if (!strip || !element) return;
    const start = element.offsetLeft - EDGE;
    const end = element.offsetLeft + element.offsetWidth + EDGE;
    const view = strip.clientWidth;
    let target = strip.scrollLeft;
    if (start < target) target = start - (before ? PEEK : 0);
    else if (end > target + view) target = end + (after ? PEEK : 0) - view;
    else return;
    strip.scrollLeft = Math.max(0, Math.min(target, strip.scrollWidth - view));
  }
  const site = () => strip?.closest("[data-ventana]")?.getAttribute("data-ventana") ?? "";
  let restored = false;
  createEffect(
    on(
      () => props.activeId,
      (id) => {
        if (!restored && strip) {
          restored = true;
          strip.scrollLeft = scrollBySite.get(site()) ?? 0;
        }
        if (!id) {
          if (props.draftLabel) revealElement(strip?.querySelector<HTMLElement>("[data-borrador]"), true, previewTabs().length > 0);
          return;
        }
        // Los ids contienen bytes nulos y no se pueden usar como valores de un selector CSS.
        const n = orderedTabs().findIndex((p) => p.id === id);
        if (n >= 0) reveal(n);
      },
    ),
  );

  function wheel(e: WheelEvent) {
    const el = e.currentTarget as HTMLElement;
    const limit = el.scrollWidth - el.clientWidth;
    if (limit <= 0 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const before = el.scrollLeft;
    el.scrollLeft = Math.min(limit, Math.max(0, before + e.deltaY));
    if (el.scrollLeft !== before) e.preventDefault();
  }

  // Sin barra de desplazamiento: las pestañas se recorren con la rueda o el trackpad.
  function scrolled() {
    if (strip) scrollBySite.set(site(), strip.scrollLeft);
  }

  const [selected, setSelectedTab] = createSignal<string | null>(null);
  const group = (action: BatchCloseAction) => {
    const id = selected();
    return id ? tabsToClose(props.tabs, id, action) : [];
  };
  const closeBatch = (action: BatchCloseAction) => {
    const ids = group(action);
    if (ids.length) props.onCloseMany(ids);
  };

  function move(e: KeyboardEvent) {
    if (!flechaDeLista(e)) return;
    const offset = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!offset) return;
    e.preventDefault();
    const list = keptTabs();
    if (list.length === 0) return;
    const i = list.findIndex((p) => p.id === props.activeId);
    const next = list[(i + offset + list.length) % list.length];
    if (!next) return;
    props.onPick(next.id);
    const n = (i + offset + list.length) % list.length;
    strip?.querySelector<HTMLElement>(`[data-pestana="${n}"]`)?.focus();
    reveal(n);
  }

  const keptTabs = () => props.tabs.filter((p) => !props.pinnedIds || props.pinnedIds.has(p.id));
  const previewTabs = () => props.tabs.filter((p) => props.pinnedIds && !props.pinnedIds.has(p.id));
  const orderedTabs = () => [...keptTabs(), ...previewTabs()];
  const renderTab = (p: Tab, i: () => number) => {
    const active = () => p.id === props.activeId;
    const transient = () => props.pinnedIds !== undefined && !props.pinnedIds.has(p.id);
    const task = () => isTaskTab(p);
    const row = () => props.session(p.session);
    const agentProfile = () => {
      const s = row();
      return s?.agent ?? null;
    };
    const legacyConversation = () => !!row()?.chat_de_agente;
    const sinEmpezar = () => {
      const s = row();
      return isTaskTab(p) && s?.turns === 0 && !s.chat_de_agente && !s.subagent && !props.liveIds.includes(p.session);
    };
    const fullTitle = () => {
      if (sinEmpezar()) return t("projects.view.new_task");
      const agent = agentProfile();
      if (agent && isTaskTab(p)) {
        if (!legacyConversation()) return row()?.title ?? p.titulo;
        return row()?.agent_thread
          ? t("projects.threads.heading", { name: displayName(agent, profiles()[agent]), title: threadTitle(row()) })
          : displayName(agent, profiles()[agent]);
      }
      return isTaskTab(p) || p.clase === "inbox" || p.clase === "broadcasts" || p.clase === "observabilidad" || p.clase === "pantalla"
        ? (isTaskTab(p) && props.session(p.session)?.subagent ? readableSessionTitle(p.titulo) : p.titulo)
        : (labels().get(p.id) ?? "");
    };
    // Anteponer el agente haría que varios títulos truncaran con el mismo texto.
    const text = () => {
      const s = row();
      return isTaskTab(p) && agentProfile() && s?.agent_thread && !s.inbox ? threadTitle(s) : fullTitle();
    };
    const detail = () =>
      p.clase === "archivo"
        ? p.ruta
        : p.clase === "artefacto"
          ? p.rel
          : p.clase === "sitio"
            ? p.url
            : undefined;
    const activity = () => taskPriority({ aprobando: props.approvingIds.includes(p.session), viva: props.liveIds.includes(p.session), esperando: props.waitingIds.includes(p.session), outcome: props.session(p.session)?.outcome });
    const description = () => isTaskTab(p) ? [fullTitle(), taskLabel(activity()), sessionGitDescription(gitRows()[p.session])].filter(Boolean).join(" · ") : undefined;
    const startsGroup = () => separators().has(p.id);
    const dirty = () => props.dirtyIds.has(p.id);
    const local = () =>
      p.clase === "archivo" ? localDe(p.project, p.session, p.arbol, p.ruta) : undefined;
    const statusDecorated = (base: string | undefined) => {
      const l = local();
      return l ? [base, describirEstado(l)].filter(Boolean).join(" · ") : base;
    };
    return (
      <>
        <Show when={startsGroup()}>
          <span
            aria-hidden="true"
            class="mx-1 h-4 w-px shrink-0 self-center bg-border"
          />
        </Show>
        <Show when={props.dropIndex === i()}>
          <span
            aria-hidden="true"
            class="-mx-px h-5 w-0.5 shrink-0 self-center rounded-full bg-primary"
          />
        </Show>
        {/* Un botón dentro de role=tab queda oculto en algunos árboles de accesibilidad. */}
        <div
          data-envoltorio={i()}
          data-preview={transient() ? "" : undefined}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            props.onDrag?.(p.id, e);
          }}
          class={cn(
            "group flex h-[30px] shrink-0 touch-none items-center rounded-sm pr-1 select-none",
            task() ? "w-[220px] text-ui" : "w-[180px] text-label",
            active()
              ? "tab-active font-semibold text-neutral-950"
              : "font-medium text-neutral-500 hover:bg-neutral-950/5 hover:text-neutral-950",
          )}
        >
          <div
            role={transient() ? "button" : "tab"}
            aria-selected={transient() ? undefined : active()}
            aria-current={transient() && active() ? "true" : undefined}
            onDblClick={(event) => {
              event.stopPropagation();
              props.onPin?.(p.id);
            }}
            tabindex={active() || (i() === 0 && !props.tabs.some((x) => x.id === props.activeId)) ? 0 : -1}
            data-pestana={transient() ? undefined : i()}
            title={statusDecorated(
              dirty()
                ? t("projects.tabs.unsaved.named", { title: detail() ?? text() })
                : (description() ?? detail()),
            )}
            aria-label={statusDecorated(
              dirty()
                ? t("projects.tabs.unsaved.named", { title: text() })
                : (description() ?? (local() ? text() : undefined)),
            )}
            onClick={() => {
              props.onPick(p.id);
              // El foco del clic solo revela el tab, sin su botón de cerrar.
              reveal(i());
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                props.onClose(p.id);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                props.onPick(p.id);
              }
              if (e.key === "Delete") {
                e.preventDefault();
                props.onClose(p.id);
              }
            }}
            class={cn(
              "flex h-full min-w-0 flex-1 cursor-default items-center gap-1.5 rounded-sm outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              task() ? "pl-2" : "pl-1.5 font-mono",
              transient() && "font-normal italic",
            )}
          >
            <Show
              when={isTaskTab(p)}
              fallback={
              <Show
                  when={p.clase !== "sitio" && p.clase !== "inbox" && p.clase !== "broadcasts" && p.clase !== "observabilidad" && p.clase !== "pantalla"}
                  fallback={
                    <Show when={p.clase === "pantalla"} fallback={<Show when={p.clase === "inbox" || p.clase === "broadcasts"} fallback={<Globe size={12} class="shrink-0 text-neutral-500" aria-hidden={true} />}><Inbox size={12} class="shrink-0 text-neutral-500" aria-hidden={true} /></Show>}>
                      <Monitor size={12} class="shrink-0 text-neutral-500" aria-hidden={true} />
                    </Show>
                  }
                >
                  <IconoDeArchivo
                    ruta={detail() ?? ""}
                    size={12}
                    class="shrink-0 text-neutral-500"
                  />
                </Show>
              }
            >
              <span class="inline-flex shrink-0 items-center gap-1">
                  <EstadoDeTarea
                    outcome={row()?.outcome}
                    aprobando={props.approvingIds.includes(p.session)}
                    viva={props.liveIds.includes(p.session)}
                    esperando={props.waitingIds.includes(p.session)}
                  />
                <Show
                  when={agentProfile()}
                  fallback={
                    <Show when={row()?.provider}>
                      {(agent) => (
                        <span class="inline-flex shrink-0" title={agent()} aria-label={agent()}>
                          <MarcaAgente id={agent()} size={12} />
                        </span>
                      )}
                    </Show>
                  }
                >
                  {(name) => (
                    <span class="inline-flex shrink-0" title={name()} aria-label={name()}>
                      <AstroAvatar
                        name={name()}
                        status="awake"
                        body={profiles()[name()]?.body}
                        avatar={profiles()[name()]?.avatar}
                        size={16}
                      />
                    </span>
                  )}
                </Show>
                <Show when={!agentProfile()}>
                  <SessionGit compact status={gitRows()[p.session]} />
                </Show>
              </span>
            </Show>
            <span class={cn("min-w-0 flex-1 truncate", local() && colorDeMarca(local()!.marca))}>
              <Show when={isTaskTab(p)} fallback={text()}>
                <WithMentions>{text()}</WithMentions>
              </Show>
            </span>
            <Show when={local()}>
              {(l) => (
                <span
                  aria-hidden="true"
                  class={cn("shrink-0 text-2xs font-semibold", colorDeMarca(l().marca))}
                >
                  {l().marca}
                </span>
              )}
            </Show>
          </div>
          <button
            type="button"
            tabindex={-1}
            aria-label={t("projects.tabs.close_named", {
              title: detail() ?? text(),
            })}
            title={`${t("projects.tabs.close")} (${textoDeAtajo("closeTab")})`}
            aria-keyshortcuts={active() ? ariaDeAtajo("closeTab") : undefined}
            onClick={() => props.onClose(p.id)}
            class={cn(
              "grid size-5 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:opacity-100",
              active() || dirty()
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            )}
          >
            {/* El punto de borrador debe seguir visible: cerrar la pestaña puede perder lo escrito. */}
            <Show when={dirty()} fallback={<X size={13} />}>
              <span
                aria-hidden="true"
                class={cn(
                  "size-1.5 rounded-full group-hover:hidden",
                  active() ? "bg-neutral-950" : "bg-neutral-500",
                )}
              />
              <X
                size={13}
                class="hidden group-hover:block"
              />
            </Show>
          </button>
        </div>
      </>
    );
  };

  return (
    <ContextMenu>
    <ContextMenuTrigger
      ref={strip}
      data-tab-scroll=""
      onKeyDown={move}
      onWheel={wheel}
      onScroll={scrolled}
      onContextMenu={(e: MouseEvent) => {
        const element = (e.target as HTMLElement).closest<HTMLElement>("[data-envoltorio]");
        const p = element ? orderedTabs()[Number(element.dataset.envoltorio)] : undefined;
        if (!p) e.preventDefault();
        setSelectedTab(p?.id ?? null);
      }}
      // La pestaña activa toca el borde inferior para fundirse con su panel bajo el velo.
      // flex-1 separaría el botón de añadir de la última pestaña.
      // Con touchpad en Windows, el rebote elástico al tope desplaza el texto sin el fondo de la pestaña.
      class="group/strip relative flex min-w-0 items-end gap-0.5 self-stretch overflow-x-auto overflow-y-hidden overscroll-x-none px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div role="tablist" aria-label={t("projects.tabs.label")} class="flex shrink-0 items-end gap-0.5 self-stretch">
        <For each={keptTabs()}>{renderTab}</For>
      <Show when={props.dropIndex === keptTabs().length}>
        <span
          aria-hidden="true"
          class="h-5 w-0.5 shrink-0 self-center rounded-full bg-primary"
        />
      </Show>
      </div>
      {/* Tras las conservadas: al lanzarse, su pestaña conservada aparece en este mismo sitio.
          Fuera del tablist y sin rol de pestaña, como las vistas: no es una pestaña guardada. */}
      <Show when={props.draftLabel}>
        {(label) => (
          <div
            data-borrador=""
            class="tab-active ml-0.5 group flex h-[30px] w-[220px] shrink-0 items-center rounded-sm pr-1 text-ui font-semibold text-neutral-950 select-none"
          >
            <div
              aria-current="page"
              title={label()}
              class="flex h-full min-w-0 flex-1 cursor-default items-center gap-1.5 pl-2"
            >
              <SquarePen size={12} class="shrink-0 text-neutral-500" aria-hidden={true} />
              <span class="min-w-0 flex-1 truncate">{label()}</span>
            </div>
            <Show when={props.onCloseDraft}>
              {(close) => (
                <button
                  type="button"
                  tabindex={-1}
                  aria-label={t("projects.tabs.close_named", { title: label() })}
                  title={`${t("projects.tabs.close")} (${textoDeAtajo("closeTab")})`}
                  aria-keyshortcuts={ariaDeAtajo("closeTab")}
                  onClick={() => close()()}
                  class="grid size-5 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:opacity-100"
                >
                  <X size={13} />
                </button>
              )}
            </Show>
          </div>
        )}
      </Show>
      <Show when={previewTabs().length > 0}>
      <div data-preview-header="" class="ml-0.5 flex shrink-0 items-end self-stretch">
        <For each={previewTabs()}>{(p, i) => renderTab(p, () => keptTabs().length + i())}</For>
      </div>
      </Show>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <Show when={selected() && props.pinnedIds && !props.pinnedIds.has(selected()!)}>
        <ContextMenuItem onSelect={() => selected() && props.onPin?.(selected()!)}>
          {t("projects.tabs.keep")}
        </ContextMenuItem>
      </Show>
      <ContextMenuItem onSelect={() => closeBatch("esta")}>
        {t("projects.tabs.close")}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={group("demas").length === 0}
        onSelect={() => closeBatch("demas")}
      >
        {t("projects.tabs.close_others")}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={group("derecha").length === 0}
        onSelect={() => closeBatch("derecha")}
      >
        {t("projects.tabs.close_right")}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => closeBatch("todas")}>
        {t("projects.tabs.close_all")}
      </ContextMenuItem>
      <ContextMenuItem disabled={!props.canReopen} onSelect={() => props.onReopen()}>
        <Atajo accion="reopenTab" etiqueta={t("projects.tabs.reopen")} />
      </ContextMenuItem>
    </ContextMenuContent>
    </ContextMenu>
  );
}

// El botón de añadir se monta aparte para conservarlo cuando la tira se vuelve a montar.
export function NewTabButton(props: {
  projects: { id: string; name: string }[];
  onNewTask: (project: string) => void;
  onBrowser: () => void;
}) {
  let selected = false;
  // Un menú modal impediría enfocar la barra del navegador recién abierto.
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={t("projects.tabs.new")}
        title={t("projects.tabs.new")}
        class="ml-0.5 grid size-6 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary data-[expanded]:bg-surface-muted data-[expanded]:text-neutral-950"
      >
        <Plus size={14} />
      </DropdownMenuTrigger>
      {/* Restaurar el foco al botón impediría enfocar el contenido que acaba de abrirse. */}
      <DropdownMenuContent
        class="max-w-[280px]"
        onCloseAutoFocus={(e) => {
          if (selected) e.preventDefault();
          selected = false;
        }}
      >
        <Show when={props.projects.length > 0}>
          <DropdownMenuGroup>
            <DropdownMenuGroupLabel>{t("projects.tabs.new_task_in")}</DropdownMenuGroupLabel>
            <For each={props.projects}>
              {(c) => (
                <DropdownMenuItem
                  class="flex items-center gap-2"
                  onSelect={() => {
                    selected = true;
                    props.onNewTask(c.id);
                  }}
                >
                  <SquarePen size={13} class="shrink-0 text-neutral-500" aria-hidden={true} />
                  <span class="min-w-0 truncate">{c.name}</span>
                </DropdownMenuItem>
              )}
            </For>
          </DropdownMenuGroup>
        </Show>
        <Show when={props.projects.length > 0}>
          <DropdownMenuSeparator />
        </Show>
        <DropdownMenuItem
          class="flex items-center gap-2"
          onSelect={() => {
            selected = true;
            props.onBrowser();
          }}
        >
          <Globe size={13} class="shrink-0 text-neutral-500" aria-hidden={true} />
          <span>{t("projects.tabs.new_browser")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
