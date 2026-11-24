import { batch, createEffect, createMemo, on, onCleanup, type Accessor, type Setter } from "solid-js";
import { invoke } from "../../../../engine-client/src/client.ts";
import { prosaDe } from "../../../../ui/src/Failure.tsx";
import { conservar } from "../../../../session/src/sessionRefresh.ts";
import { carpetasDelEscritorio, escritorioDeFila, type Space } from "../../../../ui/src/lib/spaces.ts";
import { appendToStoredStrip, deleteStoredStrip, migrateLegacyStrip, spacesWithStoredStrip, storedStrip, isTaskTab, type Tab, type TaskTab } from "../../../../ui/src/lib/tabs.ts";
import { deleteLayout, readLayout, spacesWithLayout } from "../../../../ui/src/lib/panels.ts";
import { claveDeBorrador, esProvisional } from "../../../../ui/src/lib/taskDraft.ts";
import { escribirPref, leerPref } from "../../../../../apps/desktop/src/lib/prefs.ts";
import { chipModel as modeloDeSubtarea } from "../../../../ui/src/lib/tasks/surfaces.ts";
import type { ModoDePermiso, Project, Source } from "../../../../ui/src/lib/model.ts";
import type { createComposerStore, createDraftsStore, createThreadsStore, Machine, PanelsStore, Session, TabsStore } from "../../../../ui/src/lib/project-block-types.ts";
import type { AttentionStore, WorkspaceStore } from "../screens/workspace-session.ts";
import type { SessionRow } from "../screens/Sessions.tsx";

const enMaquina = (machine: string | undefined) => (machine ? { headers: { "x-terminus-machine": machine } } : undefined);

export type DeskStripDeps = { abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; activarPestana: (p: Tab) => Promise<void>; activeSpace: Accessor<Space | null>; adjuntosEn: Map<string, string>; attention: AttentionStore; composerMachine: Accessor<string | null>; connected: Accessor<boolean>; createComposerStore: typeof createComposerStore; createDraftsStore: typeof createDraftsStore; createThreadsStore: typeof createThreadsStore; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string } } | undefined; escritorio: Accessor<string | null>; filaDe: (id: string) => SessionRow | undefined; grupos: Accessor<string[]>; hablandoCon: Accessor<{ project: string; name: string } | null>; irAlBlanco: (enProyecto?: string) => void; liveThreads: Set<string>; loadWindowThreads: (skip: string | null) => void; machines: Accessor<Machine[]>; modoInicial: (modos: ModoDePermiso[], recordado: string) => string; modoRecordado: () => string; recordarModo: (id: string) => void; naciendo: Accessor<{ project: string; row: SessionRow }[]>; olvidarPestana: (session: string) => void; paneles: PanelsStore; pegadasEn: Map<string, string>; pestanaActiva: () => string | null; pestanas: TabsStore; project: Accessor<string>; projectList: Accessor<Project[]>; refreshSessions: (proyectos: string[]) => Promise<void>; serviceStream: { paged: () => boolean }; sesiones: Accessor<Record<string, SessionRow[]>>; sessionId: Accessor<string | null>; setEscritorio: Setter<string | null>; setProyectoAbierto: Setter<string | null>; setSpaces: Setter<Space[]>; spaces: Accessor<Space[]>; taskSources: Accessor<Source[] | null>; topState: (tasks: import("../screens/workspace-session.ts").TaskAttention[]) => import("../screens/workspace-session.ts").AttentionState | null; vivas: Accessor<string[]>; withLastAnswer: <T>(machine: string | null, key: string, call: () => Promise<T>) => Promise<T>; workspaceActivo: Accessor<string | null>; workspaceContext: WorkspaceStore; workspaceMode: Accessor<string | null>; };

