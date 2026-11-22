import { open } from "@tauri-apps/plugin-dialog";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Columns2 from "lucide-solid/icons/columns-2";
import {
  batch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Index,
  type JSX,
  lazy,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Suspense,
  Switch,
} from "solid-js";
import VisorDeArtefacto from "../../../features/artifacts/src/screens/ArtifactViewer";
import type { Preview } from "../../../features/artifacts/src/components/Preview";
import Chat, {
  type Author,
  type Msg,
} from "../../../features/chat/src/screens/Chat";
import { DelegatedLaunch, type DelegatedListProps, DelegatedNone, type DelegatedPanelModel, DelegatedToolbar, delegatedAttention, delegatedDescendants, delegatedFamilies, DelegatedPanel } from "../../../features/chat/src/screens/DelegatedTasks";
import { agentSwitchBlocked, MACHINE_UNANNOUNCED } from "../../../features/chat/src/model/handover";
import SearchPanel from "../../../features/chat/src/components/SearchPanel";
import McpSignInNotice, { noteMcpSignIn } from "../../../features/settings/src/screens/McpSignInNotice";
import PreviousAgentChat from "../../../features/chat/src/screens/PreviousAgentChat";
import { ThreadSearch } from "../../../features/chat/src/screens/ThreadSearch";
import TranscriptSource from "../../../features/chat/src/screens/TranscriptSource";
import { modoInicial, modoRecordado, recordarModo } from "../../../features/chat/src/model/modes";
import {
  type ChatEvent,
  type ChatExportado,
  clave,
  mensajesDelHilo,
  modeloDeSubtarea,
  type PreguntaEvent,
  type Session,
  type SessionEvent,
} from "../../../features/chat/src/model/transcript";
import { createComposerStore } from "../../../features/composer/src";
import { createProjectsStore, activeTaskCounts, activityByProject, type HiddenProjects, hiddenIn, type PickedAt, picksIn, rememberPick, setHidden, storedPicks, taskCountOf } from "../../../features/projects/src";
import type { DeleteTarget } from "../../../features/projects/src/screens/DeleteTaskDialog";
import type { HandlerTarget } from "../../../features/settings/src/screens/HandlerPolicy";
import { createThreadsStore } from "../../../features/threads/src";
import { createWorkspaceStore } from "../../../features/workspace/src";
import { createContextSource } from "../../../features/workspaces/src";
import { listen } from "../../../../apps/desktop/src/lib/serviceEvents";

const VisorDeArchivo = lazy(() => import("../../../features/code/src/screens/FileViewer"));

import { avisarDeLosArboles } from "../../../features/code/src/queries/refresh";
import TaskFilesRow, { taskFilesWidth } from "../../../features/code/src/screens/TaskFilesRow";
import { TaskSide, TaskSideShell } from "../../../features/code/src/screens/TaskSide";
import { arbolesDe, contiene, ubicar } from "../../../features/code/src/queries/treeKind";
import { moviendoHueco } from "../../../../apps/desktop/src/lib/sites";

const DeleteTaskDialog = lazy(() => import("../../../features/projects/src/screens/DeleteTaskDialog"));
const HandoverDialog = lazy(() => import("../../../features/chat/src/screens/HandoverDialog"));
const TaskFilesCard = lazy(() => import("../../../features/code/src/screens/TaskFiles"));

import { esDeCodigo } from "../../../ui/src/lib/workdirKind";
import Observability from "../../../features/observability/src/screens/Observability";
import AnadirCarpeta, { type ClonEnCurso } from "../../../features/projects/src/screens/AddWorkdir";
import AgentPageTasks from "../../../features/projects/src/screens/AgentPageTasks";
import { createTaskFiles } from "../../../../apps/desktop/src/lib/taskFiles";

// Chunk aparte: el perfil completo de un agente solo se carga al abrirlo.
const AgentProfile = retryableLazy(() => import("../../../features/projects/src/screens/AgentProfile"));
// El alta solo se abre sin workspace o al agregar otro: no entra en la carga inicial.
const Onboarding = lazy(() => import("../../../features/onboarding/src/screens/Onboarding")), FuncionesAfectadas = lazy(() => import("../../../features/onboarding/src").then((m) => ({ default: m.FuncionesAfectadas }))), Integraciones = lazy(() => import("../../../features/onboarding/src/components/ToolCards").then((m) => ({ default: m.Integraciones })));
const TaskLocation = lazy(() => import("../../../features/chat/src/screens/TaskLocation"));
const Screen = lazy(() => import("../../../features/screen/src/screens/Screen"));
// El aviso de licencia solo se baja si la flota lo pide (trae los textos de Danil).
const MachinesLicense = lazy(() =>
  import("../../../features/settings/src/screens/TerminusLicense").then((m) => ({
    default: (props: { onRetry: () => void }) => (
      // En el escritorio, el correo del sistema; en la web, el del navegador.
      <m.TerminusLicense compact onRequest={capabilities().nativeWindow ? m.requestAccessInBrowser : m.requestAccessInPage} onRetry={props.onRetry} />
    ),
  })),
);
import { createFreeRouterConsent, folderIcon, importCarry, renderAvatar, renderImage, renderPdf, renderTable } from "./chatSlots";
import { lastActivity, launcherOf, taskDescendants, withRemoteLaunchers } from "@terminus/tasks";
import { bringHereLabel, canBringHere, carryOrigin, machineName, machineOf, machines, machineWakes, refetchMachines, rememberedRunOn, remoteChildScope, runOn, senderTaskId, setRunOn, setTaskRowMachine } from "../../../features/machines/src/queries/store";
import { createdTasks } from "../../../features/projects/src/model/agentPageFilters";
import BaseBranchPicker from "../../../features/projects/src/screens/BaseBranchPicker";
import { watchHandlerStatus, watchHandlerStatuses } from "../../../features/projects/src/queries/handlerPresence";
import { EmptyContext, ProjectPicker } from "../../../features/projects/src/screens/Projects";

// Chunk aparte: solo lo carga quien crea una tarea, no la carga inicial.
const MachinePicker = lazy(() =>
  import("../../../features/machines/src/screens/MachinePicker").then((m) => ({ default: m.MachinePicker })),
);
// Llevar el trabajo a otra máquina: solo al enviar a una que no es la de la carpeta.
const CarrySheet = lazy(() => import("../../../features/machines/src/screens/CarrySheet"));
const CarryProgress = lazy(() => import("../../../features/machines/src/screens/CarryProgress"));
const CarryOriginLabel = lazy(() =>
  import("../../../features/machines/src/screens/CarryProgress").then((m) => ({ default: m.CarryOriginLabel })),
);
const VistaDeProyecto = lazy(() => import("../../../features/projects/src/screens/ProjectView"));
import { workLabel } from "../../../ui/src/lib/workLabel.ts";
import { DEFAULT_PROFILE, displayName, notifyProfiles, watchProfiles } from "../../../features/projects/src/queries/profiles";
import RecentAgentChats from "../../../features/projects/src/screens/RecentAgentChats";
import { type SessionRow, threadTitle } from "../../../features/projects/src/screens/Sessions";
import TabStrip, { NewTabButton } from "../../../features/projects/src/screens/Tabs";
import { createTaskWork, ResumeTask } from "../../../features/projects/src/screens/TaskHistory";
import type { Etapa } from "../../../features/projects/src/screens/TaskStage";
import { esChatDeAgente } from "../../../features/projects/src/model/taskTree";
import {
  DEFAULT_PERMISSION_MODE_EVENT,
} from "../../../features/settings/src/screens/DefaultPermissions";
import type { ContextoDeProyectos } from "../../../features/settings/src/screens/ManageProjects";

// Configuración solo se abre a pedido: no entra en la carga inicial.
const Settings = lazy(() => import("./settingsSlots"));

import { listaBasta, reconciliar } from "../../../features/settings/src/model/early-startup";
import { createWorkspaces, type Startup } from "../../../features/settings/src/queries/workspaces-store";
import { createAttention, topState } from "../shell/attention";
import TaskNotifier from "../shell/TaskNotifier";

const DeleteSpace = lazy(() => import("../shell/DeleteSpace"));
import { ATTACHMENT_DOCUMENTS_FEATURE } from "@terminus/protocol";
import { openChatVisual, readChatVisual } from "../../../features/chat/src/queries/readVisual";
import { apagarVistasDe, hayVistasDe, soltarVistasHuerfanas } from "../../../features/code/src/queries/typst";
import { createConversationHandoff } from "../../../features/conversation-handoff/src";
import { createDraftsStore } from "../../../features/drafts/src";
import { asleep, withLastAnswer } from "../../../features/machines/src/queries/lastAnswer";
import { unconfirmedOpen } from "../../../features/machines/src/model/unconfirmedOpen";
import { createBatchDelivery, createServiceStream } from "../../../features/service-stream/src";
import { ConexionesMenu } from "../../../features/settings/src/screens/Tools";
import { TitleBarSection } from "../shell";
import AppTools from "../shell/AppTools";
import CloseGuard from "../shell/CloseGuard";
import AvisoDeCarpeta from "../shell/FolderNotice";
import GlobalSearch, { type SearchFilter } from "../shell/GlobalSearch";
import PantallaDeBloqueo from "../shell/LockScreen";
import AvisoDeMaterial from "../shell/MaterialNotice";
import Paneles from "../shell/Panels";
import Sidebar, { createSidebar } from "../shell/Sidebar";
import type { SidebarFilterProps } from "../shell/SidebarFilter";
import ColumnaLateral from "../shell/SideColumn";
import SpaceMenu from "../shell/SpaceMenu";
import { flattenTasks } from "../shell/sidebarTasks";
import { materialDeProyecto, visoresDeCodigo } from "../featureSlots";
import UsageTool, { UsagePanel } from "../shell/UsageTool";
import { createUsage } from "../shell/usage";
import AvisoDeVersion from "../shell/VersionNotice";
import WorkspaceColumn from "../shell/WorkspaceColumn";
import Sitio from "../../../features/sites/src/screens/Site";
import { DragOverlay, UnsavedCloseDialog } from "../../../features/tabs/src";
import { createEngineQueue, createTaskQueues } from "../../../features/task-queues/src";
import { VELO_DE_FONDO } from "../../../../apps/desktop/src/lib/chat-background";
import { fondoDeChat, imagenDelWorkspace, veloDeFondo } from "../../../../apps/desktop/src/lib/chat-background-store";
import { connected } from "../../../../apps/desktop/src/lib/engineConnection";
import { pedirElCampo } from "../../../../apps/desktop/src/lib/focus";
import { recordarCarpetas } from "../../../../apps/desktop/src/lib/folderKinds";
import { aplicarLenguaDeWorkspace, t } from "../../../../apps/desktop/src/lib/i18n";
import { captureWorkspaceContext, invoke } from "../../../engine-client/src/client.ts";
import type { InternalTaskLink } from "../../../../apps/desktop/src/lib/links";
import type {
  AgentProfile as AgentProfileData,
  ArbolEnTarea,
  HandlerList,
  Project,
  Source,
} from "../../../../apps/desktop/src/lib/model";
import { carpetaDeTrabajo } from "../../../../apps/desktop/src/lib/model";
import { threadPreview } from "../../../../apps/desktop/src/lib/nextSteps";
import {
  createPanels,
  deleteLayout,
  gridCell,
  gridTracks,
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
  type Side as PanelSide,
  panelReadingOrder,
  readLayout,
  type PanelSite as SitioDePanel,
  sameSite,
  spacesWithLayout,
} from "../../../../apps/desktop/src/lib/panels";
import { capabilities, openMachineScreen } from "../../../host/src/platform";
import { createPointerDrag } from "../../../../apps/desktop/src/lib/pointer-drag";
import { createPref, escribirPref, leerPref } from "../../../../apps/desktop/src/lib/prefs";
import type { Frase } from "../../../../apps/desktop/src/lib/prose";
import { type SenderTask } from "../../../../apps/desktop/src/lib/recipients";
import { conservar, sessionRefresh } from "../../../session/src/sessionRefresh";
import { readShellCache, shellCacheWriter } from "../../../../apps/desktop/src/lib/shellCache";
import {
  destinoDePestana,
  type NavegacionDePestanas,
} from "../../../../apps/desktop/src/lib/shortcuts";
import { comandosConAlMargen } from "../../../../apps/desktop/src/lib/side-question";
import { sidebarViewKey } from "../../../../apps/desktop/src/lib/sidebarView";
import { createSpaceNavigationOrder } from "../../../../apps/desktop/src/lib/space-navigation-order";
import {
  carpetasDelEscritorio,
  enEscritorio,
  escritorioDeFila,
  type Space,
  spaceName,
} from "../../../../apps/desktop/src/lib/spaces";
import {
  type ArtifactTab,
  appendToStoredStrip,
  artifactTabId,
  browserTabId,
  createTabs,
  deleteStoredStrip,
  type FileTab,
  fileTabId,
  isContentTab,
  isTaskTab,
  migrateLegacyStrip,
  OBSERVABILITY_TAB_ID,
  type ScreenTab,
  type SiteTab,
  screenTabId,
  siteTabId,
  spacesWithStoredStrip,
  storedStrip,
  type Tab,
  type TaskTab,
} from "../../../../apps/desktop/src/lib/tabs";
import {
  claveDeBorrador,
  esProvisional,
  proyectoDeNuevaTarea,
} from "../../../../apps/desktop/src/lib/taskDraft";
import {
  type UsageRecord,
  ventanaDe,
} from "../../../../apps/desktop/src/lib/usage";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import {
  BELOW_LOCATION,
  createCompactViewport,
  HEADER_HEIGHT,
  LOCATION_BAR,
  toggleMaximizeFromHeader,
} from "../../../host/src/window";
import { Button } from "../../../ui/src/Button";
import { prosaDe } from "../../../ui/src/Failure";
import { LazyPart, retryableLazy } from "../../../ui/src/LazyPart";
import { Toast, ToastStack } from "../../../ui/src/Toast";

import { createSleepSession, createThreadStream, createThreadSide, createAttachments, createAttachmentsMount, createResync, createResyncCommands, createShellCommand, createDraftSend, createHandover, createSend, createSendGates, createSendNow, createPanelDeChat, createChatBackground } from "../../../features/chat/src";

export const { sleepSession } = createSleepSession({ machineOf });

