import { groupCardOptions, workStateOf } from "@terminus/tasks";
import { SignalDot } from "../../ui/SignalDot";
import History from "lucide-solid/icons/history";
import Plus from "lucide-solid/icons/plus";
import SquarePen from "lucide-solid/icons/square-pen";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { createEffect, createMemo, createResource, createSignal, type JSX, lazy, mapArray, on, onCleanup, Show, Suspense } from "solid-js";
import { destinoEnVuelo, puntoDelArrastre, tareaEnVuelo } from "../../lib/drag";
import { recordarCarpetas } from "../../lib/folderKinds";
import { t } from "../../lib/i18n";
import { lastRoster, rememberRoster } from "../../lib/handlerRoster";
import { invoke } from "../../lib/invoke.ts";
import type { AgentProfile, HandlerList, HandlerStatus, Project } from "../../lib/model";
import { createPref } from "../../lib/prefs";
import { sharedLazy } from "../../lib/sharedLazy";
import { ariaDeAtajo } from "../../lib/shortcuts";
import { cn } from "../../lib/utils";
import { KeyedList } from "../../ui/KeyedList";
import { TeclaDeAtajo } from "../../ui/Shortcut";
import {
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as SidebarShell,
} from "../../ui/sidebar";
import { type ClonEnCurso, faseDeClon } from "../projects/AddWorkdir";
import { AstroAvatar } from "../projects/AstroAvatar";
import { watchHandlerStatuses } from "../projects/handlerPresence";
import type { ModelChoices } from "../projects/NewAgent";
import { watchProfiles } from "../projects/profiles";
import Sessions, { type SessionRow } from "../projects/Sessions";
import { effectiveTaskGit, watchSessionGit } from "../projects/taskGit";
import type { Etapa } from "../projects/TaskStage";
import {
  agentOptions,
  applySidebarView,
  groupKey,
  groupLabel,
  setSidebarView,
  sidebarView,
  type SidebarGroup,
  type SidebarView,
} from "../../lib/sidebarView";
import type { DockAgent } from "./dockLayout";
import type { SidebarFilterProps } from "./SidebarFilter";
import { flattenTasks, folderCounts } from "./sidebarTasks";
import { machineName, machines } from "../machines/store";
// Solo al crear un encargado: fuera de la carga inicial.
import { LazyPart, retryableLazy } from "../../ui/LazyPart";
import { Spinner } from "../../ui/Spinner";
const NewAgent = retryableLazy(() => import("../projects/NewAgent"));

// Fuera de la carga inicial: el botón y el dock llegan un instante después de la lista.
const AgentDock = lazy(() => import("./AgentDock"));
const FolderGroupHeader = sharedLazy(() => import("./FolderGroupHeader"));

/* El ancho vive en `ColumnaLateral`, que es la columna que envuelve a esta
   barra. Aquí había cuatro constantes —expandido, mínimo, máximo y el riel— que
   existían para alimentar un panel redimensionable; ese panel se fue, y con él
   la única razón de que el ancho fuera un número en este archivo. */

/**
 * El rasgo que enciende la cabecera sobre la que se soltaría la tarea que va en
 * la mano. Solo agrupando por carpeta hay cabeceras que reciben tareas.
 */
const RECIBE_LA_TAREA = ["ring-2", "ring-primary"];


/**
 * Abierto o cerrado, y nada más.
 *
 * **Ni el ancho ni el arrastre viven aquí.** Los dos son de `ColumnaLateral`,
 * que es lo que las dos columnas comparten. Aquí queda lo
 * que **no** comparten: que el historial recuerda entre sesiones de la app si
 * estaba plegado, mientras la columna de artefactos se cierra al cambiar de
 * tarea porque es de ella.
 */
export function createSidebar() {
  const [savedCollapsed, setSavedCollapsed] = createPref("sidebar.collapsed", false);
  const media = window.matchMedia("(max-width: 600px)");
  const [narrow, setNarrow] = createSignal(media.matches);
  const [narrowCollapsed, setNarrowCollapsed] = createSignal(true);
  const update = () => {
    setNarrow(media.matches);
    if (media.matches) setNarrowCollapsed(true);
  };
  media.addEventListener("change", update);
  onCleanup(() => media.removeEventListener("change", update));
  // El teléfono abre sin historial y no cambia la preferencia del escritorio.
  const colapsado = () => narrow() ? narrowCollapsed() : savedCollapsed();

  return {
    colapsado,
    alternar: () => narrow()
      ? setNarrowCollapsed(!narrowCollapsed())
      : setSavedCollapsed(!savedCollapsed()),
  };
}