export function createDeskStrip(deps: DeskStripDeps) {
  const irAlBlanco = (...a: Parameters<DeskStripDeps["irAlBlanco"]>) => deps.irAlBlanco(...a);
  const abrirSesion = (...a: Parameters<DeskStripDeps["abrirSesion"]>) => deps.abrirSesion(...a);
  const activarPestana = (...a: Parameters<DeskStripDeps["activarPestana"]>) => deps.activarPestana(...a);
  const olvidarPestana = (...a: Parameters<DeskStripDeps["olvidarPestana"]>) => deps.olvidarPestana(...a);
  const loadWindowThreads = (...a: Parameters<DeskStripDeps["loadWindowThreads"]>) => deps.loadWindowThreads(...a);
  const refreshSessions = (...a: Parameters<DeskStripDeps["refreshSessions"]>) => deps.refreshSessions(...a);
  const composerMachine = () => deps.composerMachine(), vivas = () => deps.vivas();
  const serviceStream = { paged: () => deps.serviceStream.paged() };
  const liveThreads = { has: (key: string) => deps.liveThreads.has(key) } as Set<string>;

  const { activeSpace, adjuntosEn, attention, connected, createComposerStore, createDraftsStore, deLaTarea, escritorio, filaDe, grupos, hablandoCon, machines, modoInicial, modoRecordado, recordarModo, naciendo, paneles, pegadasEn, pestanaActiva, pestanas, project, projectList, sesiones, sessionId, setEscritorio, setProyectoAbierto, setSpaces, spaces, taskSources, topState, withLastAnswer, workspaceActivo, workspaceContext, workspaceMode, createThreadsStore } = deps;
  /** El panel conserva workspace y conversación; el título pertenece a la tira. */
  const tareasEnVentanas = createMemo<(Pick<TaskTab, "id" | "session"> & { workspace: string | null })[]>((previous) =>
    conservar(previous ?? [], pestanas.open().filter(isTaskTab).map(({ id, session }) =>
      ({ id, session, workspace: workspaceActivo() })), (p) => p.id),
  );
  const proyectoDePestana = (id: string) => pestanas.open().find(tab => tab.id === id)?.project ?? "";
  /** Las tareas con pestaña: la lista viva las trae aunque estén archivadas. */
  const sesionesConPestana = createMemo(
    () =>
      [...new Set(pestanas.open().map((p) => p.session))]
        .filter((id) => id !== "" && !esProvisional(id))
        .sort(),
    [],
    { equals: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]) },
  );
  /** Los agentes de las tareas con pestaña: Configuración abre desplegados sus proveedores. */
  const agentesEnUso = () => {
    const abiertas = new Set(sesionesConPestana());
    const agentes = new Set<string>();
    for (const filas of Object.values(sesiones())) {
      for (const fila of filas) if (abiertas.has(fila.id)) agentes.add(fila.provider);
    }
    return [...agentes];
  };
  // Qué pestañas viajaron en la última lectura de cada grupo: la que se abrió
  // después aún no tiene fila, y eso no dice que la tarea ya no exista.
  const pedidas = new Map<string, Set<string>>();
  const sinPedir = (id: string) => grupos().some((g) => !pedidas.get(g)?.has(id));
  const enLista = (id: string) =>
    naciendo().some((n) => n.row.id === id) ||
    Object.values(sesiones()).some((filas) => filas.some((r) => r.id === id));
  // Una relectura por pestaña sin fila hasta que una lectura la lleve: si falla, no se repite en bucle.
  const esperandoFila = new Set<string>();
  function pedirFilasQueFaltan() {
    const faltan = sesionesConPestana().filter((id) => !enLista(id) && sinPedir(id) && !esperandoFila.has(id));
    if (faltan.length === 0) return;
    for (const id of faltan) esperandoFila.add(id);
    void refreshSessions(grupos());
  }
  createEffect(
    on(
      sesionesConPestana,
      () => {
        if (grupos().every((grupo) => grupo in sesiones())) pedirFilasQueFaltan();
      },
      { defer: true },
    ),
  );
  // Podar antes de cargar todos los grupos cerraría pestañas válidas al arrancar.
  // Archivar cierra la pestaña que se vio viva.
  let vivasVistas = new Set<string>();
  createEffect(
    on([sesiones, grupos, escritorio, spaces], ([lista, g, desk, todas]) => {
      if (!g.every((grupo) => grupo in lista)) return;
      const delanteAntes = pestanaActiva();
      const fuera = pestanas.sync((id) => {
        for (const [grupo, filas] of Object.entries(lista)) {
          const fila = filas.find((r) => r.id === id);
          if (fila) return fila.archived === true && vivasVistas.has(id) ? null : { project: grupo, titulo: fila.title };
        }
        const suya = (sinPedir(id) || naciendo().some((n) => n.row.id === id)) && pestanas.open().find((p) => p.session === id);
        return suya ? { project: suya.project, titulo: "" } : null;
      });
      vivasVistas = new Set(
        Object.values(lista)
          .flat()
          .filter((r) => r.archived !== true)
          .map((r) => r.id),
      );
      pedirFilasQueFaltan();
      fuera.forEach(soltarHilo);
      fuera.forEach(drafts.drop);
      for (const id of fuera) olvidarPestana(id);
      // Archivar (o borrar) la tarea de delante deja la conversación en
      // blanco: el panel pondría la pestaña vecina, y quien archiva acabó
      // con esa tarea, no pidió abrir otra.
      if (delanteAntes !== null && !pestanas.open().some((p) => p.id === delanteAntes)) {
        irAlBlanco(carpetaDelEscritorio(project()));
      }
      // Una tarea que se movió a otro espacio se lleva su pestaña a esa tira.
      if (!desk) return;
      const ajenas: { p: TaskTab; a: string }[] = [];
      for (const p of pestanas.open()) {
        if (!isTaskTab(p)) continue;
        const fila = Object.values(lista).flat().find((r) => r.id === p.session);
        const a = escritorioDeFila(fila, todas);
        if (a && a !== desk) ajenas.push({ p, a });
      }
      if (ajenas.length > 0) reubicarPestanas(ajenas);
    }),
  );

  /** Saca pestañas de esta tira hacia la guardada de su escritorio, sin olvidar lo leído. */
  function reubicarPestanas(ajenas: { p: TaskTab; a: string }[]) {
    const ws = workspaceActivo();
    if (!ws) return;
    for (const { p, a } of ajenas) appendToStoredStrip(ws, a, { id: p.id, project: p.project, titulo: p.titulo });
    const activaAntes = pestanaActiva();
    const vecina = pestanas.closeMany(ajenas.map(({ p }) => p.id));
    paneles.sync(pestanas.open().map((x) => x.id));
    if (activaAntes === null || pestanas.open().some((x) => x.id === activaAntes)) return;
    if (vecina) void activarPestana(vecina);
    else irAlBlanco(carpetaDelEscritorio(project()));
  }

  /**
   * Cambia la tira y el riel a otro escritorio. Las pestañas del que se deja
   * no se cierran: sus lecturas siguen hasta que su pestaña se cierre en su tira.
   */
  function cambiarEscritorio(id: string, restaurarActiva = true) {
    const ws = workspaceActivo();
    if (!ws || id === escritorio() || !spaces().some((i) => i.id === id)) return;
    const restored = batch(() => {
      setEscritorio(id);
      escribirPref(`space.${ws}`, id);
      // El reparto del que se deja ya está guardado por cada cambio suyo; aquí
      // se corta, para no escribir el del que llega bajo la clave del otro.
      paneles.bindTo(null, null);
      const r = pestanas.load(ws, id);
      // En el mismo lote: una pestaña sin ventana se monta escondida, gasta su
      // lectura sin caja y reabre al final (`montadas`).
      const vivos = pestanas.open().map((x) => x.id);
      paneles.restore(readLayout(ws, id), vivos);
      paneles.sync(vivos);
      paneles.bindTo(ws, id);
      if (r) paneles.activate(r);
      setProyectoAbierto(null);
      return r;
    });
    // Las demás ventanas del reparto que vuelve cargan su tarea, para que la
    // rejilla vuelva enseñando lo que tenía. La de delante la abre lo de abajo.
    loadWindowThreads(restored);
    if (!restaurarActiva) return;
    const p = restored ? pestanas.open().find((x) => x.id === restored) : undefined;
    if (p) void abrirSesion(p.project, p.id);
    else irAlBlanco(carpetaDelEscritorio(project()));
  }

  /** Una carpeta de este escritorio para la caja vacía: la pedida si es suya, si no la primera visible. */
  function carpetaDelEscritorio(pedido: string) {
    const desk = activeSpace();
    if (!desk) return pedido;
    const visibles = carpetasDelEscritorio(projectList(), desk, sesiones());
    if (visibles.some((p) => p.id === pedido)) return pedido;
    return visibles[0]?.id ?? pedido;
  }

  /** Lo que la ventana guarda de una pestaña que ya no va a volver. */
  function soltarPestanaGuardada(id: string) {
    drafts.drop(id);
    olvidarPestana(id);
    if (!vivas().includes(id)) soltarHilo(id);
  }

  function podarTirasMuertas(ws: string, lista: Space[]) {
    // También el reparto: un espacio con rejilla guardada y sin tira —nadie
    // abrió una pestaña— no lo alcanzaría `escritoriosConTira`.
    const conAlgo = new Set([...spacesWithStoredStrip(ws), ...spacesWithLayout(ws)]);
    for (const id of conAlgo) {
      if (lista.some((i) => i.id === id)) continue;
      for (const p of storedStrip(ws, id)) soltarPestanaGuardada(p.id);
      deleteStoredStrip(ws, id);
      deleteLayout(ws, id);
    }
  }

  /** Qué escritorio abre este workspace: el último que se usó si sigue vivo, o la primera. */
  function asentarEscritorio(ws: string, lista: Space[] | null): string | null {
    if (!lista || lista.length === 0) {
      batch(() => {
        setSpaces([]);
        setEscritorio(null);
      });
      return null;
    }
    migrateLegacyStrip(ws, lista[0].id);
    const guardado = leerPref<string | null>(`space.${ws}`, null);
    const desk = guardado && lista.some((i) => i.id === guardado) ? guardado : lista[0].id;
    podarTirasMuertas(ws, lista);
    batch(() => {
      setSpaces(lista);
      setEscritorio(desk);
    });
    return desk;
  }

  async function reloadSpaces() {
    const ws = workspaceActivo();
    if (!ws) return;
    try {
      const lista = await invoke<Space[]>("list_spaces");
      if (ws !== workspaceActivo() || escritorio() === null) return;
      setSpaces(lista);
      if (!lista.some((i) => i.id === escritorio()) && lista[0]) cambiarEscritorio(lista[0].id);
      podarTirasMuertas(ws, lista);
    } catch {
      // La lista de antes sigue sirviendo hasta el siguiente aviso.
    }
  }

  /** Lo más urgente de las tareas de un escritorio; con `sinResolver`, también las que se pintan en todos. */
  const senalDe = (desk: string, sinResolver = false) =>
    topState(
      attention.of(workspaceActivo()).filter((a) => {
        const r = filaDe(a.session);
        return !!r && (r.space === desk || (sinResolver && !r.space));
      }),
    );

  const claveDelHilo = () => sessionId() ?? "";
  const claveAbierta = () => claveDeBorrador(sessionId(), project(), hablandoCon()?.project === project() ? hablandoCon()?.name : null);
  const drafts = createDraftsStore({
    key: claveAbierta, workspace: workspaceActivo, generation: workspaceContext.generation,
    project, projects: projectList, sources: taskSources,
    prepareAttachments: async (paths, project) => {
      const machine = paths.length ? pegadasEn.get(paths[0]) : undefined;
      const routed = machine && paths.every(path => pegadasEn.get(path) === machine) ? enMaquina(machine) : undefined;
      const workspace = workspaceActivo();
      const options = { headers: { ...routed?.headers, ...(workspace ? { "x-terminus-workspace": workspace } : {}) } };
      const prepared = await invoke<string[]>("prepare_attachments", { project, paths }, options);
      if (machine) for (const path of prepared) adjuntosEn.set(path, machine);
      return prepared;
    },
  });
  onCleanup(drafts.dispose);
  const borrador = drafts.current;
  const input = drafts.input;
  const setInput = drafts.changeText;
  const navigateMentionHistory = drafts.history;
  const sourceIds = drafts.sourceIds;
  const excludedSourceIds = drafts.excludedSourceIds;
  const archivos = drafts.files;
  const setArchivos = drafts.replaceFiles;
  const agregarArchivos = drafts.addFiles;
  const adjuntas = drafts.attached;
  const materialPendiente = drafts.pendingMaterial;
  const contexto = drafts.context;

  const composer = createComposerStore({
    invoke, withLastAnswer,
    scope: { workspace: workspaceActivo, machine: () => composerMachine(),
      machineOn: () => machines().find(machine => machine.id === composerMachine())?.on,
      connected, session: () => sessionId() },
    workspaceMode, draftConfiguration: () => borrador().configuration, modoInicial, modoRecordado, recordarModo,
  });
  const { agents, agent, superficies, superficie, catalogos, models, modelosParaAgentes,
    model, effort, modo, modos, skills, cliCommands, sideCommand } = composer;
  onCleanup(composer.dispose);
  const threads = createThreadsStore({
    scope: { workspace: workspaceActivo, generation: workspaceContext.generation, paged: () => serviceStream.paged() },
    activeSession: sessionId, project, invoke, route: deLaTarea, liveThreads: () => liveThreads,
  });
  onCleanup(threads.dispose);
  const hilos = threads.rows, hiloAbierto = threads.current, msgs = threads.messages, cargandoHilo = threads.loading;
  const origenes = threads.origins, apagadas = threads.offline, machineWaits = threads.machineWaits, traspasos = threads.handovers;
  const conAntiguos = threads.olderAvailable, conRecientes = threads.recentAvailable, estadoAntiguos = threads.olderStatus, colaSuelta = threads.recentTail;
  const leerTarea = threads.read, cargarAntiguos = threads.older, soltarHilo = threads.drop;
  function avisar(sesion: string) {
    return (e: unknown) => threads.appendLive(sesion, [{ role: "system", text: prosaDe(e), meta: "aviso" }]);
  }
  function loadResult(id: string, session: Session, clear: boolean, generation: number) {
    if (!threads.acceptSession(id, session, clear, generation)) return;
    drafts.invalidateProvider(id, session.provider);
    if (id === sessionId() && (session.subagent || session.parent)) composer.useProfile({ model: modeloDeSubtarea(session), effort: session.effort });
  }
  return { tareasEnVentanas, proyectoDePestana, sesionesConPestana, agentesEnUso, pedidas, esperandoFila, cambiarEscritorio, carpetaDelEscritorio, asentarEscritorio, reloadSpaces, soltarPestanaGuardada, senalDe, claveDelHilo, claveAbierta, drafts, borrador, input, setInput, navigateMentionHistory, sourceIds, excludedSourceIds, archivos, setArchivos, agregarArchivos, adjuntas, materialPendiente, contexto, composer, agents, agent, superficies, superficie, catalogos, models, modelosParaAgentes, model, effort, modo, modos, skills, cliCommands, sideCommand, threads, hilos, hiloAbierto, msgs, cargandoHilo, origenes, apagadas, machineWaits, traspasos, conAntiguos, conRecientes, estadoAntiguos, colaSuelta, leerTarea, cargarAntiguos, soltarHilo, avisar, loadResult };
}
