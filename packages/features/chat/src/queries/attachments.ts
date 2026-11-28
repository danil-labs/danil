
import { lista } from "../../../../ui/src/lib/format";
import { aplicarLenguaDeWorkspace, t } from "../../../../ui/src/lib/i18n";
import { type Source } from "../../../../ui/src/lib/model";
import { readLayout } from "../../../../ui/src/lib/panels";
import { type Frase } from "../../../../ui/src/lib/prose.ts";
import { NotMovable, attachmentsOn } from "./remoteAttachments";
import { shellCacheMatches } from "../../../../session/src/shellCache";
import { type ShellSnapshot } from "../../../../session/src/shellCache.ts";
import { type Space } from "../../../../ui/src/lib/spaces";
import { isTaskTab } from "../../../../ui/src/lib/tabs";
import { esProvisional } from "../../../../ui/src/lib/taskDraft";
import { aplicarTemaDeTerminal } from "../model/terminal-themes";
import { displayWorkspaceSnapshot, callEngine, requestedWorkspaceSnapshot } from "../../../../engine-client/src/client.ts";
import { capabilities, isNoMachines } from "../../../../host/src/platform";
import { prosaDe } from "../../../../ui/src/Failure";
import { batch, type Accessor, type Setter } from "solid-js";
import type { ComposerPort, ContextSourcePort, DraftsPort, Hilo, MachinesPort, ProjectsPort, ScopedReadErrorSetter, SessionRow, Startup, WorkspaceContextPort, createThreadsStore } from "./types.ts";
import type { createPanels } from "../../../../ui/src/lib/panels.ts";
import type { createTabs } from "../../../../ui/src/lib/tabs.ts";
import type { sessionRefresh } from "../../../../session/src/sessionRefresh.ts";
import type { createResync } from "./resync.ts";
import type { createThreadStream } from "./thread-stream.ts";
import type { Preview } from "../../../../ui/src/lib/preview.ts";