/**
 * La columna izquierda, montada sobre el shell de `ui/sidebar.tsx`.
 *
 * **Las tareas de todas las carpetas, por carpeta salvo que se elija otra
 * agrupación.** Por carpeta, una sin tareas también tiene su cabecera: la
 * recién agregada se ve. Sin agrupar, la carpeta es un dato de cada fila.
 */
export default function Sidebar(props: {
  projects: Project[];
  /** Por id de proyecto, no por nombre: un proyecto se renombra. */
  sessions: Record<string, SessionRow[]>;
  current: string | null;
  /** Las tareas que están contestando ahora mismo. */
  vivas: string[];
  /** Las tareas paradas esperando que apruebes una acción. */
  aprobando: string[];
  collapsed: boolean;
  onToggle: () => void;
  onPick: (project: string, id: string) => void;
  draggedTask?: string | null;
  dragFolder?: string | null;
  onDrag?: (project: string, row: SessionRow, event: PointerEvent) => void;
  onNew: () => void;
  onRenombrarProyecto: (id: string, name: string) => Promise<void> | void;
  onBorrarProyecto: (id: string) => Promise<void> | void;
  /** With more than one space, the folder leaves the active one instead of being deleted. */
  onRemoveFromSpace?: (id: string) => void;
  /** Abre «Añadir un proyecto»; `inicio` salta a uno de sus caminos. */
  /** El clon que corre ahora mismo, si lo hay. Ver `projects/AddWorkdir.tsx`. */
  clon: ClonEnCurso | null;
  /** Devuelve el diálogo del clon, con su progreso y su cancelación. */
  onAbrirClon: () => void;
  /** Qué proyecto se está mirando en el panel principal, si alguno. */
  proyectoAbierto: string | null;
  /** La carpeta de «Nueva tarea» cuando eso es lo que se mira: su cabecera va marcada. */
  carpetaDelBorrador?: string | null;
  /**
   * Abre el proyecto en el panel principal: sus tareas y su contexto fijo.
   * `machine`, la del grupo partido por máquina (`""` es esta): lo que se empiece ahí corre en ella.
   */
  onAbrirProyecto: (id: string, machine?: string) => void;
  /** Lo que se ofrece como modelo por defecto al crear un agente. */
  modelos: ModelChoices;
  /**
   * Empezar una tarea dentro de ese proyecto, sin pasar por su vista. `""` es sin carpeta.
   * `machine`, la del grupo partido por máquina (`""` es esta): la tarea se lanza en ella.
   */
  onNuevaTareaEn: (id: string, machine?: string) => void;
  onDelete: (project: string, id: string) => Promise<boolean | void> | boolean | void;
  onMove: (project: string, id: string, to: string) => void;
  onEtapa: (project: string, id: string, etapa: Etapa | null) => void;
  onRenombrar: (project: string, id: string, title: string) => Promise<boolean | void> | boolean | void;
  onPin?: (project: string, id: string, pinned: boolean) => void | Promise<void>;
  onSettings: (panel?: string) => void;
  attentionMenu?: (collapsed: boolean) => JSX.Element;
  /** Abre el chat con un agente de esa carpeta, como su fila de antes. */
  onHablarCon: (project: string, name: string) => void;
  onAgentProfile: (project: string, name: string) => void;
  /** Dónde se guarda la vista del riel: una por workspace y espacio (`sidebarViewKey`). */
  viewKey: string;
  /**
   * Entrega el filtro del riel al botón Personalizar de la franja; al desmontar,
   * `null` con el que se suelta, para no borrar el de un riel que ya lo relevó.
   */
  filterRef?: (filter: SidebarFilterProps | null, released?: SidebarFilterProps) => void;
  /** El nombre del escritorio activo, para su riel vacío. */
  escritorio?: string | null;
  spaces?: { id: string; name: string }[];
  onMoveToSpace?: (project: string, id: string, space: string) => void;
  /** «Traer a esta Mac» en el menú de una tarea de otra máquina; solo en el escritorio. */
  onBringHere?: (project: string, id: string) => void;
  /** «Llevar a otra máquina…» en el menú de una carpeta de git. */
  onCarryFolder?: (project: string, machine?: string) => void;
}) {
  const [creatingAgentIn, setCreatingAgentIn] = createSignal<{ id: string; name: string } | null>(null);
  let listViewport: HTMLDivElement | undefined;
  // Colapsado, el historial no desaparece: se abre al lado del riel.
  const [desplegado, setDesplegado] = createSignal(false);
  let riel: HTMLDivElement | undefined;

  // Expandir vuelve redundante el desplegable: la lista ya está a la vista.
  createEffect(
    on(
      () => props.collapsed,
      (c) => {
        if (!c) setDesplegado(false);
      },
    ),
  );

  createEffect(
    on(desplegado, (abierto) => {
      if (!abierto) return;
      const alPulsar = (e: PointerEvent) => {
        if (!riel?.contains(e.target as Node)) setDesplegado(false);
      };
      const alTeclear = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setDesplegado(false);
        }
      };
      document.addEventListener("pointerdown", alPulsar);
      window.addEventListener("keydown", alTeclear, true);
      onCleanup(() => {
        document.removeEventListener("pointerdown", alPulsar);
        window.removeEventListener("keydown", alTeclear, true);
      });
    }),
  );

  // Los grupos por carpeta plegados; la clave es la de siempre para no perder
  // lo que alguien ya había plegado. El de otra máquina, partido, lleva la suya
  // (`id@máquina`): plegar «Terminus · vm-principal» no pliega el de esta.
  const [cerrados, setCerrados] = createPref<string[]>("historial.cerrados", []);
  const alternarGrupo = (p: string) =>
    setCerrados(
      cerrados().includes(p)
        ? cerrados().filter((x) => x !== p)
        : [...cerrados(), p],
    );
  // Cada espacio guarda su vista: cambiar de espacio relee la suya.
  const vista = () => sidebarView(props.viewKey);
  const cambiarVista = (siguiente: SidebarView) => setSidebarView(props.viewKey, siguiente);

  createEffect(() => recordarCarpetas(props.projects));

  /** De qué carpeta es cada tarea, por id: las acciones de la fila llegan con el id. */
  const carpetaDeTarea = createMemo(() => {
    const mapa = new Map<string, string>();
    for (const [project, rows] of Object.entries(props.sessions)) for (const row of rows) if (!mapa.get(row.id)) mapa.set(row.id, project);
    return mapa;
  });
  const carpetaDe = (id: string) => carpetaDeTarea().get(id) ?? "";
  const nombreDe = (project: string) => props.projects.find((p) => p.id === project)?.name;
  const relacionadas = createMemo(() => Object.values(props.sessions).flat());

  const todas = createMemo(() => flattenTasks(props.sessions));
  const cuentas = createMemo(() => folderCounts(todas()));
  // La de esta computadora, con el nombre que le da la cuenta, como su tarjeta flotante.
  const nombreDeMaquina = (id: string) => {
    const aqui = id ? undefined : machines().find((m) => m.local);
    return id ? machineName(id) : aqui ? machineName(aqui.id) : "";
  };
  const variasMaquinas = () => machines().length > 1 || todas().some((x) => !!x.row.machine);
  /**
   * La vista que se aplica: de las carpetas elegidas, las que siguen teniendo
   * tareas. Si ninguna sigue, son todas: un filtro que deja la lista vacía sin
   * decir por qué parece que se borró el trabajo.
   */
  const vistaEfectiva = createMemo<SidebarView>(() => {
    const v = vista();
    const carpetas = v.folders.filter((f) => (cuentas().get(f) ?? 0) > 0);
    return carpetas.length === v.folders.length ? v : { ...v, folders: carpetas };
  });
  const gitCandidates = createMemo(() => applySidebarView(todas().map(task => task.row), { ...vistaEfectiva(), group: "none" }, {
    live: [], approving: [], folderOf: row => carpetaDe(row.id),
  })[0].tasks);
  const gitFolders = createMemo(() => [...new Set(gitCandidates().map(row => carpetaDe(row.id)))].sort(), [], {
    equals: (a, b) => a.length === b.length && a.every((project, i) => project === b[i]),
  });
  const gitObservers = createMemo(mapArray(gitFolders, project => {
    const watcher = watchSessionGit(project);
    const input = createMemo(() => JSON.stringify([
      gitCandidates().filter(row => carpetaDe(row.id) === project).map(row => [row.id, row.updated_at]), props.vivas, props.current,
    ]));
    createEffect(on(input, () => {
      watcher.prioritize([...(props.current ? [props.current] : []), ...props.vivas,
        ...gitCandidates().filter(row => carpetaDe(row.id) === project).map(row => row.id)]);
      watcher.refresh();
    }));
    onCleanup(watcher.release);
    return { project, rows: watcher.rows };
  }));
  const grupos = createMemo(() => {
    const todosLosGrupos = applySidebarView(todas().map((x) => x.row), vistaEfectiva(), {
      live: props.vivas,
      approving: props.aprobando,
      folderOf: (row) => carpetaDe(row.id),
      workStateOf: (row) => {
        const project = carpetaDe(row.id);
        const candidates = relacionadas().filter(other => carpetaDe(other.id) === project
          && (other.machine ?? "") === (row.machine ?? ""));
        const rows = gitObservers().find(observer => observer.project === project)?.rows() ?? {};
        return workStateOf(effectiveTaskGit(row, rows, candidates));
      },
    });
    // Por carpeta, en el orden del riel (la principal primero) y «sin carpeta» al final.
    const orden = (g: SidebarGroup<SessionRow>) => {
      if (g.kind !== "folder") return Number.MAX_SAFE_INTEGER;
      const i = props.projects.findIndex((p) => p.id === g.key);
      return i === -1 ? props.projects.length : i;
    };
    if (vistaEfectiva().group !== "folder") return todosLosGrupos;
    // Por carpeta, una sin tareas también es grupo, con su «+»: la recién agregada no puede faltar.
    const elegidas = vista().folders;
    const vacias = props.projects
      .filter((p) => (cuentas().get(p.id) ?? 0) === 0 && (elegidas.length === 0 || elegidas.includes(p.id)))
      .map((p): SidebarGroup<SessionRow> => ({ kind: "folder", key: p.id, tasks: [] }));
    return [...todosLosGrupos, ...vacias].map((g, i) => ({ g, i })).sort((a, b) => orden(a.g) - orden(b.g) || a.i - b.i).map(({ g }) => g);
  });
  const hayCarpetasVacias = () => grupos().some((g) => g.kind === "folder" && g.key && g.tasks.length === 0);
  const carpetasDelFiltro = createMemo(() => props.projects
    .filter((p) => (cuentas().get(p.id) ?? 0) > 0)
    .map((p) => ({ id: p.id, name: p.name, count: cuentas().get(p.id) ?? 0 })));

  /**
   * Los agentes del dock: los de las carpetas que tienen tareas, con su
   * presencia. Un mismo agente propio sale en cada carpeta y se junta por
   * nombre; manda el estado más despierto y se suman sus tareas vivas.
   */
  const carpetasConTareas = createMemo(
    () => [...cuentas().keys()].filter((k) => k !== "").sort(),
    [],
    { equals: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]) },
  );
  const [altas, setAltas] = createSignal(0);
  const alCrearAgente = () => setAltas((n) => n + 1);
  window.addEventListener("harness:encargados", alCrearAgente);
  onCleanup(() => window.removeEventListener("harness:encargados", alCrearAgente));
  const porCarpeta = createMemo(mapArray(carpetasConTareas, (project) => {
    const [roster] = createResource(() => `${project}:${altas()}`, async () => {
      try {
        const listado = (await invoke<HandlerList>("list_agents", { project })).agents;
        rememberRoster(project, listado);
        return listado;
      } catch {
        return lastRoster(project) ?? [];
      }
    });
    return {
      project,
      roster: () => roster() ?? lastRoster(project) ?? [],
      estados: watchHandlerStatuses(project),
      perfiles: watchProfiles(project),
    };
  }));
  const RANGO: Record<HandlerStatus, number> = { working: 2, awake: 1, asleep: 0 };
  const agentesDelDock = createMemo<DockAgent[]>(() => {
    const juntos = new Map<string, DockAgent>();
    for (const c of porCarpeta()) {
      const estados = new Map(c.estados().map((r) => [r.name, r] as const));
      for (const a of c.roster()) {
        const fila = estados.get(a.name);
        const antes = juntos.get(a.name);
        const status = fila?.status;
        juntos.set(a.name, {
          name: a.name,
          status: !antes?.status || (status && RANGO[status] > RANGO[antes.status]) ? status ?? antes?.status : antes.status,
          liveTasks: (antes?.liveTasks ?? 0) + (fila?.live_tasks ?? 0),
          minutesSinceLastTurn: fila?.minutes_since_last_turn ?? antes?.minutesSinceLastTurn ?? null,
        });
      }
    }
    return [...juntos.values()];
  });
  const perfilDe = (name: string): AgentProfile | undefined => {
    for (const c of porCarpeta()) {
      const perfil = c.perfiles()[name];
      if (perfil) return perfil;
    }
    return undefined;
  };
  /** Carpetas donde está el agente, en el orden del riel. */
  const carpetasDelAgente = (name: string) => {
    const orden = (id: string) => { const i = props.projects.findIndex((p) => p.id === id); return i === -1 ? props.projects.length : i; };
    return porCarpeta()
      .filter((c) => c.roster().some((a) => a.name === name))
      .map((c) => ({ id: c.project, name: nombreDe(c.project) ?? c.project }))
      .sort((a, b) => orden(a.id) - orden(b.id));
  };
  const agentesDelFiltro = createMemo(() =>
    agentOptions(agentesDelDock().map((a) => a.name), todas().map((x) => x.row))
      .map((a) => ({ ...a, body: perfilDe(a.name)?.body, avatar: perfilDe(a.name)?.avatar })));
  const filtro: SidebarFilterProps = {
    get view() { return vistaEfectiva(); },
    onChange: cambiarVista,
    get folders() { return carpetasDelFiltro(); },
    get agents() { return agentesDelFiltro(); },
    get machines() { return variasMaquinas(); },
  };
  props.filterRef?.(filtro);
  onCleanup(() => props.filterRef?.(null, filtro));

  /**
   * A qué proyectos puede irse una tarea que hoy está en `de`.
   *
   * **Sacarla de todos no está aquí**, aunque el backend lo trate como un
   * destino más (`to` vacío): en el menú es una acción y no un sitio, y
   * mezclarla con los nombres de proyecto la hacía leerse como uno.
   */
  const destinos = (de: string) =>
    props.projects
      .filter((p) => p.id !== de)
      .map((p) => ({ id: p.id, name: p.name }));

  /**
   * Un tramo de la lista: las tareas de varias carpetas en una sola lista.
   *
   * **Es un componente y no una variable con JSX.** La lista se pinta en dos
   * sitios —expandida y en el desplegable—; una variable contendría un solo
   * nodo del DOM y colocarlo dos veces lo movería del primero al segundo.
   */
  const Historial = (p: { filas: SessionRow[]; sinCarpeta?: boolean; sinMaquina?: boolean }) => (
    <Sessions sidebar gitManaged
      draggedTask={props.draggedTask}
      hideFolder={p.sinCarpeta}
      hideMachine={p.sinMaquina}
      sessions={p.filas}
      relatedSessions={relacionadas()}
      groupByAuthor={false}
      current={props.current}
      vivas={props.vivas}
      aprobando={props.aprobando}
      de=""
      projectOf={(row) => carpetaDe(row.id)}
      destinos={[]}
      destinosDe={(row) => destinos(carpetaDe(row.id))}
      carpetaDe={(row) => nombreDe(carpetaDe(row.id))}
      onDrag={props.onDrag ? (row, event) => props.onDrag?.(carpetaDe(row.id), row, event) : undefined}
      onPick={(s) => {
        props.onPick(carpetaDe(s), s);
        setDesplegado(false);
      }}
      onDelete={(s) => props.onDelete(carpetaDe(s), s)}
      onEtapa={(s, etapa) => props.onEtapa(carpetaDe(s), s, etapa)}
      onRenombrar={(s, title) => props.onRenombrar(carpetaDe(s), s, title)}
      onPin={props.onPin ? (s, pinned) => props.onPin?.(carpetaDe(s), s, pinned) : undefined}
      spaces={props.spaces}
      onMoveToSpace={(s, space) => props.onMoveToSpace?.(carpetaDe(s), s, space)}
      onBringHere={props.onBringHere ? (s) => props.onBringHere?.(carpetaDe(s), s) : undefined}
      onMove={(s, to) => {
        // El grupo de destino se abre: una tarea que se mueve a una carpeta
        // plegada desaparece de la pantalla, y eso se lee como que se borró.
        setCerrados(cerrados().filter((x) => x !== to));
        props.onMove(carpetaDe(s), s, to);
      }}
    />
  );

  /** El rótulo de un tramo. */
  const Rotulo = (p: { children: JSX.Element; tono?: "need"; accion?: JSX.Element }) => {
    // En un memo: con `class` como único atributo vivo, Solid lo reescribe en cada
    // cambio del grupo aunque valga lo mismo (`tests/perf/open-task-cost.mjs`).
    const clase = createMemo(() => cn(
      "group flex h-7 min-w-0 items-center gap-1.5 px-2 pt-1 text-caption font-medium",
      p.accion && "pr-0",
      p.tono === "need" ? "text-warning" : "text-neutral-500",
    ));
    return (
      <div class={clase()}>
        {p.children}
        <span class="ml-auto" />
        {p.accion}
      </div>
    );
  };

  /**
   * La carpeta que se está clonando, encima de la lista.
   *
   * No se puede abrir ni recibe tareas: no hay proyecto hasta que `git clone`
   * termina. Pulsarla devuelve el diálogo, que es donde viven el progreso y la
   * cancelación. Sin esta fila, un clon de varios minutos no deja rastro en la
   * lista y se relanza creyendo que no pasó nada.
   */
  const FilaDeClon = (pp: { clon: ClonEnCurso }) => (
    <button
      class="grid min-w-0 grid-cols-[22px_minmax(0,1fr)] items-center gap-0.5 rounded-sm px-2 py-1 text-left outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      onClick={() => props.onAbrirClon()}
    >
      <Show
        when={!pp.clon.failed}
        fallback={
          <TriangleAlert
            size={14}
            class="justify-self-center text-error-strong"
            aria-hidden="true"
          />
        }
      >
        <Spinner size={14} class="justify-self-center text-neutral-500" />
      </Show>
      <span class="grid min-w-0">
        <span class="truncate text-ui font-medium text-neutral-500">
          {pp.clon.name || t("shell.sidebar.clone_unnamed")}
        </span>
        <span class="truncate text-caption text-neutral-500">
          {pp.clon.failed
            ? t("projects.add.clone_failed")
            : `${t("projects.add.cloning")} ${faseDeClon(pp.clon.phase)}${
                pp.clon.percent == null
                  ? ""
                  : ` · ${t("projects.add.percent", { percent: pp.clon.percent })}`
              }`}
        </span>
      </span>
    </button>
  );

  const Grupo = (p: { grupo: SidebarGroup<SessionRow> }) => {
    const g = () => p.grupo;
    const plegado = () => g().machine ? `${g().key}@${g().machine}` : g().key;
    const titulo = () => groupLabel(g(), (id) => nombreDe(id) ?? id, nombreDeMaquina);
    const proyecto = () => g().kind === "folder" ? props.projects.find((x) => x.id === g().key) : undefined;
    const abierto = () => g().kind !== "folder" || !cerrados().includes(plegado());
    const necesita = () => g().kind === "status" && ["approving", "asked", "failed"].includes(g().key);
    return (
      <Show when={g().tasks.length > 0 || proyecto()}>
        <section
          data-sidebar-section={g().kind === "section" ? g().key : undefined}
          data-sidebar-group={g().kind === "section" ? undefined : g().key}
          aria-label={titulo()}
        >
          <Show
            when={proyecto()}
            fallback={
              <div
                data-destino={g().kind === "folder" ? "" : undefined}
                class={cn("rounded-sm", g().kind === "folder" && (props.dragFolder ?? destinoEnVuelo()) === "" && RECIBE_LA_TAREA)}
              >
                <Rotulo
                  tono={necesita() ? "need" : undefined}
                  accion={g().kind === "folder" && !g().key ? (
                    <button
                      class="mr-1 grid size-6 shrink-0 place-items-center rounded-sm text-neutral-500 opacity-0 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary group-hover:opacity-100 group-focus-within:opacity-100"
                      data-loose-task=""
                      aria-label={t("shell.sidebar.new_loose_task")}
                      title={t("shell.sidebar.new_loose_task")}
                      onClick={() => { props.onNuevaTareaEn(""); setDesplegado(false); }}
                    >
                      <Plus size={15} aria-hidden="true" />
                    </button>
                  ) : undefined}
                >
                  <Show when={g().kind === "agent" && g().key}>
                    <AstroAvatar name={g().key} status="asleep" size={14} />
                  </Show>
                  <span class="min-w-0 truncate">{titulo()}</span>
                </Rotulo>
              </div>
            }
          >
            {(proj) => (
              <Suspense>
                <FolderGroupHeader
                  dragFolder={props.dragFolder}
                  p={proj()}
                  rotulo={g().machine === undefined ? undefined : titulo()}
                  maquina={g().machine}
                  abierto={abierto()}
                  tareas={g().tasks}
                  vivas={props.vivas}
                  aprobando={props.aprobando}
                  proyectoAbierto={props.proyectoAbierto ?? props.carpetaDelBorrador ?? null}
                  onToggle={() => alternarGrupo(plegado())}
                  onAbrir={() => { props.onAbrirProyecto(proj().id, g().machine); setDesplegado(false); }}
                  onRenombrar={(name) => props.onRenombrarProyecto(proj().id, name)}
                  onBorrar={() => props.onBorrarProyecto(proj().id)}
                  onQuitarDelEspacio={props.onRemoveFromSpace ? () => props.onRemoveFromSpace?.(proj().id) : undefined}
                  onNuevaTarea={() => props.onNuevaTareaEn(proj().id, g().machine)}
                  onNuevoAgente={() => setCreatingAgentIn({ id: proj().id, name: proj().name })}
                  onLlevar={props.onCarryFolder && proj().kind === "git" ? () => props.onCarryFolder?.(proj().id, g().machine) : undefined}
                />
              </Suspense>
            )}
          </Show>
          <Show when={abierto()}>
            <Show
              when={g().tasks.length > 0}
              fallback={<p class="m-0 py-0.5 pl-7 text-caption text-neutral-500" data-folder-empty="">{t("shell.sidebar.folder_empty")}</p>}
            >
              <Historial filas={g().tasks} sinCarpeta={groupCardOptions(g()).hideFolder} sinMaquina={groupCardOptions(g()).hideMachine} />
            </Show>
          </Show>
        </section>
      </Show>
    );
  };

  /** La misma lista, montada en dos sitios: expandida y en el desplegable. */
  const Lista = () => (
    <div data-sidebar-tasks class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-[14px]">
      <Show when={props.clon}>{(c) => <FilaDeClon clon={c()} />}</Show>

      <Show when={todas().length === 0 && !hayCarpetasVacias()}>
        <Show
          when={props.projects.length === 0}
          fallback={<p class="m-0 px-2 pt-1 text-xs text-neutral-500" data-sidebar-empty="">{t("shell.sidebar.empty")}</p>}
        >
          <Show when={props.escritorio}>
            <p class="m-0 px-2 pt-1 text-xs text-neutral-500" data-desk-empty="">
              {t("spaces.rail.empty", { name: props.escritorio ?? "" })}
            </p>
          </Show>
        </Show>
      </Show>

      <Show when={todas().length > 0 && grupos().every((g) => g.tasks.length === 0)}>
        <p class="m-0 px-2 pt-1 text-xs text-neutral-500" data-sidebar-filtered-empty="">{t("shell.sidebar.filter_empty")}</p>
      </Show>

      <KeyedList each={grupos()} by={groupKey}>{(g) => <Grupo grupo={g()} />}</KeyedList>
    </div>
  );

  return (
    <div
      ref={riel}
      // El borde que separa esta región del chat lo dibuja `ColumnaLateral`, y
      // no aquí: es la frontera **entre** las dos columnas, así que tiene que
      // irse cuando la columna se va. Con el borde en este div, cerrarla lo
      // recortaba a la vez que el contenido; con el mismo borde en las dos
      // columnas habría dos definiciones de la misma línea.
      //
      // `w-full min-w-0`: sin eso el contenido no se entera del ancho del
      // contenedor —`overflow-visible` hace falta para el menú del pie y para
      // el desplegable— así que los títulos largos lo estiraban y empujaban
      // fuera de la vista lo que estuviera a la derecha, como el «+».
      class="relative z-40 h-full min-h-0 w-full min-w-0 overflow-hidden"
    >
      <Show when={creatingAgentIn()}>{project => <LazyPart><NewAgent
        abierto onAbrir={open => { if (!open) setCreatingAgentIn(null); }}
        project={project().id}
        modelos={props.modelos}
        onCreado={() => setCreatingAgentIn(null)}
      /></LazyPart>}</Show>
      <SidebarShell
        state={props.collapsed ? "collapsed" : "expanded"}
        // Sin cabecera ni pie: la lista se estira y Agentes queda pegado al fondo.
        class="h-full w-full min-w-0 grid-rows-[minmax(0,1fr)_auto]"
        aria-label={t("shell.sidebar.label")}
      >
        {/* Sin cabecera, el pie cae en la fila `1fr` de las tres que reparte
            `ui/sidebar.tsx`: se pega debajo de la lista y se va con lo que ésta
            crezca. */}

        <SidebarContent class="gap-2 px-2 pt-2 pb-0">
          <SidebarMenu class="gap-1.5">

            <SidebarMenuItem>
              {/* Nueva tarea es la acción principal, negra y sólida.
                  `primary` queda reservado para las acciones del agente. */}
              <SidebarMenuButton
                class="bg-neutral-950 font-bold text-neutral-50 hover:bg-neutral-950"
                aria-keyshortcuts={ariaDeAtajo("newTask")}
                aria-label={t("shell.sidebar.new_task")}
                onClick={() => {
                  props.onNew();
                  setDesplegado(false);
                }}
              >
                <SquarePen size={14} aria-hidden="true" />
                <Show when={!props.collapsed}>
                  <span>{t("shell.sidebar.new_task")}</span>
                  <TeclaDeAtajo accion="newTask" />
                </Show>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {props.attentionMenu?.(Boolean(props.collapsed))}
            <Show when={props.collapsed}>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={desplegado()}
                  tooltip={t("shell.sidebar.tasks")}
                  aria-label={t("shell.sidebar.tasks")}
                  aria-expanded={desplegado()}
                  onClick={() => setDesplegado((v) => !v)}
                >
                  <History size={15} />
                  {/* Con la lista escondida, el riel sigue diciendo que hay una
                      sesión abierta: sin esto el estado se comunicaría solo al
                      desplegar. */}
                  <Show when={props.current}>
                    <SignalDot tone="working" class="ui-sidebar-menu-badge absolute top-1 right-1" />
                  </Show>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </Show>
          </SidebarMenu>

          <Show when={!props.collapsed}>
            {/* **`overflow-y-auto` y NO `overflow-auto`.** Aquél es de los dos
                ejes: los títulos llegaban al borde sin puntos suspensivos y lo
                de la derecha quedaba fuera de la vista. */}
            {/* `data-arrastre-scroll`: con la lista larga, arrastrar una tarea
                hasta un grupo que está fuera de la vista exige que el panel
                se desplace solo al llegar a sus bordes (`lib/drag.ts`). */}
            <div
              ref={listViewport}
              class="-mr-2 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-2"
              data-arrastre-scroll=""
            >
              <Lista />
            </div>
          </Show>
        </SidebarContent>

        <Show when={!props.collapsed && agentesDelDock().length > 0}>
          <Suspense>
            <AgentDock
              agents={agentesDelDock()}
              selected={vista().agent}
              foldersOf={carpetasDelAgente}
              currentFolder={(props.current ? carpetaDe(props.current) : "") || props.proyectoAbierto}
              onTalk={props.onHablarCon}
              onShowTasks={(agent) => cambiarVista({ ...vista(), agent })}
              onProfile={props.onAgentProfile}
              onSeeAll={() => props.onSettings("agentes")}
              profileOf={perfilDe}
            />
          </Suspense>
        </Show>
      </SidebarShell>

      {/* El historial colapsado no desaparece: se abre al lado del riel. Este SÍ
          lleva borde y sombra: flota de verdad sobre lo que hay debajo, que es
          para lo que el sistema reserva la elevación. */}
      <Show when={props.collapsed && desplegado()}>
        <div class="absolute top-12 left-full z-40 ml-2 flex max-h-[min(60vh,420px)] w-70 flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-md">
          <div
            ref={listViewport}
            class="min-w-0 overflow-x-hidden overflow-y-auto p-2"
            data-arrastre-scroll=""
          >
            <Lista />
          </div>
        </div>
      </Show>

      {/* Lo que va en la mano mientras se arrastra una tarea.

          **Sin esto el gesto no se ve.** El puntero cambia de forma y el
          grupo de debajo se enciende, pero nada dice QUÉ se está moviendo.

          `pointer-events-none` no es cosmético: `lib/drag.ts` resuelve el
          destino con `elementFromPoint`, y un nodo pegado al puntero sería
          siempre lo que hay debajo del puntero. */}
      <Show when={tareaEnVuelo()}>
        {(enVuelo) => (
          <div
            aria-hidden="true"
            class="pointer-events-none fixed z-[90] max-w-64 truncate rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-neutral-950 shadow-md"
            style={{
              left: `${puntoDelArrastre().x + 12}px`,
              top: `${puntoDelArrastre().y + 10}px`,
            }}
          >
            {enVuelo().titulo}
          </div>
        )}
      </Show>
    </div>
  );
}
