
import { open } from "@tauri-apps/plugin-dialog";
import { createCeldasDeContenido } from "./conversation-content";
import { createCeldasDeTareas } from "./conversation-tasks";
import { createConversacion } from "./conversation";
import { createColumnasDePrincipal } from "./principal-columns";
import { createPrincipal } from "./principal";
import { AgentProfile, CarryOriginLabel, CarryProgress,       MachinePicker,      TaskLocation } from "./lazy-screens";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import {
  batch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  
  
  type JSX,
  
  
  on,
  onCleanup,
  onMount,
  Show,
  Suspense,
  
} from "solid-js";
import type { Preview } from "../../../features/artifacts/src/components/Preview";
import Chat, {
  type Msg,
} from "../../../features/chat/src/screens/Chat";
import { DelegatedLaunch, type DelegatedListProps,  type DelegatedPanelModel,  delegatedDescendants } from "../../../features/chat/src/screens/DelegatedTasks";
import { agentSwitchBlocked, MACHINE_UNANNOUNCED } from "../../../features/chat/src/model/handover";
import { noteMcpSignIn } from "../../../features/settings/src/screens/McpSignInNotice";
import PreviousAgentChat from "../../../features/chat/src/screens/PreviousAgentChat";
import TranscriptSource from "../../../features/chat/src/screens/TranscriptSource";
import { modoInicial, modoRecordado, recordarModo } from "../../../features/chat/src/model/modes";
import {
  type ChatEvent,
  mensajesDelHilo,
  type PreguntaEvent,
  type SessionEvent,
} from "../../../features/chat/src/model/transcript";
import { createComposerStore } from "../../../features/composer/src";
import { createCloneFolder, createDeskStrip, createNewTask, createSpaceOps, createRailSessions, createSessionMutations, createWorkspaceSession } from "../../../features/projects/src";
import type { HandlerTarget } from "../../../features/settings/src/screens/HandlerPolicy";
import { createThreadsStore } from "../../../features/threads/src";
import { createWorkspaceStore } from "../../../features/workspace/src";
import { createContextSource } from "../../../features/workspaces/src";
import { listen } from "../../../../apps/desktop/src/lib/serviceEvents";


import { avisarDeLosArboles } from "../../../features/code/src/queries/refresh";
import TaskFilesRow, {  } from "../../../features/code/src/screens/TaskFilesRow";
import { arbolesDe, contiene, ubicar } from "../../../features/code/src/queries/treeKind";


import { esDeCodigo } from "../../../ui/src/lib/workdirKind";
import AgentPageTasks from "../../../features/projects/src/screens/AgentPageTasks";

import { createFreeRouterConsent, folderIcon, importCarry, renderAvatar,  renderPdf } from "./chatSlots";
import { launcherOf, taskDescendants } from "@terminus/tasks";
import { bringHereLabel, canBringHere, carryOrigin, machineName, machineOf, machines, machineWakes, refetchMachines, rememberedRunOn, remoteChildScope, runOn, senderTaskId, setRunOn, setTaskRowMachine } from "../../../features/machines/src/queries/store";
import { createdTasks } from "../../../features/projects/src/model/agentPageFilters";
import BaseBranchPicker from "../../../features/projects/src/screens/BaseBranchPicker";
import { watchHandlerStatus, watchHandlerStatuses } from "../../../features/projects/src/queries/handlerPresence";
import { EmptyContext, ProjectPicker } from "../../../features/projects/src/screens/Projects";

import { workLabel } from "../../../ui/src/lib/workLabel.ts";
import { DEFAULT_PROFILE, displayName, notifyProfiles, watchProfiles } from "../../../features/projects/src/queries/profiles";
import RecentAgentChats from "../../../features/projects/src/screens/RecentAgentChats";
import { type SessionRow, threadTitle } from "../../../features/projects/src/screens/Sessions";
import TabStrip, { NewTabButton } from "../../../features/projects/src/screens/Tabs";
import { createTaskWork, ResumeTask } from "../../../features/projects/src/screens/TaskHistory";
import { esChatDeAgente } from "../../../features/projects/src/model/taskTree";
import {
  DEFAULT_PERMISSION_MODE_EVENT,
} from "../../../features/settings/src/screens/DefaultPermissions";


import { listaBasta, reconciliar } from "../../../features/settings/src/model/early-startup";
import { createWorkspaces, type Startup } from "../../../features/settings/src/queries/workspaces-store";
import { createAttention, topState } from "../shell/attention";

import { openChatVisual, readChatVisual } from "../../../features/chat/src/queries/readVisual";
import { apagarVistasDe, hayVistasDe, soltarVistasHuerfanas } from "../../../features/code/src/queries/typst";
import { createConversationHandoff } from "../../../features/conversation-handoff/src";
import { createDraftsStore } from "../../../features/drafts/src";
import { asleep, withLastAnswer } from "../../../features/machines/src/queries/lastAnswer";
import { unconfirmedOpen } from "../../../features/machines/src/model/unconfirmedOpen";
import { createBatchDelivery, createServiceStream } from "../../../features/service-stream/src";
import { type SearchFilter } from "../shell/GlobalSearch";
import PantallaDeBloqueo from "../shell/LockScreen";
import { createSidebar } from "../shell/Sidebar";
import type { SidebarFilterProps } from "../shell/SidebarFilter";
import { createUsage } from "../shell/usage";
import { createEngineQueue, createTaskQueues } from "../../../features/task-queues/src";
import { VELO_DE_FONDO } from "../../../../apps/desktop/src/lib/chat-background";
import { fondoDeChat, imagenDelWorkspace, veloDeFondo } from "../../../../apps/desktop/src/lib/chat-background-store";
import { connected } from "../../../../apps/desktop/src/lib/engineConnection";
import { pedirElCampo } from "../../../../apps/desktop/src/lib/focus";
import { aplicarLenguaDeWorkspace, t } from "../../../../apps/desktop/src/lib/i18n";
import { captureWorkspaceContext, invoke } from "../../../engine-client/src/client.ts";
import type { InternalTaskLink } from "../../../../apps/desktop/src/lib/links";
import { carpetaDeTrabajo, type HandlerList } from "../../../../apps/desktop/src/lib/model";
import {
  createPanels,
  gridCell,
  
  
  
  type Side as PanelSide,
  panelReadingOrder,
  type PanelSite as SitioDePanel,
  sameSite,
} from "../../../../apps/desktop/src/lib/panels";
import { capabilities } from "../../../host/src/platform";
import { createPointerDrag } from "../../../../apps/desktop/src/lib/pointer-drag";
import { type SenderTask } from "../../../../apps/desktop/src/lib/recipients";
import { conservar } from "../../../session/src/sessionRefresh";
import { readShellCache, shellCacheWriter } from "../../../../apps/desktop/src/lib/shellCache";
import {
  destinoDePestana,
  type NavegacionDePestanas,
} from "../../../../apps/desktop/src/lib/shortcuts";
import { comandosConAlMargen } from "../../../../apps/desktop/src/lib/side-question";
import { createSpaceNavigationOrder } from "../../../../apps/desktop/src/lib/space-navigation-order";
import {
  type Space,
  
} from "../../../../apps/desktop/src/lib/spaces";
import {
  
  
  
  isContentTab,
  isTaskTab,
  
  
  
  screenTabId,
  type Tab,
} from "../../../../apps/desktop/src/lib/tabs";
import {
  esProvisional,
  proyectoDeNuevaTarea,
} from "../../../../apps/desktop/src/lib/taskDraft";
import {
  type UsageRecord,
  ventanaDe,
} from "../../../../apps/desktop/src/lib/usage";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import {
  
  createCompactViewport,
  
  LOCATION_BAR,
  
} from "../../../host/src/window";
import { Button } from "../../../ui/src/Button";
import { prosaDe } from "../../../ui/src/Failure";
import { LazyPart } from "../../../ui/src/LazyPart";

import { createChatEvents, createSleepSession, createThreadStream, createThreadSide, createAttachments, createAttachmentsMount, createResync, createResyncCommands, createShellCommand, createDraftSend, createHandover, createSend, createSendGates, createSendNow, createPanelDeChat, createChatBackground } from "../../../features/chat/src";

export const { sleepSession } = createSleepSession({ machineOf });