/** Lo que el bloque usaba del cuerpo de App. */
export type AttachmentsDeps = { abrirSesion: ContextSourcePort["abrirSesion"]; adjuntosEn: Map<string, string>;
  asentarEscritorio: (ws: string, lista: Space[] | null) => string | null; asleep: (error: unknown) => boolean; composer: ComposerPort;
  confirmContext: (token: Parameters<WorkspaceContextPort["confirmContext"]>[0], root: string | null, listed: Source[]) => void;
  deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; documentosEn: (options: { headers: Record<string, string>; } | undefined) => boolean;
  draftOptions: () => { headers: { "x-terminus-machine": string; }; } | undefined; drafts: DraftsPort; enCache: Accessor<boolean>;
  enMaquina: (machine: string | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; finishedTurns: ReturnType<typeof createThreadStream>["finishedTurns"];
  grupos: Accessor<string[]>; guardarCache: { save(snapshot: ShellSnapshot): void; flush: () => void; cancel(): void; }; handoff: ReturnType<typeof createThreadStream>["handoff"];
  hilos: Accessor<Record<string, Hilo>>; lifecycleRevision: number; loadThread: ContextSourcePort["loadThread"];
  loadWindowThreads: ContextSourcePort["loadWindowThreads"]; machineName: (id: string, local?: boolean) => string; machines: MachinesPort;
  paneles: ReturnType<typeof createPanels>; pegadasEn: Map<string, string>; pestanas: ReturnType<typeof createTabs>; projectCatalog: ProjectsPort;
  reconcileActiveTurns: ReturnType<typeof createResync>["reconcileActiveTurns"]; refetchMachines: () => Promise<void | never[]>; refreshSessions: (proyectos: string[]) => Promise<void>;
  sessionId: Accessor<string | null>; sessionLists: ReturnType<typeof sessionRefresh>; setAlta: Setter<boolean>; setAviso: Setter<{ texto: string; boton?: string; ir?: () => void; } | null>;
  setBloqueo: Setter<Frase | null>; setCuentasTocadas: Setter<number>; setDesdeDeTurno: ReturnType<typeof createThreadStream>["setDesdeDeTurno"]; setDraftBases: Setter<Record<string, string>>;
  setEnCache: Setter<boolean>; setError: Setter<string | null>; setEscritorio: Setter<string | null>; setFolder: ReturnType<typeof createThreadStream>["setFolder"];
  setMaterialError: Setter<string | null>; setProject: Setter<string>; setProjectReadError: ScopedReadErrorSetter; setProyectoAbierto: Setter<string | null>;
  setSesiones: Setter<Record<string, SessionRow[]>>; setSessionId: Setter<string | null>; setSettlingTurns: ReturnType<typeof createThreadStream>["setSettlingTurns"]; setSources: Setter<Source[]>;
  setSpaces: Setter<Space[]>; setStartupReadError: ScopedReadErrorSetter; setTaskSourcesError: Setter<string | null>; setVentana: ReturnType<typeof createThreadStream>["setVentana"];
  setVivas: ReturnType<typeof createThreadStream>["setVivas"]; shellCache: ShellSnapshot | null; soltarCola: ContextSourcePort["soltarCola"];
  taskQueues: ReturnType<typeof createThreadStream>["taskQueues"]; threads: ReturnType<typeof createThreadsStore>; workspaceActivo: Accessor<string | null>;
  workspaceContext: WorkspaceContextPort; };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 1724–2004, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createAttachments(deps: AttachmentsDeps) {
  const { adjuntosEn, asentarEscritorio, asleep, composer, confirmContext, deLaTarea, documentosEn, draftOptions, drafts, enCache, enMaquina, finishedTurns, grupos, guardarCache, handoff, hilos, machineName, machines, paneles, pegadasEn, pestanas, projectCatalog, refetchMachines, refreshSessions, sessionId, sessionLists, setAlta, setAviso, setBloqueo, setCuentasTocadas, setDesdeDeTurno, setDraftBases, setEnCache, setError, setEscritorio, setFolder, setMaterialError, setProject, setProjectReadError, setProyectoAbierto, setSesiones, setSessionId, setSettlingTurns, setSources, setSpaces, setStartupReadError, setTaskSourcesError, setVentana, setVivas, shellCache, taskQueues, threads, workspaceActivo, workspaceContext } = deps;
  const abrirSesion = ((...a: Parameters<typeof deps.abrirSesion>) => deps.abrirSesion(...a)) as typeof deps.abrirSesion;
  const loadThread = ((...a: Parameters<typeof deps.loadThread>) => deps.loadThread(...a)) as typeof deps.loadThread;
  const loadWindowThreads = ((...a: Parameters<typeof deps.loadWindowThreads>) => deps.loadWindowThreads(...a)) as typeof deps.loadWindowThreads;
  const reconcileActiveTurns: AttachmentsDeps["reconcileActiveTurns"] = (...a: Parameters<AttachmentsDeps["reconcileActiveTurns"]>) => deps.reconcileActiveTurns(...a);
  const soltarCola: AttachmentsDeps["soltarCola"] = (...a: Parameters<AttachmentsDeps["soltarCola"]>) => deps.soltarCola(...a);
  /**
   * Los adjuntos con las rutas de la máquina donde corre el turno. Un archivo
   * soltado o elegido se prepara en el motor de la ventana; una imagen pegada,
   * en la máquina del turno (`pegarImagen`). Lo que no está ya allá viaja
   * antes de mandar (`lib/remoteAttachments.ts`).
   */
  async function attachmentsFor(paths: string[], options: { headers: Record<string, string> } | undefined, proyecto: string): Promise<string[]> {
    const machine = options?.headers["x-terminus-machine"];
    const local = (id: string | undefined) => !id || !!machines().find((x) => x.id === id)?.local;
    const alla = (path: string) => adjuntosEn.get(path) === machine || (local(adjuntosEn.get(path)) && local(machine));
    const documentos = documentosEn(options);
    try {
      const listas = await attachmentsOn(paths, alla, {
        documentos,
        read: (path) => callEngine<Preview>("preview_file", { path, rel: path }, enMaquina(adjuntosEn.get(path))),
        save: (mime, datos, nombre) => {
          if (documentos) return callEngine<string>("guardar_adjunto", { mime, nombre: nombre ?? null, datos }, options);
          return callEngine<string>("guardar_imagen_pegada", { mime, datos }, options);
        },
        prepare: (saved) => callEngine<string[]>("prepare_attachments", { project: proyecto, paths: saved }, options),
      });
      if (machine) for (const path of listas) adjuntosEn.set(path, machine);
      return listas;
    } catch (e) {
      if (!(e instanceof NotMovable)) throw e;
      throw { what: t("chat.attachments.remote_unsupported", { names: lista(e.names), machine: machineName(machine ?? "local") }), detail: "remote_unsupported" };
    }
  }

  /** Los bytes ya están en la ventana: van directo a la máquina del turno, sin pasar por la miniatura de 4 MB. */
  async function pegarImagen(mime: string, datos: string, nombre?: string): Promise<string> {
    const abierta = sessionId();
    const opciones = abierta ? deLaTarea(abierta) : draftOptions();
    const ruta = documentosEn(opciones)
      ? await callEngine<string>("guardar_adjunto", { mime, nombre: nombre ?? null, datos }, opciones)
      : await callEngine<string>("guardar_imagen_pegada", { mime, datos }, opciones);
    const machine = opciones?.headers["x-terminus-machine"];
    if (machine) pegadasEn.set(ruta, machine);
    return ruta;
  }

  // La carpeta de trabajo de la tarea: se abre afuera desde la cabecera y la
  // columna, y resuelve lo que el hilo anuncia por su ruta relativa
  // (`abrirPorRel`).
  async function refreshFolder(p: string, id: string) {
    try {
      setFolder(await callEngine<string>("session_folder", { project: p, id }, deLaTarea(id)));
    } catch {
      setFolder(null);
    }
  }

  // Vuelve a leer el material del workspace sin tocar lo que hay abierto: es
  // la mitad de `aplicar` que no es una mudanza. Traer un repositorio cambia
  // lo que el workspace tiene, no en qué workspace estás. Aquí un fallo no
  // vacía las listas, al revés que en `aplicar`: allá lo que quedara en
  // pantalla sería de otro cliente, aquí es de este.
  let startupRetryRequest = 0;
  async function retryStartupRead() {
    const generation = workspaceContext.generation();
    const workspace = workspaceActivo();
    const request = ++startupRetryRequest;
    const readToken = setStartupReadError.begin();
    const current = () => request === startupRetryRequest && generation === workspaceContext.generation() && workspace === workspaceActivo();
    try {
      const startup = await callEngine<Startup>("workspaces_startup");
      if (!current()) return;
      if (startup.bloqueo) { setBloqueo(startup.bloqueo); return; }
      if (workspace === null) await aplicar(startup);
      else if (startup.active === workspace) setStartupReadError.setFor(readToken, null);
    } catch (cause) {
      if (current() && !asleep(cause) && !isNoMachines()) setStartupReadError.setFor(readToken, prosaDe(cause));
    }
  }

  async function recargarMaterial() {
    const request = workspaceContext.beginMaterial();
    const workspace = workspaceActivo();
    if (!workspace) return;
    setMaterialError(null);
    if (isNoMachines()) {
      setProjectReadError(null);
      setSources([]);
      return;
    }
    const projectToken = setProjectReadError.begin();
    try {
      const arranque = await callEngine<Startup>("list_workspaces");
      if (!workspaceContext.currentMaterial(request)) return;
      const current = arranque.workspaces.find((w: { id: string }) => w.id === workspace);
      if (!current) throw { what: t("projects.context.unavailable"), detail: "context_unavailable" };
      const root = current.context_root;
      const [, fuentes] = await Promise.all([
        projectCatalog.changed().then(rows => {
          if (workspaceContext.currentMaterial(request)) setProjectReadError.setFor(projectToken, null);
          return rows;
        }),
        callEngine<Source[]>("list_sources"),
      ]);
      if (!workspaceContext.currentMaterial(request)) return;

      setSources(fuentes);
      confirmContext(request, root, fuentes);
    } catch (e) {
      if (!workspaceContext.currentMaterial(request) || asleep(e) || isNoMachines()) return;
      setMaterialError(prosaDe(e));
    }
  }

  // Deja la pantalla como la de este workspace, y solo la de este.

  // Cambiar de workspace no filtra una lista: cambia la carpeta en disco.
  // Lo que hay puesto —sesión, conversación, artefactos, consumo, cola,
  // material pendiente— es de otro cliente y no puede quedarse ni un
  // render: lo que se quede escribe en el cliente equivocado y sin verse.

  // La cola: el efecto que la guarda resuelve la carpeta por el workspace
  // activo, y una `colaDe` que nombre una tarea del anterior escribe un
  // `.cola.json` en `<workspace nuevo>/sessions/<tarea del viejo>/` —una
  // carpeta sin `session.json`, que `list_live_sessions` salta sin error.

  // El material pendiente (`sourceIds`): los chips desaparecen solos
  // —`conFuente` los cruza contra las fuentes del workspace nuevo—, pero
  // los ids seguirían viajando en el `send_message` siguiente, y
  // `projects::reach` se salta el que no conoce en silencio.

  // Los archivos del borrador, incluida la conversación exportada al
  // continuar una tarea en otra: es una ruta absoluta del workspace
  // anterior, y mandarla copia su contenido a la carpeta de la tarea
  // nueva.

  // Los tres van en `borradores` y se vacían todos. No vale para «cambió el
  // material»: traer un repositorio a mitad de una tarea por aquí cierra la
  // conversación y deja la anterior abandonada, sin error y sin aviso. Para
  // eso está `recargarMaterial`.

  let altaMostrada = false;
  async function aplicar(a: Startup) {
    if (!requestedWorkspaceSnapshot(a)) return;
    guardarCache.flush();
    const activo = a.workspaces.find((w: { id: string }) => w.id === a.active);
    // El alta se ofrece una vez. Con una sesión válida puede terminar sin
    // seleccionar un workspace, y el siguiente repaso deja abierto el riel.
    if (a.active === null && capabilities().localSetup && !altaMostrada) {
      altaMostrada = true;
      setAlta(true);
    }
    const transition = workspaceContext.beginTransition(a);
  // La lengua es del workspace, y cambia al cambiar de cliente: eso es lo que
  // se pidió, no un efecto secundario. `null` hereda la de la máquina.
    aplicarLenguaDeWorkspace(activo?.lengua ?? null);
  // El tema de terminal sigue al workspace por lo mismo: es cómo se distingue
  // en qué cliente se está sin leer el nombre.
    aplicarTemaDeTerminal(activo?.terminal_theme ?? null);
    threads.saveWorkspace(transition.previous);
    const generation = workspaceContext.generation();
    let desdeCache = false;
    batch(() => {
      displayWorkspaceSnapshot(a);
      sessionLists.reset();
      taskQueues.workspaceChanged();
      handoff.reset();
      workspaceContext.activate(transition);
      // «Ejecutar en» dice qué tiene cada máquina del workspace abierto: con otro, se relee.
      void refetchMachines();
      setDraftBases({});
      // Sale la tira del anterior antes que `setSessionId(null)`, que apuntaría
      // «ninguna activa» en la que siga cargada. La nueva es la del escritorio y
      // entra abajo, al leer los espacios, con qué tarea tenía abierta.
      // El reparto de la que se va ya está guardado por espacio; se corta antes
      // de vaciar la tira, para que soltar sus pestañas no pise su rejilla.
      paneles.bindTo(null, null);
      pestanas.load(null);
      // El mismo workspace que la caché: sus filas se quedan hasta que lleguen las de verdad.
      desdeCache = enCache() && shellCacheMatches(shellCache, a.active);
      projectCatalog.workspaceChanged(desdeCache);
      if (!desdeCache) setEnCache(false);
      batch(() => {
        if (!desdeCache) {
          setSpaces([]);
          setEscritorio(null);
        }
        setAviso(null);
      });
      // Y la pantalla vuelve a una ventana: la rejilla que había era la del
      // cliente que se deja, y la del que llega la pone `asentarEscritorio`.
      paneles.reset();
      setSessionId(null);
      setProyectoAbierto(null);
      threads.activateWorkspace(a.active);
      setDesdeDeTurno({});
      drafts.reset();
      setVivas([]);
      setSettlingTurns([]);
      finishedTurns.clear();
      deps.lifecycleRevision++;
      setFolder(null);
      setVentana(null);
      if (!desdeCache) setSesiones({});
      soltarCola();
      drafts.replaceAttached([]);
      // Y las cuentas, que también son de este workspace: la franja de consumo las
      // lee una vez y se quedaría enseñando las del cliente anterior —nombre,
      // correo y cuánto le queda— sin que nada avise.
      setCuentasTocadas((n) => n + 1);
      // Con qué se puede trabajar es del workspace por lo mismo: la
      // credencial y el consentimiento cuelgan de él; el menú del otro
      // cliente ofrecería lo que este no tiene conectado.
      void composer.refreshSurfaces(true);
      setError(null);
      setMaterialError(null);
      setTaskSourcesError(null);
      setProjectReadError(null);
      setStartupReadError(null);
      // Ni con un solo proyecto se preselecciona. Autoseleccionar cuando la lista
      // trae uno ahorra un clic y reintroduce la sorpresa.
      setProject("");
    });
    // Sin workspace no se pregunta por lo que cuelga de él: preguntarlo
    // devolvía «Todavía no hay ningún workspace», pintado como error rojo
    // encima del primer arranque —la app avisando de que falta lo que esa
    // misma pantalla está pidiendo.
    if (a.active === null) {
      setSources([]);
      return;
    }
    const activeWorkspace = a.active;
    const deskReady = callEngine<Space[]>("list_spaces")
      .catch(() => null)
      .then((lista) => (generation === workspaceContext.generation() ? asentarEscritorio(activeWorkspace, lista) : null));
    if (isNoMachines()) {
      setSources([]);
      setMaterialError(null);
      setProjectReadError(null);
    } else {
      // Con las carpetas de la caché, sus tareas se leen a la vez que la lista de carpetas.
      const primeras = desdeCache ? refreshSessions(grupos()) : null;
      try {
        // A la vez, no una detrás de otra: no dependen entre sí, y
        // encadenadas sumaban sus latencias en el arranque. `list_sources`
        // esperaba a que volviera `list_projects` para preguntar algo que
        // no usa su respuesta.
        // Las fuentes que no llegan (su máquina apagada, sin copia) dejan las de antes y no tumban las carpetas.
        const [, fuentes] = await Promise.all([
          projectCatalog.refresh(),
          callEngine<Source[]>("list_sources").catch(() => null),
        ]);
        if (generation !== workspaceContext.generation()) return;

        if (workspaceContext.currentMaterial(transition)) {
          if (fuentes) {
            setSources(fuentes);
            confirmContext(transition, activo?.context_root ?? null, fuentes);
          } else if (!isNoMachines()) setMaterialError(t("projects.context.unavailable"));
        }
      } catch (e) {
        if (generation !== workspaceContext.generation() || !workspaceContext.currentMaterial(transition)) return;
        // Una máquina dormida no es un fallo, pero el arranque sigue: sin salir
        // de la caché, la ventana se queda inerte con la foto de la vez anterior
        // y no restaura pestañas ni se entera de cuando la máquina enciende.
        if (!asleep(e) && !isNoMachines()) {
          setSources([]);
          setMaterialError(prosaDe(e));
        }
      }
      if (primeras) {
        // Si cambiaron las carpetas, `grupos` relee también las nuevas; esta lectura ya vale para las de siempre.
        await primeras;
        if (generation !== workspaceContext.generation()) return;
        setEnCache(false);
      }
    }
    // La tarea que estaba abierta en este workspace vuelve a estarlo, que es lo
    // que hace un navegador al arrancar. Si su pestaña apunta a una tarea que
    // ya no existe, `abrirSesion` lo dice en la conversación y la
    // sincronización con el historial se lleva la pestaña.
    const desk = await deskReady;
    if (generation !== workspaceContext.generation()) return;
    // Si la persona ya empezó a mandar una tarea nueva mientras arrancaba, no
    // sobrescribir su pestaña provisional con la tira guardada.
    const activaAlArrancar = pestanas.active();
    if (sessionId() !== null || esProvisional(activaAlArrancar)) {
      if (a.active !== null && desk) paneles.bindTo(a.active, desk);
      if (!isNoMachines()) await reconcileActiveTurns();
      return;
    }
    const restored = pestanas.load(a.active, desk);
    // El reparto de su espacio vuelve con la tira: la pantalla partida que se
    // dejó al cerrar. La tarea de delante la abre `abrirSesion`, abajo; las
    // otras ventanas cargan la suya por `loadWindowThreads`.
    paneles.bindTo(null, null);
    const vivos = pestanas.open().map((p) => p.id);
    paneles.restore(a.active !== null && desk ? readLayout(a.active, desk) : null, vivos);
    paneles.sync(vivos);
    if (a.active !== null && desk) paneles.bindTo(a.active, desk);
    // Sin reparto guardado, `sincronizar` pone delante la última pestaña y no la activa de la tira.
    if (restored) paneles.activate(restored);
    loadWindowThreads(restored);
    // Su lectura no espera a la conciliación, que tarda lo que tarde el servicio:
    // esperándola, la pestaña de delante salía vacía y sin indicador.
    const delante = restored ? pestanas.open().find((p) => p.id === restored) : undefined;
    if (delante && isTaskTab(delante) && !hilos()[delante.session]) {
      threads.startLoading(delante.session);
      void loadThread(delante.project, delante.session).finally(() =>
        threads.finishLoading(delante.session));
    }
    const enFrente = paneles.activeTabAt(paneles.activeSite());
    if (!isNoMachines()) await reconcileActiveTurns();
    if (generation !== workspaceContext.generation()) return;
    // Lo que la persona abrió mientras se conciliaba gana: abrir la restaurada ahora le quitaría la ventana.
    if (sessionId() !== null || pestanas.active() !== null || paneles.activeTabAt(paneles.activeSite()) !== enFrente) return;
    if (delante) void abrirSesion(delante.project, delante.id);
  }
  return { aplicar, attachmentsFor, pegarImagen, recargarMaterial, refreshFolder, retryStartupRead };
}
