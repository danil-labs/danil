import { groupCardOptions } from "../../../ui/src/lib/tasks/index.ts";
import Plus from "lucide-solid/icons/plus";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { createMemo, type JSX, type Setter, Show, Suspense } from "solid-js";
import { destinoEnVuelo } from "../../../ui/src/lib/drag";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import type { Project } from "../../../ui/src/lib/model";
import { sharedLazy } from "../../../ui/src/lib/sharedLazy";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import { type ClonEnCurso, faseDeClon } from "../../../features/projects/src/screens/AddWorkdir";
import { AstroAvatar } from "../../../features/projects/src/screens/AstroAvatar";
import type { ModelChoices } from "../../../features/projects/src/screens/NewAgent";
import type { CreateFreeRouterConsent } from "../../../ui/src/lib/freeRouterConsent.ts";
import Sessions, { type SessionRow } from "../../../features/projects/src/screens/Sessions";
import type { Etapa } from "../../../features/projects/src/screens/TaskStage";
import { groupLabel, type SidebarGroup } from "../../../../apps/desktop/src/lib/sidebarView";
import type { SidebarFilterProps } from "./SidebarFilter";
import type { TareasDelRiel } from "./sidebar-groups";
import { Spinner } from "../../../ui/src/Spinner";
import { Pressable } from "../../../ui/src/Pressable";

export type { SessionRow };

const FolderGroupHeader = sharedLazy(() => import("./FolderGroupHeader"));

/**
 * El rasgo que enciende la cabecera sobre la que se soltaría la tarea que va en
 * la mano. Solo agrupando por carpeta hay cabeceras que reciben tareas.
 */
const RECIBE_LA_TAREA = ["ring-2", "ring-primary"];

export type SidebarProps = {
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
  createFreeRouterConsent: CreateFreeRouterConsent;
  /**
   * Empezar una tarea dentro de ese proyecto, sin pasar por su vista. `""` es sin carpeta.
   * `machine`, la del grupo partido por máquina (`""` es esta): la tarea se lanza en ella.
   */
  onNuevaTareaEn: (id: string, machine?: string) => void;
  onDelete: (project: string, id: string, members?: number) => Promise<boolean | void> | boolean | void;
  onMove: (project: string, id: string, to: string) => void;
  onEtapa: (project: string, id: string, etapa: Etapa | null) => void;
  onRenombrar: (project: string, id: string, title: string) => Promise<boolean | void> | boolean | void;
  onPin?: (project: string, id: string, pinned: boolean) => void | Promise<void>;
  onSettings: (panel?: string) => void;
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
};

/** Las filas del riel: los tramos de tareas, su rótulo, el clon en curso y cada grupo. */
export function createFilas(
  props: SidebarProps,
  tareas: TareasDelRiel,
  riel: { setDesplegado: Setter<boolean>; setCreatingAgentIn: Setter<{ id: string; name: string } | null> },
) {
  const { cerrados, setCerrados, alternarGrupo, carpetaDe, nombreDe, relacionadas, nombreDeMaquina } = tareas;
  const { setDesplegado, setCreatingAgentIn } = riel;

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
      onDelete={(s, members) => props.onDelete(carpetaDe(s), s, members)}
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
    <Pressable
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
    </Pressable>
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
                    <Pressable
                      class="mr-1 grid size-6 shrink-0 place-items-center rounded-sm text-neutral-500 opacity-0 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary group-hover:opacity-100 group-focus-within:opacity-100"
                      data-loose-task=""
                      aria-label={t("shell.sidebar.new_loose_task")}
                      title={t("shell.sidebar.new_loose_task")}
                      onClick={() => { props.onNuevaTareaEn(""); setDesplegado(false); }}
                    >
                      <Plus size={15} aria-hidden="true" />
                    </Pressable>
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


  return { FilaDeClon, Grupo };
}