export default function App() {
  /**
   * El alta en curso: un pestillo a propósito, que se enciende cuando no
   * hay workspace y se apaga solo al terminar. Derivarlo de
   * «¿hay workspace?» desmontaría el asistente en cuanto el paso 1 crea el
   * primero, antes de pedir proveedores de IA y source control.
   */
  const [alta, setAlta] = createSignal(false);
  const { fondoDelAgente, setFondoDelAgente, workspaceContext, contextRoot, contextConfirmed, workspaceMode, workspaceActivo, confirmContext, attention, draftBases, setDraftBases, hablandoCon, setHablandoCon, projectCatalog, projectList, sources, setSources, draftMachine, draftOptions, composerProjects, materialError, setMaterialError, taskSourcesError, setTaskSourcesError, draftProjectError, setDraftProjectError, projectReadError, setProjectReadError, startupReadError, setStartupReadError, connectionError, setConnectionError, readRevision, setReadRevision, draftMachineOn, taskSources, setTaskSources, setError, errorVisible, bloqueo, setBloqueo, grupos, project, setProject, sesiones, setSesiones, actividadDeProyectos, elegidosAqui, recordarEleccion, tareasActivas, ocultosAqui, ocultarDelSelector, naciendo, setNaciendo, retoques, setRetoques, retirarNaciendo, sessionId, setSessionId, materialPedido, setMaterialPedido, proyectoAbierto, setProyectoAbierto, pestanas, archivosDeTarea, llaveDeBorrador, anchoDeArchivos, setAnchoDeArchivos, anchoDelArbol, setAnchoDelArbol, } = createWorkspaceSession({ asleep, createAttention, createWorkspaceStore, machineName, machines, runOn });

  const pestanaActiva = () => (proyectoAbierto() ? null : pestanas.active());
  // Los escritorios del workspace (`lib/spaces.ts`). Sin lista —un servicio
  // que no los conoce— la ventana se pinta como antes de los espacios.
  const [rawSpaces, setSpaces] = createSignal<Space[]>([]);
  const spaceOrder = createSpaceNavigationOrder(() => workspaceActivo() ?? "", () => setError(t("spaces.order.error")));
  const spaces = createMemo(() => spaceOrder.arrange(rawSpaces()));
  const [escritorio, setEscritorio] = createSignal<string | null>(null);
  const [sidebarFilter, setSidebarFilter] = createSignal<SidebarFilterProps | null>(null);
  // El nombre del workspace abierto rotula el menú de espacios de la franja.
  const workspacesDeLaFranja = createWorkspaces();
  const workspaceActual = () => workspacesDeLaFranja.actual();
  // Dónde empieza el chat, ya pasada la línea de la barra lateral: la primera pestaña nace ahí.
  const [bordeDeLaBarra, setBordeDeLaBarra] = createSignal<number | null>(null);
  const medirBordeDeLaBarra = (el: HTMLDivElement) => {
    const medir = () => setBordeDeLaBarra(el.getBoundingClientRect().left || null);
    const ojo = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    // Con la conversación en su ancho base, la barra se encoge y este borde se mueve sin que cambie su tamaño.
    queueMicrotask(() => {
      const caja = el.parentElement;
      for (const parte of caja ? [caja, ...caja.children] : [el]) ojo?.observe(parte);
      medir();
    });
    onCleanup(() => ojo?.disconnect());
  };
  const activeSpace = () => spaces().find((i) => i.id === escritorio()) ?? null;
  const multipleSpaces = () => spaces().length > 1;
  // El sidebar de la vez anterior, pintado antes del primer IPC e inerte hasta que el motor lo confirma.
  const shellCache = readShellCache();
  const [enCache, setEnCache] = createSignal(shellCache !== null);
  if (shellCache) {
    batch(() => {
      projectCatalog.fromCache(shellCache.projects);
      setSesiones(shellCache.sessions);
      setSpaces(shellCache.spaces);
      setEscritorio(shellCache.desk);
    });
  }
  const guardarCache = shellCacheWriter();
  createEffect(() => {
    const workspace = workspaceActivo();
    const snapshot = { workspace, projects: projectList(), sessions: sesiones(), spaces: spaces(), desk: escritorio() };
    if (enCache() || bloqueo() || !workspace) return;
    // A mitad de un cambio de workspace las filas aún son del anterior: esa foto no se guarda.
    const carpetas = ["", ...snapshot.projects.map((p) => p.id)];
    const leidas = Object.keys(snapshot.sessions);
    if (leidas.length !== carpetas.length || !carpetas.every((c) => c in snapshot.sessions)) {
      guardarCache.cancel();
      return;
    }
    guardarCache.save({ ...snapshot, workspace });
  });
  window.addEventListener("pagehide", guardarCache.flush);
  onCleanup(() => window.removeEventListener("pagehide", guardarCache.flush));
  // Cuándo enseña tareas el sidebar, en `window.log`: el arranque se mide desde aquí.
  const pintadoDesde = new Set<string>();
  createEffect(() => {
    const source = enCache() ? "cache" : "engine";
    if (pintadoDesde.has(source) || !Object.values(sesiones()).some((filas) => filas.length > 0)) return;
    pintadoDesde.add(source);
    requestAnimationFrame(() =>
      void invoke("window_painted", { at: Math.round(performance.now()), source }).catch(() => {}));
  });
  // `null` cerrado; si no, el chip con el que abre el buscador global.
  const [buscando, setBuscando] = createSignal<SearchFilter | null>(null);
  // Los visores se recorren por id y no por el objeto abierto: `For`
  // compara por referencia, y marcar un archivo como cambiado —al
  // guardarlo— crea un objeto nuevo. Eso desmontaría y volvería a montar
  // su visor, tirando el desplazamiento y pidiendo el archivo otra vez.
  const idsDeContenido = createMemo(() =>
    pestanas.open().filter(isContentTab).map((p) => p.id),
  );

  // Las pestañas separadas: fijas a la derecha, fuera de la tira
  // (`lib/panels.ts`). Sin ninguna, todo lo de abajo se comporta como si
  // esto no existiera. La tira gobierna el panel principal y nada más:
  // lo separado no está en la tira, y no hay que preguntarse en cuál de
  // los dos panes cae lo que se pulsa.
  const paneles = createPanels(pestanas.restorable);
  // Cuánto de la cabecera ocupan de verdad los controles de cada
  // plataforma, sin poder expresarse con un padding fijo: el semáforo
  // está a la izquierda en macOS, los controles a la derecha en Windows,
  // y el título de la rama solo existe en builds de desarrollo.
  const [reservaIzquierdaDeTiras, setReservaIzquierdaDeTiras] = createSignal(0);
  const [reservaDerechaDeTiras, setReservaDerechaDeTiras] = createSignal(0);
  let cabeceraDeConversacion: HTMLDivElement | undefined;
  let controlesIzquierdos: HTMLDivElement | undefined;
  let controlesDerechos: HTMLDivElement | undefined;
  const medirReservasDeTiras = () => {
    if (!cabeceraDeConversacion || !controlesIzquierdos || !controlesDerechos)
      return;
    const cabecera = cabeceraDeConversacion.getBoundingClientRect();
    const izquierda = controlesIzquierdos.getBoundingClientRect();
    const derecha = controlesDerechos.getBoundingClientRect();
    setReservaIzquierdaDeTiras(Math.max(0, izquierda.right - cabecera.left));
    setReservaDerechaDeTiras(Math.max(0, cabecera.right - derecha.left));
  };
  onMount(() => {
    medirReservasDeTiras();
    if (typeof ResizeObserver === "undefined") return;
    const ojo = new ResizeObserver(medirReservasDeTiras);
    if (cabeceraDeConversacion) ojo.observe(cabeceraDeConversacion);
    if (controlesIzquierdos) ojo.observe(controlesIzquierdos);
    if (controlesDerechos) ojo.observe(controlesDerechos);
    onCleanup(() => ojo.disconnect());
  });
  // Con la ventana estrecha se enseña solo el panel principal; lo
  // separado sigue separado. El corte es `COMPACT_VIEWPORT_QUERY` —900px
  // de ancho, 1100 en vertical—, ya definido por la app: a 900px, con el
  // historial en sus 260, quedan ~640 para el espacio principal, y el
  // divisor no cabe en dos mínimos de 320 (`lib/panels.ts`). Esconder en
  // vez de juntar es lo que devuelve el reparto al ensanchar.
  const compacta = createCompactViewport();
  const paginaDeAgente = () => !sessionId() && hablandoCon() !== null;
  // La página de un agente ocupa la pantalla entera: las demás ventanas
  // siguen repartidas y vuelven al abrir una tarea, como con la ventana estrecha.
  const unaSolaVentana = () => compacta() || paginaDeAgente();
  /**
   * Las pistas que se le pasan a `Paneles`. Con la ventana estrecha, **una sola
   * celda**: lo separado sigue separado, solo que no se enseña.
   */
  const anchosEnPantalla = () => (unaSolaVentana() ? [1] : paneles.widths());
  const altosEnPantalla = () => (unaSolaVentana() ? [1] : paneles.heights());
  const filasEnPantalla = () =>
    unaSolaVentana() ? [1] : paneles.rowsPerColumn();
  // En qué celda de la cuadrícula se pinta lo que está en `sitio`, o
  // `undefined` si no está a la vista. Quien lo pinta lo esconde además
  // con `hidden`: un hijo sin celda asignada se colaría en la primera
  // libre. Cómo se numeran las celdas está en `celda()`.
  const estiloDeLaCelda = (sitio: SitioDePanel | null) => {
    if (!sitio) return undefined;
    if (unaSolaVentana())
      return sameSite(sitio, paneles.activeSite())
        ? { "grid-column": "1", "grid-row": "1" }
        : undefined;
    return gridCell(sitio, paneles.rowsPerColumn()[sitio.col] ?? 1);
  };
  /** Las ventanas que se pintan. Con la ventana estrecha, solo la activa. */
  const ventanas = () =>
    unaSolaVentana() ? [paneles.activeSite()] : paneles.sites();
  /** Solo las filas bajo la primera llevan su tira dentro de la cuadrícula. */
  const llevaTiraInterior = (sitio: SitioDePanel | null | undefined) =>
    paneles.isSplit() && (sitio?.fila ?? 0) > 0;
  // Si una pestaña se está viendo ahora mismo: es la que su ventana
  // tiene delante, y esa ventana se está pintando. Con la ventana
  // estrecha solo se pinta la activa: lo que hay en las demás sigue
  // repartido pero no se enseña, y ensanchar devuelve el reparto que
  // había en vez de deshacerlo.
  const seVe = (id: string) => {
    const sitio = paneles.siteOf(id);
    if (!sitio || paneles.activeTabAt(sitio) !== id) return false;
    return !unaSolaVentana() || sameSite(sitio, paneles.activeSite());
  };
  /** Dónde se pinta una pestaña, o `undefined` si no se ve. */
  const celdaDe = (id: string) =>
    seVe(id) ? estiloDeLaCelda(paneles.siteOf(id)) : undefined;
  // La vista de proyecto ocupa la celda de la ventana activa, así que quien
  // caiga en esa celda tiene que apartarse: dos nodos con la misma celda se
  // apilan y se leen encima uno del otro. Función y no memo: `proyectoDeLaVista`
  // se declara más abajo, y memoizar lanzaba `ReferenceError` en el primer
  // pintado con la app en blanco.
  const tapadoPorElProyecto = (sitio: SitioDePanel | null | undefined) =>
    proyectoDeLaVista() !== null &&
    !!sitio &&
    sameSite(sitio, paneles.activeSite());
  /** La pestaña que se ve en `sitio`: ninguna cuando la página de un
   *  proyecto la tapa, aunque siga siendo la activa de su ventana. */
  const pestanaDelanteEn = (sitio: SitioDePanel) =>
    tapadoPorElProyecto(sitio) ? null : paneles.activeTabAt(sitio);
  /** Si `sitio` enseña la conversación en blanco: la tarea nueva sin lanzar. */
  const enBorrador = (sitio: SitioDePanel) =>
    paneles.activeTabAt(sitio) === null && !tapadoPorElProyecto(sitio);
  /** Sitios sin pestaña delante, restando el que ocupa la vista de proyecto. */
  const sitiosEnBlanco = () => paneles.sites().filter(enBorrador);
  // La pestaña que había delante al pasar al blanco: cerrar la tarea nueva vuelve a ella.
  const [antesDelBorrador, setAntesDelBorrador] = createSignal<string | null>(null);
  /** A qué pestaña de `sitio` vuelve cerrar la tarea nueva; sin ninguna, no se cierra. */
  const vueltaDelBorrador = (sitio: SitioDePanel) => {
    const suyas = paneles.tabsAt(sitio);
    const antes = antesDelBorrador();
    return antes !== null && suyas.includes(antes) ? antes : (suyas.at(-1) ?? null);
  };
  function cerrarBorrador(sitio: SitioDePanel) {
    const id = vueltaDelBorrador(sitio);
    const p = pestanas.open().find((x) => x.id === id);
    if (p) void activarPestana(p);
  }
  /** La fila del historial de una tarea, en el grupo que esté. */
  const filaDe = (id: string) => {
    for (const grupo of Object.values(sesiones())) {
      const fila = grupo.find((r) => r.id === id);
      if (fila) return fila;
    }
    return naciendo().find((n) => n.row.id === id)?.row;
  };
  /**
   * Las opciones de una orden sobre la tarea `id`: si corre en otra máquina, con
   * su cabecera. La máquina sale de su fila (o de la pestaña que aún no la
   * tiene), nunca de los demás argumentos (`features/machines/router.ts`).
   */
  // El árbol, el visor y kn piden por `machineOf` desde fuera de aquí: con la fila, no solo con el prefijo.
  setTaskRowMachine((id) => filaDe(id)?.machine);
  const deLaTarea = (id: string | null | undefined) => machineOf(id);
  /** La máquina de esa tarea o carpeta y su workspace, para lo que responde o actúa en ellas. */
  const opcionesDeLaTarea = (id: string | null | undefined, workspace: string | null | undefined) =>
    captureWorkspaceContext({ headers: { ...machineOf(id)?.headers, ...(workspace ? { "x-terminus-workspace": workspace } : {}) } });
  const enMaquina = (machine: string | undefined) => (machine ? { headers: { "x-terminus-machine": machine } } : undefined);
  // En qué máquina vive cada adjunto que no está en el motor de la ventana:
  // la imagen pegada recién guardada y su copia ya preparada.
  const pegadasEn = new Map<string, string>();
  const adjuntosEn = new Map<string, string>();
  /**
   * El space con que nace o sigue algo en `machine`. Uno de esta ventana viaja:
   * es de la cuenta, con el mismo id en todas (el router lo comparte antes si
   * hace falta). Uno que solo existe en otra máquina viaja solo a esa.
   */
  const espacioPara = (space: string | null | undefined, machine: string | null | undefined) => {
    if (!space || !machine) return space ?? null;
    const own = capabilities().taskMachine?.(space) ?? null;
    return own === null || own === machine ? space : null;
  };
  // Sin la carpeta no se puede abrir: `abrirSesion` la necesita para la pestaña.
  const tareaDelRiel = (id: string): SenderTask | null => {
    for (const [folder, filas] of Object.entries(sesiones())) {
      const fila = filas.find((r) => r.id === id);
      if (fila) return { folder, task: id, title: fila.title.trim() || id, provider: fila.provider };
    }
    return null;
  };
  /**
   * Lo que se pinta en cada pestaña: el título del historial cuando ya llegó,
   * y mientras tanto el que la pestaña se guardó la última vez.
   */
  const pestanasEnPantalla = createMemo<Tab[]>(() =>
    pestanas.open().map((p) => {
      if (!isTaskTab(p)) return p;
      const fila = filaDe(p.id);
      const titulo =
        fila && esChatDeAgente(fila) && !fila.agent_thread ? (fila.agent ?? p.titulo) : fila?.inbox ? threadTitle(fila) : (fila?.title ?? p.titulo);
      // La misma fila si el título no cambió, lo que arregla la ×: esto
      // devolvía `{ ...p }` siempre, y cualquier recálculo del memo —activar
      // una ventana lo dispara— daba filas NUEVAS. `Pestanas` las pinta con
      // `For`, que compara por referencia: filas nuevas destruye y
      // reconstruye el DOM de toda la tira.

      // Sin esto, cerrar una pestaña de una ventana que no manda no hace
      // nada la primera vez: el `pointerdown` sube al contenedor de la
      // ventana, que la pone al mando (`mandarVentana`), recalcula este
      // memo, y el botón × recién pulsado deja de existir antes de que
      // llegue el `click`.
      return titulo === p.titulo ? p : { ...p, titulo };
    }),
  );

  /**
   * Las pestañas de una ventana, ya con su título. Va aquí y no arriba:
   * un memo antes de `pestanasEnPantalla` la lee en su zona muerta
   * temporal —`ReferenceError`, ventana en blanco— que `tsc` no ve: la
   * referencia es legal para TypeScript.
   */
  const pestanasDe = (sitio: SitioDePanel) => {
    const suyas = paneles.tabsAt(sitio);
    const todas = pestanasEnPantalla();
    return suyas
      .map((id) => todas.find((p) => p.id === id))
      .filter((p): p is Tab => p !== undefined);
  };
  /**
   * El reparto se reconcilia con las pestañas que existen de verdad
   * (`lib/tabs.ts`). Es un efecto y no un memo: escribe. Abrir una cae en
   * la ventana activa; cerrar la última de una ventana se la lleva. Sin
   * esto, un archivo quedaría montado sin celda: invisible, sin error.
   */
  createEffect(
    on(
      () => [pestanas.open().map((p) => p.id), pestanas.active()] as const,
      ([ids, activa], previous) => {
        batch(() => {
          paneles.sync(ids);
          if (activa) paneles.activate(activa);
          const site = activa ? paneles.siteOf(activa) : null;
          if (activa && site && !pestanas.isPinned(activa) && activa !== previous?.[1]) {
            pestanas.replacePreviews([paneles.tabsAt(site)], [activa]);
          }
          paneles.sync(pestanas.open().map((p) => p.id));
        });
      },
    ),
  );
  const { tareasEnVentanas, proyectoDePestana, sesionesConPestana, agentesEnUso, pedidas, esperandoFila, cambiarEscritorio, carpetaDelEscritorio, asentarEscritorio, reloadSpaces, senalDe, claveDelHilo, claveAbierta, drafts, borrador, input, setInput, navigateMentionHistory, sourceIds, excludedSourceIds, archivos, setArchivos, agregarArchivos, adjuntas, materialPendiente, contexto, composer, agents, agent, superficies, superficie, catalogos, models, modelosParaAgentes, model, effort, modo, modos, skills, cliCommands, sideCommand, threads, hilos, hiloAbierto, msgs, cargandoHilo, origenes, apagadas, machineWaits, traspasos, conAntiguos, conRecientes, estadoAntiguos, colaSuelta, leerTarea, cargarAntiguos, soltarHilo, avisar, loadResult, soltarPestanaGuardada } = createDeskStrip({ abrirSesion: (proyecto, id, activar, propagateError) => abrirSesion(proyecto, id, activar, propagateError), activarPestana: (p) => activarPestana(p), activeSpace, adjuntosEn, attention, composerMachine: () => composerMachine(), connected, createComposerStore, createDraftsStore, createThreadsStore, deLaTarea: (id) => deLaTarea(id), escritorio, filaDe: (id) => filaDe(id), grupos, hablandoCon, irAlBlanco: (enProyecto) => irAlBlanco(enProyecto), get liveThreads() { return liveThreads; }, loadWindowThreads: (skip) => loadWindowThreads(skip), machines, modoInicial, modoRecordado, recordarModo, naciendo, olvidarPestana: (session) => olvidarPestana(session), paneles, pegadasEn, pestanaActiva, pestanas, project, projectList, refreshSessions: (proyectos) => refreshSessions(proyectos), get serviceStream() { return serviceStream; }, sesiones, sessionId, setEscritorio, setProyectoAbierto, setSpaces, spaces, taskSources, topState, vivas: () => vivas(), withLastAnswer, workspaceActivo, workspaceContext, workspaceMode, });
  const { aviso, setAviso, deletingSpace, setDeletingSpace, createSpace, renameSpace, removeFromActiveSpace, moveToSpace, spaceDeleted } = createSpaceOps({ abrirSesion: (proyecto, id, activar, propagateError) => abrirSesion(proyecto, id, activar, propagateError), activeSpace, cambiarEscritorio, deLaTarea: (id) => deLaTarea(id), escritorio, grupos, machineOf: (id) => machineOf(id), refreshSessions: (proyectos) => refreshSessions(proyectos), reloadSpaces, setBuscando, setError, setSpaces, soltarPestanaGuardada, spaces, workspaceActivo });

  let lifecycleRevision = 0;
  const { advanceTurn, alMargen, almacenDePreguntas, arrancando, busy, carpetasDeTerminal, cerrarAlMargen, cola, colaDe, comandosDeLaCola, conversationScope, desdeDeTurno, detenidos, editando, enFondo, engineCanDispatch, esDeLaAbierta, esDelWorkspaceAbierto, esperaMaquinaEn, finishedTurns, folder, handoff, handoffAt, injecting, lanzados, liveThreadKey, liveThreads, marcarQuieta, marcarViva, mentionSources, nacenConComando, pasarAlHilo, pendingStarts, permissionError, permissions, placeCandidates, preguntarAlMargen, queueBusy, recipientCandidates, refreshTaskCandidates, reintento, releerCola, respondiendoPermiso, resumeQueue, retenidaPorElMotor, rosterDelProyecto, setArrancando, setCarpetasDeTerminal, setDesdeDeTurno, setEnFondo, setFolder, setInjecting, setMentionSources, setPermissionError, setPermissions, setPreguntasAMedias, setReintento, setRespondiendoPermiso, setSettlingTurns, setSinSteer, setTerminales, setVentana, setVivas, settlingTurns, sinSteer, soltarPreguntas, stopping, taskCandidates, taskQueues, terminales, turnClosed, turnRevisions, turnStarted, ventana, vivas } = createThreadStream({ apagadas, claveAbierta, createConversationHandoff, createEngineQueue, createTaskQueues, deLaTarea, filaDe, input, leerTarea, loadResult, machineName, machineOf, machineWaits, machineWakes, machines, opcionesDeLaTarea, pestanas, project, projectList, sesiones, sessionId, setInput, tareaDelRiel, threads, watchHandlerStatuses, watchProfiles, workspaceActivo, workspaceContext, get enviarFiltro() { return enviarFiltro; }, get lifecycleRevision() { return lifecycleRevision; }, set lifecycleRevision(v) { lifecycleRevision = v; }, get mandarElegido() { return mandarElegido; }, get reconcileActiveTurns() { return reconcileActiveTurns; } });

  const { activityMachine, activityNotice, anadiendoCarpeta, carpetaDelProyecto, inicioDeCarpeta, setActivityMachine, setActivityNotice, setAnadiendoCarpeta, setInicioDeCarpeta, setSettings, settings, sidebar } = createThreadSide({ createSidebar, alta, archivosDeTarea, closeActiveTab: () => closeActiveTab(), irAPestanaDe, irAVentanaVecina, juntarLaActiva, llaveDeBorrador, nuevaSesion: (enProyecto) => nuevaSesion(enProyecto), partirLaActiva, project, projectList, reabrirPestana, sessionId, setBuscando, workspaceActivo });
  const { clonEnCurso, setClonEnCurso, cuentasTocadas, setCuentasTocadas, firmas, modelosEnVivo, esperando, preguntadas, sesionesConEstado, sessionLists, refreshSessions, carpetasDeTarea, refreshSessionsOnEvent, releerTrasHueco, previewDeAdjunto, miniaturaDeAdjunto, documentosEn, opcionesDeAdjunto, } = createCloneFolder({ attention, avisarDeLosArboles, claveDelHilo, colaSuelta, deLaTarea: (id) => deLaTarea(id), draftOptions, esperandoFila, grupos, hiloAbierto, hilos, leerTarea, loadResult, machines, msgs, naciendo, pedidas, pestanas, project, remoteChildScope, retoques, sesiones, sesionesConPestana, sessionId, setSesiones, unconfirmedOpen, vivas: () => vivas(), workspaceActivo, workspaceContext, });


  const { aplicar, attachmentsFor, pegarImagen, recargarMaterial, refreshFolder, retryStartupRead } = createAttachments({ adjuntosEn, asentarEscritorio, asleep, composer, confirmContext, deLaTarea, documentosEn, draftOptions, drafts, enCache, enMaquina, finishedTurns, grupos, guardarCache, handoff, hilos, machineName, machines, paneles, pegadasEn, pestanas, projectCatalog, refetchMachines, refreshSessions, sessionId, sessionLists, setAlta, setAviso, setBloqueo, setCuentasTocadas, setDesdeDeTurno, setDraftBases, setEnCache, setError, setEscritorio, setFolder, setMaterialError, setProject, setProjectReadError, setProyectoAbierto, setSesiones, setSessionId, setSettlingTurns, setSources, setSpaces, setStartupReadError, setTaskSourcesError, setVentana, setVivas, shellCache, taskQueues, threads, workspaceActivo, workspaceContext, get abrirSesion() { return abrirSesion; }, get lifecycleRevision() { return lifecycleRevision; }, set lifecycleRevision(v) { lifecycleRevision = v; }, get loadThread() { return loadThread; }, get loadWindowThreads() { return loadWindowThreads; }, get reconcileActiveTurns() { return reconcileActiveTurns; }, get soltarCola() { return soltarCola; } });

  const { applyPushed, settleTurn } = createAttachmentsMount({ advanceTurn, agent, aplicar, asleep, bloqueo, closeActiveTab: () => closeActiveTab(), composer, conversationScope, createBatchDelivery, enCache, finishedTurns, grupos, handoff, hilos, leerTarea, listaBasta, loadResult, marcarQuieta, pestanas, project, projectCatalog, recargarMaterial, reconciliar, refreshSessions, sessionId, setBloqueo, setEnCache, setEnFondo, setPermissions, setSesiones, setSettings, setSettlingTurns, setStartupReadError, soltarHilo, tareaDelRiel, taskQueues, threads, turnRevisions, vivas, workspaceContext, get mandarElegido() { return mandarElegido; }, get releerProyectos() { return releerProyectos; }, get releerUna() { return releerUna; }, get soltarTerminal() { return soltarTerminal; } });
  let serviceListenersReady: Promise<unknown> = Promise.resolve();
  const { enviarFiltro, reconcileActiveTurns, reconcileSoon, releerUna, serviceStream } = createResync({ applyPushed, asleep, conversationScope, createServiceStream, esDeLaAbierta, handoff, leerTarea, liveThreads, loadResult, machines, marcarViva, pendingStarts, pestanas, project, recargarMaterial, releerTrasHueco, sesionesConPestana, sessionId, setConnectionError, setDesdeDeTurno, setEnFondo, setError, setPermissions, settleTurn, settlingTurns, soltarVistasHuerfanas, tareaDelRiel, terminales, threads, vivas, workspaceActivo, workspaceContext, get lifecycleRevision() { return lifecycleRevision; }, set lifecycleRevision(v) { lifecycleRevision = v; }, get ponerTerminal() { return ponerTerminal; }, get reponerGates() { return reponerGates; }, get serviceListenersReady() { return serviceListenersReady; }, set serviceListenersReady(v) { serviceListenersReady = v; } });

  const { alEventoDeChat } = createChatEvents({ advanceTurn, agent, avisarDeLosArboles, carpetasDeTarea, cola, composer, conversationScope, editando, enFondo, enviarFiltro, esDelWorkspaceAbierto, filaDe, finishedTurns, firmas, handoff, liveThreadKey, liveThreads, marcarViva, modelosEnVivo, noteMcpSignIn, pendingStarts, permissions, refreshSessionsOnEvent, reintento, releerCola, releerUna, sessionId, setEnFondo, setPermissionError, setPermissions, setReintento, setSettlingTurns, settleTurn, threads, turnClosed, turnStarted, workspaceActivo, get alComando() { return alComando; }, get gateSeq() { return gateSeq; }, set gateSeq(v) { gateSeq = v; }, get mandarAhora() { return mandarAhora; }, get permissionReads() { return permissionReads; }, get reponerGates() { return reponerGates; } });

  onMount(() => {
    const chat = listen<ChatEvent>("chat", alEventoDeChat);
    onCleanup(() => void chat.then((f) => f()));

  // El agente preguntó algo. Llega por su propio evento y no por el del chat:
  // es estructura —opciones que se eligen—, no texto que se pinta. El nombre
  // va en inglés y los campos no, sin ser una inconsistencia: el nombre del
  // evento es una ruta entre dos procesos y los campos son el vocabulario ya
  // persistido en `session.json`.
    const question = listen<PreguntaEvent>("question", (e) => {
      const { workspace, session, turno, preguntas, request_id } = e.payload;
      // Con qué agente se contesta: el de ESA tarea, que puede no ser la
      // abierta. El historial lo sabe por fila; el selector solo sabe el de la
      // que se mira.
      const conAgente = filaDe(session)?.provider ?? (session === sessionId() ? agent() : undefined);
      threads.question(session, { turno, preguntas, questionRequestId: request_id, agent: conAgente }, workspace ?? workspaceActivo());
    });
    onCleanup(() => void question.then((f) => f()));

    // El consumo llega como dato y se conserva por turno. No entra a `msgs`:
    // una línea de tokens es diagnóstico, no una intervención en la conversación.
    const usageEv = listen<UsageRecord>("usage", (e) => {
      const rec = e.payload;
      // `UsageRecord` trae su workspace desde que existe: cada línea del
      // registro tiene que saber de dónde salió aunque se lea suelta.
      if (!esDeLaAbierta(rec.session) || !esDelWorkspaceAbierto(rec.workspace))
        return;
      setVentana(ventanaDe([rec]));
      composer.refreshCommands(agent());
    });
    onCleanup(() => void usageEv.then((f) => f()));

    // Instalar un agente lo deja usable aquí, no solo en la pantalla
    // donde se instaló. Esta lista se leía una vez en `onMount`: quien
    // conectaba una cuenta desde Ajustes veía ahí su consumo, y en el
    // chat el mismo agente seguía diciendo «no está instalado», con el
    // campo muerto hasta cerrar y volver a abrir la app.
    const agentsEv = listen("providers", () => {
      void composer.refreshProviders();
      // Y qué se puede usar, que es lo que decide el menú. Conectar una cuenta
      // desde Configuración añade una entrada aquí; desinstalar un CLI se la
      // lleva. Sin esto había que cerrar la app para verlo.
      void composer.refreshSurfaces(false);
    });
    onCleanup(() => void agentsEv.then((f) => f()));

    // Un plugin instalado o activado trae skills: sin esto `/typst` no se
    // reconoce hasta el siguiente turno.
    const pluginsEv = listen("integrations-changed", () => composer.refreshCommands(agent()));
    onCleanup(() => void pluginsEv.then((f) => f()));

    // Cambió qué cuenta va a correr: cambió qué se puede usar.
    // `surfaces::sin_cuenta` pregunta por la cuenta activa, y la sonda de
    // estado la quita en cuanto una deja de responder
    // (`accounts::account_status`). Sin escuchar esto, el selector sigue
    // ofreciendo un agente que ya no puede correr, y el turno muere
    // contra el guarda con un muro de texto.
    const cuentaEv = listen("account", () => {
      void composer.refreshSurfaces(false);
      // El reloj de cupo cambia la activa sin pasar por Configuración: sin esto la franja enseña la agotada.
      setCuentasTocadas((n) => n + 1);
    });
    onCleanup(() => void cuentaEv.then((f) => f()));

    // La otra ventana escribió en esta carpeta de datos: hay que releer,
    // igual que el `done` de un turno propio, con dos diferencias. Rust
    // ya descartó el eco (`sync::arrancar` compara la firma); y un turno
    // vivo AQUÍ manda —si esta ventana contesta esa misma tarea, releer
    // con `vaciarVivo` borraría `vivo` a media respuesta.

    // Lo que la ventana no puede pintar. Ver `abrirEnlace`.
    const sitioPedido = listen<string>("sitio-pedido", (e) => {
      void abrirEnlace(e.payload);
    });
    onCleanup(() => void sitioPedido.then((f) => f()));
    const enlaceDelChat = (e: Event) => {
      void abrirEnlace((e as CustomEvent<string>).detail);
    };
    window.addEventListener("harness:abrir-sitio", enlaceDelChat);
    onCleanup(() => window.removeEventListener("harness:abrir-sitio", enlaceDelChat));
    const localFileLink = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path === "string") void abrirRuta(path);
    };
    window.addEventListener("harness:open-file", localFileLink);
    onCleanup(() => window.removeEventListener("harness:open-file", localFileLink));
    // «Que lo arregle el agente» en un documento Typst: sale como si la persona lo escribiera, en su tarea.
    const pedirAlAgente = (e: Event) => {
      const pedido = (e as CustomEvent<{ project: string; session: string; texto: string } | null>).detail;
      if (!pedido?.texto || !pedido.session) return;
      void (async () => {
        if (sessionId() !== pedido.session) await abrirSesion(pedido.project, pedido.session);
        if (sessionId() === pedido.session) await mandarTexto(pedido.texto);
      })();
    };
    window.addEventListener("harness:pedir-al-agente", pedirAlAgente);
    onCleanup(() => window.removeEventListener("harness:pedir-al-agente", pedirAlAgente));
    const taskLink = (e: Event) => {
      const target = (e as CustomEvent<InternalTaskLink>).detail;
      if (!target || target.workspace !== workspaceActivo()) {
        setError(t("markdown.link.other_workspace"));
        return;
      }
      void leerTarea(target.folder, target.task)
        .then(() => {
          if (target.workspace === workspaceActivo()) void abrirSesion(target.folder, target.task);
        })
        .catch((error) => setError(prosaDe(error)));
    };
    window.addEventListener("harness:open-task-link", taskLink);
    onCleanup(() => window.removeEventListener("harness:open-task-link", taskLink));
    // Con proyecto lo avisa un gesto de `Sessions.tsx`; sin él, `cli-changed`.
    const tasksChanged = (event: Event) => {
      const project = (event as CustomEvent<{ project?: string } | null>).detail?.project;
      void (project !== undefined ? refreshSessions([project]) : refreshSessionsOnEvent(grupos()));
    };
    window.addEventListener("harness:tasks-changed", tasksChanged);
    onCleanup(() => window.removeEventListener("harness:tasks-changed", tasksChanged));
    // Otra máquina de la cuenta trajo una rebanada distinta (`features/machines/router.ts`): se relee solo eso.
    const machineSlices = (event: Event) => {
      const changes = (event as CustomEvent<{ changes?: string[] } | null>).detail?.changes ?? [];
      if (changes.includes("sessions")) {
        void refreshSessionsOnEvent(grupos());
        reconcileSoon();
      }
      if (changes.includes("spaces")) void reloadSpaces();
      if (changes.includes("mentions") && input().includes("@")) void refreshTaskCandidates();
      if (changes.includes("projects")) {
        const workspace = workspaceActivo();
        void projectCatalog.changed().then(() => {
          if (workspace === workspaceActivo()) setProjectReadError(null);
        }).catch(() => {});
      }
    };
    window.addEventListener("harness:machine-slices", machineSlices);
    onCleanup(() => window.removeEventListener("harness:machine-slices", machineSlices));
    // La otra mitad de la elección del enlace (`ui/Markdown.tsx`): sale al
    // navegador de la persona por una puerta más estrecha que la de dentro.
    // Ver `sites::abrible_fuera`.
    const enlaceFuera = (e: Event) => {
      void invoke("site_open_external", {
        url: (e as CustomEvent<string>).detail,
      }).catch(() => {});
    };
    window.addEventListener("harness:abrir-fuera", enlaceFuera);
    onCleanup(() => window.removeEventListener("harness:abrir-fuera", enlaceFuera));

    const cliChanged = listen<{ workspace: string | null; command: string }>("cli-changed", (e) => {
      window.dispatchEvent(new CustomEvent("harness:workspace-name"));
      if (!esDelWorkspaceAbierto(e.payload.workspace ?? undefined)) return;
      const workspace = workspaceActivo();
      void projectCatalog.changed().then(() => {
        if (workspace === workspaceActivo()) setProjectReadError(null);
      }).catch((error) => { if (workspace === workspaceActivo() && !asleep(error)) setProjectReadError(prosaDe(error)); });
      void reloadSpaces();
      void composer.refreshSurfaces(false);
      setCuentasTocadas((n) => n + 1);
      window.dispatchEvent(new CustomEvent("harness:tasks-changed"));
      // El mismo aviso que dan `NewAgent.tsx` y `AgentProfile.tsx`: sin él, lo
      // creado o cambiado desde el CLI no sale en el riel hasta cambiar de carpeta.
      if (e.payload.command === "handler.create" || e.payload.command === "handler.update") {
        window.dispatchEvent(new CustomEvent("harness:encargados"));
        window.dispatchEvent(new CustomEvent("harness:profiles"));
      }
      if (e.payload.command === "config.set") {
        const modeGeneration = workspaceContext.generation();
        void invoke<Startup>("list_workspaces").then((startup) => {
          if (workspace !== workspaceActivo()) return;
          const current = startup.workspaces.find((w) => w.id === workspace);
          aplicarLenguaDeWorkspace(current?.lengua ?? null);
          workspaceContext.modeChanged(workspace, current?.default_permission_mode ?? null, modeGeneration);
          setStartupReadError(null);
        }).catch((error) => { if (workspace === workspaceActivo() && !asleep(error)) setStartupReadError(prosaDe(error)); });
      }
    });
    onCleanup(() => void cliChanged.then((stop) => stop()));
    const cliOpen = listen<{ workspace: string; folder: string; task: string; operation: string; by_agent?: boolean }>("cli-open-task", (e) => {
      void (async () => {
        if (e.payload.workspace !== workspaceActivo()) {
          // Un agente que abre una tarea de otro workspace no se lleva a la
          // persona del que está mirando: lo pidió ella para lo suyo.
          if (e.payload.by_agent) {
            await invoke("cli_task_opened", { operation: e.payload.operation, error: "workspace_not_shown" });
            return;
          }
          await invoke("set_active_workspace", { id: e.payload.workspace });
          await aplicar(await invoke<Startup>("list_workspaces"));
        }
        await abrirSesion(e.payload.folder, e.payload.task, e.payload.task, true);
        const opened = sessionId() === e.payload.task && project() === e.payload.folder;
        await invoke("cli_task_opened", { operation: e.payload.operation, error: opened ? null : "open_superseded" });
      })().catch((error) => {
        setError(prosaDe(error));
        void invoke("cli_task_opened", { operation: e.payload.operation, error: prosaDe(error) }).catch(() => {});
      });
    });
    onCleanup(() => void cliOpen.then((stop) => stop()));

    const sesionEv = listen<SessionEvent>("session", (e) => {
      const generation = workspaceContext.generation();
      const { session, project, workspace } = e.payload;
      if (!esDelWorkspaceAbierto(workspace)) return;
      // El historial primero, y para todos: una tarea que la otra ventana
      // acaba de crear no está en ningún hilo de esta. Releer solo la abierta
      // la dejaría invisible hasta cambiar de proyecto. Su carpeta basta: el
      // aviso la trae, y releerlas todas esperaba a la más lenta.
      void refreshSessionsOnEvent(carpetasDeTarea(session, project));
      reconcileSoon();
      // La otra instancia escribió esa tarea: su árbol también pudo moverse.
      // Mismo motivo que en el cierre de turno.
      avisarDeLosArboles(session);
      // Borrada desde el CLI con su vista de Typst abierta: su Tinymist no tiene ya árbol que servir.
      if (hayVistasDe(session))
        void leerTarea(project, session).catch(() => void apagarVistasDe(session));
      if (vivas().includes(session)) return;
      if (esDeLaAbierta(session)) {
        void leerTarea(project, session)
          .then((s) => loadResult(session, s, true, generation))
          .catch(() => {});
        return;
      }
      const pestana = pestanas.open().find((p) => p.id === session);
      if (pestana)
        void leerTarea(pestana.project, session)
          .then((s) => loadResult(session, s, true, generation))
          .catch(() => {});
    });
    onCleanup(() => void sesionEv.then((f) => f()));
    // Los eventos de otra máquina llegan por el relay, no por `service_poll`:
    // un hueco ahí se llevó sus `session` y el sondeo de esta ventana no lo ve.
    const trasHueco = () => releerTrasHueco();
    window.addEventListener("harness:service-gap", trasHueco);
    onCleanup(() => window.removeEventListener("harness:service-gap", trasHueco));
    serviceListenersReady = Promise.all([chat, question, usageEv, agentsEv, cuentaEv, cliChanged, cliOpen, sesionEv]);
  });

  const { alComando, ponerTerminal, porContestar, quitarDeLaCola, responderPermiso, setPorContestar, soltarTerminal } = createResyncCommands({ advanceTurn, cola, comandosDeLaCola, detenidos, engineCanDispatch, finishedTurns, lanzados, marcarViva, opcionesDeLaTarea, pendingStarts, retenidaPorElMotor, sessionId, setCarpetasDeTerminal, setPermissionError, setPermissions, setRespondiendoPermiso, setSettlingTurns, setTerminales, settleTurn, superficies, taskQueues, terminales, threads, workspaceActivo, get adoptarComando() { return adoptarComando; }, get contestarALaTerminal() { return contestarALaTerminal; }, get pendientesDe() { return pendientesDe; }, get reanudarCola() { return reanudarCola; }, get reponerGates() { return reponerGates; } });
  const { abrirConComando, adoptarComando, composerMachine, contestarALaTerminal, detener, ejecutarComando, enviarDeLaCola, mandarCola, mandarElegido, razonDeLaCola, teclearAlComando } = createShellCommand({ DEFAULT_PERMISSION_MODE_EVENT, agent, agents, busy, carpetasDeTerminal, claveAbierta, cola, comandosDeLaCola, composer, conversationScope, deLaTarea, draftBases, draftMachine, draftOptions, effort, enCache, engineCanDispatch, escritorio, espacioPara, esperando, grupos, hablandoCon, handoff, handoffAt, injecting, lanzados, machineOf, machines, marcarQuieta, marcarViva, model, modo, nacenConComando, pendingStarts, pestanas, ponerTerminal, project, projectCatalog, quitarDeLaCola, refreshFolder, refreshSessions, retenidaPorElMotor, retirarNaciendo, sesiones, sessionId, setArrancando, setHablandoCon, setInjecting, setPermissionError, setPorContestar, setSessionId, setTerminales, settleTurn, settlingTurns, soltarTerminal, stopping, taskQueues, terminales, threads, vivas, workspaceActivo, workspaceContext, get adoptarNacida() { return adoptarNacida; }, get configDeLaSesion() { return configDeLaSesion; }, get detenerYEnviar() { return detenerYEnviar; }, get enviar() { return enviar; }, get lifecycleRevision() { return lifecycleRevision; }, set lifecycleRevision(v) { lifecycleRevision = v; }, get olvidarPestana() { return olvidarPestana; }, get pintarNaciendo() { return pintarNaciendo; }, get reanudarCola() { return reanudarCola; } });

  const { abrirBorradorDeAgente, requestedProfile, setRequestedProfile, proyectosEnAjustes, cerrarAjustes, openAgentProfile, enLaMaquinaDelGrupo, nuevaSesion, irAlBlanco, closeActiveTab, cerrarPestana, cerrarPestanas, cierreSinGuardar, setCierreSinGuardar, } = createNewTask({ abrirProyecto: (id) => abrirProyecto(id), alta, arrancando, borrarProyecto: (id) => borrarProyecto(id), carpetaDelEscritorio, cerrarBorrador, cerrarPestanasYa, composer, drafts, enBorrador, hablandoCon, hablarConEncargado: (enProyecto, name) => hablarConEncargado(enProyecto, name), multipleSpaces, ocultarDelSelector, ocultosAqui, paneles, pedirElCampo, pestanaActiva, pestanas, project, proyectosDelRiel: () => proyectosDelRiel(), proyectoDeNuevaTarea, removeFromActiveSpace: (folder) => removeFromActiveSpace(folder), renombrarProyecto: (id, name) => renombrarProyecto(id, name), restoreDraftConfiguration: () => restoreDraftConfiguration(), setAnadiendoCarpeta, setAntesDelBorrador, setCuentasTocadas, setFolder, setHablandoCon, setMaterialPedido, setProject, setProyectoAbierto, setRunOn, setSessionId, setSettings, settings, soltarCola: () => soltarCola(), soltarHilo, tareasActivas, workspaceActivo, });

  const { elegirCarpetaDelWorkspace, releerProyectos, renombrarProyecto, abrirProyecto, adjuntarAlProyecto, quitarDelProyecto, carpetaEditable, borrarProyecto, elegirProyecto, soltarCola, abrirSesion, loadThread, loadWindowThreads, hablarConEncargado } = createContextSource({ abrirBorradorDeAgente, adjuntas, aplicar, cambiarEscritorio, cola, composer, deLaTarea, drafts, engineCanDispatch, escritorio, excludedSourceIds, filaDe, hilos, leerTarea, loadResult, nuevaSesion, open, paneles, pestanas, project, projectCatalog, proyectoAbierto, refreshFolder, refreshSessions, releerCola, reloadSpaces, sessionId, setError, setFolder, setHablandoCon, setMentionSources, setProject, setProjectReadError, setProyectoAbierto, setSessionId, setVentana, sourceIds, spaces, taskQueues, threads, workspaceActivo, workspaceContext, get restoreDraftConfiguration() { return restoreDraftConfiguration; }, get restoreSessionConfiguration() { return restoreSessionConfiguration; } });

  const { resolverCierre, setTraspasoPendiente, traspasoPendiente } = createDraftSend({ activarPestana, cerrarPestanasYa, cierreSinGuardar, claveAbierta, pestanas, sessionId, setCierreSinGuardar });

  function cerrarPestanasYa(ids: string[]) {
    const pedidas = new Set(ids);
    const cerradas = pestanas.open().filter((x) => pedidas.has(x.id));
    if (cerradas.length === 0) return;
    const activaAntes = pestanaActiva();
    const vecina = pestanas.closeMany(ids, { remember: true });
    // Closing a task also removes its documents, which can empty several panels.
    paneles.sync(pestanas.open().map((x) => x.id));
    // El borrador y el hilo son de la tarea: cerrar un archivo o un
    // artefacto suyo no los toca, la tarea sigue abierta detrás.
    for (const p of cerradas.filter(isTaskTab)) {
      drafts.drop(p.id);
      olvidarPestana(p.id);
      if (!vivas().includes(p.id)) soltarHilo(p.id);
    }
    // Se pregunta si el cierre se llevó lo que se estaba mirando, no si
    // el id cerrado era el activo: una tarea arrastra sus archivos, y
    // cerrándola con uno delante, comparar ids da «no era la activa» y
    // no carga nada —la tira marca la vecina y el chat sigue enseñando
    // la tarea recién cerrada.
    if (activaAntes === null) return;
    if (pestanas.open().some((x) => x.id === activaAntes)) return;
    if (vecina) void activarPestana(vecina);
    else {
      const owner = cerradas.find((p) => isContentTab(p) && p.session !== "" && !cerradas.some((x) => isTaskTab(x) && x.id === p.session));
      if (owner) void abrirSesion(owner.project, owner.session);
      else irAlBlanco(carpetaDelEscritorio(project()));
    }
  }

  /**
   * Lo último que se cerró a mano vuelve a la tira, salvo lo que ya no existe:
   * una tarea borrada mientras tanto no reaparece como pestaña rota.
   */
  function reabrirPestana() {
    const antes = new Set(pestanas.open().map((x) => x.id));
    const p = pestanas.reopen((x) => x.session === "" || filaDe(x.session) !== undefined);
    if (!p) return;
    // La tira que se pinta es la de la ventana: sin colocarlas, volverían al final.
    const tira = pestanas.open().map((x) => x.id);
    paneles.sync(tira);
    paneles.placeLikeStrip(tira.filter((id) => !antes.has(id)), tira);
    void activarPestana(p);
  }

  /**
   * Poner una pestaña delante, sea de lo que sea. Toda pestaña lleva su
   * tarea dentro: activar el archivo de otra tarea abre esa tarea detrás.
   * `abrirSesion` no relee nada cuando ya es la abierta: pasar de un
   * archivo a su conversación no cuesta un viaje al disco.
   */
  async function activarPestana(p: Tab) {
    // La ventana que la tiene pasa a mandar, y la enseña. Es lo que ata las
    // tres cosas que decide el mando —la caja, la columna derecha y dónde caen
    // las pestañas nuevas— a un solo gesto (`lib/panels.ts`).
    paneles.activate(p.id);
    setProyectoAbierto(null);
    // El navegador del «+» tampoco cuelga de ninguna tarea: detrás no se
    // abre nada.
    if (p.clase === "observabilidad" || p.clase === "pantalla" || (p.clase === "sitio" && p.navegador)) {
      pestanas.activate(p.id);
      return;
    }
    // Un archivo abierto antes de que la tarea existiera no cuelga de ninguna:
    // detrás queda la conversación en blanco de su proyecto, que es la que
    // decide de qué commit se lee.
    if (p.session === "") {
      if (project() !== p.project || sessionId() !== null) irAlBlanco(p.project);
      paneles.activate(p.id);
      pestanas.activate(p.id);
      return;
    }
    await abrirSesion(p.project, p.session, p.id);
  }

  /**
   * El atajo de teclado, sobre la tira de la ventana activa y no sobre la
   * tira entera: partida la pantalla, cada ventana lleva la suya y el número
   * cuenta lo que se ve (`lib/panels.ts`).
   */
  function irAPestanaDe(nav: NavegacionDePestanas) {
    const sitio = paneles.activeSite();
    const id = destinoDePestana(
      nav,
      paneles.tabsAt(sitio),
      paneles.activeTabAt(sitio),
    );
    const p = id ? pestanas.open().find((x) => x.id === id) : null;
    if (p) void activarPestana(p);
  }

  /**
   * Cambiar de ventana con el teclado, que es lo que el ratón hace pulsando
   * en ella. Con la ventana estrecha solo se pinta la activa, y esto es lo
   * único que llega a lo que hay en las demás.
   */
  function irAVentanaVecina(salto: 1 | -1) {
    const recorrido = panelReadingOrder(paneles.rowsPerColumn());
    if (recorrido.length < 2) return;
    const i = recorrido.findIndex((s) => sameSite(s, paneles.activeSite()));
    mandarVentana(recorrido[(i + salto + recorrido.length) % recorrido.length]);
  }

  function abrirObservabilidad() {
    setProyectoAbierto(null);
    pestanas.openObservability(t("observability.tab"));
  }

  /** La pantalla de una computadora, en una ventana al lado de la conversación. */
  function abrirPantalla(machine: string) {
    const id = screenTabId(machine);
    const nueva = !pestanas.open().some((p) => p.id === id);
    const conversacion = pestanas.active();
    // Sin batch la pantalla pasa un instante delante de la conversación: esta se
    // desmonta, vuelve al dividir y su barra de ubicación parpadea mientras relee.
    batch(() => {
      setProyectoAbierto(null);
      pestanas.openScreen(machine, t("screen.tab", { name: machineName(machine) }));
      paneles.sync(pestanas.open().map((x) => x.id));
      paneles.activate(id);
      if (nueva && !paneles.isSplit()) paneles.split(id);
      // La pantalla se mira al lado; el mando sigue en la conversación, que
      // sin él queda de solo lectura y sin caja de escritura.
      const suya = conversacion ? paneles.siteOf(conversacion) : null;
      const pantalla = paneles.siteOf(id);
      if (conversacion && suya && pantalla && !sameSite(suya, pantalla)) {
        pestanas.activate(conversacion);
        paneles.activate(conversacion);
      }
    });
  }

  /**
   * Pone una ventana al mando pulsando en cualquier sitio de ella, no
   * solo en una pestaña, y abre lo que tiene delante: columna derecha y
   * caja de escritura cuelgan de la sesión abierta, y enfocar sin abrir
   * dejaría el mando en una ventana y el contexto en otra.
   */
  function mandarVentana(sitio: SitioDePanel) {
    if (sameSite(sitio, paneles.activeSite())) return;
    paneles.focus(sitio);
    const id = paneles.activeTabAt(sitio);
    const p = id ? pestanas.open().find((x) => x.id === id) : null;
    if (p) void activarPestana(p);
  }

  // Separar conserva la vista y deja disponible su celda de origen.
  function partirLaActiva() {
    partirVentana(paneles.activeSite());
  }

  /**
   * Parte esa ventana, no la que esté al mando. Un botón en la fila de
   * título no pertenece a ninguna ventana —con la rejilla, no diría cuál
   * partir—; puesto en la tira de cada una, es de su ventana. El atajo de
   * teclado sigue partiendo la activa: ahí sí es la única respuesta.
   */
  function partirVentana(sitio: SitioDePanel) {
    const id = paneles.activeTabAt(sitio);
    if (!id) return;
    if (paneles.split(id)) pestanas.pin(id);
  }

  const puedeSepararseDe = (sitio: SitioDePanel) =>
    !paginaDeAgente() && paneles.activeTabAt(sitio) !== null && paneles.canSplit();

  /** Recoge la ventana activa en la de al lado. Es el atajo de deshacer. */
  function juntarLaActiva() {
    if (!paneles.join()) return;
    const id = paneles.activeTabAt(paneles.activeSite());
    const p = id ? pestanas.open().find((x) => x.id === id) : null;
    if (p) void activarPestana(p);
  }

  /**
   * Qué zona del cuerpo de una ventana hay bajo el cursor: sus cuatro bordes
   * parten hacia ahí y el medio mueve. Se mide contra el rectángulo real y no
   * contra un tamaño fijo: un panel repartido es más estrecho que su vecino.
   */
  function edgeZone(el: Element, x: number, y: number) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return "center" as const;
    const qx = (x - r.left) / r.width;
    const qy = (y - r.top) / r.height;
    const m = 0.25;
    if (qx > m && qx < 1 - m && qy > m && qy < 1 - m) return "center" as const;
    const sides: [PanelSide, number][] = [
      ["left", qx],
      ["right", 1 - qx],
      ["up", qy],
      ["down", 1 - qy],
    ];
    return sides.reduce((best, c) => (c[1] < best[1] ? c : best))[0];
  }

  /**
   * Qué ventana hay bajo el cursor, y en qué hueco de su tira o en qué zona de
   * su cuerpo. Se pregunta al documento y no a un `dragover` por elemento: el
   * gesto lo conduce `window`, y `elementFromPoint` hace que soltar valga tanto
   * sobre la tira como sobre el cuerpo del cuadrante.
   */
  function ventanaBajo(x: number, y: number) {
    const leer = (el: Element) => {
      const [col, fila] = (el.getAttribute("data-ventana") ?? "")
        .split(",")
        .map(Number);
      return Number.isFinite(col) && Number.isFinite(fila)
        ? { col, fila }
        : null;
    };
    const el = document.elementFromPoint(x, y);
    const tira = el?.closest?.("[data-tira]");
    if (tira) {
      const sitio = leer(tira);
      if (!sitio) return null;
      // Antes de qué pestaña cae, según de qué lado de ella esté el cursor.
      const tabs = [...tira.querySelectorAll("[data-pestana]")];
      let indice = tabs.length;
      for (let n = 0; n < tabs.length; n++) {
        const r = tabs[n].getBoundingClientRect();
        if (x < r.left + r.width / 2) {
          indice = n;
          break;
        }
      }
      return { sitio, indice };
    }
    const panel = el?.closest?.("[data-ventana]");
    if (!panel) return null;
    const sitio = leer(panel);
    return sitio ? { sitio, zone: edgeZone(panel, x, y) } : null;
  }

  let railDrag: { project: string; row: SessionRow } | null = null;
  const tabDrag = createPointerDrag({
    scope: () => `${workspaceActivo()}\u0000${escritorio()}`,
    canStart: id => pestanas.open().some(tab => tab.id === id) || (railDrag?.row.id === id && !!filaDe(id)),
    locate: point => {
      const panel = ventanaBajo(point.x, point.y);
      if (panel) return { ...panel, folder: undefined as string | undefined };
      const folder = railDrag && !railDrag.row.parent && !railDrag.row.chat_de_agente
        ? document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-destino]")?.dataset.destino
        : undefined;
      return folder !== undefined && folder !== railDrag?.project
        ? { sitio: paneles.activeSite(), indice: undefined, zone: undefined, folder }
        : null;
    },
    scroll(point) {
      const element = document.elementFromPoint(point.x, point.y)
        ?.closest("[data-tira]")?.querySelector<HTMLElement>("[data-tab-scroll]");
      if (element) return { element, axis: "x" };
      const rail = railDrag ? document.elementFromPoint(point.x, point.y)
        ?.closest<HTMLElement>("[data-arrastre-scroll]") : null;
      return rail ? { element: rail, axis: "y" } : null;
    },
    drop(id, destino) {
      if (destino.folder !== undefined && railDrag) {
        void moverSesion(railDrag.project, id, destino.folder);
        return;
      }
      if (railDrag && !pestanas.open().some(tab => tab.id === id)) {
        pestanas.ensure({ id, project: railDrag.project, titulo: railDrag.row.title });
        paneles.sync(pestanas.open().map(tab => tab.id));
      }
      if (destino.zone && destino.zone !== "center" && paneles.splitAt(id, destino.sitio, destino.zone)) {
        pestanas.pin(id);
        const p = pestanas.open().find(tab => tab.id === id);
        if (p) void activarPestana(p);
        return;
      }
      const from = paneles.siteOf(id);
      const index = destino.indice;
      const strip = paneles.tabsAt(destino.sitio).filter(pestanas.isPinned);
      const origin = strip.indexOf(id);
      const insertion = index !== undefined && sameSite(from, destino.sitio) && origin >= 0 && origin < index
        ? index - 1
        : index;
      soltarPestana(id, destino.sitio, insertion);
    },
  });
  const arrastrando = tabDrag.source;
  const cursor = tabDrag.cursor;
  const donde = () => {
    const destination = tabDrag.destination();
    return destination?.folder === undefined ? destination : null;
  };
  const arrastrarPestana = (id: string, event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    railDrag = null;
    tabDrag.start(id, event);
  };
  const arrastrarTarea = (project: string, row: SessionRow, event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    if (esProvisional(row.id) || (row.workspace && row.workspace !== workspaceActivo())) return;
    railDrag = { project, row };
    tabDrag.start(row.id, event);
  };

  /**
   * Cómo se llama una pestaña, para el fantasma del arrastre. La tira
   * compone el suyo con la carpeta cuando dos archivos se llaman igual;
   * aquí basta el nombre: solo hay que reconocer qué se está moviendo.
   */
  const tituloDePestana = (id: string) => {
    const p = pestanasEnPantalla().find((x) => x.id === id);
    if (!p) return railDrag?.row.id === id ? railDrag.row.title : "";
    if (isTaskTab(p)) return p.titulo;
    if (p.clase === "observabilidad" || p.clase === "pantalla") return p.titulo;
    if (p.clase === "sitio" && !p.url) return t("sites.new_tab");
    const r = p.clase === "archivo" ? p.ruta : p.clase === "artefacto" ? p.rel : p.url;
    return r.slice(r.lastIndexOf("/") + 1);
  };

  /** Dónde cae la marca dentro de la tira de `sitio`, o `null`. */
  const marcaDe = (sitio: SitioDePanel) => {
    const d = donde();
    return d && sameSite(d.sitio, sitio) ? (d.indice ?? null) : null;
  };

  /**
   * El lado por el que caería la pestaña arrastrada, o `null` si cae dentro o
   * sobre una tira. Solo hay lado si la rejilla lo admite: cuando no cabe, el
   * marco de siempre dice «entra aquí» y soltar mueve.
   */
  const dropSide = () => {
    const d = donde();
    const id = arrastrando();
    if (!d?.zone || d.zone === "center" || !id) return null;
    return paneles.canSplitAt(id, d.sitio, d.zone, railDrag?.row.id === id) ? d.zone : null;
  };

  /**
   * Suelta una pestaña arrastrada en una ventana y la pone delante.
   * Arrastrar no desmonta nada: los visores cuelgan del mismo padre y
   * solo cambia su celda (`features/shell/Panels.tsx`), lo que permite
   * arrastrar un archivo con cambios sin guardar.
   */
  function soltarPestana(id: string, a: SitioDePanel, indice?: number) {
    if (!paneles.groupAt(a)) return;
    pestanas.pin(id);
    const kept = paneles.tabsAt(a).filter((x) => x !== id && pestanas.isPinned(x));
    const before = indice === undefined ? undefined : kept[indice];
    const position = before === undefined ? undefined : paneles.tabsAt(a).filter((x) => x !== id).indexOf(before);
    paneles.move(id, a, position);
    const p = pestanas.open().find((x) => x.id === id);
    if (p) void activarPestana(p);
  }

  const { deleteTarget, setDeleteTarget, setDeletingEditors, editorDeletionLocked, deleteTask, deletedTaskMembers, dirtyTaskFiles, moverSesion, etaparSesion, fijarSesion, renombrarSesion, adjuntarFuente, quitarFuente, taskMaterialOptions, materialTarget, cambiarRama, abrirRuta, archivoMovido, archivoBorrado, reatarVistaPrevia, abrirEnlace, abrirNavegador, carpetasDelMas, abrirSitio, abrirPorRel, exportarChat, forkDesde, } = createSessionMutations({ abrirBorradorDeAgente, abrirSesion, activarPestana, activeSpace, arbolesDe, archivosDeTarea, capabilities, cerrarPestana, claveAbierta, contiene, contextConfirmed, deLaTarea, draftBases, draftOptions, drafts, esDeCodigo, filaDe, folder, irAlBlanco, machineName, machineOf, machines, get maquinaDeLaVentana() { return maquinaDeLaVentana; }, nuevaSesion, olvidarPestana: (session) => olvidarPestana(session), opcionesDeLaTarea, paneles, pestanas, project, projectCatalog, projectList, proyectoAbierto, readRevision, refreshSessions, senderTaskId, sesiones, sessionId, setError, setProject, setProyectoAbierto, setRetoques, setRunOn, setTaskSources, setTaskSourcesError, soltarHilo, sources, threads, ubicar, workspaceActivo, workspaceContext, });


  const botonDeNuevaPestana = () => (
    <NewTabButton
      projects={carpetasDelMas()}
      onNewTask={(id) => nuevaSesion(id)}
      onBrowser={() => abrirNavegador()}
    />
  );

  const { adoptarNacida, chooseEffort, configDeLaSesion, confirmarTraspaso, effortDelTurno, elegirModelo, elegirModo, pintarNaciendo, restoreDraftConfiguration, restoreSessionConfiguration, saveDraftConfiguration, situacionDeTraspaso } = createHandover({ agent, avisar, borrador, busy, claveAbierta, composer, deLaTarea, draftMachine, drafts, esChatDeAgente, filaDe, machines, model, modo, notifyProfiles, opcionesDeLaTarea, paneles, permissions, pestanas, project, reatarVistaPrevia, responderPermiso, sessionId, setDraftBases, setError, setNaciendo, setTraspasoPendiente, threads, traspasoPendiente, traspasos, vivas, workspaceActivo, get mudarPestana() { return mudarPestana; }, get olvidarPestana() { return olvidarPestana; } });
  let gateSeq = 0;

  const { enviar, pendientesDe } = createSend({ adoptarNacida, advanceTurn, agents, apagadas, attachmentsFor, catalogos, claveAbierta, conversationScope, deLaTarea, draftBases, draftOptions, drafts, espacioPara, excludedSourceIds, filaDe, finishedTurns, firmas, grupos, hablandoCon, handoff, leerTarea, loadResult, machineWaits, machines, marcarQuieta, marcarViva, modelosEnVivo, opcionesDeLaTarea, pendingStarts, pestanas, pintarNaciendo, project, reconcileActiveTurns, refetchMachines, refreshSessions, retirarNaciendo, sessionId, setArrancando, setError, setHablandoCon, setSessionId, settleTurn, sourceIds, taskQueues, taskSources, threads, traspasos, workspaceActivo, workspaceContext, get carryModule() { return carryModule; }, get lifecycleRevision() { return lifecycleRevision; }, set lifecycleRevision(v) { lifecycleRevision = v; }, get olvidarPestana() { return olvidarPestana; } });

  const { abrirLlevarCarpeta, abrirTraer, cancelarPregunta, carryModule, despuesDeTraer, esRemota, hojaDeLlevar, mandar, maquinaDeLaVentana, permissionReads, reponerGates, responder, setHojaDeLlevar, traer } = createSendGates({ importCarry, abrirConComando, agent, archivos, attachmentsFor, borrador, busy, claveAbierta, cola, configDeLaSesion, deLaTarea, drafts, effortDelTurno, ejecutarComando, engineCanDispatch, enviar, escritorio, filaDe, input, leerTarea, machineName, machines, model, modo, msgs, nuevaSesion, opcionesDeLaTarea, pendientesDe, preguntarAlMargen, project, projectList, queueBusy, runOn, sessionId, setArchivos, setAviso, setError, setInput, setPermissions, setRunOn, sideCommand, soltarPreguntas, threads, vivas, workspaceActivo, workspaceContext, get encolar() { return encolar; }, get encolarYSoltar() { return encolarYSoltar; }, get gateSeq() { return gateSeq; }, set gateSeq(v) { gateSeq = v; } });

  const { detenerYEnviar, editarEncolado, encolar, encolarYSoltar, mandarAhora, mandarTexto, quitarEncolado, reanudarCola, reintentar } = createSendNow({ agent, attachmentsFor, cola, conversationScope, deLaTarea, drafts, effortDelTurno, enFondo, engineCanDispatch, enviar, escritorio, filaDe, handoff, handoffAt, hilos, injecting, mandar, model, modo, msgs, project, queueBusy, resumeQueue, sessionId, setDesdeDeTurno, setError, setInjecting, setSinSteer, sinSteer, taskQueues, threads, workspaceActivo });

  const { SelectorDeProyecto, botonDeArchivos, botonDelArbol, consumo, delegatedPanels, guardarLectura, lecturas, montadas, mudarPestana, muestra, nombreDeSeparar, olvidarPestana, proyectoDeLaVista, searchSurfaces, setDelegatedPanels, setSearchSurfaces, setThreadSearchTargets, threadSearchTargets, tiraDeLaVentana, vistaDe } = createPanelDeChat({ createUsage, EmptyContext, MachinePicker, ProjectPicker, TabStrip, activarPestana, actividadDeProyectos, agent, agents, archivosDeTarea, arrastrarPestana, botonDeNuevaPestana, busy, cargandoHilo, carpetaDelProyecto, celdaDe, cerrarBorrador, cerrarPestana, cerrarPestanas, composerProjects, contextConfirmed, contextRoot, cuentasTocadas, elegidosAqui, elegirCarpetaDelWorkspace, elegirProyecto, enBorrador, filaDe, hilos, llaveDeBorrador, mandarVentana, marcaDe, materialError, ocultarDelSelector, ocultosAqui, paginaDeAgente, paneles, permissions, pestanaDelanteEn, pestanas, pestanasDe, preguntadas, project, projectList, proyectoAbierto, reabrirPestana, recargarMaterial, recordarEleccion, setAnadiendoCarpeta, setDraftBases, setPreguntasAMedias, setReadRevision, setSettings, soltarPreguntas, sources, tapadoPorElProyecto, tareasActivas, tareasEnVentanas, taskSourcesError, vivas, vueltaDelBorrador, workspaceActivo });
  const PanelDeChat = (pp: {
    sesion: string | null;
    /** El proyecto de esa tarea. `null` en la ventana en blanco, que no tiene. */
    proyecto?: string | null;
    soloLectura?: boolean;
  }) => {
    const visualWorkspace = workspaceActivo() ?? "";
    // La pestaña de una tarea que nace no tiene hilo hasta `adoptarNacida`: su primer
    // globo está en el de la ventana sin id, y con la máquina encendiéndose quedaba en blanco.
    const claveDelHilo = () => (esProvisional(pp.sesion) ? "" : pp.sesion ?? "");
    /**
     * Mensajes de ESTA ventana, memoizados en dos pasos: leer `hilos()`
     * directo baja al fondo TODAS las ventanas al moverse una. El
     * primer memo aísla la entrada de esta por `===`; no usa `msgs()`
     * aunque sea la abierta, que cambiaría de identidad al mudar.
     */
    const suyo = createMemo(() => hilos()[claveDelHilo()]);
    // Un ternario en la prop crea un memo en cada lectura, y la que llega fuera de un dueño no se suelta nunca.
    const esperandoAqui = () => !pp.soloLectura && esperando();
    const proyectoDeLaCelda = () =>
      (pp.sesion ? projectList() : composerProjects()).find((p) => p.id === (pp.proyecto ?? project()));
    // El panel de archivos de esta celda: el de su tarea, o el de la carpeta mientras no hay tarea.
    // Sin tarea, la misma llave que el botón y la tarjeta de borrador: la lista del
    // composer de una máquina remota llega sin carpeta, y con otra llave la fila no
    // reservaría el hueco de la tarjeta y la caja quedaría encima de ella.
    const clavePanel = () => pp.sesion
      ?? (carpetaDelProyecto() ? llaveDeBorrador(project()) : "");
    const [estadoDelTrabajo, { refetch: refreshWork }] = createTaskWork(() => pp.sesion
      ? { project: proyectoDeLaCelda()?.id ?? "", id: pp.sesion }
      : undefined);
    const hasDelegation = createMemo(() => !!pp.sesion && (
      filaDe(pp.sesion)?.has_delegates
      || Object.values(sesiones()).flat().some(row => launcherOf(row) === pp.sesion)
      || [...(suyo()?.base ?? []), ...(suyo()?.vivo ?? [])].some(message => message.meta === "task_launched")
    ));
    const delegationScope = createMemo(() => pp.sesion && hasDelegation()
      ? JSON.stringify([workspaceActivo(), proyectoDeLaCelda()?.id ?? "", pp.sesion,
        Object.entries(sesiones()).map(([folder, rows]) => [folder, rows.map(row => [row.id, row.updated_at, row.archived, row.pinned, row.title])])])
      : undefined);
    const [delegation, { refetch: refreshDelegation }] = createResource(delegationScope, async key => {
      const [workspace, folder, id] = JSON.parse(key) as [string, string, string];
      try {
        const rows = await invoke<SessionRow[]>("list_delegated_sessions", { project: folder, id }, deLaTarea(id));
        return { workspace, id, rows, error: undefined as unknown };
      } catch (error) {
        return { workspace, id, rows: [] as SessionRow[], error };
      }
    });
    const delegationData = () => {
      const value = delegation();
      return value?.workspace === workspaceActivo() && value?.id === pp.sesion ? value : undefined;
    };
    const delegatedRows = createMemo<SessionRow[]>((previous) => {
      const all = Object.entries(sesionesConEstado()).flatMap(([folder, rows]) => rows.map(row => ({ ...row, folder })));
      const known = new Map(all.map(row => [row.id, row]));
      const rows = new Map((delegationData()?.rows ?? []).map(row => [row.id, row]));
      for (const row of delegatedDescendants(all, filaDe(pp.sesion ?? "") ?? { id: pp.sesion ?? "" })) rows.set(row.id, row);
      const unseen = attention.unseen(workspaceActivo());
      const waiting = new Set(preguntadas());
      return conservar(previous ?? [], [...rows.values()].map(row => ({
        ...row, ...known.get(row.id), esperando: known.get(row.id)?.esperando ?? (waiting.has(row.id) || row.esperando),
        sin_ver: unseen.has(row.id),
      })), row => row.id);
    }, []);
    const delegatedList = (folder: string): DelegatedListProps => ({
      relatedSessions: [...Object.entries(sesionesConEstado()).flatMap(([folder, rows]) => rows.map(row => ({ ...row, folder }))), ...delegatedRows()],
      de: folder, current: pp.sesion ?? null, vivas: vivas(), aprobando: permissions().map(item => item.session),
      carpetaDe: () => projectList().find(item => item.id === folder)?.name,
      destinos: projectList().filter(item => item.id !== folder).map(item => ({ id: item.id, name: item.name })),
      onPick: id => { void abrirSesion(folder, id); },
      onDelete: (id, members) => void deleteTask(folder, id, members),
      onMove: (id, destination) => void moverSesion(folder, id, destination),
      onEtapa: (id, stage) => void etaparSesion(folder, id, stage),
      onRenombrar: (id, title) => void renombrarSesion(folder, id, title),
      onPin: (id, pinned) => fijarSesion(folder, id, pinned),
    });
    const delegatedPanelRows = createMemo(() => {
      const rows = delegatedRows();
      const peers = rows.filter(row => row.root_peer);
      if (!peers.length) return rows;
      const outside = new Set([...peers, ...taskDescendants(rows, peers)].map(row => row.id));
      return rows.filter(row => !outside.has(row.id));
    });
    const delegatedModel = (): DelegatedPanelModel => ({
      context: `${workspaceActivo()}/${pp.sesion}`,
      rows: delegatedPanelRows(),
      list: delegatedList,
      live: vivas(),
      approvals: permissions().map(item => item.session),
      loading: delegation.loading,
      error: delegationData()?.error,
      onRetry: () => void refreshDelegation(),
      onDismiss: () => { if (pp.sesion) archivosDeTarea.setOpen(pp.sesion, false); },
    });
    createEffect(() => {
      if (!pp.sesion || !hasDelegation()) return;
      const key = `${workspaceActivo()}/${pp.sesion}`;
      setDelegatedPanels(previous => new Map(previous).set(key, delegatedModel));
      onCleanup(() => setDelegatedPanels(previous => {
        if (previous.get(key) !== delegatedModel) return previous;
        const next = new Map(previous);
        next.delete(key);
        return next;
      }));
    });
    const coordinatorScope = createMemo(() => {
      const row = filaDe(pp.sesion ?? "");
      return pp.sesion && (row?.parent || row?.launched_by)
        ? JSON.stringify([workspaceActivo(), proyectoDeLaCelda()?.id ?? "", pp.sesion, row.updated_at, row.launcher_available, tareaDelRiel(row.parent ?? row.launched_by ?? "")])
        : undefined;
    });
    const [coordinator] = createResource(coordinatorScope, async key => {
      const [workspace, folder, id] = JSON.parse(key) as [string, string, string];
      try {
        const reference = await invoke<SenderTask | null>("task_coordinator", { project: folder, id }, deLaTarea(id));
        return { workspace, id, reference };
      } catch { return { workspace, id, reference: null }; }
    });
    const coordinatingTask = () => {
      const value = coordinator();
      if (value?.workspace !== workspaceActivo() || value.id !== pp.sesion) return null;
      const reference = value.reference;
      return reference?.machine ? { ...reference, task: senderTaskId(reference.machine, reference.task) } : reference;
    };
    const recuperable = () => !pp.soloLectura && !!estadoDelTrabajo()?.recreatable;
    const origenArchivada = () => (estadoDelTrabajo()?.history.archived ? origenes()[pp.sesion ?? ""] : undefined);
    /**
     * Qué cuenta como resultado de un turno lo decide la carpeta, y cada una
     * tiene una sola forma de decirlo: con git, el diff del turno; sin git, los
     * artefactos. Los dos bloques miden lo mismo con criterios que no coinciden
     * —el rango de `development::rangos` frente al tamaño y la fecha de
     * `workspace/artifacts.rs`—, así que juntos no suman, se contradicen.
     */
    const esRepositorio = () => proyectoDeLaCelda()?.kind === "git";
    /** Con quién se habla en esta celda, si lo que hay abierto es su chat. */
    const encargadoDeLaCelda = createMemo(() => {
      if (!pp.sesion) {
        const conversacion = hablandoCon();
        if (!conversacion || conversacion.project !== (proyectoDeLaCelda()?.id ?? "")) return null;
        return conversacion.name;
      }
      const fila = filaDe(pp.sesion ?? "");
      return fila && esChatDeAgente(fila) ? (fila.agent ?? null) : null;
    });
    /**
     * Por qué esta celda no ofrece cambiar de CLI; `null` si lo ofrece. El
     * candado del selector lo dice con la frase del motor, no escondiendo los
     * otros agentes.
     */
    const bloqueoDeTraspaso = createMemo(() => {
      const fila = pp.sesion ? filaDe(pp.sesion) : undefined;
      return agentSwitchBlocked({
        ...situacionDeTraspaso(pp.sesion ?? ""),
        agentChat: !!fila && esChatDeAgente(fila),
      });
    });
    /** La rama literal existe para locales.mjs, que solo cuenta usos literales y la clave no es del motor; con t(clave) queda huérfana. */
    const motivoDeTraspaso = () => {
      const clave = bloqueoDeTraspaso();
      if (!clave) return null;
      return clave === MACHINE_UNANNOUNCED ? t("chat.handover.machine_unannounced") : t(clave);
    };
    // Memo: releer la fila tras una aprobación no es cambiar de agente ni cierra su perfil.
    const identidadVisualDeLaCelda = createMemo(() => pp.sesion
      ? (filaDe(pp.sesion)?.agent ?? null)
      : encargadoDeLaCelda());
    /**
     * El estado que enseña la cabecera es el MISMO que pinta su fila del riel.
     * Derivarlo de «esta conversación tiene turno vivo» decía «Despierto» de
     * un agente que el riel daba por dormido, y nunca decía «Trabajando»
     * cuando lo que corría era una tarea que él lanzó.
     */
    const estadoDelEncargado = watchHandlerStatus(() => {
      const name = identidadVisualDeLaCelda();
      const proyecto = proyectoDeLaCelda()?.id;
      return name ? { project: proyecto ?? "", name } : null;
    });
    /* Dentro de un memo: la celda del panel principal sigue al proyecto
       abierto, y mirarlo una sola vez al montar dejaba los perfiles del
       proyecto de antes — la cabecera caía al nombre crudo y a la cara del
       hash mientras el riel pintaba la elegida. Al cambiar de proyecto, el
       `onCleanup` de `watchProfiles` suelta la lectura anterior. */
    const perfilesDelProyecto = createMemo(() => watchProfiles(pp.proyecto ?? project()));
    const profiles = () => perfilesDelProyecto()();
    const cellProfile = () => {
      const name = identidadVisualDeLaCelda();
      return (name ? profiles()[name] : undefined) ?? DEFAULT_PROFILE;
    };
    /* El fondo viaja como `data:` URI: la política de la ventana no deja
       pintar un `file://` (`AGENTS.md` § el guarda `csp`). */
    const [chatBackground] = createResource(
      () => cellProfile().background ?? undefined,
      async (ruta) => {
        try {
          return (await invoke<Preview>("preview_file", { path: ruta, rel: ruta }, machineOf(ruta))).data_url;
        } catch {
          return null;
        }
      },
    );
    /* Solo la celda con el mando lleva su fondo a toda la ventana; las demás
       celdas de una división lo siguen pintando dentro de su chat. */
    const celdaActiva = () => (pp.sesion ?? null) === (sessionId() ?? null);
    createEffect(() => {
      if (!celdaActiva()) return;
      const url = chatBackground();
      const propio = url ? { url, veil: cellProfile().veil } : null;
      setFondoDelAgente(propio);
      // Solo borra el suyo: al pasar el mando, la otra celda puede publicar antes.
      onCleanup(() => { if (fondoDelAgente() === propio) setFondoDelAgente(null); });
    });
    const [declared] = createResource(
      () => {
        const name = identidadVisualDeLaCelda();
        const id = proyectoDeLaCelda()?.id ?? "";
        return name ? `${id}\u0000${name}` : undefined;
      },
      async (clave) => {
        const [id, name] = clave.split("\u0000");
        try {
          const listado = await invoke<HandlerList>("list_agents", { project: id });
          return listado.agents.find((e) => e.name === name) ?? null;
        } catch {
          return null;
        }
      },
    );
    const [viewingProfile, setViewingProfile] = createSignal(false);
    createEffect(() => {
      // Cambiar de conversación cierra el perfil: seguiría abierto sobre un
      // chat que ya es de otro agente.
      identidadVisualDeLaCelda();
      setViewingProfile(false);
    });
    createEffect(() => {
      const pedido = requestedProfile();
      if (!pedido) return;
      if (pedido.name !== identidadVisualDeLaCelda()) return;
      if (pedido.project !== (proyectoDeLaCelda()?.id ?? "")) return;
      setRequestedProfile(null);
      setViewingProfile(true);
    });
    // Una cadena y no un objeto: releer la lista de proyectos no reinicia el panel ni borra su resultado.
    const handlerPolicy = createMemo<HandlerTarget | undefined>(() => {
      const workspace = workspaceActivo();
      const project = proyectoDeLaCelda()?.id ?? "";
      const name = identidadVisualDeLaCelda();
      return workspace && name
        ? JSON.stringify([workspace, project, name, opcionesDeLaTarea(project, workspace).headers])
        : undefined;
    });
    const lecturaDeLaCelda = () => lecturas.get(pp.sesion ?? "") ?? null;
    const preguntasDeLaCelda = almacenDePreguntas(() => pp.sesion);
    const vistaDeLaCelda = vistaDe(pp.sesion ?? "");
    const mensajes = createMemo<Msg[]>(() => {
      const h = suyo();
      const todos = h ? mensajesDelHilo(h) : [];
      return esRepositorio()
        ? todos.filter((m) => !m.artefactos?.length)
        : todos;
    });
    const historialAnteriorEnReposo = () => {
      const id = pp.sesion;
      return !!id && !!filaDe(id)?.chat_de_agente && !vivas().includes(id)
        && !permissions().some(item => item.session === id)
        && !(colaDe() === id && cola().length > 0);
    };
    const soloPorSerAnterior = () => historialAnteriorEnReposo() && !pp.soloLectura
      && !estadoDelTrabajo()?.history.archived && estadoDelTrabajo()?.available !== false;
    const seguirConElAgente = () => {
      const name = encargadoDeLaCelda();
      const proyecto = proyectoDeLaCelda()?.id;
      if (name) hablarConEncargado(proyecto ?? "", name);
    };
    // Máquina, carpeta y rama de la tarea. Una función y no un elemento: el chat la pinta
    // y, cuando los archivos lo tapan, la fila de la tarea pinta la suya.
    // Es una sola barra con las herramientas de la ventana (que flotan a su derecha):
    // la caja guarda su altura aunque `TaskLocation` aún no cargue, para que el chat
    // empiece siempre debajo y el primer mensaje no quede bajo esas herramientas.
    const barraDeLaTarea = (contenido: JSX.Element) =>
      <div data-task-bar="" class={cn("flex min-w-0 shrink-0 flex-col overflow-hidden", LOCATION_BAR)}>{contenido}</div>;
    const ubicacion = () => <Show when={pp.sesion} fallback={<Show when={!paginaDeAgente()}>{barraDeLaTarea(<Suspense fallback={null}><TaskLocation
      /* La tarea nueva: la máquina y la carpeta donde va a correr. La rama sale al empezarla. */
      machine={(draftMachine() ?? (capabilities().nativeWindow ? null : rememberedRunOn(workspaceActivo()))) ?? undefined} machineName={machineName} machineWakes={machineWakes} folderIcon={folderIcon}
      on={((m) => m?.on !== false && (capabilities().nativeWindow || (!!m && m.hosts !== false)))(machines().find(m => m.id === (draftMachine() ?? rememberedRunOn(workspaceActivo()))))}
      onScreen={abrirPantalla}
      project={proyectoDeLaCelda()}
      path={carpetaDeTrabajo(proyectoDeLaCelda() ?? {}) || undefined} /></Suspense>)}</Show>}>{(id) => {
      return barraDeLaTarea(<Suspense fallback={null}><TaskLocation
        machine={filaDe(id())?.machine} machineName={machineName} machineWakes={machineWakes} folderIcon={folderIcon}
        on={!apagadas()[id()] && filaDe(id())?.machine_on !== false && (capabilities().nativeWindow || machines().find(m => m.id === filaDe(id())?.machine)?.hosts !== false)}
        onScreen={abrirPantalla}
        onFiles={() => {
          const folder = proyectoDeLaCelda()?.id;
          if (folder) void abrirSesion(folder, id()).then(() => archivosDeTarea.setOpen(id(), true));
        }}
        project={proyectoDeLaCelda()}
        path={estadoDelTrabajo()?.path || undefined}
        branch={workLabel(estadoDelTrabajo()?.branch, estadoDelTrabajo()?.alias) || undefined} /></Suspense>);
    }}</Show>;
    return (
    <Show
      when={viewingProfile() && declared()}
      fallback={
    <TaskFilesRow
      open={!!clavePanel() && archivosDeTarea.panel(clavePanel()).open}
      covers={!!clavePanel() && (archivosDeTarea.panel(clavePanel()).expanded || paneles.isSplit() || compacta())}
      hasTabs={!!clavePanel() && archivosDeTarea.panel(clavePanel()).tabs.length > 0}
      width={anchoDeArchivos()}
      treeWidth={anchoDelArbol()}
      onWidth={setAnchoDeArchivos}
      onTreeWidth={setAnchoDelArbol}
      location={ubicacion}
      chat={
    <Chat
        besideFiles={!!clavePanel() && archivosDeTarea.panel(clavePanel()).open}
        onSearchReady={target => {
          if (!pp.sesion) return;
          setThreadSearchTargets(previous => {
            const next = new Map(previous);
            if (target) next.set(pp.sesion!, target);
            else next.delete(pp.sesion!);
            return next;
          });
        }}
        soloLectura={pp.soloLectura || (!!pp.sesion && !esProvisional(pp.sesion) && capabilities().taskWritable?.(pp.sesion) === false) || !!estadoDelTrabajo()?.history.archived || estadoDelTrabajo()?.available === false || historialAnteriorEnReposo()}
        recovery={pp.sesion && (recuperable() || origenArchivada() !== undefined || soloPorSerAnterior()) ? <>
          <Show when={recuperable()}>
            <ResumeTask project={proyectoDeLaCelda()?.id ?? ""} id={pp.sesion ?? ""} onChanged={() => {
              void refreshWork();
              if (pp.sesion) {
                avisarDeLosArboles(pp.sesion);
                void refreshFolder(proyectoDeLaCelda()?.id ?? "", pp.sesion);
              }
            }} />
          </Show>
          <Show when={origenArchivada() !== undefined}>
            <TranscriptSource origin={origenArchivada() ?? null} agents={agents()} />
          </Show>
          <Show when={soloPorSerAnterior()}>
            <PreviousAgentChat name={encargadoDeLaCelda() ? displayName(encargadoDeLaCelda() ?? "", cellProfile()) : null}
              onContinue={seguirConElAgente} />
          </Show>
        </> : undefined}
        delegatedTask={reference => <DelegatedLaunch reference={reference.machine
          ? { ...reference, task: senderTaskId(reference.machine, reference.task) } : reference} rows={delegatedRows()}
          list={delegatedList} loading={delegation.loading} error={delegationData()?.error} />}
        coordinator={<>
          <Show when={coordinatingTask()}>
            <div class="shrink-0 px-4 py-1">
              <Button variant="ghost" size="sm" class="max-w-full min-w-0 shrink text-xs" data-task-coordinator
                onClick={() => void abrirSesion(coordinatingTask()!.folder, coordinatingTask()!.task)}>
                <ArrowLeft size={14} class="shrink-0" aria-hidden="true" />
                <span class="truncate">{t("chat.delegation.back", { title: coordinatingTask()!.title })}</span>
              </Button>
            </div>
          </Show>
          <Show when={!pp.sesion && carryModule()?.carries()[claveAbierta()]}>
            <Suspense fallback={null}>
              <CarryProgress draft={claveAbierta()} onRetry={() => void mandar(archivos())} onOpenSettings={(panel) => setSettings(panel)} />
            </Suspense>
          </Show>
          <Show when={pp.sesion && carryOrigin(pp.sesion)}>
            <Suspense fallback={null}><CarryOriginLabel session={pp.sesion ?? ""} onOpen={(p, id) => void abrirSesion(p, id)} /></Suspense>
          </Show>
          <Show when={pp.sesion && carryModule()?.carries()[`bring:${pp.sesion}`]}>
            <Suspense fallback={null}>
              <CarryProgress draft={`bring:${pp.sesion}`} onRetry={() => void traer(`bring:${pp.sesion}`)} onOpenSettings={(panel) => setSettings(panel)} />
            </Suspense>
          </Show>
          <Show when={pp.sesion && canBringHere() && esRemota(pp.sesion) && !carryModule()?.carries()[`bring:${pp.sesion}`]}>
            <div class="shrink-0 px-4 py-1">
              <Button variant="outline" size="compact" data-bring-here onClick={() => void abrirTraer(proyectoDeLaCelda()?.id, pp.sesion ?? "")}>
                {bringHereLabel()}
              </Button>
            </div>
          </Show>
        </>}
        machine={pp.sesion ? filaDe(pp.sesion)?.machine : undefined}
        activities={threads.activities(pp.sesion ?? "", mensajes())}
        msgs={mensajes()}
        /* Identidad de lo que tiene delante, no ids de proyecto/tarea: es lo
           único con lo que distingue «entró un mensaje» de «otra
           conversación». La caja es la misma instancia al cambiar de tarea:
           sin esto el fondo del hilo anterior quedaría puesto. */
        conversacion={pp.sesion ?? ""}
        /* Sin fila todavía es la que acaba de nacer vacía (`crearEnTareaVacia`). */
        sinEmpezar={!!pp.sesion && (filaDe(pp.sesion)?.turns ?? 0) === 0 && !filaDe(pp.sesion)?.chat_de_agente
          && !vivas().includes(pp.sesion) && cargandoHilo() !== pp.sesion}
        lectura={lecturaDeLaCelda()}
        onLectura={(lectura) => guardarLectura(pp.sesion, lectura)}
        chatEncargado={identidadVisualDeLaCelda()}
        agentDraft={!pp.sesion && !!encargadoDeLaCelda()}
        recentTasks={<Show when={!pp.sesion && encargadoDeLaCelda()}>{agent =>
          <RecentAgentChats project={proyectoDeLaCelda()?.id ?? ""} agent={agent()}
            sessions={sesionesConEstado()[proyectoDeLaCelda()?.id ?? ""] ?? []}
            onPick={id => { setHablandoCon(null); void abrirSesion(proyectoDeLaCelda()?.id ?? "", id); }} />
        }</Show>}
        agentTasks={<Show when={!pp.sesion && encargadoDeLaCelda()}>{agent => {
          const de = () => proyectoDeLaCelda()?.id ?? "";
          const folderOf = (id: string) => Object.entries(sesionesConEstado()).find(([, rows]) => rows.some(row => row.id === id))?.[0] ?? de();
          return <AgentPageTasks
            context={`${de()}/${agent()}`}
            tasks={createdTasks(Object.entries(sesionesConEstado()).flatMap(([folder, rows]) => rows.map(row => ({ ...row, folder }))), agent(), null, de())}
            list={{
              carpetaDe: row => projectList().find(item => item.id === folderOf(row.id))?.name,
              projectOf: row => folderOf(row.id), destinosDe: row => projectList().filter(item => item.id !== folderOf(row.id)).map(item => ({ id: item.id, name: item.name })),
              de: de(), current: null, vivas: vivas(), aprobando: permissions().map(item => item.session),
              destinos: projectList().filter(item => item.id !== de()).map(item => ({ id: item.id, name: item.name })),
              onDelete: (id, members) => void deleteTask(folderOf(id), id, members),
              onMove: (id, destination) => void moverSesion(folderOf(id), id, destination),
              onEtapa: (id, stage) => void etaparSesion(folderOf(id), id, stage),
              onRenombrar: (id, title) => void renombrarSesion(folderOf(id), id, title),
            }}
            onPick={id => { setHablandoCon(null); void abrirSesion(folderOf(id), id); }} />;
        }}</Show>}
        chatEstado={!pp.sesion && encargadoDeLaCelda() ? "awake" : estadoDelEncargado()}
        chatName={filaDe(pp.sesion ?? "")?.agent_thread
          ? t("projects.threads.heading", { name: displayName(identidadVisualDeLaCelda() ?? "", cellProfile()), title: threadTitle(filaDe(pp.sesion ?? "")) })
          : displayName(identidadVisualDeLaCelda() ?? "", cellProfile())}
        chatBody={cellProfile().body}
        workAgent={identidadVisualDeLaCelda()}
        chatDescription={declared()?.description}
        chatAvatar={cellProfile().avatar}
        bodyOf={(name) => profiles()[name]?.body ?? null}
        avatarOf={(name) => profiles()[name]?.avatar ?? null}
        onOpenProfile={() => setViewingProfile(true)}
        /* Que el hilo viene, no que no hay: sin esto el chat lee el vacío en
           vuelo como conversación nueva y salta al fondo (#315). Va por
           sesión y no por `hiloEnVuelo()` —global, solo pregunta por la
           abierta—: una celda separada tiene su propia lectura en vuelo. Es
           opcional: `tsc` no avisa si se pierde. */
        cargando={cargandoHilo() !== null && cargandoHilo() === pp.sesion}
        masRecientes={!!conRecientes()[pp.sesion ?? ""]}
        onRecientes={async () => {
          if (!pp.sesion) return;
          try { await threads.latest(pp.sesion); }
          catch (e) { setError(prosaDe(e)); }
        }}
        estadoAntiguos={estadoAntiguos()[pp.sesion ?? ""] ?? "idle"}
        onLeyendo={(leyendo) => {
          if (!pp.sesion) return;
          threads.reading(pp.sesion, leyendo);
        }}
        masAntiguos={!!conAntiguos()[pp.sesion ?? ""]}
        onAntiguos={() => cargarAntiguos(proyectoDeLaCelda()?.id ?? "", pp.sesion ?? "")}
        /* El medidor de memoria es de la sesión abierta —`ventana` se
           recalcula al abrir otra—: una celda separada no tiene el suyo. Va
           `null`, que el contrato lee como «todavía no hay ninguno». Pasarle
           `ventana()` enseñaría el de OTRA conversación, con un número
           creíble y equivocado. */
        ventana={pp.sesion === sessionId() ? ventana() : null}
        busy={pp.sesion === sessionId() ? busy() : esProvisional(pp.sesion) ? arrancando() : vivas().includes(pp.sesion ?? "")}
        stopping={handoffAt(pp.sesion, proyectoDeLaCelda()?.id)?.stopping ?? false}
        handoff={pp.sesion ? handoff.presentation(conversationScope(pp.sesion, proyectoDeLaCelda()?.id)) : null}
        agents={agents()}
        proyecto={
          <SelectorDeProyecto nueva={!pp.sesion} locked={!!encargadoDeLaCelda()} branch={
            /* Apagada no contesta sus ramas: la tarea sale de la rama por defecto. */
            <Show when={!pp.sesion && esRepositorio() && draftMachineOn() !== false}>
              <BaseBranchPicker
                project={project()}
                machine={draftMachine()}
                directory={carpetaDeTrabajo(proyectoDeLaCelda() ?? {})}
                value={draftBases()[claveAbierta()]}
                disabled={busy()}
                onChange={(reference) => {
                  setDraftBases((bases) => ({ ...bases, [claveAbierta()]: reference }));
                  saveDraftConfiguration();
                }}
              />
            </Show>
          } />
        }
        /* Tarea de ESTA ventana (`pp.sesion`), no la que tenga el mando: el
           botón vive dentro del hilo de cada panel. Sin git no se ofrece: la
           foto del turno incluye todo lo que se movió en la carpeta. */
        onVerCambios={esRepositorio() && pp.sesion ? () => {
          archivosDeTarea.setSide(pp.sesion!, "changes");
          archivosDeTarea.setOpen(pp.sesion!, true);
        } : undefined}
        material={materialPendiente()}
        materialTarget={materialTarget()}
        materialAvailable={taskSources() !== null && (!pp.sesion || !!taskMaterialOptions())}
        materialOptions={pp.sesion && filaDe(pp.sesion)?.machine
          ? { headers: { "x-terminus-machine": filaDe(pp.sesion)!.machine! } }
          : taskMaterialOptions()}
        contexto={contexto()}
        catalogo={taskSources() ?? []}
        onAdjuntarFuente={adjuntarFuente}
        onQuitarFuente={quitarFuente}
        onCambiarRama={cambiarRama}
        onAbrirArtefacto={abrirPorRel}
        onOpenTask={(folder, task, machine) => void abrirSesion(folder, machine ? senderTaskId(machine, task) : task)}
        tareaPorId={tareaDelRiel}
        /* Solo con tarea abierta y con el turno cerrado: exportar a mitad de una
           respuesta se llevaría una conversación sin ella. */
        onForkDesde={sessionId() ? forkDesde : null}
        forkAgents={(rosterDelProyecto() ?? []).map((e) => e.name)}
        forkAgent={sessionId() ? (filaDe(sessionId()!)?.agent ?? null) : null}
        onError={setError}
        adjuntos={archivos()}
        onAdjuntos={setArchivos}
        onAgregarAdjuntos={agregarArchivos}
        agent={agent()}
        modelOptions={composer.options()}
        onCreditsPrepare={async () => {
          const prepare = capabilities().danilCredits?.prepare;
          if (!prepare) return;
          await composer.prepareCredits(prepare);
        }}
        /* Lo utilizable, más la superficie de la tarea abierta si dejó de
           serlo: una tarea viva no puede cambiar de agente en silencio. El
           `&&` va dentro del accesor y no aquí — ver `menuDeSuperficies`. */
        superficies={composer.menu()}
        superficie={superficie()}
        /* La salida del estado vacío: es la sección, no una superficie.
           Apuntaba al id de la primera —«claude», «opencode»—, válido
           cuando cada proveedor tenía panel propio; agrupada la
           configuración por secciones, ese id ya no nombra ningún panel y
           el primer arranque salía a ninguna parte, justo el peor sitio
           para romperse: lo primero que ve alguien sin nada conectado. */
        onConectar={() => setSettings("proveedores-ia")}
        onReintentar={() => void reintentar()}
        // El renglón de estado es de la tarea de esta celda, no de la del
        // panel activo: con la pantalla partida, leerlo de `sessionId()` hacía
        // que la misma tarea dijera «Libre» o «Cavilando» según el foco.
        reintento={
          reintento()?.session === pp.sesion ? reintento() : null
        }
        enFondo={enFondo().includes(pp.sesion ?? "")}
        machineWait={esperaMaquinaEn(pp.sesion)}
        inicioDelTurno={desdeDeTurno()[pp.sesion ?? ""] ?? null}
        terminal={terminales()[pp.sesion ?? ""] ?? null}
        carpetaDeTerminal={carpetasDeTerminal()[pp.sesion ?? ""] ?? null}
        onEntradaDeComando={(texto, eco) => teclearAlComando(pp.sesion, texto, eco)}
        models={models()}
        catalogos={catalogos()}
        model={model()}
        nativeSubagent={Boolean(pp.sesion && filaDe(pp.sesion)?.subagent)}
        /* Sólo mientras contesta, no con cualquier tarea abierta: cada
           turno guarda con qué modelo se contestó (`Turn::modelo_usado`),
           y la transcripción dice la verdad turno a turno; cambiar de
           modelo no la hace mentir. Lo del agente queda fijo, y lo
           sostiene `elegirModelo`. */
        modelLocked={Boolean(pp.sesion && filaDe(pp.sesion)?.subagent)}
        agentLocked={Boolean(pp.sesion) && bloqueoDeTraspaso() !== null}
        agentLockedReason={motivoDeTraspaso()}
        onModel={elegirModelo}
        effort={effort()}
        onEffort={chooseEffort}
        modo={modo()}
        modos={modos()}
        onModo={elegirModo}
        skills={skills()}
        commands={comandosConAlMargen({ commands: cliCommands(), skills: [], side_question: sideCommand() }, t("chat.side.menu"))}
        sideCommand={sideCommand()}
        contestandoALaTerminal={porContestar().includes(pp.sesion ?? "")}
        alMargen={alMargen()?.session === (pp.sesion ?? "") ? alMargen() : null}
        onCerrarAlMargen={cerrarAlMargen}
        onPasarAlHilo={pasarAlHilo}
        mentionSources={mentionSources()}
        input={input()}
        taskCandidates={taskCandidates()}
        onTaskMenuOpen={() => void refreshTaskCandidates()}
        taskMentions={borrador().task_mentions}
        mentionProject={project()}
        mentionSession={sessionId()}
        mentionMachineName={capabilities().taskMachine ? (id) => (id ? capabilities().machineName?.(id) : capabilities().windowMachine?.()?.name) : undefined}
        onMentionHistory={navigateMentionHistory}
        placeCandidates={placeCandidates()}
        recipientCandidates={recipientCandidates()}
        recipientFolder={projectList().find((p) => p.id === project())?.name}
        recipients={borrador().recipients}
        /* Llamar a alguien y adjuntar material entran por caminos distintos y
           acaban en listas distintas; lo que comparten es que insertar en el
           texto corre a la otra lista. */
        onRecipient={drafts.recipient}
        onReference={drafts.reference}
        onInput={setInput}
        onSend={mandar} renderAvatar={renderAvatar} renderPdf={renderPdf} createFreeRouterConsent={createFreeRouterConsent} machineOf={machineOf}
        onRespuestaRapida={mandarTexto}
        visualScope={JSON.stringify([visualWorkspace, pp.proyecto ?? "", pp.sesion])}
        readVisual={(file) => readChatVisual({ workspace: visualWorkspace, project: pp.proyecto ?? "", session: pp.sesion ?? "", machine: machineOf(pp.sesion) }, file)}
        openVisual={capabilities().nativeWindow ? (file) => openChatVisual({ workspace: visualWorkspace, project: pp.proyecto ?? "", session: pp.sesion ?? "", machine: machineOf(pp.sesion) }, file) : undefined}
        onMiniatura={miniaturaDeAdjunto}
        onPreview={previewDeAdjunto}
        onPegarImagen={pegarImagen}
        aceptaDocumentos={() => documentosEn(opcionesDeAdjunto())}
        onStop={detener}
        /* Solo el de la tarea que se está mirando: con el primero de la
           lista, dos turnos a la vez ponen la hoja de aprobar pegada a una
           conversación que no es la suya —el permiso sigue yendo a su
           sesión, pero se lee el comando de otra tarea sobre este hilo. No
           se pierde: la fila de esa tarea lo dice en el historial. */
        permission={permissions().find((p) => p.session === pp.sesion) ?? null}
        permissionError={permissionError()}
        respondingPermission={respondiendoPermiso()}
        onPermission={(permission, allow) =>
          void responderPermiso(permission, allow)
        }
        esperando={esperandoAqui()}
        onResponder={responder}
        onCancelarPregunta={cancelarPregunta}
        preguntasAMedias={preguntasDeLaCelda}
        vista={vistaDeLaCelda}
        cola={{
          items: cola(),
          pending: injecting().filter((item) => item.session === sessionId()).map((item) => item.id),
          agentes: agents(),
          actual: { agent: agent(), model: model() },
          retenida: razonDeLaCola(),
          onEditar: editarEncolado,
          onBorrar: quitarEncolado,
          onEditando: taskQueues.editMode,
          onMandar: mandarCola,
          // Con un id nuevo: el motor no sabe si el anterior salió, y este puede llegar dos veces.
          onReenviar: (id) => { const session = sessionId(); if (session) void enviarDeLaCola(session, id, crypto.randomUUID()); },
          onDetenerYEnviar: pp.sesion && vivas().includes(pp.sesion) && !esperando()
            ? detenerYEnviar
            : null,
        }}
        />
      } />
      }
    >
      {(e) => (
        <LazyPart><AgentProfile
          project={proyectoDeLaCelda()?.id ?? ""} createFreeRouterConsent={createFreeRouterConsent}
          agent={e()}
          profile={cellProfile()}
          handlerPolicy={handlerPolicy()}
          status={estadoDelEncargado()}
          background={chatBackground() ?? null}
          superficies={superficies() ?? []}
          catalogos={catalogos()}
          currentAgent={filaDe(pp.sesion ?? "")?.provider ?? null}
          onModelChosen={(elegidoAgent, elegidoModel) => {
            // Solo si es la conversación que tiene el mando: las demás
            // celdas no tienen composer propio con quien aplicarlo, y
            // pisarían el agente/modelo de la que sí lo tiene.
            if (pp.sesion !== sessionId() || busy()) return;
            batch(() => {
              composer.resumeTask({ provider: elegidoAgent || agent(), model: elegidoModel ?? "", effort: effort() });
              saveDraftConfiguration();
            });
          }}
          onDeleted={() => setViewingProfile(false)}
          onClose={() => setViewingProfile(false)}
        /></LazyPart>
      )}
    </Show>
    );
  };

  /* La imagen propia del fondo global, leída como `data:` URI: la
     política de la ventana no deja pintar un `file://`. Sin imagen —o si
     no se puede leer— la sección cae al atardecer. El fondo propio de un
     agente se pinta encima, dentro de su chat. */
  const { fondoPropioUrl } = createChatBackground({ machineOf });

  /* El fondo, la imagen y los velos son del workspace: su motor los recuerda
     y se leen al abrirlo, aquí y en la web. */
  createEffect(on(workspaceActivo, (workspace) => void import("../../../../apps/desktop/src/lib/chat-background-engine").then((m) => m.cargarFondoDelWorkspace(workspace))));

  /* El fondo de Estilo cubre la ventana entera, detrás de las columnas de
     vidrio (`.glass-panel`): así se ve también tras el historial, el árbol y
     las barras. Cada chat solo pinta encima el fondo propio de su agente. */
  const imagenDeVentana = () =>
    fondoDelAgente()?.url ?? (fondoDeChat() === "propia" ? (imagenDelWorkspace() ?? fondoPropioUrl()) : null) ?? null;
  const veloDeVentana = () => (fondoDelAgente() ? (fondoDelAgente()?.veil ?? VELO_DE_FONDO) : veloDeFondo());

  const { CeldasDeContenido } = createCeldasDeContenido({ PanelDeChat, abrirSesion, adjuntarAlProyecto, agent, agents, anchoDeArchivos, anchoDelArbol, archivosDeTarea, carpetaDelProyecto, carpetaEditable, celdaDe, cerrarPestanasYa, claveAbierta, compacta, consumo, deleteTask, draftBases, editorDeletionLocked, estiloDeLaCelda, etaparSesion, fijarSesion, hablarConEncargado, idsDeContenido, llaveDeBorrador, llevaTiraInterior, mandarVentana, materialPedido, modelosParaAgentes, moverSesion, nuevaSesion, paneles, permissions, pestanas, project, projectList, proyectoDeLaVista, quitarDelProyecto, renombrarSesion, sesionesConEstado, sessionId, setMaterialPedido, setSettings, sitiosEnBlanco, sources, tapadoPorElProyecto, vivas, workspaceActivo });

  const { CeldasDeTareas } = createCeldasDeTareas({ PanelDeChat, activarPestana, agent, alta, anchoDeArchivos, anchoDelArbol, archivoBorrado, archivoMovido, archivosDeTarea, arrastrando, arrastrarPestana, botonDeArchivos, botonDelArbol, carpetaDelProyecto, celdaDe, cerrarBorrador, cerrarPestana, cerrarPestanas, compacta, consumo, cursor, delegatedPanels, donde, dropSide, editorDeletionLocked, enBorrador, estiloDeLaCelda, exportarChat, filaDe, llaveDeBorrador, llevaTiraInterior, mandarVentana, marcaDe, montadas, muestra, nombreDeSeparar, paginaDeAgente, paneles, partirVentana, permissions, pestanaDelanteEn, pestanas, pestanasDe, preguntadas, project, proyectoDePestana, puedeSepararseDe, reabrirPestana, searchSurfaces, setSearchSurfaces, setSettings, settings, tapadoPorElProyecto, tareasEnVentanas, threadSearchTargets, tituloDePestana, ventanas, vivas, vueltaDelBorrador, workspaceActivo });

  const { Conversacion } = createConversacion({ CeldasDeContenido, CeldasDeTareas, activarPestana, altosEnPantalla, anchosEnPantalla, arrastrarPestana, botonDeNuevaPestana, cerrarBorrador, cerrarPestana, cerrarPestanas, enBorrador, filaDe, filasEnPantalla, mandarVentana, marcaDe, nombreDeSeparar, paneles, partirVentana, permissions, pestanaDelanteEn, pestanas, pestanasDe, preguntadas, puedeSepararseDe, reabrirPestana, reservaDerechaDeTiras, reservaIzquierdaDeTiras, ventanas, vivas, vueltaDelBorrador, get cabeceraDeConversacion() { return cabeceraDeConversacion; }, set cabeceraDeConversacion(v) { cabeceraDeConversacion = v; }, get controlesDerechos() { return controlesDerechos; }, set controlesDerechos(v) { controlesDerechos = v; }, get controlesIzquierdos() { return controlesIzquierdos; }, set controlesIzquierdos(v) { controlesIzquierdos = v; } });

  const { proyectosDelRiel, sesionesDelRiel, opcionesDeMover } = createRailSessions({ activeSpace, escritorio, multipleSpaces, permissions, projectList, remoteChildScope, sesiones, sesionesConEstado, spaces, vivas, });


  const { ColumnasDePrincipal } = createColumnasDePrincipal({ Conversacion, abrirLlevarCarpeta, abrirObservabilidad, abrirProyecto, abrirSesion, abrirSitio, abrirTraer, activeSpace, alta, arrastrando, arrastrarTarea, attention, bordeDeLaBarra, borrarProyecto, buscando, busy, cambiarEscritorio, clonEnCurso, createSpace, deleteTask, enCache, enLaMaquinaDelGrupo, escritorio, etaparSesion, fijarSesion, hablandoCon, hablarConEncargado, medirBordeDeLaBarra, modelosParaAgentes, moveToSpace, moverSesion, multipleSpaces, nuevaSesion, opcionesDeMover, openAgentProfile, permissions, pestanaActiva, project, projectList, proyectoAbierto, proyectosDelRiel, removeFromActiveSpace, renameSpace, renombrarProyecto, renombrarSesion, senalDe, sesiones, sesionesConPestana, sesionesDelRiel, sessionId, setAlta, setAnadiendoCarpeta, setBuscando, setDeletingSpace, setHablandoCon, setInput, setSettings, setSidebarFilter, sidebar, sidebarFilter, spaces, tabDrag, tiraDeLaVentana, vivas, workspaceActivo, workspaceActual });

  const { Principal } = createPrincipal({ ColumnasDePrincipal, abrirSesion, activityMachine, activityNotice, agentesEnUso, agents, anadiendoCarpeta, archivos, attention, aviso, carryModule, cerrarAjustes, cierreSinGuardar, claveAbierta, confirmarTraspaso, connectionError, deleteTarget, deletedTaskMembers, deletingSpace, despuesDeTraer, dirtyTaskFiles, draftProjectError, errorVisible, escritorio, filaDe, hojaDeLlevar, imagenDeVentana, inicioDeCarpeta, mandar, modelosParaAgentes, nuevaSesion, openAgentProfile, paneles, pestanas, project, projectCatalog, projectList, projectReadError, proyectoAbierto, proyectosEnAjustes, recargarMaterial, refreshSessions, reloadSpaces, resolverCierre, retryStartupRead, sessionId, setActivityMachine, setActivityNotice, setAnadiendoCarpeta, setAviso, setCierreSinGuardar, setClonEnCurso, setDeleteTarget, setDeletingEditors, setDeletingSpace, setDraftProjectError, setError, setHojaDeLlevar, setInicioDeCarpeta, setProjectReadError, setReadRevision, setSettings, setStartupReadError, setTraspasoPendiente, settings, spaceDeleted, spaces, startupReadError, traer, traspasoPendiente, veloDeVentana, ventanas, workspaceActivo });

  // **La ventana que no puede abrir estos datos no pinta la app,
  // la sustituye.** Un aviso encima dejaría debajo una app usable sobre la
  // carpeta que se acaba de negar a tocar. Ver `PantallaDeBloqueo`.
  return (
    <Show when={bloqueo()} fallback={<Principal />}>
      {(b) => <PantallaDeBloqueo frase={b()} />}
    </Show>
  );
}
