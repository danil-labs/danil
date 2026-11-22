import { createEffect, createMemo, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { lastActivity } from "@terminus/tasks";
import { createProjectsStore, invoke } from "../queries/store.ts";
import { prosaDe } from "../../../../ui/src/Failure.tsx";
import { t } from "../../../../../apps/desktop/src/lib/i18n.ts";
import { createPref } from "../../../../../apps/desktop/src/lib/prefs.ts";
import { recordarCarpetas } from "../../../../../apps/desktop/src/lib/folderKinds.ts";
import { createTabs } from "../../../../../apps/desktop/src/lib/tabs.ts";
import { createTaskFiles } from "../../../../../apps/desktop/src/lib/taskFiles.ts";
import type { Frase } from "../../../../../apps/desktop/src/lib/prose.ts";
import type { Project, Source } from "../../../../../apps/desktop/src/lib/model.ts";
import type { Machine, ProjectPlace } from "../../../../../apps/desktop/src/lib/project-block-types.ts";
import { activeTaskCounts, activityByProject, hiddenIn, type HiddenProjects, type PickedAt, picksIn, rememberPick, setHidden, storedPicks } from "../model/recent.ts";
import type { SessionRow } from "./Sessions.tsx";

export type AttentionState = "unseen" | "asked" | "approving" | "failed";

export type TaskAttention = { session: string; project: string; state: AttentionState; };

export type WorkspaceAttention = { workspace: string; tasks: TaskAttention[]; };

export type AttentionStore = { list: Accessor<WorkspaceAttention[]>; of: (workspace: string | null) => TaskAttention[]; unseen: (workspace: string | null) => Set<string>; markSeen(workspace: string, session: string): void; };

export type WorkspaceStore = { active: Accessor<string | null>; mode: Accessor<string | null>; root: Accessor<string | null>; confirmed: Accessor<boolean>; generation: () => number; beginTransition: (startup: { active: string | null; workspaces: { id: string; context_root: string | null; default_permission_mode: string | null; }[]; }) => Readonly<{ generation: number; material: number; }> & Readonly<{ previous: string | null; workspace: string | null; }>; activate: (token: Readonly<{ generation: number; material: number; }> & Readonly<{ previous: string | null; workspace: string | null; }>) => boolean; beginMaterial: () => Readonly<{ generation: number; material: number; }>; current: (token: Readonly<{ generation: number; material: number; }>) => boolean; currentMaterial: (token: Readonly<{ generation: number; material: number; }>) => boolean; confirmContext: (token: Readonly<{ generation: number; material: number; }>, candidate: string | null, listed: { id: string; root: boolean; missing: boolean; }[]) => "obsolete" | "unavailable" | "accepted"; modeChanged: (workspace: string | null, value: string | null, requestedGeneration?: number) => void; dispose: () => void; };

export type WorkspaceSessionDeps = { asleep: (error: unknown) => boolean; createAttention: () => AttentionStore; createWorkspaceStore: () => WorkspaceStore; machineName: (id: string, local?: boolean) => string; machines: Accessor<Machine[]>; runOn: (workspace: string | null, project?: ProjectPlace) => string | null; };

export function createWorkspaceSession(deps: WorkspaceSessionDeps) {
  const { asleep, createAttention, createWorkspaceStore, machineName, machines, runOn } = deps;
  /* El fondo propio del agente de la conversación con el mando: lo publica su
     celda y se pinta detrás del área de trabajo, no solo detrás de su chat. */
  const [fondoDelAgente, setFondoDelAgente] = createSignal<{ url: string; veil?: number } | null>(null);
  const workspaceContext = createWorkspaceStore();
  const contextRoot = workspaceContext.root;
  const contextConfirmed = workspaceContext.confirmed;
  const workspaceMode = workspaceContext.mode;
  const workspaceActivo = workspaceContext.active;
  onCleanup(workspaceContext.dispose);
  function confirmContext(token: Parameters<typeof workspaceContext.confirmContext>[0], root: string | null, listed: Source[]) {
    const result = workspaceContext.confirmContext(token, root, listed);
    if (result === "unavailable") throw { what: t("projects.context.unavailable"), detail: "context_unavailable" };
    if (result === "accepted") setMaterialError(null);
  }
  const attention = createAttention();
  const [draftBases, setDraftBases] = createSignal<Record<string, string>>({});
  const [hablandoCon, setHablandoCon] = createSignal<{ project: string; name: string } | null>(null);
  const projectCatalog = createProjectsStore({ scope: () => ({ workspace: workspaceActivo(), machine: null }), invoke });
  const projectList = projectCatalog.rows;
  onCleanup(projectCatalog.dispose);
  createEffect(() => recordarCarpetas(projectList()));
  const [sources, setSources] = createSignal<Source[]>([]);
  // `rows: null`: la máquina está apagada y no contestó; el selector ofrece lo que se sabe de ella.
  const [draftProjects, setDraftProjects] = createSignal<{ workspace: string; machine: string; rows: Project[] | null } | null>(null);
  const draftMachine = () => runOn(workspaceActivo()) ?? machines().find(m => m.active)?.id ?? null;
  const draftOptions = () => {
    const machine = draftMachine();
    return machine ? { headers: { "x-terminus-machine": machine } } : undefined;
  };
  /**
   * Con la máquina apagada no se le puede preguntar, y elegir proyecto no la
   * enciende: la enciende enviar. Mientras, el selector ofrece los proyectos
   * que ya tienen su carpeta ahí y los que tienen remoto, que el motor clona
   * al llegar el primer mensaje (`ensure_here`). Sin su carpeta: la de la
   * fila es de otra máquina.
   */
  const projectsWhileOff = (machine: string) =>
    projectList()
      .filter(p => p.machines?.includes(machine) || !!p.remote_url)
      .map(p => ({ ...p, working_directory: null, work_tree: null }));
  const composerProjects = createMemo(() => {
    const machine = draftMachine();
    if (!machine) return projectList();
    if (machines().find(m => m.id === machine)?.local) return projectList().filter(p => !p.machines || p.machines.includes(machine));
    const found = draftProjects();
    if (found?.machine !== machine || found.workspace !== workspaceActivo()) return [];
    return found.rows ?? projectsWhileOff(machine);
  });
  const [materialError, setMaterialError] = createSignal<string | null>(null);
  const [taskSourcesError, setTaskSourcesError] = createSignal<string | null>(null);
  const [draftProjectError, setDraftProjectError] = createSignal<string | null>(null);
  const [projectReadError, setProjectReadError] = createSignal<string | null>(null);
  const [startupReadError, setStartupReadError] = createSignal<string | null>(null);
  const [connectionError, setConnectionError] = createSignal<string | null>(null);
  const [readRevision, setReadRevision] = createSignal(0);
  const draftMachineOn = () => machines().find(m => m.id === draftMachine())?.on;
  createEffect(on([workspaceActivo, draftMachine], () => setDraftProjectError(null)));
  createEffect(on([workspaceActivo, draftMachine, draftMachineOn, projectList, readRevision], ([workspace, machine, encendida]) => {
    setDraftProjects(previous => previous?.workspace === workspace && previous.machine === machine ? previous : null);
    if (!workspace || !machine || machines().find(m => m.id === machine)?.local) return;
    if (encendida === false) {
      setDraftProjects({ workspace, machine, rows: null });
      return;
    }
    let current = true;
    onCleanup(() => { current = false; });
    void projectCatalog.readForMachine(machine).then(rows => {
      if (current) { setDraftProjectError(null); setDraftProjects({ workspace, machine, rows: rows.map(row => ({
        ...row, machines: projectList().find(p => p.id === row.id)?.machines ?? [machine],
      })) }); }
    }).catch(e => {
      if (!current) return;
      // Se apagó entre la lista de máquinas y la pregunta, o la pregunta la está
      // encendiendo: lo mismo que apagada.
      if (asleep(e)) setDraftProjects({ workspace, machine, rows: null });
      else setDraftProjectError(prosaDe(e));
    });
  }));
  createEffect(on(draftMachine, (machine, before) => {
    if (before !== undefined && machine !== before) setDraftBases({});
  }));

  const [taskSources, setTaskSources] = createSignal<Source[] | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const errorVisible = () => {
    const message = error();
    return machines().some(machine => message === t("web.machines.off_wakes", { name: machineName(machine.id) })) ? null : message;
  };
  // Por qué esta ventana no puede abrir estos datos, si es que no puede: una
  // instalación con una forma que este binario ya no sabe convertir
  // (`workspaces::base_decidida`). Con esto
  // puesto no se pinta nada más que `PantallaDeBloqueo`.
  const [bloqueo, setBloqueo] = createSignal<Frase | null>(null);

  // Los ids, para el historial agrupado y los efectos que lo recargan.
  const projects = createMemo(() => projectList().map((p) => p.id));
  // Los grupos del historial: los proyectos y las tareas sin proyecto, que
  // Rust responde con `""`. Van por el mismo camino que las demás: son
  // otra carpeta, no otro mecanismo (`workspace/sessions.rs`, `sessions_root`).
  const grupos = createMemo(() => ["", ...projects()]);

  // Vacío es un estado legítimo y es el de arranque: nadie eligió todavía.
  // La app no elige por ti — con un proyecto puesto se puede mandar una
  // pregunta atribuida a un trabajo que nunca se abrió.
  const [project, setProject] = createSignal("");
  // El historial es de TODO el workspace, agrupado por proyecto. Rust
  // responde por proyecto: se pregunta una vez por cada uno. Son lecturas
  // de un directorio, no de red.
  const [sesiones, setSesiones] = createSignal<Record<string, SessionRow[]>>({});
  // Lo que ordena el selector de proyectos: sus tareas vivas y la última vez que se eligió, por workspace.
  const actividadDeProyectos = createMemo(() => activityByProject(sesiones(), lastActivity));
  const [proyectosElegidos, setProyectosElegidos] = createPref<Record<string, PickedAt>>("projects.last_picked", {});
  // Lo guardado puede venir de otra versión o estar roto: se lee con tolerancia.
  const elegidosAqui = () => picksIn(proyectosElegidos(), workspaceActivo() ?? "");
  function recordarEleccion(id: string) {
    const workspace = workspaceActivo();
    if (!workspace || !id) return;
    const existentes = new Set([...projectList(), ...composerProjects()].map((p) => p.id));
    setProyectosElegidos({ ...storedPicks(proyectosElegidos()), [workspace]: rememberPick(elegidosAqui(), id, Date.now(), existentes) });
  }
  // Las tareas activas que la ventana ya cargó: el `sessions` del motor cuenta también las archivadas.
  const tareasActivas = createMemo(() => activeTaskCounts(sesiones()));
  // Apartados del selector, por workspace. Solo el selector los mira: ni el riel ni las tareas cambian.
  const [proyectosOcultos, setProyectosOcultos] = createPref<HiddenProjects>("projects.hidden", {});
  const ocultosAqui = createMemo(() => hiddenIn(proyectosOcultos(), workspaceActivo()));
  function ocultarDelSelector(id: string, ocultar: boolean) {
    const workspace = workspaceActivo();
    if (!workspace || !id) return;
    const existentes = [...projectList(), ...composerProjects()].map((p) => p.id);
    setProyectosOcultos(setHidden(proyectosOcultos(), workspace, id, ocultar, existentes));
  }
  /**
   * Las tareas que la pantalla ya pinta y Rust todavía no ha escrito.
   *
   * Aparte de `sesiones`, que es el espejo fiel de lo que hay en disco: una
   * fila inventada ahí dentro sobreviviría al siguiente refresco sin que nadie
   * la reclamara. `sesionesConEstado` las junta para pintar.
   */
  const [naciendo, setNaciendo] = createSignal<{ project: string; row: SessionRow }[]>([]);
  /**
   * Lo que la persona acaba de cambiarle a una fila (fijarla, su etapa, su
   * nombre) y el disco todavía no confirma. Se pinta encima de `sesiones` en el
   * mismo gesto —ir y volver al motor, a veces por el relay, no puede ser lo que
   * tarde el riel en reaccionar— y se suelta cuando la relectura de su carpeta
   * ya lo trae, o se deshace si el motor lo rechaza. `sesiones` sigue siendo el
   * espejo del disco. Lo pone `retocarFila`.
   */
  const [retoques, setRetoques] = createSignal<Record<string, { cambio: Partial<SessionRow>; n: number }>>({});
  const retirarNaciendo = (id: string) =>
    setNaciendo((ns) => ns.filter((n) => n.row.id !== id));
  // La que ya llegó del disco deja de nacer: su fila de verdad la sustituye.
  createEffect(() => {
    const listas = sesiones();
    setNaciendo((ns) => {
      const quedan = ns.filter(
        (n) => !(listas[n.project] ?? []).some((r) => r.id === n.row.id),
      );
      return quedan.length === ns.length ? ns : quedan;
    });
  });
  const [sessionId, setSessionId] = createSignal<string | null>(null);
  // Qué proyecto se está mirando en el panel principal, si alguno: una
  // vista y no un modo. No cambia lo que la app hace, cambia lo que el
  // panel enseña. Abrir una tarea o empezar una la cierra: la
  // conversación es lo que ocupa ese sitio.
  /** La carpeta que se abrió para ver lo que lee: su página entra una vez por Configuración. */
  const [materialPedido, setMaterialPedido] = createSignal<string | null>(null);
  const [proyectoAbierto, setProyectoAbierto] = createSignal<string | null>(
    null,
  );
  // Con la tarea delante, un turno que cierra tampoco queda sin ver.
  createEffect(() => {
    const workspace = workspaceActivo();
    const id = sessionId();
    if (workspace && id && !proyectoAbierto() && attention.unseen(workspace).has(id)) attention.markSeen(workspace, id);
  });

  // Las pestañas: lo que se tiene a mano en el espacio principal —tareas,
  // archivos y artefactos en una tira—, una vista y no la vida de la
  // sesión: cerrar una no toca a Rust ni al historial (`lib/tabs.ts`). La
  // activa la guarda el módulo (`activarPestana`) y no `sessionId`: una
  // tarea, uno de sus archivos y uno de sus artefactos pueden estar
  // abiertos a la vez y los tres dirían "activo" si se derivara de ahí.
  const pestanas = createTabs({ transient: true });
  const archivosDeTarea = createTaskFiles();
  /** Sin tarea todavía, el panel de la carpeta del proyecto vive bajo su propia llave. */
  const llaveDeBorrador = (proyecto: string | undefined) => (proyecto ? `borrador:${proyecto}` : "");
  const [anchoDeArchivos, setAnchoDeArchivos] = createPref("taskFiles.width", 0.55);
  const [anchoDelArbol, setAnchoDelArbol] = createPref("taskFiles.treeWidth", 330);
  return { fondoDelAgente, setFondoDelAgente, workspaceContext, contextRoot, contextConfirmed, workspaceMode, workspaceActivo, confirmContext, attention, draftBases, setDraftBases, hablandoCon, setHablandoCon, projectCatalog, projectList, sources, setSources, draftMachine, draftOptions, composerProjects, materialError, setMaterialError, taskSourcesError, setTaskSourcesError, draftProjectError, setDraftProjectError, projectReadError, setProjectReadError, startupReadError, setStartupReadError, connectionError, setConnectionError, readRevision, setReadRevision, draftMachineOn, taskSources, setTaskSources, error, setError, errorVisible, bloqueo, setBloqueo, projects, grupos, project, setProject, sesiones, setSesiones, actividadDeProyectos, elegidosAqui, recordarEleccion, tareasActivas, ocultosAqui, ocultarDelSelector, naciendo, setNaciendo, retoques, setRetoques, retirarNaciendo, sessionId, setSessionId, materialPedido, setMaterialPedido, proyectoAbierto, setProyectoAbierto, pestanas, archivosDeTarea, llaveDeBorrador, anchoDeArchivos, setAnchoDeArchivos, anchoDelArbol, setAnchoDelArbol, };
}