export default function App() {
  /**
   * El alta en curso: un pestillo a propósito, que se enciende cuando no
   * hay workspace y se apaga solo al terminar. Derivarlo de
   * «¿hay workspace?» desmontaría el asistente en cuanto el paso 1 crea el
   * primero, antes de pedir proveedores de IA y source control.
   */
  const [alta, setAlta] = createSignal(false);
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
  let ultimoRetoque = 0;
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

  /** El aviso de lo que un gesto sobre espacios acaba de hacer, con su «Ir». */
  const [aviso, setAviso] = createSignal<{ texto: string; boton?: string; ir?: () => void } | null>(null);
  const [deletingSpace, setDeletingSpace] = createSignal<string | null>(null);
  const replaceSpace = (i: Space) =>
    setSpaces((lista) => lista.map((x) => (x.id === i.id ? i : x)));

  async function createSpace(name: string, folders: string[]) {
    const nueva = await invoke<Space>("create_space", { name, folders });
    setSpaces((lista) => [...lista.filter((i) => i.id !== nueva.id), nueva]);
    cambiarEscritorio(nueva.id);
  }

  async function renameSpace(id: string, name: string) {
    try {
      replaceSpace(await invoke<Space>("rename_space", { id, name }, machineOf(id)));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  async function updateSpaceFolders(id: string, folders: string[]) {
    replaceSpace(await invoke<Space>("set_space_folders", { id, folders }, machineOf(id)));
  }

  async function removeFromActiveSpace(folder: string) {
    const i = activeSpace();
    if (!i) return;
    try {
      await updateSpaceFolders(i.id, i.folders.filter((f) => f !== folder));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  async function moveToSpace(project: string, id: string, space: string) {
    try {
      // A la máquina de la tarea: el router comparte antes con la cuenta el
      // space de esta ventana y allá se crea con el mismo id.
      // Con la máquina de la tarea apagada el relay lo aplaza y no hay respuesta del motor: el space es el pedido.
      const destino = (await invoke<{ id: string; name: string | null } | null>("move_task_to_space", { project, id, space }, deLaTarea(id)))
        ?? spaces().find((i) => i.id === space) ?? null;
      await refreshSessions(grupos());
      setAviso({
        texto: t("spaces.move.toast", { name: spaceName(destino) }),
        boton: t("spaces.toast.go"),
        ir: () => void abrirSesion(project, id),
      });
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  /** Borrada: sale de la barra, su tira se olvida y el aviso abre sus archivadas en el buscador. */
  function spaceDeleted(i: Space, archivadas: number) {
    const ws = workspaceActivo();
    setDeletingSpace(null);
    if (!ws) return;
    const quedan = spaces().filter((x) => x.id !== i.id);
    if (escritorio() === i.id && quedan[0]) cambiarEscritorio(quedan[0].id);
    setSpaces(quedan);
    for (const p of storedStrip(ws, i.id)) soltarPestanaGuardada(p.id);
    deleteStoredStrip(ws, i.id);
    window.dispatchEvent(new CustomEvent("harness:tasks-changed"));
    void reloadSpaces();
    setAviso({
      texto: t("spaces.delete.toast", { name: spaceName(i), count: archivadas }),
      boton: t("spaces.delete.see_archived"),
      ir: () => setBuscando("archived"),
    });
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
  let lifecycleRevision = 0;
  const { advanceTurn, alMargen, almacenDePreguntas, arrancando, busy, carpetasDeTerminal, cerrarAlMargen, cola, colaDe, comandosDeLaCola, conversationScope, desdeDeTurno, detenidos, editando, enFondo, engineCanDispatch, esDeLaAbierta, esDelWorkspaceAbierto, esperaMaquinaEn, finishedTurns, folder, handoff, handoffAt, injecting, lanzados, liveThreadKey, liveThreads, marcarQuieta, marcarViva, mentionSources, nacenConComando, pasarAlHilo, pendingStarts, permissionError, permissions, placeCandidates, preguntarAlMargen, queueBusy, recipientCandidates, refreshTaskCandidates, reintento, releerCola, respondiendoPermiso, resumeQueue, retenidaPorElMotor, rosterDelProyecto, setArrancando, setCarpetasDeTerminal, setDesdeDeTurno, setEnFondo, setFolder, setInjecting, setMentionSources, setPermissionError, setPermissions, setPreguntasAMedias, setReintento, setRespondiendoPermiso, setSettlingTurns, setSinSteer, setTerminales, setVentana, setVivas, settlingTurns, sinSteer, soltarPreguntas, stopping, taskCandidates, taskQueues, terminales, turnClosed, turnRevisions, turnStarted, ventana, vivas } = createThreadStream({ apagadas, claveAbierta, createConversationHandoff, createEngineQueue, createTaskQueues, deLaTarea, filaDe, input, leerTarea, loadResult, machineName, machineOf, machineWaits, machineWakes, machines, opcionesDeLaTarea, pestanas, project, projectList, sesiones, sessionId, setInput, tareaDelRiel, threads, watchHandlerStatuses, watchProfiles, workspaceActivo, workspaceContext, get enviarFiltro() { return enviarFiltro; }, get lifecycleRevision() { return lifecycleRevision; }, set lifecycleRevision(v) { lifecycleRevision = v; }, get mandarElegido() { return mandarElegido; }, get reconcileActiveTurns() { return reconcileActiveTurns; } });

  const { activityMachine, activityNotice, anadiendoCarpeta, carpetaDelProyecto, inicioDeCarpeta, setActivityMachine, setActivityNotice, setAnadiendoCarpeta, setInicioDeCarpeta, setSettings, settings, sidebar } = createThreadSide({ createSidebar, alta, archivosDeTarea, closeActiveTab, irAPestanaDe, irAVentanaVecina, juntarLaActiva, llaveDeBorrador, nuevaSesion, partirLaActiva, project, projectList, reabrirPestana, sessionId, setBuscando, workspaceActivo });
  /** El clon en vuelo, que el riel enseña mientras no hay proyecto que listar. */
  const [clonEnCurso, setClonEnCurso] = createSignal<ClonEnCurso | null>(null);
  // Cerrar la configuración es el único momento en que las cuentas pudieron
  // cambiar sin que el resto de la app se entere.
  const [cuentasTocadas, setCuentasTocadas] = createSignal(0);

  // Los oyentes se montan una vez y leen las señales al recibir cada evento:
  // guardar fuera el valor de `sessionId()` o `agents()` los dejaría
  // trabajando con el estado del montaje. `firmas` es una variable y no una
  // señal: nada pinta sus valores, solo los consultan las funciones de respuesta.

  // Con qué se firma lo que llega de cada tarea, por sesión: con una sola
  // firma, arrancar un segundo turno pisa la del primero, y al volver a la
  // primera su texto sale con el autor del otro agente. La clave `""` es la
  // del turno sin sesión en disco; se muda a su id en cuanto Rust lo
  // devuelve.
  const firmas: Record<string, Author | null> = {};
  // Con qué modelo se lanzó el turno en vivo, con las mismas claves que
  // `firmas`: la fila del mensaje lo enseña hasta que el cierre guarde el observado.
  const modelosEnVivo: Record<string, string | null> = {};

  // Hay una pregunta del agente que nadie contestó. Se deriva de la
  // transcripción, no se guarda: una marca de "pendiente" aparte sería un
  // segundo estado capaz de contradecir a los turnos, dejando seguir el
  // trabajo sin el dato que el agente pidió. Mismo criterio que
  // `sin_contestar` en `workspace/sessions.rs`.
  const preguntasPendientes = (messages: Msg[]) => {
    const contestadas = new Set(
      messages
        .flatMap((m) => m.respuestas ?? [])
        .map((r) => clave(r.turn, r.question)),
    );
    return messages.some(
      (m) =>
        !!m.turno &&
        (m.preguntas ?? []).some((p) => !contestadas.has(clave(m.turno!, p.id))),
    );
  };
  // Con la ventana lejos del final, lo que espera es lo de la última cola leída, no lo que se ve.
  const esperando = createMemo(() => {
    const cola = colaSuelta()[claveDelHilo()];
    return preguntasPendientes(cola ? [...cola, ...(hiloAbierto()?.vivo ?? [])] : msgs());
  });
  /**
   * Qué tareas tienen una pregunta sin contestar, para la tira. De la abierta
   * manda lo derivado de su conversación —es más fresco que el historial, que
   * se relee al cerrar el turno—; de las demás, lo que dice su fila.
   */
  const preguntadas = createMemo(() => {
    const abierta = sessionId();
    const otras = Object.values(sesiones())
      .flat()
      .filter((r) => r.esperando && r.id !== abierta)
      .map((r) => r.id);
    const ids = new Set(otras);
    for (const [id, hilo] of Object.entries(hilos())) {
      if (preguntasPendientes([...hilo.base, ...hilo.vivo])) ids.add(id);
    }
    if (abierta && esperando()) ids.add(abierta);
    return [...ids].sort();
  }, undefined, { equals: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]) });

  function sesionesConEstado() {
    const pending = new Set(preguntadas());
    const unseen = attention.unseen(workspaceActivo());
    const listas = sesiones();
    const nuevas = naciendo();
    const proyectos = new Set([...Object.keys(listas), ...nuevas.map((n) => n.project)]);
    // Una hija remota cuelga de su coordinador como una delegada más (`remote_parent`).
    const remotas = remoteChildScope();
    return Object.fromEntries([...proyectos].map((project) => {
      const rows = withRemoteLaunchers(listas[project] ?? [], remotas);
      // Delante: `list_live_sessions` ordena por cuándo nacieron, y estas acaban de
      // nacer. La misma fila dos veces mientras el refresco llega se evita
      // mirando lo que ya trajo el disco.
      const enDisco = new Set(rows.map((row) => row.id));
      const propias = nuevas
        .filter((n) => n.project === project && !enDisco.has(n.row.id))
        .map((n) => n.row);
      const cambios = retoques();
      return [project, [...propias, ...rows.map(leida => {
        const retoque = cambios[leida.id];
        const row = retoque ? { ...leida, ...retoque.cambio } : leida;
        const preview = threadPreview(hilos()[row.id]?.vivo ?? []) ?? row.last_message;
        const sinVer = unseen.has(row.id);
        return row.esperando === pending.has(row.id) && preview === row.last_message && !!row.sin_ver === sinVer ? row : {
          ...row, esperando: pending.has(row.id), last_message: preview, sin_ver: sinVer,
        };
      })]];
    }));
  }

  const sessionLists = sessionRefresh<SessionRow>({
    read: async (project) => {
      const open = sesionesConPestana();
      const rows = await invoke<SessionRow[]>("list_live_sessions", { project, open });
      // La pestaña que su máquina no confirmó no cuenta como pedida: no se cierra ni se pide en bucle.
      const sinConfirmar = new Set(unconfirmedOpen(rows));
      const confirmadas = open.filter((id) => !sinConfirmar.has(id));
      pedidas.set(project, new Set(confirmadas));
      for (const id of confirmadas) esperandoFila.delete(id);
      return rows;
    },
    apply: (update) => setSesiones(update),
    projects: () => grupos(),
    key: (row) => row.id,
    // Una mutación del CLI avisa dos veces seguidas, y varios agentes a la vez, una ráfaga.
    gather: 200,
  });
  onCleanup(() => sessionLists.reset());
  function refreshSessions(proyectos: string[]) {
    return sessionLists.refresh(proyectos);
  }
  /**
   * Qué carpetas relee un aviso sobre `session`: la suya y la de su padre, que
   * pinta el estado de sus hijas. Una tarea que el riel todavía no conoce (la
   * creó otra ventana u otra máquina) puede estar en cualquiera: todas.
   */
  function carpetasDeTarea(session: string, project?: string | null): string[] {
    const listas = sesiones();
    const buscar = (id: string) => Object.keys(listas).find((p) => listas[p].some((r) => r.id === id));
    const suya = project ?? buscar(session);
    if (suya === undefined) return grupos();
    const fila = listas[suya]?.find((r) => r.id === session);
    const delPadre = fila?.parent ? buscar(fila.parent) : undefined;
    return [...new Set([suya, ...(delPadre === undefined ? [] : [delPadre])])];
  }
  /** La relectura que pide un evento del servicio; la de un gesto de la persona va sin espera. */
  function refreshSessionsOnEvent(proyectos: string[]) {
    return sessionLists.gathered(proyectos);
  }
  // Un hueco del stream o un motor nuevo se lleva los eventos `session` de en medio: se
  // relee lo que habrían refrescado. Las tareas vivas las reconcilia `reconcileActiveTurns`.
  function releerTrasHueco() {
    const generation = workspaceContext.generation();
    void refreshSessionsOnEvent(grupos());
    for (const pestana of pestanas.open()) avisarDeLosArboles(pestana.id);
    const abierta = sessionId();
    if (!abierta || vivas().includes(abierta)) return;
    avisarDeLosArboles(abierta);
    void leerTarea(project(), abierta)
      .then((s) => loadResult(abierta, s, true, generation))
      .catch(() => {});
  }

  // La miniatura de un adjunto del mensaje, o `null` si no hay que enseñar
  // una: null no es un fallo, y no se distingue del error. Un PDF, un `.docx`
  // o una imagen que no cabe se pintan igual —con su tarjeta—, y quien llama
  // no decide con la diferencia. Lo que sí sería un fallo es tumbar la
  // transcripción por un archivo que ya no está. Resuelve contra la tarea
  // abierta: de esa son los mensajes que `Chat` está pintando.
  async function previewDeAdjunto(rel: string): Promise<Preview | null> {
    try {
  // Un adjunto se guarda por su ruta del sistema. Los turnos anteriores a
  // v0.1.23 guardaron una relativa `entradas/…`, y esas van por
  // `attachment_preview`, que resuelve la ruta él para no ser un lector de
  // archivos abierto a la ventana.
      const esDeLaTarea = rel.startsWith("entradas/");
      const id = sessionId();
      if (esDeLaTarea && !id) return null;
      return esDeLaTarea
        ? await invoke<Preview>("attachment_preview", {
            project: project(),
            id,
            rel,
          }, deLaTarea(id))
        : await previewOn(rel, id);
    } catch {
      return null;
    }
  }

  async function miniaturaDeAdjunto(rel: string): Promise<string | null> {
    return (await previewDeAdjunto(rel))?.data_url ?? null;
  }

  // Lo que se mandó a una tarea de otra máquina vive allá; lo que todavía no
  // salió (el globo mientras se manda) sigue en la de la ventana.
  async function previewOn(path: string, id: string | null): Promise<Preview> {
    const there = deLaTarea(id);
    if (!there) return invoke<Preview>("preview_file", { path, rel: path });
    try {
      return await invoke<Preview>("preview_file", { path, rel: path }, there);
    } catch {
      return invoke<Preview>("preview_file", { path, rel: path });
    }
  }

  /** Si la máquina de esas opciones anuncia la extensión de documentos. */
  function documentosEn(options: { headers: Record<string, string> } | undefined): boolean {
    const machine = options?.headers["x-terminus-machine"];
    const fila = machines().find((m) => (machine ? m.id === machine : m.local));
    return fila?.features?.includes(ATTACHMENT_DOCUMENTS_FEATURE) === true;
  }

  /** Las opciones de la conversación abierta o del borrador, como en `pegarImagen`. */
  function opcionesDeAdjunto() {
    const abierta = sessionId();
    return abierta ? deLaTarea(abierta) : draftOptions();
  }

  const { aplicar, attachmentsFor, pegarImagen, recargarMaterial, refreshFolder, retryStartupRead } = createAttachments({ adjuntosEn, asentarEscritorio, asleep, composer, confirmContext, deLaTarea, documentosEn, draftOptions, drafts, enCache, enMaquina, finishedTurns, grupos, guardarCache, handoff, hilos, machineName, machines, paneles, pegadasEn, pestanas, projectCatalog, refetchMachines, refreshSessions, sessionId, sessionLists, setAlta, setAviso, setBloqueo, setCuentasTocadas, setDesdeDeTurno, setDraftBases, setEnCache, setError, setEscritorio, setFolder, setMaterialError, setProject, setProjectReadError, setProyectoAbierto, setSesiones, setSessionId, setSettlingTurns, setSources, setSpaces, setStartupReadError, setTaskSourcesError, setVentana, setVivas, shellCache, taskQueues, threads, workspaceActivo, workspaceContext, get abrirSesion() { return abrirSesion; }, get lifecycleRevision() { return lifecycleRevision; }, set lifecycleRevision(v) { lifecycleRevision = v; }, get loadThread() { return loadThread; }, get loadWindowThreads() { return loadWindowThreads; }, get reconcileActiveTurns() { return reconcileActiveTurns; }, get soltarCola() { return soltarCola; } });

  const { applyPushed, settleTurn } = createAttachmentsMount({ advanceTurn, agent, aplicar, asleep, bloqueo, closeActiveTab, composer, conversationScope, createBatchDelivery, enCache, finishedTurns, grupos, handoff, hilos, leerTarea, listaBasta, loadResult, marcarQuieta, pestanas, project, projectCatalog, recargarMaterial, reconciliar, refreshSessions, sessionId, setBloqueo, setEnCache, setEnFondo, setPermissions, setSesiones, setSettings, setSettlingTurns, setStartupReadError, soltarHilo, tareaDelRiel, taskQueues, threads, turnRevisions, vivas, workspaceContext, get mandarElegido() { return mandarElegido; }, get releerProyectos() { return releerProyectos; }, get releerUna() { return releerUna; }, get soltarTerminal() { return soltarTerminal; } });
  let serviceListenersReady: Promise<unknown> = Promise.resolve();
  const { enviarFiltro, reconcileActiveTurns, reconcileSoon, releerUna, serviceStream } = createResync({ applyPushed, asleep, conversationScope, createServiceStream, esDeLaAbierta, handoff, leerTarea, liveThreads, loadResult, machines, marcarViva, pendingStarts, pestanas, project, recargarMaterial, releerTrasHueco, sesionesConPestana, sessionId, setConnectionError, setDesdeDeTurno, setEnFondo, setError, setPermissions, settleTurn, settlingTurns, soltarVistasHuerfanas, tareaDelRiel, terminales, threads, vivas, workspaceActivo, workspaceContext, get lifecycleRevision() { return lifecycleRevision; }, set lifecycleRevision(v) { lifecycleRevision = v; }, get ponerTerminal() { return ponerTerminal; }, get reponerGates() { return reponerGates; }, get serviceListenersReady() { return serviceListenersReady; }, set serviceListenersReady(v) { serviceListenersReady = v; } });

  onMount(() => {
    const chat = listen<ChatEvent>("chat", (e) => {
      const {
        workspace,
        session,
        kind,
        text,
        meta,
        id,
        target,
        ok,
        request_id,
        origin,
      } = e.payload;
      const paintTranscript = () => threads.event(e.payload, {
        provider: filaDe(session)?.provider ?? (session === sessionId() ? agent() : undefined),
        author: firmas[session] ?? firmas[""] ?? null,
        model: modelosEnVivo[session] ?? modelosEnVivo[""] ?? null,
      });
      // Lo que no es texto se ordena detrás de los fragmentos que llegaron antes.
      if (kind !== "delta") threads.flush();
      // Que un turno terminó se apunta ANTES del filtro de abajo: es la mitad
      // que hace posible trabajar en dos tareas. El filtro descarta lo que no
      // se está mirando, correcto para pintar, pero el cierre no es pintura:
      // si se descartara, la tarea que terminó mientras mirabas otra seguiría
      // marcada como viva para siempre, con su caja en «Detener» y sin nada
      // corriendo detrás.
      if (kind === "done") {
        turnClosed(session);
        threads.finishActivity(session, workspace || workspaceActivo());
        setEnFondo((ids) => ids.filter((id) => id !== session));
        if (!esDelWorkspaceAbierto(workspace)) {
          advanceTurn(session);
          if (workspace) {
            liveThreads.delete(liveThreadKey(workspace, session));
            enviarFiltro();
            threads.dropSaved(workspace, session);
          }
          setPermissions((items) => items.filter((permission) => permission.session !== session));
        }
        if (esDelWorkspaceAbierto(workspace)) finishedTurns.set(session, ok);
        if (esDelWorkspaceAbierto(workspace)) handoff.observe({ kind: "terminal", scope: conversationScope(session) });
        // Un turno que acaba libera el material que tenía delante, y hay quien
        // está esperando justo eso para traerlo (`AvisoDeMaterial`). Se avisa
        // aquí, antes del filtro por tarea abierta: el turno que termina puede
        // ser de otra.
        window.dispatchEvent(new CustomEvent("harness:turno-cerrado"));
      // Y el árbol de esa tarea quedó como quedó: el panel de código tiene
      // archivos abiertos que el turno pudo reescribir. Sin este aviso siguen
      // enseñando la versión de antes, y guardar encima escribiría el archivo
      // viejo entero sobre lo que el agente acaba de hacer
      // (`features/code/refresh.ts`). Va antes del filtro por tarea abierta,
      // como el cierre: el panel decide por su cuenta si le toca.
        avisarDeLosArboles(session);
      }

      // Una tarea puede arrancar sin que esta pantalla la lance: las hijas de
      // orquestación las despacha el backend al cerrar el turno del padre
      // (`workspace/orchestration.rs`), y su `started` es la única señal de que
      // existen. Se apunta antes del filtro, como el cierre, y el historial
      // se recarga para que la fila aparezca —o, en un `done` de una tarea
      // que no se está mirando, para que deje de decir que trabaja—.
      if (kind === "started" || kind === "done") {
        if (kind === "started" && workspace) liveThreads.add(liveThreadKey(workspace, session));
        enviarFiltro();
        if (kind === "started" && esDelWorkspaceAbierto(workspace)) {
          const lanzadoAqui = pendingStarts.delete(session);
          advanceTurn(session);
          // Lo que el servicio escribió al lanzarlo solo —la línea del cupo— está en disco y no llega por eventos.
          if (!lanzadoAqui) releerUna(session);
          setSettlingTurns((ids) => ids.filter((id) => id !== session));
          finishedTurns.delete(session);
          setEnFondo((ids) => ids.filter((id) => id !== session));
          marcarViva(session, undefined, true);
        }
        if (esDelWorkspaceAbierto(workspace)) void refreshSessionsOnEvent(carpetasDeTarea(session));
      }

      // Cada evento cae en el hilo de SU sesión, esté abierta o no (ver
      // `hilos`). Lo único que se descarta es lo que corre en otro workspace:
      // lo que hay en memoria es de este cliente.

      // El permiso se salta esa comprobación para RECIBIRSE, no para
      // pintarse: descartarlo aquí lo perdería —es la única copia, y el turno
      // que lo espera se quedaría parado sin que nadie pudiera ya
      // contestarle—. Dejarlo entrar no es dejarlo aparecer: quién lo pinta
      // elige el de la tarea abierta, y el resto espera en la suya.

      // Pintarlo al llegar mete el comando de una conversación al pie de otra
      // —y, cambiando de workspace con algo contestando, de otro cliente— con
      // su aviso de procedencia calculado contra el material equivocado. El
      // gate espera en su conversación; el punto del historial y el de la
      // pestaña dicen en cuál.
      if (kind === "shell_started" || kind === "shell_output" || kind === "shell_done") {
        if (esDelWorkspaceAbierto(workspace) && id) alComando(session, kind, { id, text, meta, target });
        return;
      }

      const esGate = kind === "permission" || kind === "permission_resolved";
      const retainedStream = Boolean(workspace && liveThreads.has(liveThreadKey(workspace, session))) &&
        ["delta", "reasoning", "image", "tool", "tool_done", "notice", "task_launched", "segment_saved", "command_output", "command_running"].includes(kind);
      if (!esGate && !esDelWorkspaceAbierto(workspace) && !retainedStream) return;

      if (kind === "started") { const scope = conversationScope(session); handoff.observe({ kind: "started", scope }); turnStarted(scope); return; }

      if (kind === "task_launched") {
        paintTranscript();
        if (esDelWorkspaceAbierto(workspace)) void refreshSessionsOnEvent(carpetasDeTarea(session));
        return;
      }
      if (kind === "segment_saved") { paintTranscript(); return; }
      if (kind === "queue") { releerCola(session); return; }

      if (kind === "mcp_auth") {
        noteMcpSignIn(session, text);
        return;
      }

      if (kind === "model") {
        if (session === sessionId()) composer.runtimeFact({ kind: "model", value: text });
        return;
      }
      if (kind === "effort") {
        if (session === sessionId()) composer.runtimeFact({ kind: "effort", value: text });
        return;
      }

      // El CLI está reintentando contra su proveedor. No entra en la
      // transcripción —cinco intentos serían cinco filas permanentes por algo
      // que puede resolverse solo—: enciende el indicador de estado del
      // turno, que es lo único que contesta «¿esto sigue vivo?» mientras el
      // proveedor no contesta. Se apaga en cuanto el turno vuelve a avanzar,
      // unas líneas más abajo.
      if (kind === "retry") {
        const [intento, total] = (meta ?? "").split("/").map(Number);
        setReintento({
          session,
          intento: intento || 0,
          total: total || 0,
          clase: text,
        });
        return;
      }

      // Y se apaga con la primera señal de que el turno avanzó otra vez. Sin
      // esto, un reintento que sale bien deja el rótulo puesto hasta el cierre
      // y la pantalla afirma una espera que ya terminó.
      if (reintento()?.session === session) setReintento(null);

      if (kind === "background") {
        setEnFondo((ids) => (ids.includes(session) ? ids : [...ids, session]));
        const primero = session === sessionId() && !editando() ? cola()[0] : undefined;
        if (primero) void mandarAhora(primero.id);
        return;
      }
      if (enFondo().includes(session)) setEnFondo((ids) => ids.filter((id) => id !== session));

      if (kind === "tool" || kind === "tool_done") { paintTranscript(); return; }

      if (kind === "done") {
        void settleTurn(session, ok, text === "unsaved");
        releerCola(session);
        return;
      }

      // El pedido ya tiene decisión, tomada aquí o en otra ventana sobre la
      // misma tarea. Sin esto el gate se quedaba hasta que el turno cerrara,
      // y pulsarlo solo devolvía «ya se contestó». La fila de la decisión se
      // pinta con lo que trae el evento; la relectura del cierre la reemplaza.
      if (kind === "permission_resolved") {
        if (!request_id) return;
        permissionReads.set(session, (permissionReads.get(session) ?? 0) + 1);
        const gate = permissions().find((p) => p.session === session && (p.requestId === request_id || p.durableId === request_id));
        setPermissions((ps) => ps.filter((p) => p.session !== session || (p.requestId !== request_id && p.durableId !== request_id)));
        if (gate && id && esDelWorkspaceAbierto(workspace)) {
          threads.commitUniqueTurn(session, {
                          role: "user",
                          text: "",
                          turno: id,
                          permission: {
                            request_id,
                            tool: text || gate.tool,
                            target: target ?? gate.target,
                            allow: ok === true,
                            when: Date.now(),
                          },
                        });
        }
        return;
      }

      if (kind === "permission") {
        setPermissionError(null);
        if (!request_id) {
          threads.appendLive(session, [{
                          role: "system",
              // Sin nombrar a un agente: un literal escrito mirando a uno nombra al
              // equivocado justo cuando algo va mal. Los de protocolo también piden
              // permiso.
                          text: t("shell.turn.permission_no_reply"),
                          meta: "fallo",
                        }], workspace);
          return;
        }
        setPermissions((ps) =>
          ps.some((p) => p.session === session && (p.requestId === request_id || p.durableId === request_id))
            ? ps
            : [
                ...ps,
                {
                  session,
                  workspace: workspace ?? workspaceActivo() ?? undefined,
                  llegada: ++gateSeq,
                  requestId: request_id,
                  tool: text,
                  target: target ?? meta,
                  origin: origin ?? null,
                },
              ],
        );
        void reponerGates(session, workspace ?? workspaceActivo());
        return;
      }

      paintTranscript();
    });
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

  const { elegirCarpetaDelWorkspace, releerProyectos, renombrarProyecto, abrirProyecto, adjuntarAlProyecto, quitarDelProyecto, carpetaEditable, borrarProyecto, elegirProyecto, soltarCola, abrirSesion, loadThread, loadWindowThreads, hablarConEncargado } = createContextSource({ abrirBorradorDeAgente, adjuntas, aplicar, cambiarEscritorio, cola, composer, deLaTarea, drafts, engineCanDispatch, escritorio, excludedSourceIds, filaDe, hilos, leerTarea, loadResult, nuevaSesion, open, paneles, pestanas, project, projectCatalog, proyectoAbierto, refreshFolder, refreshSessions, releerCola, reloadSpaces, sessionId, setError, setFolder, setHablandoCon, setMentionSources, setProject, setProjectReadError, setProyectoAbierto, setSessionId, setVentana, sourceIds, spaces, taskQueues, threads, workspaceActivo, workspaceContext, get restoreDraftConfiguration() { return restoreDraftConfiguration; }, get restoreSessionConfiguration() { return restoreSessionConfiguration; } });
  /** Una tarea nueva con la carpeta y el agente ya elegidos. */
  function abrirBorradorDeAgente(enProyecto: string, name: string) {
    setHablandoCon({ project: enProyecto, name });
    irAlBlanco(enProyecto);
    // El borrador tampoco arranca a ciegas: si ya declaró con qué
    // prefiere trabajar, la caja en blanco lo trae puesto en vez del
    // último agente que se usó en cualquier otra conversación.
    void invoke<Record<string, AgentProfileData>>("list_agent_profiles", { project: enProyecto })
      .then((perfiles) => {
        const sigue = hablandoCon();
        if (sigue?.project !== enProyecto || sigue.name !== name) return;
        const perfil = perfiles[name];
        if (!perfil) return;
        composer.useProfile(perfil);
      })
      .catch(() => {});
  }

  /**
   * Qué perfil se pide abrir desde el riel. Lo consume la celda que acaba
   * teniendo delante a ese agente: su conversación se abre antes, y sin esta
   * espera el perfil se pediría a una celda que todavía enseña otra cosa.
   */
  const [requestedProfile, setRequestedProfile] = createSignal<{
    project: string;
    name: string;
  } | null>(null);

  /** Ajustes → Proyectos usa las carpetas y las acciones del riel. Un solo objeto: la hoja no se remonta. */
  const proyectosEnAjustes: ContextoDeProyectos = {
    get projects() {
      return proyectosDelRiel();
    },
    onAdd: () => setAnadiendoCarpeta(true),
    onRename: (id, name) => void renombrarProyecto(id, name),
    onDelete: (id) => void borrarProyecto(id),
    get onRemoveFromSpace() {
      return multipleSpaces() ? removeFromActiveSpace : undefined;
    },
    activeTasks: (id) => taskCountOf({ id, sessions: 0 }, tareasActivas()),
    hiddenInPicker: (id) => ocultosAqui().has(id),
    onSetHiddenInPicker: (id, hide) => ocultarDelSelector(id, hide),
    onOpenMaterial: (id) => {
      cerrarAjustes();
      setMaterialPedido(id);
      abrirProyecto(id);
    },
  };

  function cerrarAjustes() {
    setSettings(null);
    setCuentasTocadas((n) => n + 1);
    // Conectar una cuenta, pegar una clave o activar los gratuitos
    // ocurre ahí dentro, y es justo lo que decide qué ofrece el menú del
    // chat. Sin esto habría que reabrir la app para verlo.
    void composer.refreshSurfaces(false);
  }

  function openAgentProfile(enProyecto: string, name: string) {
    setRequestedProfile({ project: enProyecto, name });
    hablarConEncargado(enProyecto, name);
  }

  /**
   * Una carpeta con tareas en varias máquinas se parte en un grupo por máquina
   * en el riel: lo que se empieza desde un grupo corre en la suya (`""` es esta).
   */
  function enLaMaquinaDelGrupo(machine: string | undefined) {
    if (machine !== undefined) setRunOn(workspaceActivo(), machine || null);
  }

  function nuevaSesion(enProyecto?: string) {
    // Empezar una tarea es cuando más barato sale enterarse de que el
    // material se movió: si esta tarea va a leer un repositorio, ¿está al
    // día? Se comprueba, no se trae —traer mueve el árbol que otras
    // tareas leen, y esa decisión es de quien mira el aviso.
    window.dispatchEvent(new CustomEvent("harness:tarea-nueva"));
    // Una tarea nueva a secas no es de nadie: si la anterior se abrió desde
    // la fila de un agente, ese nombre no puede arrastrarse hasta esta.
    setHablandoCon(null);
    irAlBlanco(proyectoDeNuevaTarea(enProyecto, carpetaDelEscritorio(project())));
  }

  /**
   * La conversación en blanco: lo que el panel enseña sin tarea abierta.
   * `nuevaSesion` es esto más el aviso de que se va a empezar algo. No es
   * una pestaña de `lib/tabs.ts`: la tira solo la pinta como «Nueva tarea»
   * (`enBorrador`). Su borrador —separado por proyecto— espera hasta el
   * primer turno.
   */
  function irAlBlanco(enProyecto = project()) {
    const delante = paneles.activeTabAt(paneles.activeSite());
    batch(() => {
      if (delante !== null) setAntesDelBorrador(delante);
      setProject(enProyecto);
      setProyectoAbierto(null);
      pestanas.activate(null);
    // Y la ventana también se queda sin pestaña delante: `pestanas` y
    // `paneles` llevan la cuenta por separado. Sin esto, la ventana
    // seguía enseñando la conversación anterior bajo la pantalla en blanco.
      paneles.showDraft();
      setSessionId(null);
      restoreDraftConfiguration();
      composer.startNewDraft();
      setFolder(null);
    // Lo que la tarea que se deja ya lee es suyo; el borrador de la
    // conversación en blanco es el suyo y no se toca.
      drafts.replaceAttached([]);
      soltarCola();
      // El hilo sin id es el del primer turno. Si Rust lo negó, se quedaba
      // pintado en toda tarea nueva, de este proyecto o de otro.
      if (!arrancando()) soltarHilo("");
    });
    pedirElCampo();
  }

  function closeActiveTab() {
    if (settings() !== null || alta()) return;
    const id = pestanaActiva();
    if (id) cerrarPestana(id);
    else if (enBorrador(paneles.activeSite())) cerrarBorrador(paneles.activeSite());
  }

  /**
   * Cerrar una pestaña no cierra la sesión: la quita de la tira y suelta
   * su borrador. Su turno, si sigue corriendo, sigue corriendo —Rust no
   * sabe de pestañas—; si era la activa pasa a la vecina y sin vecinas,
   * al blanco: el reparto de un navegador.
   */
  function cerrarPestana(id: string) {
    cerrarPestanas([id]);
  }

  /**
   * Varias a la vez, desde el menú de la tira: una escritura y una vecina. Si en
   * lo que se va hay un archivo sin guardar, primero se pregunta.
   */
  function cerrarPestanas(ids: string[]) {
    const sinGuardar = pestanas.dirtyTabsToClose(ids);
    if (sinGuardar.length > 0) {
      setCierreSinGuardar({ ids, archivos: sinGuardar.map((a) => a.ruta), sucios: sinGuardar.map((a) => a.id) });
      return;
    }
    cerrarPestanasYa(ids);
  }

  /** Lo que la tira tenía sin guardar cuando alguien pidió cerrar. */
  const [cierreSinGuardar, setCierreSinGuardar] = createSignal<
    { ids: string[]; archivos: string[]; sucios: string[] } | null
  >(null);

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

  const [deleteTarget, setDeleteTarget] = createSignal<DeleteTarget | null>(null);

  const [deletingEditors, setDeletingEditors] = createSignal<{ workspace: string | null; ids: string[] } | null>(null);
  const editorDeletionLocked = (id: string) => deletingEditors()?.workspace === workspaceActivo() && deletingEditors()?.ids.includes(id) === true;

  function deleteTask(project: string, id: string, members?: number) {
    // One deletion at a time: its preview and consent belong to the task that started it.
    if (deleteTarget()) return;
    const machine = deLaTarea(id)?.headers["x-terminus-machine"] ?? machines().find(item => item.local || item.active)?.id;
    const target = machines().find(item => item.id === machine);
    const folderNames = new Map(projectList().map(folder => [folder.id, folder.name]));
    setDeleteTarget({
      machineName: machine ? machineName(machine) : t("shell.machines.this_computer"),
      folderName: folder => folderNames.get(folder) || folder || t("shell.sidebar.view.no_folder"),
      project, id, workspace: workspaceActivo(), members,
      supported: target?.features?.includes("task_lifecycle_v1") === true,
      options: opcionesDeLaTarea(id, workspaceActivo()),
      panelId: task => machine ? senderTaskId(machine, task) : task,
    });
  }

  function deletedTaskMembers(members: { project: string; id: string }[]) {
    const view = proyectoAbierto();
    const ids = members.map(member => member.id);
    const activeRemoved = ids.includes(sessionId() ?? "");
    const tabIds = pestanas.open().filter(tab => ids.includes(tab.id) || ids.includes(tab.session)).map(tab => tab.id);
    const neighbor = pestanas.closeMany(tabIds);
    paneles.sync(pestanas.open().map(tab => tab.id));
    for (const id of ids) {
      soltarHilo(id);
      drafts.drop(id);
      olvidarPestana(id);
      archivosDeTarea.forget(id);
    }
    if (activeRemoved) {
      if (!view && neighbor) void activarPestana(neighbor);
      else { irAlBlanco(); setProyectoAbierto(view); }
    }
    void refreshSessions([...new Set(members.map(member => member.project))]);
  }

  function dirtyTaskFiles(id: string): string[] {
    const tabIds = pestanas.open().filter(tab => tab.id === id || tab.session === id).map(tab => tab.id);
    const tabs = pestanas.dirtyTabsToClose(tabIds).map(tab => tab.ruta);
    const panel = archivosDeTarea.panel(id);
    return [...new Set([...tabs, ...panel.tabs.filter(tab => panel.dirty.includes(tab.id)).map(tab => tab.path)])];
  }

  /**
   * Mueve una tarea a otro proyecto, o la saca de todos. Si es la que
   * está abierta se cambia también el proyecto en pantalla: el
   * siguiente turno se guarda donde ahora vive la tarea.
   */
  async function moverSesion(de: string, id: string, a: string) {
    try {
      await invoke("move_session", { project: de, id, to: a }, deLaTarea(id));
      if (id === sessionId()) setProject(a);
      pestanas.moveToProject(id, a);
      void refreshSessions([de, a]);
      await projectCatalog.changed();
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  /**
   * Marca en qué etapa está una tarea, o le quita la marca con `null`.
   * Se ve al instante (`retocarFila`), pero lo que queda es lo que relee
   * del disco: con dos ventanas sobre el mismo workspace, la que no marcó
   * se enteraría tarde o nunca si solo se tocara la memoria.
   */
  async function etaparSesion(
    proyecto: string,
    id: string,
    etapa: Etapa | null,
  ) {
    try {
      await retocarFila(proyecto, id, { stage: etapa }, () =>
        invoke("set_session_stage", { project: proyecto, id, stage: etapa }, deLaTarea(id)));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  /**
   * Cambia una fila en pantalla ya y la escribe detrás (`retoques`). Después
   * relee solo su carpeta: releer todas esperaba a la más lenta, y otra máquina
   * apagada o lejos retrasaba lo que acababa de cambiar aquí. Si el motor lo
   * rechaza, la fila vuelve a como estaba y el error sube a quien llamó.
   */
  async function retocarFila(proyecto: string, id: string, cambio: Partial<SessionRow>, escribir: () => Promise<unknown>) {
    const n = ++ultimoRetoque;
    setRetoques((rs) => ({ ...rs, [id]: { cambio: { ...rs[id]?.cambio, ...cambio }, n } }));
    // Solo el suyo: un segundo clic sobre la misma fila mientras vuelve el primero manda.
    const soltar = () => setRetoques((rs) => {
      if (rs[id]?.n !== n) return rs;
      const { [id]: _, ...resto } = rs;
      return resto;
    });
    try {
      await escribir();
    } catch (e) {
      soltar();
      throw e;
    }
    await refreshSessions([proyecto]);
    soltar();
  }

  async function fijarSesion(proyecto: string, id: string, pinned: boolean) {
    await retocarFila(proyecto, id, { pinned }, () =>
      invoke("set_session_pinned", { project: proyecto, id, pinned }, deLaTarea(id)));
  }

  /**
   * Le cambia el nombre a una tarea. Relee la lista, igual que
   * `etaparSesion`, y de paso llega a las pestañas
   * (`pestanasEnPantalla`): sin releer, la abierta seguiría rotulada con
   * el nombre viejo hasta el siguiente arranque.
   */
  async function renombrarSesion(proyecto: string, id: string, title: string) {
    try {
      await retocarFila(proyecto, id, { title: title.trim() }, () =>
        invoke("rename_session", { project: proyecto, id, title }, deLaTarea(id)));
      return true;
    } catch (e) {
      setError(prosaDe(e));
      return false;
    }
  }

  /**
   * Una fuente que entra a la tarea. No escribe en disco: lo pendiente viaja
   * con el turno, y `send_message` lo suma a la tarea. El agente la lee por
   * `--add-dir`; dónde escribe es la carpeta de trabajo del proyecto.
   */
  const adjuntarFuente = async (id: string) => {
    drafts.addSource(id);
    // `harness:sources` y no `harness:workspace`: aquel cierra la
    // conversación abierta; adjuntar material a mitad de una tarea no muda de
    // cliente.
    window.dispatchEvent(new CustomEvent("harness:sources"));
  };

  /**
   * Quitar una fuente de esta tarea: deja de ofrecerse de aquí en adelante.
   * No deshace lo que el agente ya leyó: el control
   * dice «quitar», no «olvidar».
   */
  const quitarFuente = async (id: string) => {
    drafts.removeSource(id);
    const sid = sessionId();
    if (!sid) return;
    try {
      await invoke("detach_session_source", {
        project: project(),
        session: sid,
        source: id,
      }, deLaTarea(sid));
    } catch (e) {
      threads.appendPersisted(sid, [{
                  role: "system",
                  text: t("chat.scope.source.remove_failed", { error: prosaDe(e) }),
                  meta: "fallo",
                }]);
    }
  };

  function taskMaterialOptions() {
    if (capabilities().nativeWindow && !capabilities().remoteCreate) return { headers: {} };
    const sid = sessionId();
    const row = sid ? filaDe(sid) : null;
    const named = sid ? machines().find((m) => sid.startsWith(`${m.id}~`))?.id : null;
    if (sid && !row && !named) return undefined;
    const chosen = sid ? undefined : draftOptions();
    const machine = row?.machine ?? named ?? machines().find((m) => m.local || m.active)?.id;
    return chosen ?? (machine ? { headers: { "x-terminus-machine": machine } } : undefined);
  }

  const materialTarget = () => `${workspaceActivo()}:${workspaceContext.generation()}:${sessionId()}:${claveAbierta()}:${JSON.stringify(taskMaterialOptions())}`;
  let taskSourcesRequest = 0;
  createEffect(on(() => ({
    target: materialTarget(),
    retry: readRevision(),
    workspace: workspaceActivo(),
    options: taskMaterialOptions(),
    ready: !sessionId() || !!taskMaterialOptions(),
    single: (!capabilities().remoteCreate && capabilities().nativeWindow) || machines().length === 1,
    confirmed: contextConfirmed(),
    catalog: sources(),
  }), ({ workspace, options, ready, single, confirmed, catalog }) => {
    const request = ++taskSourcesRequest;
    setTaskSources(null);
    setTaskSourcesError(null);
    if (!workspace || !ready) return;
    if (single) {
      if (confirmed) setTaskSources(catalog);
      return;
    }
    if (!options) return;
    void invoke<Source[]>("list_sources", {}, options).then((listed) => {
      if (request === taskSourcesRequest) setTaskSources(listed);
    }).catch((e) => {
      if (request === taskSourcesRequest) setTaskSourcesError(prosaDe(e));
    });
  }));

  /**
   * Cambiar la rama de una fuente sustituyéndola: su identidad incluye la
   * rama (`context::repo_identity`), otra rama es otra fuente. La nueva entra
   * antes de que salga la anterior: un fallo de `add_repo_url` deja las dos,
   * y se ve.
   */
  const cambiarRama = async (fuente: Source, rama: string) => {
    if (fuente.kind !== "git" || fuente.branch === rama) return;
    const target = materialTarget();
    if (sessionId() && !taskMaterialOptions()) throw { what: t("projects.context.task_unavailable") };
    const machine = sessionId() ? filaDe(sessionId()!)?.machine : null;
    const options = machine ? { headers: { "x-terminus-machine": machine } } : taskMaterialOptions();
    const nueva = await invoke<{ id: string }>("add_repo_url", {
      cloneUrl: fuente.location,
      branch: rama,
    }, options);
    if (target !== materialTarget()) throw { what: t("projects.context.target_changed") };
    await adjuntarFuente(nueva.id);
    if (target !== materialTarget()) throw { what: t("projects.context.target_changed") };
    await quitarFuente(fuente.id);
    window.dispatchEvent(new CustomEvent("harness:sources"));
  };

  /**
   * Abrir un artefacto es abrir una pestaña del centro, con su propio
   * visor (`ArtifactViewer.tsx`). Llega por aquí lo que el hilo anunció
   * y la conversación exportada: lo que la tarea produjo, nunca un adjunto.
   */
  function abrirArtefacto(
    rel: string,
    path: string,
    kind: ArtifactTab["kind"] = "output",
    codigo = false,
  ) {
    const id = sessionId();
    if (!id) return;
    pestanas.openContent({
      clase: "artefacto",
      id: artifactTabId({ session: id, rel }),
      project: project(),
      session: id,
      rel,
      path,
      kind,
      ...(codigo ? { codigo } : {}),
    });
  }

  /**
   * Un archivo por su ruta absoluta. Dentro de un repositorio de la tarea abre
   * en su árbol, donde se escribe; fuera de todo árbol, en una tarea de código
   * se lee en la vista de código y en una documental como documento.
   */
  async function abrirRuta(path: string, rel = path.replaceAll("\\", "/")) {
    const id = sessionId();
    if (!id) return;
    const arboles = await arbolesDe(project(), id).catch(() => []);
    // Abrir después del await en otra tarea pondría esta ruta, editable, en el repositorio de aquella.
    if (sessionId() !== id) return;
    const dentro = ubicar(arboles, path);
    if (dentro && esDeCodigo(dentro.arbol.kind)) {
      return abrirArchivo(dentro.arbol.key, dentro.rel, false);
    }
    const f = folder();
    const enLaTarea = Boolean(dentro) || (f !== null && contiene(f, path));
    abrirArtefacto(
      rel,
      path,
      enLaTarea ? "output" : "external",
      !dentro && arboles.some((a) => esDeCodigo(a.kind)),
    );
  }

  /**
   * Un archivo del árbol de código, en su pestaña del centro. Sin tarea aún lo
   * mismo: la pestaña lee el commit base y el primer turno la reata
   * (`lib/tabs.ts`). Un archivo no se enseña de dos maneras según cuándo se
   * abra.
   */
  function abrirArchivo(arbol: string, ruta: string, cambiado: boolean) {
    const tarea = sessionId();
    if (tarea) { archivosDeTarea.open(tarea, { tree: arbol, path: ruta, changes: cambiado }); return; }
    const proyecto = project();
    const id = sessionId() ?? "";
    if (!proyecto && !id) return;
    pestanas.openContent({
      clase: "archivo",
      id: fileTabId({ project: proyecto, session: id, arbol, ruta }),
      project: proyecto,
      session: id,
      arbol,
      ruta,
      cambiado,
      ...(id ? {} : { base: draftBases()[claveAbierta()] }),
    });
  }

  function archivoMovido(session: string, arbol: string, desde: string, hasta: string) {
    archivosDeTarea.renamed(session, arbol, desde, hasta);
    paneles.renameTabs(pestanas.renameFiles(session, arbol, desde, hasta));
  }

  function archivoBorrado(session: string, arbol: string, ruta: string) {
    archivosDeTarea.removed(session, arbol, ruta);
    const fuera = pestanas
      .open()
      .filter(
        (p) =>
          p.clase === "archivo" &&
          p.session === session &&
          p.arbol === arbol &&
          (p.ruta === ruta || p.ruta.startsWith(`${ruta}/`)),
      );
    for (const p of fuera) cerrarPestana(p.id);
  }

  /**
   * Los archivos que se miraban antes del primer turno pasan a la tarea que ese
   * turno creó. La clave del árbol no se adivina: se pide, y es una
   * (`development::list_task_trees`).
   */
  async function reatarVistaPrevia(proyecto: string, session: string) {
    const sueltas = pestanas
      .open()
      .some((p) => p.clase === "archivo" && p.session === "" && p.project === proyecto);
    if (!sueltas) return;
    try {
      const arboles = await invoke<ArbolEnTarea[]>("list_task_trees", {
        project: proyecto,
        session,
      }, deLaTarea(session));
      const arbol = arboles[0]?.key;
      if (!arbol) return;
      paneles.renameTabs(pestanas.attachPreviewFiles(proyecto, session, arbol));
    } catch {
      // Sin clave de árbol las pestañas se quedan en el commit del que nació la
      // copia: enseñan el archivo, no un error.
    }
  }

  /**
   * El servidor que levantó una tarea, pestaña más del centro. Se abre
   * la tarea primero: `pestanas.abrir` mete la de contenido detrás de
   * las de su tarea, o dejaría un hueco al cerrarla (`lib/tabs.ts`).
   * El puerto puede ser de una tarea no abierta: pasa por `abrirSesion`.
   */

  /**
   * Un enlace, en una pestaña de esta ventana. Dos entradas y un solo
   * camino: el clic en un enlace del chat (evento `harness:abrir-sitio`)
   * y el guarda de navegación (`lib.rs` · `sitio-pedido`) —así el
   * «abrir enlace» del menú nativo acaba en el mismo sitio que un clic.
   */

  /**
   * Un sitio cuelga de una tarea (`lib/tabs.ts`): se cuelga de la que
   * esté delante. Sin ninguna se entrega al navegador del sistema: un
   * enlace que no hace nada se lee como que la app está rota.
   */
  async function abrirEnlace(url: string) {
    // `activa()` es el id, no la pestaña: se busca en las abiertas.
    const p = pestanas.open().find((x) => x.id === pestanas.active());
    // Delante hay un navegador suelto: no hay tarea de la que colgarlo, así
    // que va a otra pestaña de navegador.
    if (p?.clase === "sitio" && p.navegador) return abrirNavegador(url);
    if (p) return void abrirSitio(url, p.project, p.session);
    await invoke("open_external", { target: url }).catch(() => {});
  }

  /**
   * Una pestaña de navegador suelta, la del «+» de la tira. Sin dirección
   * abre vacía, con la barra lista para teclear (`features/sites/Site.tsx`).
   */
  function abrirNavegador(url = "") {
    setProyectoAbierto(null);
    pestanas.openContent({
      clase: "sitio",
      id: browserTabId(),
      project: "",
      session: "",
      url,
      navegador: true,
    });
  }

  /**
   * Las carpetas que ofrece el «+» de la tira: las del riel de este espacio.
   * Se calcula aquí y no con `proyectosDelRiel`, que se declara después de
   * la cabecera que lo usa.
   */
  const carpetasDelMas = () =>
    carpetasDelEscritorio(projectList(), activeSpace(), sesiones()).map((p) => ({
      id: p.id,
      name: p.name,
    }));

  const botonDeNuevaPestana = () => (
    <NewTabButton
      projects={carpetasDelMas()}
      onNewTask={(id) => nuevaSesion(id)}
      onBrowser={() => abrirNavegador()}
    />
  );

  async function abrirSitio(url: string, proyecto: string, session: string) {
    await abrirSesion(proyecto, session);
    const p: SiteTab = {
      clase: "sitio",
      id: siteTabId({ session, url }),
      project: proyecto,
      session,
      url,
    };
    pestanas.openContent(p);
  }

  /**
   * Abrir lo que el hilo anunció, por su ruta. La absoluta se arma con la
   * carpeta de hoy y no se guarda en la transcripción: la carpeta de datos
   * se mueve, y una ruta escrita envejece sin avisar. Sin carpeta se abre
   * la columna en vez de un error.
   */
  function abrirPorRel(rel: string) {
    const f = folder();
    if (!f) {
      return;
    }
    // El separador es el de la carpeta: `rel` viaja con barras normales.
    const sep = f.includes("\\") ? "\\" : "/";
    void abrirRuta(f + sep + rel.split("/").join(sep), rel);
  }

  /** El árbol recuenta por `harness:copia`, como al guardar un archivo desde su pestaña. */
  async function exportarChat(id: string, proyecto: string) {
    try {
      const salida = await invoke<ChatExportado>("export_chat", { project: proyecto, id }, deLaTarea(id));
      abrirArtefacto(salida.rel, salida.path);
      window.dispatchEvent(new CustomEvent("harness:copia"));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  async function forkDesde(turno: string, mode: "full" | "focused", encargado: string | null) {
    const workspace = workspaceActivo();
    const id = sessionId();
    const proyecto = project();
    if (!id) return;
    const context = await invoke<{
      path: string; last_prompt: string; last_reply: string;
      sources: string[]; excluded_sources: string[];
    }>("prepare_session_continuation", { project: proyecto, id, turno }, deLaTarea(id))
      .catch((e) => { throw prosaDe(e); });
    if (workspace !== workspaceActivo() || id !== sessionId() || proyecto !== project()) return;
    const prompt = mode === "full"
      ? t("chat.continuation.full_prompt", { path: context.path })
      : t("chat.continuation.focused_prompt", {
          path: context.path, prompt: context.last_prompt, reply: context.last_reply,
        });
    const machine = machineOf(id)?.headers["x-terminus-machine"] ?? maquinaDeLaVentana();
    setRunOn(workspace, machine);
    // Con agente, el borrador es el suyo, como al pulsar su fila en el riel:
    // la tarea nace con él y con el proveedor y modelo de su perfil.
    if (encargado) abrirBorradorDeAgente(proyecto, encargado);
    else nuevaSesion(proyecto);
    drafts.continueFrom(prompt, context.path, context.sources, context.excluded_sources);
  }

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

  const Conversacion = () => (
    <section class="relative flex h-full min-h-0 flex-col overflow-hidden">
      {/* Sin línea divisora y sin rótulo de sección: arriba va DE QUÉ es esta
          conversación y el único control que abre algo. El selector de agente no
          vive aquí: con qué agente corre un mensaje se decide al escribirlo. */}

      {/* El mismo eje que la cabecera del historial —el del semáforo,
          ver `lib/window.ts`— y con su hueco cuando la esquina superior
          izquierda es suya: al colapsar el historial a ancho cero, esta
          fila lleva el conmutador para traerlo de vuelta. Antes flotaba
          con `position: absolute`, sin compartir eje con nada. */}
      <Show when={paneles.isSplit()}>
      <div
        ref={cabeceraDeConversacion}
        class={cn("tab-veil flex shrink-0 items-center gap-3 pr-4",
          HEADER_HEIGHT,
          "pl-4",
        )}
        data-tauri-drag-region=""
        onDblClick={toggleMaximizeFromHeader}
      >
        <div ref={controlesIzquierdos} class="relative z-40 flex shrink-0 items-center gap-3">
        </div>
        {/* Las pestañas, donde estaba el título de la conversación: con
            una se ve como el título de siempre; con varias, las tareas
            a mano. El historial de la izquierda sigue siendo el
            historial entero; esto son las abiertas. Con el split, las
            de abajo llevan su tira en la cuadrícula, sin pagar una
            fila propia. */}

        {/* Sin partir hay una sola ventana y una sola tira. Su envoltorio y
            el «+» quedan fuera del `For`, que vuelve a montar la tira al
            abrir una tarea: así el «+» no cuesta nodos en cada apertura. */}
        {/* Partida, las tiras se alinean por las pistas reales de las
            ventanas: `pistas(anchosEnPantalla())`, igual que `Paneles`. */}
        <Show when={paneles.isSplit()}>
          <div
            class="pointer-events-none absolute inset-0 z-30 grid"
            style={{ "grid-template-columns": gridTracks(anchosEnPantalla()) }}
          >
            <For each={ventanas().filter((sitio) => sitio.fila === 0)}>
              {(sitio) => (
                <div
                  class="pointer-events-auto flex h-[30px] min-w-0 items-center px-2"
                  style={{
                    "grid-column": `${sitio.col * 2 + 1}`,
                    "padding-left":
                      sitio.col === 0
                        ? `${Math.max(8, reservaIzquierdaDeTiras())}px`
                        : undefined,
                    "padding-right":
                      sitio.col === anchosEnPantalla().length - 1
                        ? `${Math.max(8, reservaDerechaDeTiras())}px`
                        : undefined,
                  }}
                  data-tira=""
                  data-ventana={`${sitio.col},${sitio.fila}`}
                  onPointerDown={() => mandarVentana(sitio)}
                >
                  <TabStrip
                    session={filaDe}
                    tabs={pestanasDe(sitio)}
                  pinnedIds={pestanas.pinned()}
                  onPin={pestanas.pin}
                    activeId={pestanaDelanteEn(sitio)}
                    draftLabel={enBorrador(sitio) ? t("projects.tabs.draft") : undefined}
                    onCloseDraft={vueltaDelBorrador(sitio) !== null ? () => cerrarBorrador(sitio) : undefined}
                    liveIds={vivas()}
                    approvingIds={permissions().map((p) => p.session)}
                    waitingIds={preguntadas()}
                    onPick={(id) => {
                      const p = pestanas.open().find((x) => x.id === id);
                      if (p) void activarPestana(p);
                    }}
                    onClose={cerrarPestana}
                    dirtyIds={pestanas.dirty()}
                    onCloseMany={cerrarPestanas}
                    canReopen={pestanas.canReopen()}
                    onReopen={reabrirPestana}
                    onDrag={arrastrarPestana}
                    dropIndex={marcaDe(sitio)}
                  />
                  {botonDeNuevaPestana()}
                  <span class="flex-1" />
                  <Show when={pestanas.open().find(p => p.id === paneles.activeTabAt(sitio))?.clase !== "tarea"}>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-6 shrink-0 text-neutral-500"
                    disabled={!puedeSepararseDe(sitio)}
                    onClick={() => partirVentana(sitio)}
                    aria-label={nombreDeSeparar(sitio)}
                    title={nombreDeSeparar(sitio)}
                  >
                    <Columns2 size={14} />
                  </Button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
        <div ref={controlesDerechos} class="relative z-40 ml-auto flex shrink-0 items-center gap-3">
        </div>
      </div>
      </Show>


      {/* La columna del árbol de trabajo no reemplaza al chat: lo angosta. La
          vista de proyecto sí, y es la única cosa que lo hace: es lo que
          ocupa el panel cuando lo que se está mirando no es una conversación. */}

      {/* La conversación se esconde, no se desmonta, cuando hay un documento
          delante: un archivo y un artefacto son pestañas del mismo sitio que
          las tareas y ocupan este hueco; volver a la conversación devuelve
          el hilo donde iba y lo escrito sin mandar. Desmontarla tiraría las
          dos cosas. */}

      {/* Esa misma propiedad sostiene la cuadrícula: separar una pestaña no
          mueve estos nodos a otro padre, les asigna una celda con
          `grid-column`/`grid-row` dentro de la misma cuadrícula
          (`features/shell/Panels.tsx`). Cambia dónde se pinta cada uno y
          cuál está escondido, no quién lo pintó. */}
      <Paneles
        anchos={anchosEnPantalla()}
        altos={altosEnPantalla()}
        filasPorColumna={filasEnPantalla()}
        minimoAncho={MIN_PANEL_WIDTH}
        minimoAlto={MIN_PANEL_HEIGHT}
        etiquetaAncho={t("projects.split.divider")}
        etiquetaAlto={t("projects.split.divider_rows")}
        onRepartirAncho={paneles.resizeColumns}
        onRepartirAlto={paneles.resizeRows}
      >
      <Index each={ventanas()}>{site => {
        const task = () => pestanas.open().find(p => p.id === paneles.activeTabAt(site()) && p.clase === "tarea");
        const target = () => threadSearchTargets().get(task()?.session ?? "");
        // La ventana activa responde con lo elegido en el composer; las demás, con el agente de su tarea.
        const agenteDeLaVentana = () => sameSite(site(), paneles.activeSite())
          ? agent()
          : (filaDe(task()?.session ?? "")?.agent ?? agent());
        const idDePanel = () => task()?.session || (carpetaDelProyecto() ? llaveDeBorrador(project()) : "");
        const herramientas = () => <ThreadSearch conversation={task()?.session ?? ""} active={sameSite(site(), paneles.activeSite()) && settings() === null && !alta()}
              disabled={!task()?.session}
              open={muestra(task()?.session ?? "", "search")}
              messages={target()?.messages() ?? []} thread={() => target()?.thread()}
              onJump={block => target()?.jump(block)}
              onMove={delta => target()?.move(delta)}
              onToggle={() => { const id = task()?.session; if (id) archivosDeTarea.present(id, "search"); }}
              onShow={() => { const id = task()?.session; if (id && !muestra(id, "search")) archivosDeTarea.present(id, "search"); }}
              onClose={() => { const id = task()?.session; if (id) archivosDeTarea.setOpen(id, false); }}
              onSurface={(id, surface) => setSearchSurfaces(previous => {
                if (surface) return new Map(previous).set(id, surface);
                if (!previous.has(id)) return previous;
                const next = new Map(previous);
                next.delete(id);
                return next;
              })}
              tools={<>
                <Show when={delegatedPanels().get(`${workspaceActivo()}/${task()?.session ?? ""}`)} fallback={<DelegatedNone />}>
                  {(read) => <DelegatedToolbar model={read()()} pressed={muestra(task()?.session ?? "", "delegated")} onClick={() => { const id = task()?.session; if (id) archivosDeTarea.present(id, "delegated"); }} />}
                </Show>
                <UsageTool usage={consumo} agent={agenteDeLaVentana()} pressed={muestra(idDePanel(), "usage")} onToggle={() => { const id = idDePanel(); if (id) archivosDeTarea.present(id, "usage"); }} />
                <Show when={task()?.session} fallback={<Show when={!paginaDeAgente()}>{botonDelArbol()}</Show>}>
                  {botonDeArchivos(() => task()?.session ?? "")}
                </Show>
              </>} />;
        // Centrada con la fila de máquina, proyecto y rama de la tarea (`TaskLocation`).
        // La tarea nueva (ventana sin pestaña) lleva la misma barra, con lo que aún no tiene apagado;
        // la página de un agente también es una ventana sin pestaña, y no es una tarea.
        return <Show when={(Boolean(task()) || (paneles.activeTabAt(site()) === null && !paginaDeAgente())) && !tapadoPorElProyecto(site())}>
          <div class="z-20 min-w-0 max-w-full self-start justify-self-end pt-2 pr-3" style={estiloDeLaCelda(site())}
            classList={{ "mt-[30px]": llevaTiraInterior(site()) }} onPointerDown={() => mandarVentana(site())}>
            {herramientas()}
          </div>
        </Show>;
      }}</Index>

      {/* Aquí solo viven las tiras de las filas inferiores: la primera usa
          la cabecera del chasis, que una fila inferior no comparte. Va
          encima de su celda con `align-self: start` y no en un contenedor
          propio: meter tira y contenido en un mismo padre por ventana los
          sacaría del padre común que arrastrar un visor necesita
          (`features/shell/Panels.tsx`). */}

      {/* Partir vive un nivel por debajo de las pestañas, a la derecha de
          su ventana, como en un terminal: pertenece al panel que va a
          partir, no a una fila compartida donde un botón único no diría
          cuál. Flota sobre la esquina (`self-start justify-self-end`) en
          vez de ocupar una fila propia de 30 px que separaría las
          pestañas del texto. */}

      {/* El icono son dos columnas y no una flecha: es una forma, no un
          movimiento. No es un conmutador —sin `aria-pressed`—: la vuelta
          atrás es cerrar la última pestaña de la ventana. */}
      <For each={ventanas().filter((sitio) => sitio.fila > 0 && pestanas.open().find(p => p.id === paneles.activeTabAt(sitio))?.clase !== "tarea")}>
        {(sitio) => (
          <div
            class="z-20 flex self-start justify-self-end p-1"
            style={estiloDeLaCelda(sitio)}
          >
            <Button
              variant="ghost"
              size="icon"
              class="size-6 text-neutral-500"
              disabled={!puedeSepararseDe(sitio)}
              onClick={() => partirVentana(sitio)}
              aria-label={nombreDeSeparar(sitio)}
              title={nombreDeSeparar(sitio)}
            >
              <Columns2 size={14} />
            </Button>
          </div>
        )}
      </For>

      <Show when={paneles.isSplit()}>
        <For each={ventanas().filter((sitio) => sitio.fila > 0)}>
          {(sitio) => (
            <div
              class="tab-veil z-30 flex h-[30px] min-w-0 items-center self-start px-2"
              style={estiloDeLaCelda(sitio)}
              // Cómo la encuentra el arrastre: `ventanaBajo` pregunta al
              // documento por estos dos atributos, que es lo que hace que soltar
              // valga tanto aquí como en el cuerpo del cuadrante.
              data-tira=""
              data-ventana={`${sitio.col},${sitio.fila}`}
              // Pulsar en cualquier sitio de la tira pone su ventana al mando,
              // aunque no se pulse una pestaña. Es lo que hace que la caja y la
              // columna derecha sigan al clic y no solo al cambio de pestaña.
              onPointerDown={() => mandarVentana(sitio)}
            >
              <TabStrip
                session={filaDe}
                tabs={pestanasDe(sitio)}
                  pinnedIds={pestanas.pinned()}
                  onPin={pestanas.pin}
                activeId={pestanaDelanteEn(sitio)}
                draftLabel={enBorrador(sitio) ? t("projects.tabs.draft") : undefined}
                onCloseDraft={vueltaDelBorrador(sitio) !== null ? () => cerrarBorrador(sitio) : undefined}
                liveIds={vivas()}
                approvingIds={permissions().map((p) => p.session)}
                waitingIds={preguntadas()}
                onPick={(id) => {
                  const p = pestanas.open().find((x) => x.id === id);
                  if (p) void activarPestana(p);
                }}
                onClose={cerrarPestana}
                dirtyIds={pestanas.dirty()}
                onCloseMany={cerrarPestanas}
                canReopen={pestanas.canReopen()}
                onReopen={reabrirPestana}
                onDrag={arrastrarPestana}
                dropIndex={marcaDe(sitio)}
              />
            </div>
          )}
        </For>
      </Show>

      {/* La pestaña que se está llevando, pegada al cursor: sin ella el
          gesto no dice que lleve nada. El arrastre nativo del navegador
          pinta este fantasma solo; el nuestro es por puntero
          (`arrastrarPestana`) y hay que pintarlo aquí, no en la tira, que
          no sabe dónde acabó el cursor. */}
      <DragOverlay
        dragging={arrastrando() !== null}
        cursor={cursor()}
        title={tituloDePestana(arrastrando()!)}
        split={paneles.isSplit()}
        hasDestination={donde() !== null}
        targetStyle={estiloDeLaCelda(donde()!.sitio)}
        side={dropSide()}
      />

      {/* Una conversación por tarea abierta, no por ventana: la clave es la
          tarea. Arrastrarla a otra ventana solo le cambia la celda —no se
          desmonta, no se vuelve a pedir el hilo, no se pierde lo escrito sin
          mandar. Con una por ventana, arrastrar costaría las tres cosas. */}

      {/* Se lee y no se escribe salvo en la activa (`PanelDeChat` ·
          `soloLectura`): la caja de escritura es una sola y vive donde está
          el mando, evitando que dos cajas manden con el agente y el modelo
          que eligió una (`lib/panels.ts`). */}
      <For each={tareasEnVentanas()}>
        {(p) => {
          const sitio = () => paneles.siteOf(p.id);
          /** Se ve si su ventana la tiene delante y esa ventana se pinta. */
          const celda = () => celdaDe(p.id);
          const placement = createMemo<ReturnType<typeof celda>>(previous => celda() ?? previous);
          const manda = () => sameSite(sitio(), paneles.activeSite())
            && celda() !== undefined && !tapadoPorElProyecto(sitio());
          return (
            <div
              class="flex min-h-0 min-w-0 flex-col"
              classList={{
                hidden: celda() === undefined || tapadoPorElProyecto(sitio()),
                "pt-8": llevaTiraInterior(sitio()),
              }}
              style={placement()}
              data-ventana={
                sitio() ? `${sitio()!.col},${sitio()!.fila}` : undefined
              }
              onPointerDown={() => {
                const d = sitio();
                if (d) mandarVentana(d);
              }}
            >
              <Show when={montadas().has(p.id)}>
                <PanelDeChat
                  sesion={p.session}
                  proyecto={proyectoDePestana(p.id)}
                  soloLectura={!manda()}
                />
              </Show>
            </div>
          );
        }}
      </For>

      {/* The files card of each open task: a sibling of its chat, kept mounted while the chat is not. */}
      <For each={tareasEnVentanas()}>
        {(p) => {
          const sitio = () => paneles.siteOf(p.id);
          const celda = () => celdaDe(p.id);
          const placement = createMemo<ReturnType<typeof celda>>(previous => celda() ?? previous);
          const panel = () => archivosDeTarea.panel(p.session);
          const [usado, setUsado] = createSignal(false);
          createEffect(() => { if (panel().open) setUsado(true); });
          const cubre = () => panel().expanded || paneles.isSplit() || compacta();
          const visible = () => panel().open && celda() !== undefined && !tapadoPorElProyecto(sitio());
          const ancho = () => (cubre() ? undefined : taskFilesWidth(panel().tabs.length > 0, anchoDeArchivos(), anchoDelArbol()));
          return (
            <Show when={usado()}>
              {/* The padding clears the location row (8 px of air plus the 30 px box)
                  instead of covering it: only the card takes the pointer. */}
              <div class={cn("pointer-events-none z-10 flex min-h-0 min-w-0 justify-self-end pr-2 pb-2 *:pointer-events-auto", BELOW_LOCATION)}
                classList={{ hidden: !visible(), "w-full pl-2": cubre(), "mt-[30px]": llevaTiraInterior(sitio()), "transition-[width] duration-200 ease-out": !moviendoHueco() }}
                style={{ ...placement(), width: ancho() }}
                onPointerDown={() => { const d = sitio(); if (d) mandarVentana(d); }}>
                <TaskSideShell mode={panel().mode} side={<TaskSide mode={panel().mode}
                  searchSlot={searchSurfaces().get(p.session) ? <SearchPanel surface={searchSurfaces().get(p.session)!} /> : undefined}
                  usageSlot={<UsagePanel usage={consumo} agent={sameSite(paneles.siteOf(p.id) ?? null, paneles.activeSite()) ? agent() : (filaDe(p.session)?.agent ?? agent())} onManage={() => { archivosDeTarea.setOpen(p.session, false); setSettings("proveedores-ia"); }} />}
                  delegatedSlot={
                    <Show when={delegatedPanels().get(`${workspaceActivo()}/${p.session}`)?.()} fallback={<p class="m-0 px-3 py-3 text-xs text-neutral-500">{t("chat.delegation.none")}</p>}>
                      <DelegatedPanel model={() => delegatedPanels().get(`${workspaceActivo()}/${p.session}`)?.()} />
                    </Show>
                  } />}>
                  <Suspense fallback={null}>
                    <TaskFilesCard visores={visoresDeCodigo} project={proyectoDePestana(p.id)} session={p.session} files={archivosDeTarea}
                      visible={visible()} readOnly={editorDeletionLocked(p.session)}
                      expandedOnly={paneles.isSplit() || compacta()}
                      onSaved={() => window.dispatchEvent(new CustomEvent("harness:copia"))}
                      onExportChat={() => exportarChat(p.session, proyectoDePestana(p.id))}
                      onMoved={archivoMovido} onRemoved={archivoBorrado} />
                  </Suspense>
                </TaskSideShell>
              </div>
            </Show>
          );
        }}
      </For>

      {/* Toda ventana enseña algo: su pestaña de delante, o la conversación
          en blanco. La vista de proyecto ocupa la activa; una ventana sin
          pestaña delante pinta el blanco en su propia celda. */}

      {/* El blanco es de la celda, no de la ventana activa: `paneles.blanquear()`
          deja la ventana con sus pestañas y sin ninguna delante, y la celda
          hace la pregunta —no una señal global— para que enfocar otra
          ventana no se lleve el blanco con ella. */}

      {/* Dos ventanas en blanco del mismo proyecto comparten borrador y solo
          escribe la que manda. Proyectos distintos conservan borradores
          distintos. */}

      {/* El `For` de arriba pinta una conversación por tarea abierta: sin
          tareas no pinta ninguna. Sin este bloque, cerrar la última pestaña
          deja la ventana en negro sin que `tsc` lo detecte. */}
      <Show when={proyectoDeLaVista()}>
        {(p) => (
          <div
            class="flex min-h-0 min-w-0 flex-col"
            classList={{ "pt-8": llevaTiraInterior(paneles.activeSite()) }}
            style={estiloDeLaCelda(paneles.activeSite())}
            data-ventana={`${paneles.activeSite().col},${paneles.activeSite().fila}`}
          >
            <Suspense fallback={<div class="flex flex-1 items-center justify-center text-sm text-neutral-500" role="status">{t("projects.view.opening")}</div>}>
            <VistaDeProyecto material={materialDeProyecto}
              proyecto={p()}
              materialPedido={materialPedido() === p().id}
              onMaterialVisto={() => setMaterialPedido(null)}
              workspace={workspaceActivo()}
              modelos={modelosParaAgentes()} createFreeRouterConsent={createFreeRouterConsent}
              sources={sources()}
              agents={agents()}
              sessions={sesionesConEstado()[p().id] ?? []}
              current={sessionId()}
              vivas={vivas()}
              aprobando={permissions().map((x) => x.session)}
              destinos={projectList()
                .filter((x) => x.id !== p().id)
                .map((x) => ({ id: x.id, name: x.name }))}
              onNueva={() => nuevaSesion(p().id)}
              onAbrir={(id) => void abrirSesion(p().id, id)}
              onHablarCon={(name) => hablarConEncargado(p().id, name)}
              onDelete={(id, members) => void deleteTask(p().id, id, members)}
              onMove={(id, a) => void moverSesion(p().id, id, a)}
              onEtapa={(id, etapa) => void etaparSesion(p().id, id, etapa)}
              onPin={(id, pinned) => fijarSesion(p().id, id, pinned)}
              onRenombrar={(id, title) =>
                void renombrarSesion(p().id, id, title)
              }
              onAdjuntar={(source) => adjuntarAlProyecto(p().id, source)}
              onQuitar={(source) => quitarDelProyecto(p().id, source)}
              onCarpetaEditable={(dir) => carpetaEditable(p().id, dir)}
            />
            </Suspense>
          </div>
        )}
      </Show>

      {/* `Index` y no `For`: la lista son sitios, y `sitios()` construye
          objetos nuevos en cada lectura. Con `For` —que compara por
          referencia— activar una pestaña en OTRA ventana volvería a montar
          este blanco, perdiendo foco y punto de inserción del cursor.
          `Index` va por posición y reutiliza el nodo mientras la cuenta de
          ventanas en blanco no cambie. */}
      <Index each={sitiosEnBlanco()}>
        {(sitio) => (
          <div
            class="flex min-h-0 min-w-0 flex-col"
            classList={{ "pt-8": llevaTiraInterior(sitio()) }}
            style={estiloDeLaCelda(sitio())}
            data-ventana={`${sitio().col},${sitio().fila}`}
            onPointerDown={() => mandarVentana(sitio())}
          >
            <PanelDeChat
              sesion={null}
              soloLectura={!sameSite(sitio(), paneles.activeSite())}
            />
          </div>
        )}
      </Index>

      {/* Los archivos base de la carpeta, antes de que exista la tarea: el mismo panel, leído del proyecto. */}
      <Index each={sitiosEnBlanco()}>
        {(sitio) => {
          const llave = () => (carpetaDelProyecto() ? llaveDeBorrador(project()) : "");
          const panel = () => archivosDeTarea.panel(llave());
          const [usado, setUsado] = createSignal(false);
          createEffect(() => { if (llave() && panel().open) setUsado(true); });
          const cubre = () => panel().expanded || paneles.isSplit() || compacta();
          const visible = () => !!llave() && panel().open && !tapadoPorElProyecto(sitio());
          const ancho = () => (cubre() ? undefined : taskFilesWidth(panel().tabs.length > 0, anchoDeArchivos(), anchoDelArbol()));
          return (
            <Show when={usado() && project()}>
              {(proyecto) => (
                <div class={cn("pointer-events-none z-10 flex min-h-0 min-w-0 justify-self-end pr-2 pb-2 *:pointer-events-auto", BELOW_LOCATION)}
                  classList={{ hidden: !visible(), "w-full pl-2": cubre(), "mt-[30px]": llevaTiraInterior(sitio()), "transition-[width] duration-200 ease-out": !moviendoHueco() }}
                  style={{ ...estiloDeLaCelda(sitio()), width: ancho() }}
                  onPointerDown={() => mandarVentana(sitio())}>
                  <TaskSideShell mode={panel().mode} side={<TaskSide mode={panel().mode}
                    searchSlot={undefined}
                    usageSlot={<UsagePanel usage={consumo} agent={agent()} onManage={() => { archivosDeTarea.setOpen(llave(), false); setSettings("proveedores-ia"); }} />}
                    delegatedSlot={<p class="m-0 px-3 py-3 text-xs text-neutral-500">{t("chat.delegation.none")}</p>} />}>
                    <Suspense fallback={null}>
                      <TaskFilesCard visores={visoresDeCodigo} project={proyecto()} session="" panelKey={llave()} preview={{ baseRef: draftBases()[claveAbierta()] }}
                        files={archivosDeTarea} visible={visible()}
                        expandedOnly={paneles.isSplit() || compacta()}
                        onSaved={() => {}} onExportChat={async () => {}}
                        onMoved={() => {}} onRemoved={() => {}} />
                    </Suspense>
                  </TaskSideShell>
                </div>
              )}
            </Show>
          );
        }}
      </Index>

      {/* Cada documento queda montado, escondido cuando no es el que se
          está mirando: cambiar de pestaña y volver no vuelve a pedir el
          archivo, no pierde qué vista se había elegido ni el borrador sin
          guardar. */}

      {/* Se montan todos, no solo los de la tarea abierta: la tira es una,
          y activar el archivo de otra tarea abre esa tarea detrás
          (`activarPestana`); su visor sigue vivo mientras su pestaña
          exista. */}
      <For each={idsDeContenido()}>
        {(id) => {
          const p = () => pestanas.open().find((x) => x.id === id) ?? null;
          /**
           * En qué panel se enseña este documento, `-1` si en ninguno. No es
           * `id === pestanaActiva()`: con un solo panel son lo mismo, pero con
           * la pantalla partida un documento del panel de al lado se ve sin
           * ser la activa, y esa pregunta lo dejaría escondido.
           */
          const celda = () => celdaDe(id);
          const visible = () => celda() !== undefined;
          return (
            <Show when={p()}>
              {(abierta) => (
                <div
                  class="min-h-0 min-w-0 overflow-y-auto"
                  classList={{
                    hidden: !visible() || tapadoPorElProyecto(paneles.siteOf(id)),
                    "pt-8": llevaTiraInterior(paneles.siteOf(id)),
                  }}
                  style={celda()}
                  data-ventana={(() => {
                    const d = paneles.siteOf(id);
                    return d ? `${d.col},${d.fila}` : undefined;
                  })()}
                  onPointerDown={() => {
                    const d = paneles.siteOf(id);
                    if (d) mandarVentana(d);
                  }}
                >
                  {/* `Switch` y no dos `Show` anidados: con tres clases,
                      el `fallback` de un `Show` deja de significar «la otra»
                      y pasa a significar «alguna de las otras dos». Aquí
                      cada clase se nombra. */}
                  <Switch>
                    {/* El estrechamiento va en el `when`, no dentro del
                        hijo: aquí el cuerpo corre una vez y lo que decide qué
                        se pinta es la expresión reactiva (`SYSTEM.md` § Las
                        reglas de Solid · 7). Con el `as` dentro del hijo, la
                        rama del archivo se construía también para una pestaña
                        de sitio, con `arbol` y `ruta` en `undefined`. */}
                    <Match
                      when={
                        abierta().clase === "archivo"
                          ? (abierta() as FileTab)
                          : null
                      }
                    >
                      {(a) => (
                        <Suspense fallback={null}><VisorDeArchivo visores={visoresDeCodigo}
                          project={a().project}
                          session={a().session}
                          readOnly={editorDeletionLocked(a().session)}
                          base={a().base}
                          arbol={a().arbol}
                          ruta={a().ruta}
                          cambiado={a().cambiado}
                          visible={visible()}
                          onSucio={(sucio) => pestanas.setDirty(id, sucio)}
                          onGuardador={(guardar) => pestanas.registerSaver(id, guardar)}
                          onBorrado={() => cerrarPestanasYa([id])}
                          onAbrirOtro={(ruta) =>
                            pestanas.openContent({
                              clase: "archivo",
                              id: fileTabId({ project: a().project, session: a().session, arbol: a().arbol, ruta }),
                              project: a().project,
                              session: a().session,
                              arbol: a().arbol,
                              ruta,
                              cambiado: false,
                            })
                          }
                          onGuardado={() => {
                            // Guardar convierte el archivo en uno cambiado: su
                            // pestaña gana la vista de cambios y el árbol
                            // relee su estado, que es de donde la pestaña saca
                            // su letra de git.
                            pestanas.markChanged(id);
                            window.dispatchEvent(
                              new CustomEvent("harness:copia"),
                            );
                          }}
                        /></Suspense>
                      )}
                    </Match>
                    <Match
                      when={
                        abierta().clase === "sitio"
                          ? (abierta() as SiteTab)
                          : null
                      }
                    >
                      {(s) => (
                        <Sitio
                          url={s().url}
                          visible={visible()}
                          navegador={s().navegador}
                          onNavego={(url) => s().navegador && pestanas.navigate(id, url)}
                        />
                      )}
                    </Match>
                    <Match
                      when={
                        abierta().clase === "artefacto"
                          ? (abierta() as ArtifactTab)
                          : null
                      }
                    >
                      {(a) => (
                        <Show
                          when={a().codigo}
                          fallback={<VisorDeArtefacto path={a().path} rel={a().rel} kind={a().kind} session={a().session} renderPdf={renderPdf} renderImage={renderImage} renderTable={renderTable} />}
                        >
                          <Suspense fallback={null}><VisorDeArchivo visores={visoresDeCodigo}
                            project={a().project}
                            session={a().session}
                            arbol=""
                            ruta={a().path}
                            suelto
                            cambiado={false}
                            visible={visible()}
                            onSucio={() => {}}
                            onGuardador={() => {}}
                            onGuardado={() => {}}
                          /></Suspense>
                        </Show>
                      )}
                    </Match>
                  </Switch>
                </div>
              )}
            </Show>
          );
        }}
      </For>

      <Show when={pestanas.open().some((p) => p.id === OBSERVABILITY_TAB_ID)}>
        <div
          class="min-h-0 min-w-0"
          classList={{ hidden: celdaDe(OBSERVABILITY_TAB_ID) === undefined || tapadoPorElProyecto(paneles.siteOf(OBSERVABILITY_TAB_ID)), "pt-8": llevaTiraInterior(paneles.siteOf(OBSERVABILITY_TAB_ID)) }}
          style={celdaDe(OBSERVABILITY_TAB_ID)}
        >
          <Observability onManage={() => setSettings("plugins")} renderSite={(url) => <Sitio url={url} visible />} />
        </div>
      </Show>

      <For each={pestanas.open().filter((p): p is ScreenTab => p.clase === "pantalla")}>
        {(p) => {
          return (
            <div
              class="min-h-0 min-w-0"
              classList={{ hidden: celdaDe(p.id) === undefined || tapadoPorElProyecto(paneles.siteOf(p.id)), "pt-8": llevaTiraInterior(paneles.siteOf(p.id)) }}
              style={celdaDe(p.id)}
            >
              <Suspense fallback={null}><Screen open={() => openMachineScreen(p.machine)} /></Suspense>
            </div>
          );
        }}
      </For>

      </Paneles>

    </section>
  );

  // El riel del escritorio activo. Sin escritorio es el de siempre.
  const proyectosDelRiel = createMemo(() => carpetasDelEscritorio(projectList(), activeSpace(), sesiones()));
  const delegationFamilies = createMemo(() => delegatedFamilies(withRemoteLaunchers(Object.values(sesiones()).flat(), remoteChildScope())));
  const sesionesDelRiel = () => {
    const current = sesionesConEstado();
    const all = Object.values(current).flat();
    const approvals = permissions().map(item => item.session);
    const known = new Map(all.map(row => [row.id, row]));
    const families = delegationFamilies();
    const todas = Object.fromEntries(Object.entries(current).map(([folder, rows]) => [folder, rows.map(row => {
      const children = (families.get(row.id) ?? []).flatMap(id => known.get(id) ?? []);
      return children.length ? { ...row,
        delegated_activity: delegatedAttention([row, ...children], vivas(), approvals) } : row;
    })]));
    const desk = escritorio();
    if (!desk) return todas;
    return Object.fromEntries(Object.entries(todas).map(([k, filas]) => [k, filas.filter((r) => enEscritorio(r, desk))]));
  };
  const opcionesDeMover = () =>
    multipleSpaces() ? spaces().map((i) => ({ id: i.id, name: spaceName(i) })) : [];

  const Principal = () => (
    // UNA superficie continua, no tres tarjetas flotando: las columnas
    // pegan con el chat y se separan con hairline y divisor arrastrable
    // (shells → surfaces → components).

    // Continua no quiere decir de un solo tono: los rieles llevan `bg`
    // y el chat `surface` (`ColumnaLateral`), y lo que la regla prohíbe
    // —hueco, sombra, esquina redondeada— sigue prohibido.

    // Sin cabecera y sin título de app, como Claude: la ventana ya se
    // llama Terminus.
    <div
      class="relative isolate flex h-full flex-col overflow-hidden bg-surface"
      // `.tab-active` repite este fondo dentro de la pestaña para fundirse con su panel.
      style={{
        "--window-image": imagenDeVentana() ? `url("${imagenDeVentana()}")` : "none",
        "--window-veil": String(veloDeVentana()),
      }}
    >
      <CloseGuard title={(id) => filaDe(id)?.title} />
      <ToastStack>
        {/* Aquí y no en Configuración: ahí no entra nadie a buscar
            actualizaciones. El panel de «Estado del entorno» dice lo
            mismo para quien va a mirar; esto es para quien no va a ir. */}
        <AvisoDeVersion />
        {/* Debajo del de versión y con la misma forma: los dos son avisos
            que no interrumpen. Si coinciden, el de versión queda arriba:
            reiniciar afecta a lo que estés haciendo, y traer material no. */}
        <AvisoDeMaterial />
        <AvisoDeCarpeta project={project()} session={sessionId()} />
        <McpSignInNotice session={sessionId()} />
        <Show when={activityNotice()}>{notice => <Toast onDismiss={() => setActivityNotice(null)}>
          <div class="grid min-w-0 flex-1 gap-2">
          <p class="m-0 text-sm font-medium">{notice().title}</p>
          <p class="m-0 text-xs text-neutral-500">{t(`activity.state.${notice().state}`)} · {notice().machine ? machineName(notice().machine!) : t("activity.this_machine")}</p>
          <Button variant="ghost" size="compact" onClick={() => { setActivityMachine(notice().machine ?? null); setSettings("activity"); setActivityNotice(null); }}>{t("activity.view")}</Button>
          </div>
        </Toast>}</Show>
        <TaskNotifier
          attention={attention.list()}
          workspace={workspaceActivo()}
          inView={(id) =>
            !proyectoAbierto() &&
            (id === sessionId() ||
              ventanas().some((sitio) => {
                const tab = pestanas.open().find((p) => p.id === paneles.activeTabAt(sitio));
                return !!tab && isTaskTab(tab) && tab.session === id;
              }))}
          title={(id) => filaDe(id)?.title}
          open={(project, id) => void abrirSesion(project, id)}
        />
        {/* Una lectura que falló va a la pila y no al riel: encima de «Nueva
            tarea» se quedaba fija tras un gesto fallido. La conexión no tiene
            cruz: se quita sola al volver el motor. */}
        <Show when={startupReadError() ?? draftProjectError() ?? projectReadError() ?? connectionError()}>{failure => {
          const lectura = () => !!(startupReadError() || draftProjectError() || projectReadError());
          return <Toast data-read-status="" onDismiss={lectura() ? () => { setStartupReadError(null); setDraftProjectError(null); setProjectReadError(null); } : undefined}>
            <Show when={lectura()}><p class="m-0 text-xs font-medium text-neutral-950">{t("shell.read.failed")}</p></Show>
            <Show when={!lectura() || failure() !== t("shell.service.failed")}><p class="m-0 break-words text-xs text-neutral-500">{failure()}</p></Show>
            <Show when={lectura()}><div><Button variant="outline" size="compact" onClick={() => {
              setReadRevision(n => n + 1);
              if (startupReadError()) void retryStartupRead();
              else if (!draftProjectError()) void recargarMaterial();
            }}>{t("common.part.retry")}</Button></div></Show>
          </Toast>;
        }}</Show>
        {/* El error del último gesto, y no caduca solo: uno que se va a los
            segundos no se llega a leer. Lo quita su cruz o el cambio de
            workspace. */}
        <Show when={errorVisible()}>
          {(e) => (
            <Toast data-toast-error="" tone="error" onDismiss={() => setError(null)}>
              <p class="m-0 break-words text-xs text-error-strong">{e()}</p>
            </Toast>
          )}
        </Show>
        <Show when={aviso()}>
          {(a) => (
            <Toast data-space-toast="" onDismiss={() => setAviso(null)}>
              <p class="m-0 break-words text-xs text-neutral-950">{a().texto}</p>
              <Show when={a().ir}>
                {(ir) => (
                  <div>
                    <Button variant="outline" size="compact" onClick={() => { setAviso(null); ir()(); }}>
                      {a().boton}
                    </Button>
                  </div>
                )}
              </Show>
            </Toast>
          )}
        </Show>
      </ToastStack>

      <Show when={spaces().find((i) => i.id === deletingSpace())}>
        {(i) => (
          <DeleteSpace
            space={i()}
            proyectos={projectList()}
            onCerrar={() => setDeletingSpace(null)}
            onAbrir={(folder, task) => {
              setDeletingSpace(null);
              void abrirSesion(folder, task);
            }}
            onEliminada={(n) => spaceDeleted(i(), n)}
            onTocadas={(folders) => void refreshSessions(folders)}
          />
        )}
      </Show>

      <Show when={deleteTarget()}>{target => (
        <DeleteTaskDialog target={target()} dirty={dirtyTaskFiles}
          prepare={async ids => { for (const id of ids) await apagarVistasDe(id); }}
          isCurrent={() => target().workspace === workspaceActivo()}
          lock={ids => setDeletingEditors(ids.length ? { workspace: target().workspace, ids } : null)}
          onDeleted={members => { if (target().workspace === workspaceActivo()) deletedTaskMembers(members); }}
          onClose={() => setDeleteTarget(null)} />
      )}</Show>

      <Show when={cierreSinGuardar()}>{(c) => (
        <UnsavedCloseDialog
          files={c().archivos}
          onCancel={() => setCierreSinGuardar(null)}
          onDiscard={() => void resolverCierre("descartar")}
          onSave={() => void resolverCierre("guardar")}
        />
      )}</Show>

      {/* El traspaso de proveedor se confirma una vez y se guarda como
          intento: viaja en el turno siguiente, no al elegir el modelo. */}
      <Show when={traspasoPendiente()}>{(pedido) => (
        <HandoverDialog
          from={agents().find((a) => a.id === pedido().desde)?.label ?? pedido().desde}
          to={agents().find((a) => a.id === pedido().opcion.agent)?.label ?? pedido().opcion.agent}
          onCancel={() => setTraspasoPendiente(null)}
          onConfirm={confirmarTraspaso}
        />
      )}</Show>

      {/* Sin workspace no hay carpeta donde escribir: aquí sí se tapa
          todo, riel incluido. Es la única pantalla que lo hace —el
          estado vacío de contexto se puede usar; esto no tiene dónde
          guardar nada. */}
      <Show
        when={!alta()}
        fallback={
          <Suspense fallback={null}>
            <Onboarding
              /* Por el mismo evento que usa el selector de workspace: quien acaba
                 de crear el primero no tiene por qué saber cómo se recarga esta
                 pantalla. */
              onListo={() => {
                setAlta(false);
                window.dispatchEvent(new CustomEvent("harness:workspace"));
              }}
            />
          </Suspense>
        }
      >
        {/* El chasis se monta SIEMPRE, tenga o no fuente de contexto:
            detrás de `contextRoot`, un workspace recién creado no tenía
            riel lateral ni forma de escribir hasta señalar una carpeta,
            y eso contradecía el modelo —un proyecto dejó de ser un
            repo. */}

        {/* Las dos columnas son hermanas de ancho propio y usan
            `ColumnaLateral`, que documenta sus límites. */}
        <TitleBarSection
          border={bordeDeLaBarra()}
          sidebarCollapsed={sidebar.colapsado()}
          onToggleSidebar={sidebar.alternar}
          spaceMenu={<Show when={spaces().length > 0}>
            <SpaceMenu
              workspace={workspaceActual()?.name ?? ""}
              spaces={spaces()}
              activa={escritorio()}
              proyectos={projectList()}
              senal={(id) => senalDe(id)}
              onElegir={cambiarEscritorio}
              onCrear={createSpace}
              onRenombrar={renameSpace}
              onEliminar={(id) => setDeletingSpace(id)}
            />
          </Show>}
          sidebarExtra={capabilities().sidebarExtra?.()}
          searchOpen={buscando() !== null}
          onSearch={() => setBuscando("all")}
          onAddProject={() => setAnadiendoCarpeta(true)}
          filter={sidebarFilter()}
          tabs={tiraDeLaVentana()}
        />
        <GlobalSearch
          open={buscando()}
          onClose={() => setBuscando(null)}
          tasks={buscando() === null ? [] : flattenTasks(sesionesDelRiel(), true)}
          folders={proyectosDelRiel()}
          projects={projectList()}
          spaces={spaces()}
          onOpenTask={(p, id) => { setHablandoCon(null); void abrirSesion(p, id); }}
          onOpenFolder={abrirProyecto}
          onNewTask={(id) => nuevaSesion(id)}
        />
        {/* El velo del marco cubre la columna y el hueco alrededor de la caja: un solo tono también en la esquina. */}
        <div class="tab-veil window-frame relative flex min-h-0 flex-1 overflow-visible">
          <WorkspaceColumn
            attention={attention.list()}
            onManage={() => setSettings("workspaces")}
            onSettings={(panel) => setSettings(panel ?? "")}
            onReportarBug={() => setInput(t("chat.composer.bug_report_starter"))}
            tools={<>
            <ConexionesMenu triggerClass="size-8 rounded-md" onManage={() => setSettings("mcp")} />
            <AppTools
              workspace={workspaceActivo()}
              busy={busy()}
              onAbrirSitio={(url, proyecto, session) => void abrirSitio(url, proyecto, session)}
              onObservability={abrirObservabilidad}
              trabajando={vivas()}
              conPestana={sesionesConPestana()}
              onAbrirTarea={(proyecto, session) => void abrirSesion(proyecto, session)}
              lookup={(session) => {
                for (const [id, rows] of Object.entries(sesiones())) {
                  const row = rows.find((r) => r.id === session);
                  if (row) return { title: row.title, project: projectList().find((p) => p.id === id)?.name };
                }
                return undefined;
              }}
            />
            </>}
          />
          {/* La superficie: barra, ventana y panel derecho, una caja redondeada que flota sobre el marco. */}
          <div class="relative mr-1 mb-1 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[10px] bg-surface" data-surface="">
          {/* Los topes los pone quien monta: el ancho por debajo del
              cual algo deja de caber solo lo sabe su contenido. Por
              debajo de 220 los títulos del historial dejan de caber; por
              encima de 420 la barra empieza a comer la conversación. */}
          <ColumnaLateral
            lado="left"
            colapsada={sidebar.colapsado()}
            clave="sidebar.width"
            ancho={260}
            min={220}
            max={420}
            etiqueta={t("shell.column.sidebar_width")}
          >
            <div class="relative h-full min-h-0 w-full min-w-0">
            {/* Las otras máquinas se ven por el relay, que es de pago: si la flota lo
                detuvo por la licencia, el aviso de Terminus (el pago vive en la web). */}
            <Show when={capabilities().machinesLicense?.() === "license_required" && !sidebar.colapsado()}>
              <div class="absolute inset-x-2 bottom-2 z-10 rounded-md border border-border bg-surface-raised p-3 shadow-sm" data-machines-license="">
                <MachinesLicense onRetry={() => capabilities().retryMachines?.()} />
              </div>
            </Show>
            <div
              class="flex h-full min-h-0 w-full min-w-0 flex-col"
              ref={(el) => createEffect(() => el.toggleAttribute("inert", enCache()))}
              aria-busy={enCache() || undefined}
              data-shell-cache={enCache() ? "" : undefined}
            >
            <div class="min-h-0 flex-1">
            <Sidebar
              projects={proyectosDelRiel()}
              modelos={modelosParaAgentes()} createFreeRouterConsent={createFreeRouterConsent}
              sessions={sesionesDelRiel()}
              viewKey={sidebarViewKey(workspaceActivo(), escritorio())}
              filterRef={(filter, released) => setSidebarFilter((actual) => filter ?? (actual === released ? null : actual))}
              onHablarCon={hablarConEncargado}
              onAgentProfile={openAgentProfile}
              escritorio={activeSpace() ? spaceName(activeSpace()) : null}
              spaces={opcionesDeMover()}
              onMoveToSpace={(p, id, i) => void moveToSpace(p, id, i)}
              onBringHere={(p, id) => void abrirTraer(p, id)}
              onCarryFolder={machines().length > 1 ? (id, machine) => void abrirLlevarCarpeta(id, machine) : undefined}
              current={sessionId()}
              vivas={vivas()}
        /* Qué tareas esperan que apruebes algo, aparte de `vivas`: pesa
           más, una que trabaja no necesita nada de ti, y una parada
           esperando tu aprobación no avanza hasta que vayas. */
        aprobando={permissions().map((p) => p.session)}
              collapsed={sidebar.colapsado()}
              onToggle={sidebar.alternar}
              draggedTask={arrastrando()}
              dragFolder={tabDrag.destination()?.folder}
              onDrag={arrastrarTarea}
              onPick={(p, id) => {
                // Abrir una tarea suelta la marca del agente: su fila no
                // puede seguir señalada cuando ya se mira otra cosa.
                setHablandoCon(null);
                void abrirSesion(p, id);
              }}
              onNew={() => nuevaSesion()}
              onRenombrarProyecto={(id, name) =>
                void renombrarProyecto(id, name)
              }
              onBorrarProyecto={borrarProyecto}
              onRemoveFromSpace={multipleSpaces() ? removeFromActiveSpace : undefined}
              clon={clonEnCurso()}
              onAbrirClon={() => setAnadiendoCarpeta(true)}
              proyectoAbierto={proyectoAbierto()}
              carpetaDelBorrador={!proyectoAbierto() && pestanaActiva() === null && !sessionId() && !hablandoCon() ? project() || null : null}
              onAbrirProyecto={(id, machine) => { abrirProyecto(id); enLaMaquinaDelGrupo(machine); }}
              /* El proyecto viaja en el mismo gesto que abre el borrador. */
              onNuevaTareaEn={(id, machine) => { nuevaSesion(id); enLaMaquinaDelGrupo(machine); }}
              onDelete={(p, id, members) => deleteTask(p, id, members)}
              onMove={(p, id, a) => void moverSesion(p, id, a)}
              onEtapa={(p, id, etapa) => void etaparSesion(p, id, etapa)}
              onPin={fijarSesion}
              onRenombrar={(p, id, title) =>
                renombrarSesion(p, id, title)
              }
              onSettings={(panel) => setSettings(panel ?? "")}
            />
            </div>
            </div>
            </div>
          </ColumnaLateral>

          {/* 30rem es lo que cabe en la caja sin partir el modelo ni el modo.
              Las columnas laterales encogen mil veces más rápido, hasta su
              mínimo; un factor menor que 1 aquí dejaría desbordar la fila. */}
          <div ref={medirBordeDeLaBarra} class={"min-h-0 min-w-0 flex-[1_1_30rem] overflow-hidden work-background"} data-conversacion>
            <Conversacion />
          </div>

          </div>
        </div>
      </Show>


      <AnadirCarpeta machines={machines} runOn={runOn} machineName={machineName}
        abierto={anadiendoCarpeta()}
        workspace={workspaceActivo()}
        space={escritorio()}
        inicio={inicioDeCarpeta()}
        onClon={setClonEnCurso}
        onCerrar={() => batch(() => {
          setAnadiendoCarpeta(false);
          setInicioDeCarpeta(null);
        })}
        onHecho={async (p, activate) => {
          await projectCatalog.changed();
          // El backend ya la fijó en el escritorio desde el que se pidió: un
          // clon en segundo plano termina cuando la ventana puede mirar otro.
          await reloadSpaces();
          // Se sigue en «Nueva tarea» dentro de ella; su página queda a un clic en su nombre.
          if (activate) nuevaSesion(p.id);
        }}
      />

      <Show when={hojaDeLlevar()} keyed>
        {(hoja) => (
          <Suspense fallback={null}>
            <CarrySheet
              check={hoja.check}
              busy={hoja.busy}
              onCancel={() => setHojaDeLlevar(null)}
              onConfirm={(choice, state) => {
                const { key, check } = hoja;
                const mod = carryModule();
                mod?.planCarry(key, check, mod.jobFor(check, choice), state);
                setHojaDeLlevar(null);
                if (check.task) {
                  despuesDeTraer.set(key, choice.next);
                  void traer(key);
                } else if (claveAbierta() === key) void mandar(archivos());
              }}
            />
          </Suspense>
        )}
      </Show>

      {/* El nombre del workspace ya no se deduce de la ruta: lo lee el propio
          menú de la cabecera, que es quien sabe cuál está activo. */}

      <Show when={settings() !== null}>
        <Suspense fallback={null}>
          <Settings
            workspace={workspaceActivo()}
            activityMachine={activityMachine()}
            panel={settings() || undefined}
            modelos={modelosParaAgentes()}
            proyecto={proyectoAbierto() ?? project()}
            agentesEnUso={agentesEnUso()}
            onClose={cerrarAjustes}
            proyectos={proyectosEnAjustes} avisoReparacion={(p) => <Suspense fallback={null}><FuncionesAfectadas {...p} /></Suspense>} integraciones={(p) => <Suspense fallback={null}><Integraciones {...p} /></Suspense>}
            onAgentProfile={(enProyecto, name) => {
              cerrarAjustes();
              openAgentProfile(enProyecto, name);
            }}
          />
        </Suspense>
      </Show>
    </div>
  );

  // **La ventana que no puede abrir estos datos no pinta la app,
  // la sustituye.** Un aviso encima dejaría debajo una app usable sobre la
  // carpeta que se acaba de negar a tocar. Ver `PantallaDeBloqueo`.
  return (
    <Show when={bloqueo()} fallback={<Principal />}>
      {(b) => <PantallaDeBloqueo frase={b()} />}
    </Show>
  );
}
