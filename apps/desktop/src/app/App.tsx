import type { DeleteTarget } from "../features/projects/DeleteTaskDialog";
import type { HandlerTarget } from "../features/settings/HandlerPolicy";
import { deliver, type JournalEvent, listen } from "../lib/serviceEvents";
import { open } from "@tauri-apps/plugin-dialog";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Columns2 from "lucide-solid/icons/columns-2";
import FolderOpen from "lucide-solid/icons/folder-open";
import FolderPlus from "lucide-solid/icons/folder-plus";
import PanelLeftClose from "lucide-solid/icons/panel-left-close";
import PanelLeftOpen from "lucide-solid/icons/panel-left-open";
import Search from "lucide-solid/icons/search";
import {
  batch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Index,
  type JSX,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Suspense,
  Switch,
  lazy,
  untrack,
} from "solid-js";
import VisorDeArtefacto from "../features/artifacts/ArtifactViewer";
import type { Preview } from "../features/artifacts/Preview";
import Chat, {
  type Author,
  type Msg,
  type PermissionRequest,
  type VistaDeLaConversacion,
  vistaNueva,
} from "../features/chat/Chat";
import McpSignInNotice, { noteMcpSignIn } from "../features/chat/McpSignInNotice";
import type { Encolado } from "../features/chat/MessageQueue";
import {
  MODO_AUTOMATICO,
  modoInicial,
  modoRecordado,
  recordarModo,
} from "../features/chat/modes";
import { DelegatedLaunch, DelegatedNone, DelegatedToolbar, delegatedAttention, delegatedDescendants, delegatedFamilies, type DelegatedListProps, type DelegatedPanelModel } from "../features/chat/DelegatedTasks";
import PreviousAgentChat from "../features/chat/PreviousAgentChat";
import type { AlmacenDePreguntas, PreguntasAMedias, Respuesta, RespuestaEnviada } from "../features/chat/Questions";
import { contestaALaTerminal, despachable, ENTREGA_SIN_CONFIRMAR, esDeLaTerminal, guardable, inyectable, type RazonDeRetencion, retencionAlCargar, siguienteLote, sueltaElBorrador } from "../features/chat/queue";
import type { ComandoEnVivo } from "../features/chat/ShellCard";
import { comandoDeTerminal } from "../features/chat/terminalIndent";
import type { AlMargen } from "../features/chat/SideQuestion";
import { comandoEscrito } from "../features/chat/slashOutput";
import { ThreadSearch, type SearchSurface, type ThreadSearchTarget } from "../features/chat/ThreadSearch";
import TranscriptSource from "../features/chat/TranscriptSource";
import type { Lectura } from "../features/chat/threadWindow";
import { lotesDeDeltas } from "../features/chat/deltaFrames";
import { hasOlder, hasRecentGap, HistoryPager, type OlderState } from "../features/chat/history";
import { agentSwitchBlocked, canHandOverTask, handoverInForce, handoverMatches, MACHINE_UNANNOUNCED, shellCli, type HandoverPending, type HandoverState } from "../features/chat/handover";
import {
  anexarDeltas,
  anexarImagen,
  anexarRazonamiento,
  type ChatEvent,
  type ChatExportado,
  clave,
  mcpCallFromName,
  mensajesDelHilo,
  modeloDeSubtarea,
  type PreguntaEvent,
  type Session,
  type SessionEvent,
  type Signatures,
  type TranscriptOrigin,
  type Turn,
  tramoGuardado,
  transcripcion,
} from "../features/chat/transcript";
const VisorDeArchivo = lazy(() => import("../features/code/FileViewer"));
import { avisarDeLosArboles } from "../features/code/refresh";
import { arbolesDe, contiene, ubicar } from "../features/code/treeKind";
import TaskFilesRow, { taskFilesWidth } from "../features/code/TaskFilesRow";
import { TaskSide, TaskSideShell } from "../features/code/TaskSide";
import { moviendoHueco } from "../lib/sites";
const DeleteTaskDialog = lazy(() => import("../features/projects/DeleteTaskDialog"));
const DanilWorkspaceStep = lazy(() => import("../features/shell/DanilWorkspaceStep"));
const HandoverDialog = lazy(() => import("../features/chat/HandoverDialog"));
const TaskFilesCard = lazy(() => import("../features/code/TaskFiles"));
import { createTaskFiles, type TaskSideMode } from "../lib/taskFiles";
import { esDeCodigo } from "../features/code/workdirKind";
import Observability from "../features/observability/Observability";
import AnadirCarpeta, { type ClonEnCurso, type InicioDeCarpeta } from "../features/projects/AddWorkdir";
import AgentPageTasks from "../features/projects/AgentPageTasks";
// Chunk aparte: el perfil completo de un agente solo se carga al abrirlo.
const AgentProfile = retryableLazy(() => import("../features/projects/AgentProfile"));
// El alta solo se abre sin workspace o al agregar otro: no entra en la carga inicial.
const Onboarding = lazy(() => import("../features/onboarding/Onboarding"));
const TaskLocation = lazy(() => import("../features/chat/TaskLocation"));
const CustomizeMenu = lazy(() => import("../features/shell/SidebarFilter").then((m) => ({ default: m.CustomizeMenu })));
const Screen = lazy(() => import("../features/screen/Screen"));
// El aviso de licencia solo se baja si la flota lo pide (trae los textos de Danil).
const MachinesLicense = lazy(() =>
  import("../features/settings/TerminusLicense").then((m) => ({
    default: (props: { onRetry: () => void }) => (
      // En el escritorio, el correo del sistema; en la web, el del navegador.
      <m.TerminusLicense compact onRequest={capabilities().nativeWindow ? m.requestAccessInBrowser : m.requestAccessInPage} onRetry={props.onRetry} />
    ),
  })),
);
import { createdTasks } from "../features/projects/agentPageFilters";
import BaseBranchPicker from "../features/projects/BaseBranchPicker";
import { watchHandlerStatus, watchHandlerStatuses } from "../features/projects/handlerPresence";
import { EmptyContext, ProjectPicker } from "../features/projects/Projects";
import { bringHereLabel, canBringHere, carryOrigin, machineName, machineOf, machineWakes, machines, refetchMachines, remoteChildScope, runOn, senderTaskId, setRunOn, setTaskRowMachine } from "../features/machines/store";
import { launcherOf, withRemoteLaunchers } from "@terminus/tasks";
import type { CarriedBase, CarryCheck } from "../features/machines/carry";
// Chunk aparte: solo lo carga quien crea una tarea, no la carga inicial.
const MachinePicker = lazy(() =>
  import("../features/machines/MachinePicker").then((m) => ({ default: m.MachinePicker })),
);
// Llevar el trabajo a otra máquina: solo al enviar a una que no es la de la carpeta.
const CarrySheet = lazy(() => import("../features/machines/CarrySheet"));
const CarryProgress = lazy(() => import("../features/machines/CarryProgress"));
const CarryOriginLabel = lazy(() =>
  import("../features/machines/CarryProgress").then((m) => ({ default: m.CarryOriginLabel })),
);
type CarryModule = typeof import("../features/machines/carry");
/** Lo que corta un envío cuya copia se detuvo: el fallo y su arreglo quedan en el encabezado. */
const CARRY_STOPPED = Symbol("carry-stopped");
const VistaDeProyecto = lazy(() => import("../features/projects/ProjectView"));
import { DEFAULT_PROFILE, displayName, notifyProfiles, watchProfiles } from "../features/projects/profiles";
import RecentAgentChats from "../features/projects/RecentAgentChats";
import { type SessionRow, threadTitle } from "../features/projects/Sessions";
import TabStrip, { NewTabButton } from "../features/projects/Tabs";
import { createTaskWork, ResumeTask } from "../features/projects/TaskHistory";
import { workLabel } from "../features/projects/branchLabel";
import { mensajeDeFallo } from "../features/chat/failures";
import type { Etapa } from "../features/projects/TaskStage";
import { esChatDeAgente } from "../features/projects/taskTree";
import {
  DEFAULT_PERMISSION_MODE_EVENT,
  type DefaultPermissionModeChange,
} from "../features/settings/DefaultPermissions";
import type { ContextoDeProyectos } from "../features/settings/ManageProjects";
// Configuración solo se abre a pedido: no entra en la carga inicial.
const Settings = lazy(() => import("../features/settings/Settings"));
import { createWorkspaces, type Startup } from "../features/settings/workspaces-store";
import { listaBasta, reconciliar } from "../features/settings/early-startup";
import { createAttention, topState } from "../features/shell/attention";
import TaskNotifier from "../features/shell/TaskNotifier";
const DeleteSpace = lazy(() => import("../features/shell/DeleteSpace"));
import AvisoDeCarpeta from "../features/shell/FolderNotice";
import PantallaDeBloqueo from "../features/shell/LockScreen";
import AvisoDeMaterial from "../features/shell/MaterialNotice";
import Paneles from "../features/shell/Panels";
import Sidebar, { createSidebar } from "../features/shell/Sidebar";
import type { SidebarFilterProps } from "../features/shell/SidebarFilter";
import { sidebarViewKey } from "../lib/sidebarView";
import { recordarCarpetas } from "../lib/folderKinds";
import { lista } from "../lib/format";
import ColumnaLateral from "../features/shell/SideColumn";
import { createSpaceNavigationOrder } from "../lib/space-navigation-order";
import GitHubStar from "../features/shell/GitHubStar";
import TitleBar from "../features/shell/TitleBar";
import GlobalSearch, { type SearchFilter } from "../features/shell/GlobalSearch";
import { flattenTasks } from "../features/shell/sidebarTasks";
import AppTools from "../features/shell/AppTools";
import { ConexionesMenu } from "../features/settings/Tools";
import SpaceMenu from "../features/shell/SpaceMenu";
import UsageTool from "../features/shell/UsageTool";
import { createUsage } from "../features/shell/usage";
import AvisoDeVersion from "../features/shell/VersionNotice";
import CloseGuard from "../features/shell/CloseGuard";
import WorkspaceColumn from "../features/shell/WorkspaceColumn";
import { agentsWorkspace, setAgentsWorkspace, signedInCount } from "../features/shell/workspace-directory";
import Sitio from "../features/sites/Site";
import { VELO_DE_FONDO } from "../lib/chat-background";
import { fondoDeChat, fondoPropio, imagenDelWorkspace, veloDeFondo } from "../lib/chat-background-store";
import { capabilities, openMachineScreen } from "../lib/platform";
import { pedirElCampo } from "../lib/focus";
import { lastRoster, rememberRoster } from "../lib/handlerRoster";
import { aplicarLenguaDeWorkspace, clavesConocidas, t } from "../lib/i18n";
import { attachmentsOn, NotMovable } from "../lib/remoteAttachments";
import { ATTACHMENT_DOCUMENTS_FEATURE, PROVIDER_HANDOFF_FEATURE, SESSION_MODEL_FEATURE } from "@terminus/protocol";
import { invoke } from "../lib/invoke.ts";
import { connected } from "../lib/engineConnection";
import { openChatVisual, readChatVisual } from "../features/chat/readVisual";
import { createPointerDrag } from "../lib/pointer-drag";
import type { InternalTaskLink } from "../lib/links";
import type { MentionSources } from "../lib/mentions";
import type {
  Agent,
  AgentModels,
  AgentProfile as AgentProfileData,
  ArbolEnTarea,
  HandlerDefinition,
  HandlerList,
  HandlerStatusRow,
  ModoDePermiso,
  Project,
  Source,
} from "../lib/model";
import { carpetaDeTrabajo } from "../lib/model";
import { type CatalogosDeModelos, effortAlCambiarDeModelo, type OpcionDeModelo } from "../lib/models";
import { threadPreview } from "../lib/nextSteps";
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
} from "../lib/panels";
import { createPref, escribirPref, leerPref } from "../lib/prefs";
import type { Frase } from "../lib/prose";
import { editDraft, insertMention, insertRecipient, type Recipient, type RecipientCandidate, recipientCandidatesOf, type SenderTask, trimDraft } from "../lib/recipients";
import { conservar, conservarEnOrden, conservarPorClave, sessionRefresh } from "../lib/sessionRefresh";
import { readShellCache, shellCacheWriter } from "../lib/shellCache";
import {
  accionDeAtajo,
  destinoDePestana,
  type NavegacionDePestanas,
  navegacionDePestanas,
  ventanaVecina,
} from "../lib/shortcuts";
import { alHilo, comandosConAlMargen, preguntaAlMargen } from "../lib/side-question";
import type { CliCommand, Skill, SlashMenu } from "../lib/skills";
import {
  carpetasDelEscritorio,
  enEscritorio,
  escritorioDeFila,
  type Space,
  spaceName,
} from "../lib/spaces";
import { type Paso, pasoDe } from "../lib/steps";
import {
  esDe,
  paraElMenu,
  type Superficie,
  superficieDe,
} from "../lib/surfaces";
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
  INBOX_TAB_ID,
  BROADCASTS_TAB_ID,
  OBSERVABILITY_TAB_ID,
  type ScreenTab,
  screenTabId,
  type SiteTab,
  siteTabId,
  spacesWithStoredStrip,
  storedStrip,
  type Tab,
  type TaskTab,
} from "../lib/tabs";
import {
  adjuntosDevueltos,
  adjuntosSinMandar,
  claveDeBorrador,
  esProvisional,
  fuentesHeredadas,
  idProvisional,
  proyectoDeNuevaTarea,
  sameSources,
  tituloProvisional,
  unirFuentes,
} from "../lib/taskDraft";
import { editMentions, type PlaceCandidate, type TaskCandidate, type TaskMention, type TextEdit } from "../lib/taskMentions";
import { aplicarTemaDeTerminal } from "../lib/terminal-themes";
import {
  type SessionUsage,
  type UsageRecord,
  type Ventana,
  ventanaDe,
} from "../lib/usage";
import { cn } from "../lib/utils";
import {
  BELOW_LOCATION,
  LOCATION_BAR,
  createCompactViewport,
  HEADER_HEIGHT,
  isWindows,
  toggleMaximizeFromHeader,
} from "../lib/window";
import { Button } from "../ui/Button";
import { LazyPart, retryableLazy } from "../ui/LazyPart";
import { mergeGates } from "../features/chat/permissionGates";
import { asleep, withLastAnswer } from "../features/machines/lastAnswer";
import { Dialog, DialogContent, DialogTitle } from "../ui/Dialog";
import { asFailure, claveDe, detalleDe, prosaDe } from "../ui/Failure";
import { BotonConAtajo } from "../ui/Shortcut";
import type { ActivityEvent } from "@terminus/protocol";
import { Toast, ToastStack } from "../ui/Toast";
import { apagarVistasDe, hayVistasDe, soltarVistasHuerfanas } from "../features/code/typst";

// Lo que falla en el camino a la ventana y no en el comando: se vuelve a
// preguntar en vez de pintarlo (`cli/service/mod.rs`, `para_la_ventana`).
const TRANSPORTE = new Set([
  "shell.service.unreachable",
  "shell.service.busy",
  "shell.service.version",
]);

/** Un turno que sigue contestando, tal como lo cuenta `turn::list_live_turns`. */
type TerminalLanzada = {
  project: string;
  provider: string;
  model: string | null;
  effort: string | null;
  permission_mode: string | null;
};

/** Lo que devuelve `run_shell_command`: el turno y la tarea donde corrió. */
type Corrida = { session: string; turn: Turn };

/** Un `!` escrito sin tarea, hasta que Rust dice cuál abrió. */
type ComandoQueNace = {
  lanzado: TerminalLanzada;
  provisional: string;
  titulo: string;
  claveBorrador: string;
  generation: number;
  session: string | null;
};

type LiveTurn = {
  session: string;
  workspace: string;
  project: string;
  started_at: number;
  /** El agente ya contestó y el turno solo sigue abierto por una hija. */
  background?: boolean;
  /** Lo que ocupa la tarea es un `!` y no el agente. */
  shell?: { id: string; command: string };
};

// Sin botón todavía: expone `sleep_session` para el gesto «Dormir» que la
// pantalla aún no ofrece.
export async function sleepSession(project: string, session: string) {
  await invoke<void>("sleep_session", { project, session }, machineOf(session));
}

export default function App() {
  /**
   * El alta en curso: un pestillo a propósito, que se enciende cuando no
   * hay workspace y se apaga solo al terminar o cancelar. Derivarlo de
   * «¿hay workspace?» desmontaría el asistente en cuanto el paso 1 crea el
   * primero, antes de pedir proveedores de IA y source control.
   */
  const [alta, setAlta] = createSignal<null | "primera" | "nueva">(null);
  /* El fondo propio del agente de la conversación con el mando: lo publica su
     celda y se pinta detrás del área de trabajo, no solo detrás de su chat. */
  const [fondoDelAgente, setFondoDelAgente] = createSignal<{ url: string; veil?: number } | null>(null);
  // `null` es «este workspace todavía no tiene contexto»; se enseña como un
  // renglón al lado del selector de proyecto, no como una pantalla que lo pida.
  const [contextRoot, setContextRoot] = createSignal<string | null>(null);
  const [contextConfirmed, setContextConfirmed] = createSignal(false);
  let materialRequest = 0;
  function confirmContext(root: string | null, listed: Source[]) {
    root ??= listed.find((source) => source.root)?.id ?? null;
    if (root && !listed.some((source) => source.id === root && !source.missing)) {
      throw { what: t("projects.context.unavailable"), detail: "context_unavailable" };
    }
    setContextRoot(root);
    setContextConfirmed(true);
  }
  /** Con qué modo arranca lo nuevo de este workspace. `null` es el último elegido a mano. */
  const [workspaceMode, setWorkspaceMode] = createSignal<string | null>(null);
  /** Cuál está abierto, para poder descartar lo que emite el turno de otro. */
  const [workspaceActivo, setWorkspaceActivo] = createSignal<string | null>(
    null,
  );
  const attention = createAttention();
  const [draftBases, setDraftBases] = createSignal<Record<string, string>>({});
  const [hablandoCon, setHablandoCon] = createSignal<{ project: string; name: string } | null>(null);
  const [projectList, setProjectRows] = createSignal<Project[]>([]);
  // El riel pinta carpetas con `For`: una nueva en cada relectura remonta sus tareas, y cada una vuelve a pedir su `task_history`.
  const setProjectList = (next: Project[]) => setProjectRows((previous) => conservar(previous, next, (p) => p.id));
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
  const draftMachineOn = () => machines().find(m => m.id === draftMachine())?.on;
  createEffect(on([workspaceActivo, draftMachine, draftMachineOn, projectList], ([workspace, machine, encendida]) => {
    setDraftProjects(previous => previous?.workspace === workspace && previous.machine === machine ? previous : null);
    if (!workspace || !machine || machines().find(m => m.id === machine)?.local) return;
    if (encendida === false) {
      setDraftProjects({ workspace, machine, rows: null });
      return;
    }
    let current = true;
    onCleanup(() => { current = false; });
    void invoke<Project[]>("list_projects", {}, { headers: { "x-terminus-machine": machine } }).then(rows => {
      if (current) setDraftProjects({ workspace, machine, rows: rows.map(row => ({
        ...row, machines: projectList().find(p => p.id === row.id)?.machines ?? [machine],
      })) });
    }).catch(e => {
      if (!current) return;
      // Se apagó entre la lista de máquinas y la pregunta, o la pregunta la está
      // encendiendo: lo mismo que apagada.
      if (asleep(e)) setDraftProjects({ workspace, machine, rows: null });
      else setError(prosaDe(e));
    });
  }));
  createEffect(on(draftMachine, (machine, before) => {
    if (before !== undefined && machine !== before) setDraftBases({});
  }));

  const [taskSources, setTaskSources] = createSignal<Source[] | null>(null);
  const [error, setError] = createSignal<string | null>(null);
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
  const [spacesContext, setSpacesContext] = createSignal<string | null>(null);
  const customization = capabilities().inbox?.customization(() => ({ user: capabilities().inbox?.userId, workspace: workspaceActivo(), space: spacesContext() === workspaceActivo() ? escritorio() : null }), capabilities().inbox?.subscribe) ?? {ready:()=>false,scope:()=>"",selection:()=>({enabled:[],writable:false}),temporary:()=>true,toggle:(_id:string)=>{},enabled:(_id:string)=>false};
  const [sidebarFilter, setSidebarFilter] = createSignal<SidebarFilterProps | null>(null);
  // El nombre del workspace abierto rotula el menú de espacios de la franja.
  const workspacesDeLaFranja = createWorkspaces();
  const workspaceActual = () => workspacesDeLaFranja.actual();
  // Agentes: el workspace abierto o el elegido en el menú que solo tiene agentes. Volver a uno de Terminus lo suelta.
  const workspaceDeAgentes = () => agentsWorkspace() ?? workspaceActivo();
  createEffect(on(() => workspaceActivo(), () => setAgentsWorkspace(null), { defer: true }));
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
  const attentionEntries = () => capabilities().inbox?.entries(customization.selection().enabled) ?? [];
  const activeSpace = () => spaces().find((i) => i.id === escritorio()) ?? null;
  const multipleSpaces = () => spaces().length > 1;
  // El sidebar de la vez anterior, pintado antes del primer IPC e inerte hasta que el motor lo confirma.
  const shellCache = readShellCache();
  const [enCache, setEnCache] = createSignal(shellCache !== null);
  if (shellCache) {
    batch(() => {
      setProjectList(shellCache.projects);
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
    ({ headers: { ...machineOf(id)?.headers, ...(workspace ? { "x-terminus-workspace": workspace } : {}) } });
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
  const tareasEnVentanas = createMemo<(Pick<TaskTab, "id" | "session" | "project"> & { workspace: string | null })[]>((previous) =>
    conservar(previous ?? [], pestanas.open().filter(isTaskTab).map(({ id, session, project }) =>
      ({ id, session, project, workspace: workspaceActivo() })), (p) => p.id),
  );
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
      fuera.forEach(soltarBorrador);
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
    soltarBorrador(id);
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
    setSpacesContext(ws);
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

  // El borrador de cada conversación: lo escrito y lo puesto en la caja que
  // todavía no ha viajado, por conversación y no de la app —cambiar de
  // pestaña no se lleva lo que estabas escribiendo en otra—. La clave es el
  // id de sesión, o el proyecto para la que aún no existe en disco. `archivos`
  // vive aquí y no en `Chat.tsx`: bajarlo lo pierde al cambiar de pestaña.
  type Borrador = {
    input: string;
    task_mentions?: TaskMention[];
    /** A quién va dirigido lo escrito. Lista aparte: no es material del prompt. */
    recipients?: Recipient[];
    mentionHistory?: { text: string; task_mentions?: TaskMention[]; recipients?: Recipient[] }[];
    mentionFuture?: { text: string; task_mentions?: TaskMention[]; recipients?: Recipient[] }[];
    sourceIds: string[];
    excludedSourceIds: string[];
    archivos: string[];
    configuration?: { agent: string; surface: string; model: string; effort: string; mode?: string };
    /**
     * El traspaso confirmado para ESTA tarea: de qué CLI a cuál, todavía sin
     * consumir. Vive aquí y no en `configuration` para no convertirse en
     * preferencia de las tareas nuevas. El `from` delata a otro cliente que
     * cambió el CLI antes del envío.
     */
    provider?: HandoverPending;
  };
  const SIN_BORRADOR: Borrador = {
    input: "",
    sourceIds: [],
    excludedSourceIds: [],
    archivos: [],
  };
  const [borradores, setBorradores] = createSignal<Record<string, Borrador>>({});
  const claveDelHilo = () => sessionId() ?? "";
  const claveAbierta = () => claveDeBorrador(sessionId(), project(), hablandoCon()?.project === project() ? hablandoCon()?.name : null);
  const editarBorrador = (clave: string, fn: (b: Borrador) => Borrador) =>
    setBorradores((bs) => ({ ...bs, [clave]: fn(bs[clave] ?? SIN_BORRADOR) }));
  const soltarBorrador = (clave: string) =>
    setBorradores((bs) => {
      if (!(clave in bs)) return bs;
      const { [clave]: _, ...resto } = bs;
      return resto;
    });
  const borrador = () => borradores()[claveAbierta()] ?? SIN_BORRADOR;
  const input = () => borrador().input;
  const setInput = (v: string, inputType?: string, edit?: TextEdit) =>
    editarBorrador(claveAbierta(), (b) => {
      const history = [...(b.mentionHistory ?? []), { text: b.input, task_mentions: b.task_mentions, recipients: b.recipients }].slice(-100);
      const restored = inputType?.startsWith("history") ? [...history].reverse().find(h => h.text === v) : undefined;
      // Las dos listas se mueven con el mismo gesto: una que se quedara atrás
      // pintaría su etiqueta sobre otro trozo del texto.
      const next = editDraft({ text: b.input, task_mentions: b.task_mentions, recipients: b.recipients }, v, edit);
      return { ...b, input: v, task_mentions: restored?.task_mentions ?? next.task_mentions,
        recipients: restored?.recipients ?? next.recipients, mentionHistory: history, mentionFuture: [] };
    });
  const navigateMentionHistory = (redo: boolean): boolean => {
    const draft = borrador();
    const history = draft.mentionHistory ?? [];
    const future = draft.mentionFuture ?? [];
    if (![...history, ...future, draft].some(item => item.task_mentions?.length || item.recipients?.length)) return false;
    const next = (redo ? future : history).at(-1);
    if (!next) return false;
    const current = { text: draft.input, task_mentions: draft.task_mentions, recipients: draft.recipients };
    editarBorrador(claveAbierta(), b => ({ ...b, input: next.text, task_mentions: next.task_mentions, recipients: next.recipients,
      mentionHistory: redo ? [...history, current] : history.slice(0, -1),
      mentionFuture: redo ? future.slice(0, -1) : [...future, current],
    }));
    return true;
  };
  const sourceIds = createMemo(() => borrador().sourceIds, undefined, {
    equals: sameSources,
  });
  const excludedSourceIds = createMemo(() => borrador().excludedSourceIds, undefined, {
    equals: sameSources,
  });
  const archivos = () => borrador().archivos;
  const setArchivos = (v: string[]) =>
    editarBorrador(claveAbierta(), (b) => ({ ...b, archivos: v }));
  async function agregarArchivos(paths: string[]) {
    const key = claveAbierta();
    const workspace = workspaceActivo();
    // Una imagen pegada ya está en la máquina del turno: su copia se prepara allá.
    const machine = paths.length ? pegadasEn.get(paths[0]) : undefined;
    const opciones = machine && paths.every((p) => pegadasEn.get(p) === machine) ? enMaquina(machine) : undefined;
    const prepared = await invoke<string[]>("prepare_attachments", {
      project: project(),
      paths,
    }, opciones);
    if (machine) for (const path of prepared) adjuntosEn.set(path, machine);
    if (workspace !== workspaceActivo()) return;
    editarBorrador(key, (b) => ({
      ...b,
      archivos: [...new Set([...b.archivos, ...prepared])],
    }));
  }
  // Lo que la tarea YA lee, distinto de lo que está por adjuntarse: los chips
  // de la caja se vacían al mandar, esto es material de la conversación y se
  // queda a la vista mientras dure. Sin esto, adjuntar se veía como mandar un
  // archivo: el chip desaparecía sin dejar nada diciendo que el agente lo
  // está leyendo.
  const [adjuntas, setAdjuntas] = createSignal<string[]>([]);
  const conFuente = (ids: string[]) =>
    ids
      .map((id) => taskSources()?.find((s) => s.id === id))
      .filter((s): s is Source => !!s);
  const idsDelProyecto = createMemo(
    () => projectList().find((p) => p.id === project())?.sources ?? [],
  );
  const heredadas = createMemo(() =>
    fuentesHeredadas(projectList(), project(), excludedSourceIds()),
  );
  const materialPendiente = createMemo(() => conFuente(sourceIds()));
  const contexto = createMemo(() =>
    conFuente(unirFuentes(heredadas(), adjuntas())),
  );

  const [agents, setAgents] = createSignal<Agent[]>([]);
  const [agent, setAgent] = createSignal("claude");
  // Lo que se puede elegir para trabajar. `null` mientras no se ha leído. Es
  // la lista entera, con lo que no se puede usar dentro: quién filtra es cada
  // pantalla, y filtran distinto a propósito (`runtime/surfaces.rs`).
  const [superficies, setSuperficies] = createSignal<Superficie[] | null>(null);
  // Con cuál se está trabajando. No se guarda en la sesión: lo que la tarea
  // persiste es el agente y el modelo, y de ahí se deriva esto al abrirla
  // (`superficies.superficieDe`). Partir la fila de OpenCode en dos no dejó
  // ninguna tarea apuntando a un nombre que ya no existe.
  const [superficie, setSuperficie] = createSignal("");
  // Modelo y razonamiento viven aquí, no dentro de la caja: al reanudar una
  // sesión hay que restaurar con qué corrió, y eso lo sabe quien la carga.
  const [catalogos, setCatalogos] = createSignal<CatalogosDeModelos>({});
  const models = createMemo(() => catalogos()[agent()] ?? null);
  const modelosParaAgentes = createMemo(() => ({
    superficies: superficies() ?? [],
    catalogos: catalogos(),
  }));
  const [model, setModel] = createSignal("");
  const [effort, setEffort] = createSignal("");
  // Cada hilo separa lo persistido de lo que construyen los eventos del turno
  // en curso: si lo propio viviera en `vivo`, releer del disco al volver a
  // una tarea que sigue contestando lo pintaría dos veces, una del disco y
  // otra de la memoria.

  // Un hilo por sesión y no una señal para la abierta: sin eso, lo que
  // contesta una tarea que no se mira no tiene dónde caer, y volver a ella
  // enseña la pregunta sin la respuesta hasta que el turno cierre. Tienen
  // hilo la abierta, las de una pestaña, y las que siguen contestando;
  // cambiar de workspace los suelta todos (`aplicar`).
  // `guardados`: los ids de los turnos que trajo la última lectura (`mensajesDelHilo`).
  type Hilo = { base: Msg[]; vivo: Msg[]; guardados?: ReadonlySet<string> };
  const SIN_HILO: Hilo = { base: [], vivo: [] };
  const workspaceThreads = new Map<string, Record<string, Hilo>>();
  const [hilos, setHilos] = createSignal<Record<string, Hilo>>({});
  // El hilo de la conversación abierta, memo aparte y no derivado en línea:
  // `setHilos` reemplaza el registro entero en cada evento pero conserva por
  // referencia el `Hilo` que no tocó, y un memo sobre el objeto no propaga
  // cuando lo que cambió fue el de otra tarea. Sin él, `msgs` recalculaba con
  // cada delta de cualquier tarea del workspace: la transcripción saltaba al
  // final aunque nada hubiera cambiado aquí.
  const hiloAbierto = createMemo(() => hilos()[claveDelHilo()]);
  const msgs = createMemo<Msg[]>(() => {
    const h = hiloAbierto();
    return h ? mensajesDelHilo(h) : [];
  });
  // De qué tarea se está trayendo la transcripción del disco, si de alguna.
  // `msgs` no distingue «no tiene mensajes» de «todavía no han llegado»:
  // abrir una tarea es síncrono hasta `setSessionId`, y hasta que
  // `load_session` vuelve el chat pinta su estado de conversación nueva.
  // Guarda el id y no un booleano: las aperturas se solapan, y la respuesta
  // tardía de la primera no debe apagar el indicador de la segunda.
  const [cargandoHilo, setCargandoHilo] = createSignal<string | null>(null);
  /** Lo que construyen los eventos del turno en curso. */
  const escribirVivo = (session: string, fn: (vivo: Msg[]) => Msg[], workspace = workspaceActivo()) => {
    if (workspace && workspace !== workspaceActivo()) {
      const threads = workspaceThreads.get(workspace) ?? {};
      const thread = threads[session] ?? SIN_HILO;
      workspaceThreads.set(workspace, { ...threads, [session]: { ...thread, vivo: fn(thread.vivo) } });
      return;
    }
    setHilos((hs) => {
      const h = hs[session] ?? SIN_HILO;
      return { ...hs, [session]: { ...h, vivo: fn(h.vivo) } };
    });
  };
  // Los deltas de un cuadro entran juntos; todo lo demás que toca un hilo vacía antes lo pendiente.
  const deltasPorCuadro = lotesDeDeltas((session, workspace, deltas) =>
    escribirVivo(session, (m) => anexarDeltas(m, deltas), workspace),
  );
  /** Un rechazo del motor como aviso en la conversación de esa tarea. */
  function avisar(sesion: string) {
    return (e: unknown) => anexar(sesion, (m) => [...m, { role: "system", text: prosaDe(e), meta: "aviso" }]);
  }
  const anexar = (session: string, fn: (vivo: Msg[]) => Msg[], workspace = workspaceActivo()) => {
    deltasPorCuadro.vaciar();
    escribirVivo(session, fn, workspace);
  };
  /** Lo que ya está —o va a estar— en disco. */
  const asentar = (session: string, fn: (base: Msg[]) => Msg[]) => {
    deltasPorCuadro.vaciar();
    setHilos((hs) => {
      const h = hs[session] ?? SIN_HILO;
      return { ...hs, [session]: { ...h, base: fn(h.base) } };
    });
  };
  // La transcripción recién leída del disco. `vivo` se vacía solo al
  // cerrarse el turno; al abrir una tarea que sigue contestando se
  // conserva, salvo el tramo que `AskUserQuestion` ya persistió
  // (`guardar_segmento_pregunta`): ese turno llega por partida doble, de
  // `base` y de `vivo`. Se identifican por `turno`; a `base` se le copia
  // su `questionRequestId`, o la respuesta cae al canal de archivo.
  type IdsDeTurnos = ReadonlySet<string>;
  const releer = (session: string, leida: Msg[], vaciarVivo: boolean, antepuesta = false, guardados?: IdsDeTurnos, cola?: IdsDeTurnos) => {
    deltasPorCuadro.vaciar();
    setHilos((hs) => {
      const previo = hs[session];
      const vivoPrevio = previo?.vivo ?? [];
      const ataduras = new Map(
        vivoPrevio
          .filter((m) => m.turno && m.questionRequestId)
          .map((m) => [m.turno as string, m.questionRequestId]),
      );
      // `cola`: lo que acaba de leerse aunque la ventana no lo tenga, porque se quedó atrás leyendo.
      const persistidos = new Set([
        ...leida.map((m) => m.turno).filter((t): t is string => !!t),
        ...(cola ?? []),
      ]);
      const atada =
        ataduras.size === 0
          ? leida
          : leida.map((m) =>
              m.turno && ataduras.has(m.turno)
                ? { ...m, questionRequestId: ataduras.get(m.turno) }
                : m,
            );
      // El chat identifica filas por referencia: un objeto nuevo por mensaje remonta el hilo entero.
      const base = (antepuesta ? conservarPorClave : conservarEnOrden)(previo?.base ?? [], atada);
      const vivo = vaciarVivo
        ? []
        : vivoPrevio.filter((m) => !m.turno || !persistidos.has(m.turno));
      const mismoVivo = vivo.length === vivoPrevio.length;
      const tramos = guardados ?? previo?.guardados;
      if (previo && base === previo.base && mismoVivo && tramos === previo.guardados) return hs;
      return { ...hs, [session]: { base, vivo: mismoVivo ? vivoPrevio : vivo, guardados: tramos } };
    });
  };
  const idsDeTurnos = (turns: readonly Turn[]) => new Set(turns.flatMap((t) => (t.id ? [t.id] : [])));
  // Por tarea: `undefined` es que aún no se abrió, `null` que salió de `session.json`.
  const [origenes, setOrigenes] = createSignal<Readonly<Record<string, TranscriptOrigin | null>>>({});
  // Por tarea, la máquina apagada que la corre (`offline` de la lectura) y la que se está
  // encendiendo porque se le mandó algo.
  const [apagadas, setApagadas] = createSignal<Readonly<Record<string, string>>>({});
  const [encendiendo, setEncendiendo] = createSignal<Readonly<Record<string, string>>>({});
  // Por tarea, lo que `load_session` dijo de cambiar de CLI. Se relee al abrir
  // y al cerrar cada turno, que es cuando el motor puede haber cambiado de idea.
  const [traspasos, setTraspasos] = createSignal<Readonly<Record<string, HandoverState>>>({});
  const anotar = (set: typeof setApagadas, id: string, machine: string | null) =>
    set((all) => {
      if ((all[id] ?? null) === machine) return all;
      const { [id]: _, ...resto } = all;
      return machine ? { ...resto, [id]: machine } : resto;
    });
  // Los turnos de cada tarea que trajo `service history`, desde `start`; lo anterior se pide al subir.
  const historias = new Map<string, HistoryPager<Session["turns"][number]>>();
  const proyectosDeHistoria = new Map<string, string>();
  const leyendoLejos = new Set<string>();
  const [conAntiguos, setConAntiguos] = createSignal<Readonly<Record<string, boolean>>>({});
  const [conRecientes, setConRecientes] = createSignal<Readonly<Record<string, boolean>>>({});
  const [estadoAntiguos, setEstadoAntiguos] = createSignal<Readonly<Record<string, OlderState>>>({});
  const marcarAntiguos = (id: string, pager: HistoryPager<unknown>) => {
    const loaded = pager.loaded;
    if (loaded) {
      setConAntiguos((all) => (!!all[id] === hasOlder(loaded) ? all : { ...all, [id]: hasOlder(loaded) }));
      const recent = hasRecentGap(loaded);
      setConRecientes(all => !!all[id] === recent ? all : { ...all, [id]: recent });
    }
    setEstadoAntiguos(all => (all[id] ?? "idle") === pager.older ? all : { ...all, [id]: pager.older });
  };
  const [colaSuelta, setColaSuelta] = createSignal<Readonly<Record<string, Msg[]>>>({});
  const historiaDe = (id: string) => {
    const hay = historias.get(id);
    if (hay) return hay;
    const pager: HistoryPager<Session["turns"][number]> = new HistoryPager({
      read: (before) => leerTarea(proyectosDeHistoria.get(id) ?? project(), id, before),
      onChange: () => marcarAntiguos(id, pager),
    });
    historias.set(id, pager);
    return pager;
  };
  // Con el stream empujado el motor sabe paginar: abrir trae los últimos turnos y no la transcripción entera.
  let historialPaginado = false;
  const leerTarea = async (project: string, id: string, before: number | null = null) => {
    proyectosDeHistoria.set(id, project);
    const result = historialPaginado
      ? await invoke<Session>("load_history", { project, id, before }, deLaTarea(id))
      : await invoke<Session>("load_session", { project, id, history_request: { version: 1, before } }, deLaTarea(id));
    if (result.history?.version === 1) {
      result.turns = result.turns.map(turn => ({ ...turn,
        history_refs: turn.history_refs?.map(ref => ({ ...ref, project, session: id })),
      }));
    }
    return result;
  };
  /**
   * La página anterior a lo cargado de `id`, lista para anteponerse: devuelve con qué
   * ponerla, para que el hilo la monte sin mover lo que se lee. `null` si no hay o falló.
   */
  async function cargarAntiguos(project: string, id: string): Promise<(() => void) | null> {
    const pager = historias.get(id);
    if (!pager) return null;
    proyectosDeHistoria.set(id, project);
    const generation = sessionGeneration;
    const poner = await pager.fetchOlder();
    pintarHistoria(id, pager, false);
    if (!poner || generation !== sessionGeneration) return null;
    return () => {
      if (generation !== sessionGeneration) return;
      poner();
      pintarHistoria(id, pager, true);
    };
  }
  /** El hilo de lo que tiene la ventana de `id`; separado de lo más reciente si se quedó atrás. */
  function pintarHistoria(id: string, pager: HistoryPager<Session["turns"][number]>, antepuesta: boolean, clear = false, leidos?: ReadonlySet<string>) {
    const loaded = pager.loaded;
    if (!loaded) return;
    const leida = transcripcion(loaded.turns, loaded.start);
    if (hasRecentGap(loaded)) leida.push({ role: "system", text: "", meta: "history_gap", clave: "history_gap" });
    releer(id, leida, clear, antepuesta, idsDeTurnos(loaded.turns), leidos);
  }
  /**
   * La máquina que se enciende para el mensaje que la tarea de esta celda acaba
   * de mandar. Una tarea que nace aún no tiene id: su pestaña provisional, o el
   * borrador, es la que se mira.
   */
  const encendiendoEn = (sesion: string | null | undefined) => {
    const id = sesion ?? (sessionId() ? null : pestanas.active());
    const machine = (id ? encendiendo()[id] : undefined) ?? (sesion || sessionId() ? undefined : encendiendo()[claveAbierta()]);
    return machine ? { name: machineName(machine), wakes: machineWakes(machine) } : null;
  };
  /**
   * Lo que se dice de la máquina de la tarea abierta mientras está apagada.
   * Encendiéndose no: el mensaje ya salió y lo dice el renglón del turno, donde
   * después dirá «Pensando».
   */
  const avisoDeMaquina = () => {
    if (encendiendoEn(sessionId())) return null;
    const id = sessionId() ?? pestanas.active();
    const off = id ? apagadas()[id] : undefined;
    return off ? t("shell.machines.asleep_notice", { name: machineName(off) }) : null;
  };
  // Encendida por otra vía (otra ventana, otra acción), la tarea se vuelve a leer de su motor.
  createEffect(on(() => {
    const id = sessionId();
    return id && apagadas()[id] && filaDe(id)?.machine_on === true ? id : null;
  }, (id) => {
    if (!id) return;
    const generation = sessionGeneration;
    void leerTarea(project(), id).then((s) => loadResult(id, s, false, generation)).catch(() => {});
  }));
  function loadResult(id: string, session: Session, clear: boolean, generation: number) {
    if (generation !== sessionGeneration) return;
    anotar(setApagadas, id, session.offline?.machine ?? null);
    setTraspasos((all) => {
      const previo = all[id];
      const ahora = {
        can: session.can_hand_over === true,
        blocked: session.hand_over_blocked ?? null,
        provider: session.provider ?? null,
        model: session.model ?? null,
        effort: session.effort ?? null,
      };
      if (
        previo &&
        previo.can === ahora.can &&
        previo.blocked === ahora.blocked &&
        previo.provider === ahora.provider &&
        previo.model === ahora.model &&
        previo.effort === ahora.effort
      ) return all;
      return { ...all, [id]: ahora };
    });
    // Otro cliente pudo cambiar el CLI: un traspaso confirmado que ya no parte
    // del que la sesión tiene caduca, y el siguiente envío no lo resucita.
    setBorradores((bs) => {
      const suyo = bs[id];
      if (!suyo?.provider || suyo.provider.from === session.provider) return bs;
      const { provider: _, ...resto } = suyo;
      return { ...bs, [id]: resto };
    });
    const pager = historiaDe(id);
    const loaded = pager.accept(session.turns, session.history, { reading: leyendoLejos.has(id) });
    setColaSuelta((all) => {
      if (hasRecentGap(loaded)) return { ...all, [id]: transcripcion(session.turns, session.history?.start ?? 0) };
      if (!(id in all)) return all;
      const { [id]: _, ...resto } = all;
      return resto;
    });
    pintarHistoria(id, pager, false, clear, idsDeTurnos(session.turns));
    const origen = session.transcript ?? null;
    setOrigenes((o) =>
      id in o && o[id]?.file === origen?.file && o[id]?.from_cli === origen?.from_cli ? o : { ...o, [id]: origen },
    );
    if (id !== sessionId() || !(session.subagent || session.parent)) return;
    const modelo = modeloDeSubtarea(session);
    if (modelo) setModel(modelo);
    if (session.effort) setEffort(session.effort);
  }
  const soltarHilo = (session: string) => {
    deltasPorCuadro.vaciar();
    setHilos((hs) => {
      historias.get(session)?.close();
      historias.delete(session);
      if (!(session in hs)) return hs;
      const { [session]: _, ...resto } = hs;
      return resto;
    });
  };
  // Lo contestado a medias de cada pregunta, por sesión y turno: los ids
  // `q1..qN` se repiten entre turnos. Aquí y no en la tarjeta, que se desmonta
  // con su pestaña.
  const [preguntasAMedias, setPreguntasAMedias] = createSignal<ReadonlyMap<string, PreguntasAMedias>>(new Map());
  const claveDePregunta = (session: string, turno: string) => `${session}\u0000${turno}`;
  const almacenDePreguntas = (session: () => string | null): AlmacenDePreguntas => ({
    leer: (turno) => preguntasAMedias().get(claveDePregunta(session() ?? "", turno)),
    escribir: (turno, aMedias) =>
      setPreguntasAMedias((m) => new Map(m).set(claveDePregunta(session() ?? "", turno), aMedias)),
  });
  const soltarPreguntas = (session: string, turno?: string) =>
    setPreguntasAMedias((m) => {
      const suyas = [...m.keys()].filter((k) =>
        turno === undefined ? k.startsWith(`${session}\u0000`) : k === claveDePregunta(session, turno),
      );
      if (suyas.length === 0) return m;
      const resto = new Map(m);
      for (const k of suyas) resto.delete(k);
      return resto;
    });
  // Cuánto se aprueba a mano, y qué modos puede el agente elegido. Vive aquí
  // por lo mismo que el modelo: al reanudar una tarea hay que restaurar con
  // qué corrió. La lista se pide al backend: lo que cada CLI sostiene es dato
  // suyo (`agents::Permisos`), y escrita aquí sería una segunda copia que un
  // día diría otra cosa.
  const [modo, setModo] = createSignal("");
  const [modos, setModos] = createSignal<ModoDePermiso[]>([]);
  // Qué tareas están contestando ahora mismo, por id. Era un `busy` de la
  // aplicación entera: con un turno vivo, la caja de CUALQUIER otra tarea
  // enseñaba «Detener turno» en `type="button"`, y empezar algo mientras el
  // agente pensaba era imposible. El backend nunca tuvo ese límite
  // —`chat::vivos()` es un conjunto de sesiones, cada turno corre en su
  // propio hilo—: lo que faltaba estaba aquí.
  const [vivas, setVivas] = createSignal<string[]>([]);
  const finishedTurns = new Map<string, boolean | null | undefined>();
  // Turnos que la reconciliación cerró sin su `done`, que llega cada sondeo del servicio.
  const sinDesenlace = new Set<string>();
  const [settlingTurns, setSettlingTurns] = createSignal<string[]>([]);
  let lifecycleRevision = 0;
  const turnRevisions = new Map<string, number>();
  function advanceTurn(id: string) {
    lifecycleRevision++;
    const revision = (turnRevisions.get(id) ?? 0) + 1;
    turnRevisions.set(id, revision);
    return revision;
  }
  const pendingStarts = new Map<string, symbol>();
  const [injecting, setInjecting] = createSignal<{ session: string; id: string }[]>([]);
  /**
   * Los agentes que ya contestaron que no reciben mensajes a mitad del turno
   * (`chat.steer.unsupported`) o que dejaron la entrega sin confirmar. Con uno
   * de ellos «Mandar ahora» no haría nada: el mensaje se queda en la cola. Es
   * del agente y no de la tarea, y abrir la ventana lo olvida.
   */
  const [sinSteer, setSinSteer] = createSignal<string[]>([]);
  /**
   * Las tareas donde «detener y enviar» acaba de cortar el turno: al cerrar,
   * la cola no se retiene por el fallo de la interrupción, que aquí lo pidió la
   * persona. Sin esto el gesto dejaba el mensaje parado justo después de usarlo.
   */
  const enviarAlCerrar = new Set<string>();
  const queueBusy = () => busy() || settlingTurns().includes(sessionId() ?? "") || injecting().some((item) => item.session === sessionId());
  const [desdeDeTurno, setDesdeDeTurno] = createSignal<Record<string, number>>({});
  const liveThreads = new Set<string>();
  const liveThreadKey = (workspace: string, session: string) => `${workspace}/${session}`;
  // El turno que ya arrancó y todavía no tiene sesión en disco. El primer
  // mensaje de una tarea crea la sesión en Rust: entre que sale y vuelve el
  // id no hay a qué apuntar. Sin esto, esa ventana deja la caja libre y un
  // segundo Enter manda dos primeros turnos.
  const [arrancando, setArrancando] = createSignal(false);
  /** Si la tarea que se está mirando está contestando. */
  const busy = () => {
    const id = sessionId();
    return id ? vivas().includes(id) : arrancando();
  };
  const marcarViva = (id: string, desde = Date.now()) =>
    batch(() => {
      const workspace = workspaceActivo();
      if (workspace) liveThreads.add(liveThreadKey(workspace, id));
      enviarFiltro();
      // Otro turno: el `done` que llegue ya no es del que cerró sin desenlace.
      sinDesenlace.delete(id);
      setVivas((v) => (v.includes(id) ? v : [...v, id]));
      setDesdeDeTurno((d) => (id in d ? d : { ...d, [id]: desde }));
    });
  const marcarQuieta = (id: string) =>
    batch(() => {
      const workspace = workspaceActivo();
      if (workspace) liveThreads.delete(liveThreadKey(workspace, id));
      enviarFiltro();
      setVivas((v) => v.filter((x) => x !== id));
      setDesdeDeTurno((d) => {
        if (!(id in d)) return d;
        const { [id]: _, ...resto } = d;
        return resto;
      });
    });
  /**
   * ¿Este evento es de la tarea que se está mirando? Solo filtra el
   * consumo y la ventana de contexto; el chat cae directo en el hilo de
   * su sesión. Un `sessionId() &&` delante aceptaría TODO: «sin tarea» y
   * «tarea recién arrancada» son indistinguibles.
   */
  const esDeLaAbierta = (session: string) => session === sessionId();

  /**
   * ¿Este evento es del workspace que se está mirando? Segundo cinturón,
   * no reemplazo de `esDeLaAbierta`: workspace puede cambiar con una tarea
   * contestando, y solo evitaba pintarse aquí por suerte —ids de sesión
   * aleatorios sin colisión, no una comprobación real.
   */

  /**
   * Solo descarta cuando sabe contra qué comparar, y en esa dirección tiene
   * que fallar: equivocarse hacia «pasa» cuesta lo que el filtro por
   * sesión ya cubría; hacia «descarta» deja corriendo un turno mudo, sin
   * nada que lo explique.
   */

  /**
   * Rust deja el campo fuera cuando el evento no viene de un turno de
   * fondo, y ahí no hay nada que descartar (`chat::emitir_chat`). La
   * cadena vacía cuenta igual —consumo escrito antes de los workspaces—:
   * esconder un gasto real por no saber de quién es sería peor.
   */
  const esDelWorkspaceAbierto = (ws?: string) => {
    const abierto = workspaceActivo();
    return !ws || !abierto || ws === abierto;
  };
  /** Qué tarea se pidió detener. Es de una, no de la app: ver `vivas`. */
  const [deteniendo, setDeteniendo] = createSignal<string | null>(null);
  const stopping = () => deteniendo() !== null && deteniendo() === sessionId();
  // El `!` que ocupa cada tarea mientras corre, pintado con sus `shell_*`.
  const [terminales, setTerminales] = createSignal<Record<string, ComandoEnVivo>>({});
  const [carpetasDeTerminal, setCarpetasDeTerminal] = createSignal<Record<string, string>>({});
  // Con qué se escribió cada `!` que lanzó esta ventana: es con lo que el agente
  // contesta a su salida. Otra ventana no pide esa respuesta.
  const lanzados = new Map<string, TerminalLanzada>();
  // Por el id de ejecución que esta ventana propuso: es lo que trae el
  // `shell_started` de la tarea que su `!` acaba de abrir.
  const nacenConComando = new Map<string, ComandoQueNace>();
  const detenidos = new Set<string>();
  const comandosDeLaCola = new Map<string, string>();
  const [permissions, setPermissions] = createSignal<PermissionRequest[]>([]);
  const [respondiendoPermiso, setRespondiendoPermiso] = createSignal(false);
  const [permissionError, setPermissionError] = createSignal<string | null>(null);
  // De cuánta ventana de contexto va la conversación, aparte del total: no
  // es un acumulado. Cada turno reenvía la conversación entera, y el
  // último reporte ya es el total —sumarlos daría una ventana imposible.

  // Se llama `ventana` y no `contexto`: en este archivo «contexto» ya es
  // el material que la tarea lee.
  const [ventana, setVentana] = createSignal<Ventana>(null);

  // Lo escrito durante un turno, que sale cuando el turno cierre. Vive
  // aquí y no dentro de la caja: es de la SESIÓN.
  const [cola, setCola] = createSignal<Encolado[]>([]);
  // De qué sesión es la cola que se tiene en la mano. `null` es una
  // conversación que todavía no existe en disco.
  const [colaDe, setColaDe] = createSignal<string | null>(null);
  /**
   * Por qué la cola no avanza sola: `fallo` es un turno que no cerró bien
   * —mandar algo encima de lo reventado compone el daño—; `borrador` se
   * cargó de disco y podría dispararse contra un proyecto ya cambiado;
   * `pregunta` es la única que no se suelta a mano, se sale contestando;
   * `session` espera a que termine otro turno de esta misma sesión.
   */
  const [retenida, setRetenida] = createSignal<
    null | "fallo" | "borrador" | "pregunta" | "session"
  >(null);
  type SavedQueue = { project: string; items: Encolado[]; retained: RazonDeRetencion | null };
  const savedQueues = new Map<string, SavedQueue>();
  const drainingQueues = new Set<string>();
  // La retención de cada cola de los workspaces que se dejaron. Sin ella, volver
  // la leía de disco como `borrador` y se quedaba parada (`retencionAlCargar`).
  const workspaceRetentions = new Map<string, Map<string, RazonDeRetencion | null>>();
  // La tarea cuya cola se abrió en `borrador` por venir de disco (`sueltaElBorrador`).
  let draftFromDisk: string | null = null;

  createEffect(on([cola, colaDe, retenida], ([items, owner, retained]) => {
    if (owner && owner === sessionId()) savedQueues.set(owner, { project: project(), items, retained });
  }));

  /** El título de la sesión ocupada. */
  const [esperandoA, setEsperandoA] = createSignal<string | null>(null);
  /**
   * Cuántos turnos cerraron, de cualquier tarea de este cliente. Es lo que
   * despierta una cola retenida por `session`: Rust libera la sesión antes
   * de emitir el `done`, y al recibirlo ya se puede volver a pedir.
   */
  const [cierres, setCierres] = createSignal(0);
  // En qué cierre se retuvo por `session`: el despacho solo reintenta en uno
  // posterior. No es señal a propósito: leerla no debe volver a correr nada.
  let cierreDeLaRetencion = -1;
  // El CLI está reintentando contra su proveedor, en esta sesión: los eventos
  // de otra tarea siguen llegando a esta ventana, y sin la sesión un turno de
  // fondo que reintenta encendería el rótulo del que se está mirando. `null`
  // es lo normal: solo Claude anuncia sus reintentos, y solo mientras duran.
  const [reintento, setReintento] = createSignal<{
    session: string;
    intento: number;
    total: number;
    clase: string;
  } | null>(null);
  // Tareas cuyo agente ya contestó y solo espera a una hija en segundo plano: el
  // turno sigue abierto, pero un mensaje entra ya en vez de esperar al cierre.
  const [enFondo, setEnFondo] = createSignal<string[]>([]);
  // Editar pausa la cola: si el turno cierra a mitad de la edición, no se manda
  // el texto a medias.
  const [editando, setEditando] = createSignal(false);
  const [skills, setSkills] = createSignal<Skill[]>([]);
  const [cliCommands, setCliCommands] = createSignal<CliCommand[]>([]);
  const [sideCommand, setSideCommand] = createSignal<string | null>(null);
  // Sin comandos es «no se pudo saber»: el que no publica lista y el que todavía
  // no la mandó se ven igual desde aquí, y el menú enseña las skills igual. Se
  // vuelve a pedir al cerrar cada turno: los de ACP la publican dentro de uno.
  const cargarComandos = (a: string) => {
    const revision = composerRevision;
    const poner = (menu: SlashMenu) => {
      // La respuesta de un agente que ya no es el de la caja ofrecería sus comandos.
      if (a !== agent() || revision !== composerRevision) return;
      setCliCommands(menu.commands);
      setSkills(menu.skills);
      setSideCommand(menu.side_question ?? null);
    };
    void invoke<SlashMenu>("list_slash_menu", { provider: a }, composerOptions())
      .then(poner)
      .catch(() => poner({ commands: [], skills: [] }));
  };
  // La pregunta al margen vive en memoria y es de una tarea: al cambiar de
  // tarea se pierde, y la respuesta que llegue tarde no se pinta en otra.
  const [alMargen, setAlMargen] = createSignal<AlMargen | null>(null);
  let preguntasAlMargen = 0;
  createEffect(on(sessionId, (id) => {
    if (alMargen() && alMargen()?.session !== id) cerrarAlMargen();
  }));
  function cerrarAlMargen() {
    preguntasAlMargen++;
    setAlMargen(null);
  }
  async function preguntarAlMargen(question: string) {
    const session = sessionId();
    const turno = ++preguntasAlMargen;
    if (!session) {
      setAlMargen({ session: "", question, answer: null, failure: { what: { clave: "chat.side.error.no_session" }, detail: "" } });
      return;
    }
    setAlMargen({ session, question, answer: null, failure: null });
    const vigente = () => turno === preguntasAlMargen && sessionId() === session;
    try {
      const { answer } = await invoke<{ answer: string }>("ask_side_question", { project: project(), session, question }, deLaTarea(session));
      if (vigente()) setAlMargen({ session, question, answer, failure: null });
    } catch (e) {
      if (vigente()) setAlMargen({ session, question, answer: null, failure: asFailure(e) });
    }
  }
  function pasarAlHilo() {
    const m = alMargen();
    if (!m?.answer) return;
    const texto = t("chat.side.thread_text", { question: m.question, answer: m.answer });
    setInput(alHilo(input(), texto));
    cerrarAlMargen();
  }
  // Lo que se puede mencionar. Sale de las fuentes que ESTA tarea tiene
  // adjuntas y solo de ellas: la frontera de lo mencionable es la del agente.
  const [mentionSources, setMentionSources] = createSignal<MentionSources | null>(null);
  const [taskCandidates, setTaskCandidates] = createSignal<TaskCandidate[]>([]);
  let taskCandidateRequest = 0;
  const refreshTaskCandidates = async () => {
    const request = ++taskCandidateRequest;
    const workspace = workspaceActivo();
    const session = sessionId();
    try {
      const items = await invoke<TaskCandidate[]>("list_task_mentions");
      if (request === taskCandidateRequest && workspace === workspaceActivo() && session === sessionId()) setTaskCandidates(items);
    } catch {
      if (request === taskCandidateRequest) setTaskCandidates([]);
    }
  };
  /**
   * Los encargados de la carpeta abierta, para el menú de `@`. Sale de la
   * misma llamada que el riel ya hace, y el último listado conocido cubre la
   * lectura que falle: mejor el nombre de ayer que un menú sin encargados.
   */
  const [rosterDelProyecto] = createResource(project, async (id) => {
    if (!id) return [] as HandlerDefinition[];
    try {
      const listado = (await invoke<HandlerList>("list_agents", { project: id })).agents;
      rememberRoster(id, listado);
      return listado;
    } catch {
      return lastRoster(id) ?? [];
    }
  });
  /**
   * La presencia sigue a la carpeta abierta: suscribirse a una fija dejaría
   * las caras del proyecto anterior. Misma forma que `watchHandlerStatus`.
   */
  const [presenciaDeEncargados, setPresenciaDeEncargados] = createSignal<HandlerStatusRow[]>([]);
  createEffect(() => {
    const id = project();
    if (!id) {
      setPresenciaDeEncargados([]);
      return;
    }
    const filas = watchHandlerStatuses(id);
    createEffect(() => setPresenciaDeEncargados(filas()));
  });
  // Los ocultos salen del menú como salen del riel; sin carpeta no hay perfiles que leer.
  const perfilesDeLaCarpeta = createMemo(() => {
    const id = project();
    return id ? watchProfiles(id) : () => ({});
  });
  const recipientCandidates = createMemo<RecipientCandidate[]>(() =>
    recipientCandidatesOf(rosterDelProyecto() ?? lastRoster(project()) ?? [], {
      profiles: perfilesDeLaCarpeta()(),
      // `undefined` no es un estado: es que todavía no se sabe, y el menú
      // pinta la cara despierta en vez de inventar que duerme.
      statuses: presenciaDeEncargados(),
    }),
  );
  const placeCandidates = createMemo<PlaceCandidate[]>(() => {
    return projectList().map(f => ({ target: { kind: "folder" as const, projectId: f.id }, name: f.name, detail: "", updatedAt: f.updated_at }));
  });
  createEffect(on([workspaceActivo, sessionId, sesiones], () => {
    taskCandidateRequest++;
    setTaskCandidates([]);
    if (input().includes("@")) void refreshTaskCandidates();
  }));

  const [folder, setFolder] = createSignal<string | null>(null);

  const sidebar = createSidebar();
  const carpetaDelProyecto = () =>
    carpetaDeTrabajo(projectList().find((p) => p.id === project()) ?? {});
  // Los archivos viven dentro de la tarea (`archivosDeTarea`); sin tarea no hay nada que enseñar.
  const alternarElArbol = () => {
    const id = sessionId() ?? (carpetaDelProyecto() ? llaveDeBorrador(project()) : "");
    if (id) archivosDeTarea.toggle(id);
  };

  onMount(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey)) return;
      if (settings() !== null || alta() !== null) return;
      const accion = accionDeAtajo(e);
      if (accion) {
        e.preventDefault();
        if (accion === "newTask") nuevaSesion();
        else if (accion === "closeTab") closeActiveTab();
        else if (accion === "reopenTab") reabrirPestana();
        else if (accion === "sidebar") sidebar.alternar();
        else if (accion === "search") setBuscando((b) => (b === null ? "all" : null));
        else alternarElArbol();
        return;
      }
      const nav = navegacionDePestanas(e);
      if (nav) {
        e.preventDefault();
        irAPestanaDe(nav);
        return;
      }
      const salto = ventanaVecina(e);
      if (salto) {
        e.preventDefault();
        irAVentanaVecina(salto);
        return;
      }
      if (e.altKey || (e.key.toLowerCase() !== "d" && e.code !== "Backslash")) return;
      e.preventDefault();
      if (e.shiftKey) juntarLaActiva();
      else partirLaActiva();
    };
    window.addEventListener("keydown", alTeclear);
    onCleanup(() => window.removeEventListener("keydown", alTeclear));
  });

  // `null` = cerrada. Una cadena es además con qué destino abrirla.
  const [settings, setSettings] = createSignal<string | null>(capabilities().initialSettings ?? null);
  const [activityNotice, setActivityNotice] = createSignal<ActivityEvent | null>(null);
  const [activityMachine, setActivityMachine] = createSignal<string | null>(null);
  onMount(() => {
    const states = new Map<string, ActivityEvent["state"]>();
    const events = listen<ActivityEvent>("activity", event => {
      const row = event.payload;
      if (row?.workspace !== workspaceActivo() || typeof row.id !== "string" || typeof row.title !== "string" || !["running", "success", "failure", "interrupted"].includes(row.state)) return;
      const key = JSON.stringify([row.workspace, row.machine, row.id]);
      if (states.get(key) === row.state) return;
      states.set(key, row.state);
      if (states.size > 256) states.delete(states.keys().next().value!);
      if (row.state === "failure" || row.state === "interrupted") setActivityNotice(row);
    });
    onCleanup(() => { void events.then(off => off()); });
  });
  createEffect(on(workspaceActivo, () => setActivityNotice(null)));

  const [anadiendoCarpeta, setAnadiendoCarpeta] = createSignal(false);
  const [inicioDeCarpeta, setInicioDeCarpeta] = createSignal<InicioDeCarpeta | null>(null);
  /** El clon en vuelo, que el riel enseña mientras no hay proyecto que listar. */
  const [clonEnCurso, setClonEnCurso] = createSignal<ClonEnCurso | null>(null);
  // Cerrar la configuración es el único momento en que las cuentas pudieron
  // cambiar sin que el resto de la app se entere.
  const [cuentasTocadas, setCuentasTocadas] = createSignal(0);

  // Los oyentes se montan una vez y leen las señales al recibir cada evento:
  // guardar fuera el valor de `sessionId()` o `agents()` los dejaría
  // trabajando con el estado del montaje. `firmas` y `encolados` son
  // variables y no señales: nada pinta sus valores, solo los consultan las
  // funciones de respuesta.

  // Con qué se firma lo que llega de cada tarea, por sesión: con una sola
  // firma, arrancar un segundo turno pisa la del primero, y al volver a la
  // primera su texto sale con el autor del otro agente. La clave `""` es la
  // del turno sin sesión en disco; se muda a su id en cuanto Rust lo
  // devuelve.
  const firmas: Record<string, Author | null> = {};
  // Con qué modelo se lanzó el turno en vivo, con las mismas claves que
  // `firmas`: la fila del mensaje lo enseña hasta que el cierre guarde el observado.
  const modelosEnVivo: Record<string, string | null> = {};
  let encolados = 0;

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

  let sessionGeneration = 0;
  const sessionLists = sessionRefresh<SessionRow>({
    read: async (project) => {
      const open = sesionesConPestana();
      const rows = await invoke<SessionRow[]>("list_live_sessions", { project, open });
      pedidas.set(project, new Set(open));
      for (const id of open) esperandoFila.delete(id);
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
    const generation = sessionGeneration;
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
        read: (path) => invoke<Preview>("preview_file", { path, rel: path }, enMaquina(adjuntosEn.get(path))),
        save: (mime, datos, nombre) => {
          if (documentos) return invoke<string>("guardar_adjunto", { mime, nombre: nombre ?? null, datos }, options);
          return invoke<string>("guardar_imagen_pegada", { mime, datos }, options);
        },
        prepare: (saved) => invoke<string[]>("prepare_attachments", { project: proyecto, paths: saved }, options),
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
      ? await invoke<string>("guardar_adjunto", { mime, nombre: nombre ?? null, datos }, opciones)
      : await invoke<string>("guardar_imagen_pegada", { mime, datos }, opciones);
    const machine = opciones?.headers["x-terminus-machine"];
    if (machine) pegadasEn.set(ruta, machine);
    return ruta;
  }

  // La carpeta de trabajo de la tarea: se abre afuera desde la cabecera y la
  // columna, y resuelve lo que el hilo anuncia por su ruta relativa
  // (`abrirPorRel`).
  async function refreshFolder(p: string, id: string) {
    try {
      setFolder(await invoke<string>("session_folder", { project: p, id }, deLaTarea(id)));
    } catch {
      setFolder(null);
    }
  }

  // Vuelve a leer el material del workspace sin tocar lo que hay abierto: es
  // la mitad de `aplicar` que no es una mudanza. Traer un repositorio cambia
  // lo que el workspace tiene, no en qué workspace estás. Aquí un fallo no
  // vacía las listas, al revés que en `aplicar`: allá lo que quedara en
  // pantalla sería de otro cliente, aquí es de este.
  async function recargarMaterial() {
    const generation = sessionGeneration;
    const request = ++materialRequest;
    const workspace = workspaceActivo();
    if (!workspace) return;
    setContextConfirmed(false);
    try {
      const arranque = await invoke<Startup>("list_workspaces");
      if (generation !== sessionGeneration || request !== materialRequest) return;
      const current = arranque.workspaces.find((w) => w.id === workspace);
      if (!current) throw { what: t("projects.context.unavailable"), detail: "context_unavailable" };
      const root = current.context_root;
      const [, fuentes] = await Promise.all([
        invoke<Project[]>("list_projects").then(rows => {
          if (generation === sessionGeneration && request === materialRequest) setProjectList(rows);
          return rows;
        }),
        invoke<Source[]>("list_sources"),
      ]);
      if (generation !== sessionGeneration || request !== materialRequest) return;

      setSources(fuentes);
      confirmContext(root, fuentes);
    } catch (e) {
      if (generation !== sessionGeneration || request !== materialRequest || asleep(e)) return;
      setError(prosaDe(e));
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

  async function aplicar(a: Startup) {
    guardarCache.flush();
    const activo = a.workspaces.find((w) => w.id === a.active);
  // Sin workspace se abre el alta. Si ya estaba abierta no se toca: el paso 1
  // acaba de crear uno, y volver a mirar aquí la cerraría a mitad.
    if (a.active === null) setAlta((x) => x ?? "primera");
    setContextRoot(activo?.context_root ?? null);
    setContextConfirmed(false);
    const material = ++materialRequest;
    setWorkspaceMode(activo?.default_permission_mode ?? null);
  // La lengua es del workspace, y cambia al cambiar de cliente: eso es lo que
  // se pidió, no un efecto secundario. `null` hereda la de la máquina.
    aplicarLenguaDeWorkspace(activo?.lengua ?? null);
  // El tema de terminal sigue al workspace por lo mismo: es cómo se distingue
  // en qué cliente se está sin leer el nombre.
    aplicarTemaDeTerminal(activo?.terminal_theme ?? null);
    sessionGeneration++;
    for (const pager of historias.values()) pager.close();
    sessionLists.reset();
    const generation = sessionGeneration;
    const previousWorkspace = workspaceActivo();
    deltasPorCuadro.vaciar();
    if (previousWorkspace) workspaceThreads.set(previousWorkspace, Object.fromEntries(
      Object.entries(hilos()).filter(([id]) => liveThreads.has(liveThreadKey(previousWorkspace, id))),
    ));
    if (previousWorkspace) workspaceRetentions.set(previousWorkspace, new Map(
      [...savedQueues].filter(([, queued]) => queued.items.length > 0).map(([id, queued]) => [id, queued.retained]),
    ));
    savedQueues.clear();
    drainingQueues.clear();
    setSpacesContext(null);
    setWorkspaceActivo(a.active);
    setDraftBases({});
    // Sale la tira del anterior antes que `setSessionId(null)`, que apuntaría
    // «ninguna activa» en la que siga cargada. La nueva es la del escritorio y
    // entra abajo, al leer los espacios, con qué tarea tenía abierta.
    // El reparto de la que se va ya está guardado por espacio; se corta antes
    // de vaciar la tira, para que soltar sus pestañas no pise su rejilla.
    paneles.bindTo(null, null);
    pestanas.load(null);
    // El mismo workspace que la caché: sus filas se quedan hasta que lleguen las de verdad.
    const desdeCache = enCache() && shellCache?.workspace === a.active;
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
    setHilos(a.active ? workspaceThreads.get(a.active) ?? {} : {});
    setDesdeDeTurno({});
    setBorradores({});
    setVivas([]);
    setSettlingTurns([]);
    finishedTurns.clear();
    sinDesenlace.clear();
    lifecycleRevision++;
    setFolder(null);
    setVentana(null);
    if (!desdeCache) setSesiones({});
    soltarCola();
    setAdjuntas([]);
    // Y las cuentas, que también son de este workspace: la franja de consumo las
    // lee una vez y se quedaría enseñando las del cliente anterior —nombre,
    // correo y cuánto le queda— sin que nada avise.
    setCuentasTocadas((n) => n + 1);
    // Con qué se puede trabajar es del workspace por lo mismo: la
    // credencial y el consentimiento cuelgan de él; el menú del otro
    // cliente ofrecería lo que este no tiene conectado.
    void cargarSuperficies(true);
    setError(null);
    // Ni con un solo proyecto se preselecciona. Autoseleccionar cuando la lista
    // trae uno ahorra un clic y reintroduce la sorpresa.
    setProject("");
    // Sin workspace no se pregunta por lo que cuelga de él: preguntarlo
    // devolvía «Todavía no hay ningún workspace», pintado como error rojo
    // encima del primer arranque —la app avisando de que falta lo que esa
    // misma pantalla está pidiendo.
    if (a.active === null) {
      setProjectList([]);
      setSources([]);
      return;
    }
    const pedidas = invoke<Space[]>("list_spaces").catch(() => null);
    // Con las carpetas de la caché, sus tareas se leen a la vez que la lista de carpetas.
    const primeras = desdeCache ? refreshSessions(grupos()) : null;
    try {
      // A la vez, no una detrás de otra: no dependen entre sí, y
      // encadenadas sumaban sus latencias en el arranque. `list_sources`
      // esperaba a que volviera `list_projects` para preguntar algo que
      // no usa su respuesta.
      // Las fuentes que no llegan (su máquina apagada, sin copia) dejan las de antes y no tumban las carpetas.
      const [, fuentes] = await Promise.all([
        invoke<Project[]>("list_projects").then(rows => {
          if (generation === sessionGeneration) setProjectList(rows);
          return rows;
        }),
        invoke<Source[]>("list_sources").catch(() => null),
      ]);
      if (generation !== sessionGeneration) return;

      if (material === materialRequest) {
        if (fuentes) {
          setSources(fuentes);
          confirmContext(activo?.context_root ?? null, fuentes);
        } else setError(t("projects.context.unavailable"));
      }
    } catch (e) {
      if (generation !== sessionGeneration || material !== materialRequest) return;
      // Una máquina dormida no es un fallo, pero el arranque sigue: sin salir
      // de la caché, la ventana se queda inerte con la foto de la vez anterior
      // y no restaura pestañas ni se entera de cuando la máquina enciende.
      if (!asleep(e)) {
        setProjectList([]);
        setSources([]);
        setError(prosaDe(e));
      }
    }
    if (primeras) {
      // Si cambiaron las carpetas, `grupos` relee también las nuevas; esta lectura ya vale para las de siempre.
      await primeras;
      if (generation !== sessionGeneration) return;
      setEnCache(false);
    }
    // La tarea que estaba abierta en este workspace vuelve a estarlo, que es lo
    // que hace un navegador al arrancar. Si su pestaña apunta a una tarea que
    // ya no existe, `abrirSesion` lo dice en la conversación y la
    // sincronización con el historial se lleva la pestaña.
    const lista = await pedidas;
    if (generation !== sessionGeneration) return;
    const desk = asentarEscritorio(a.active, lista);
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
      setCargandoHilo(delante.session);
      void loadThread(delante.project, delante.session).finally(() =>
        setCargandoHilo((c) => (c === delante.session ? null : c)));
    }
    const enFrente = paneles.activeTabAt(paneles.activeSite());
    await reconcileActiveTurns();
    if (generation !== sessionGeneration) return;
    // Lo que la persona abrió mientras se conciliaba gana: abrir la restaurada ahora le quitaría la ventana.
    if (sessionId() !== null || pestanas.active() !== null || paneles.activeTabAt(paneles.activeSite()) !== enFrente) return;
    if (delante) void abrirSesion(delante.project, delante.id);
  }

  onMount(() => {
    // Aquí es cuando deja de verse la ventana en blanco: `Setup` no monta esto
    // hasta que su comprobación vuelve. Sin esta línea el arranque no se mide
    // en ningún sitio y cualquier mejora suya es una opinión.
    void invoke("window_ready", { at: Math.round(performance.now()) });
    // El webview es la mayor parte de la memoria de la app y nadie sabe de qué.
    // Nodos, heap y lo que la ventana retiene separan las causas posibles, que
    // piden arreglos distintos. `memory` no existe en todos los motores: cero dice «no se sabe».
    const vitales = () => {
      const memoria = (performance as { memory?: { usedJSHeapSize: number } }).memory;
      const retenidos = Object.values(hilos());
      void invoke("window_vitals", {
        nodes: document.getElementsByTagName("*").length,
        heapMb: Math.round((memoria?.usedJSHeapSize ?? 0) / 1048576),
        tabs: pestanas.open().length,
        threads: retenidos.length,
        messages: retenidos.reduce((n, h) => n + h.base.length + h.vivo.length, 0),
      });
    };
    vitales();
    const latido = setInterval(vitales, 300_000);
    onCleanup(() => clearInterval(latido));
    const closeTab = listen("close-tab", closeActiveTab);
    onCleanup(() => void closeTab.then((unlisten) => unlisten()));

    // Sin respuesta (una máquina apagada sin copia, en la web) se queda la lista de antes.
    void invoke<Agent[]>("list_providers").then(setAgents).catch(() => {});
    // Lo primero de todo: sin workspace no hay dónde leer ni escribir. El
    // arranque migra lo que hubiera suelto de antes y devuelve cuál quedó
    // activo. Lo que el workspace tiene es su fuente de contexto, no «dónde
    // están los proyectos»: lo que quede en `localStorage` de cuando esa
    // carpeta era una preferencia de esta máquina se lee UNA vez, aquí.
    let workspaceRequest = 0;
    // `workspaces_startup` migra dentro y tarda minutos; la ventana abre con
    // `list_workspaces` y el arranque la confirma al llegar (`early-startup.ts`).
    let arranqueLlego = false;
    let aplicadaDeLista: Startup | null = null;
    void invoke<Startup>("list_workspaces").then((lista) => {
      if (arranqueLlego || workspaceRequest !== 0 || bloqueo()) return;
      if (!listaBasta(lista)) return;
      aplicadaDeLista = lista;
      return aplicar(lista);
    }).catch(() => {
      // Sin lista se espera al arranque, como antes: su error es el que se pinta.
    });
    // Que el servicio no conteste todavía no es una respuesta. Recién
    // instalado arranca en frío —`workspaces_startup` tardó nueve segundos
    // en una medición— y el primer intento de la ventana se pasa del plazo:
    // la app abría a medias y no se recuperaba sola.
    const arrancar = async (quedan: number) => {
      try {
        const a = await invoke<Startup>("workspaces_startup");
        arranqueLlego = true;
        // `bloqueo` no pasa por `aplicar`: es lo que lo hace seguro. Viene
        // con `workspaces` y `active` vacíos, que para `aplicar` significan
        // «primer arranque» y abren el alta — la negativa acabaría
        // invitando a crear un workspace en la carpeta que se negó a tocar.
        if (a.bloqueo) {
          // Antes que `workspaceRequest`: tapa aunque la lista ya abriera la ventana.
          setEnCache(false);
          setBloqueo(a.bloqueo);
          return;
        }
        if (workspaceRequest !== 0) return;
        // Lo que la lista ya pintó se queda si el arranque dice lo mismo:
        // volver a aplicar cerraría la tarea que la persona ya abrió.
        if (reconciliar(aplicadaDeLista, a) === "nada") return;
        await aplicar(a);
      } catch (e) {
        if (workspaceRequest !== 0) return;
        if (quedan > 0 && TRANSPORTE.has(claveDe(e) ?? "")) {
          setTimeout(() => void arrancar(quedan - 1), 1000);
          return;
        }
        // Una máquina apagada tiene su indicador; al conectarse trae sus workspaces.
        if (!asleep(e)) setError(prosaDe(e));
        // La lista ya abrió la ventana: se dice el error y no se vacía lo que se está usando.
        if (aplicadaDeLista) return;
        if (enCache()) {
          batch(() => {
            setEnCache(false);
            setProjectList([]);
            setSesiones({});
          });
        }
        // Sin arranque no hay workspace: no hay nada que ofrecer. Dejarlo
        // en «leyendo» pintaría una caja muda esperando una respuesta que
        // ya falló; vacío es lo que hay, y encima está el error.
        setSuperficies([]);
      }
    };
    void arrancar(10);

    // El selector de workspace vive en otra pantalla y no sabe nada de esta. Se
    // hablan por el evento y no por props para que se pueda mover de sitio —al
    // pie del sidebar— sin tocar a nadie.
    const alMudar = () => {
      const request = ++workspaceRequest;
      void invoke<Startup>("list_workspaces")
        .then((startup) => request === workspaceRequest ? aplicar(startup) : undefined)
        .catch((e) => { if (request === workspaceRequest && !asleep(e)) setError(prosaDe(e)); });
    };
    window.addEventListener("harness:workspace", alMudar);
    onCleanup(() => window.removeEventListener("harness:workspace", alMudar));

    // Y el otro aviso, que se parece y no es el mismo: cambió el material
    // de este workspace, no el workspace. Son dos eventos: dos
    // consecuencias distintas, una mudanza y un estante nuevo.
    // Las fuentes de skills también avisan por aquí y cambian el menú de `/`.
    const alCambiarMaterial = () => {
      void recargarMaterial();
      cargarComandos(agent());
    };
    window.addEventListener("harness:sources", alCambiarMaterial);
    onCleanup(() =>
      window.removeEventListener("harness:sources", alCambiarMaterial),
    );

    // Agregar un workspace lo pide quien lo ofrece —el panel de
    // Configuración— y lo monta esta pantalla: el alta ocupa la ventana
    // entera.
    const alPedirAlta = () => {
      // La hoja de Configuración se cierra: el alta va debajo de ella y
      // quedaría tapada por la pantalla desde la que se pidió.
      setSettings(null);
      setAlta("nueva");
    };
    window.addEventListener("harness:new-workspace", alPedirAlta);
    onCleanup(() =>
      window.removeEventListener("harness:new-workspace", alPedirAlta),
    );
    // Lo piden las vistas que necesitan un plugin: `DrawioMcpCanvas.tsx`.
    const alPedirAjustes = (e: Event) => {
      const panel = (e as CustomEvent<unknown>).detail;
      setSettings(typeof panel === "string" ? panel : "");
    };
    window.addEventListener("harness:open-settings", alPedirAjustes);
    onCleanup(() =>
      window.removeEventListener("harness:open-settings", alPedirAjustes),
    );
  });

  // Y al revés: quien ofrezca cambiar de workspace sabe que hay un agente
  // contestando. El bloqueo de verdad lo impone el backend, esto es para
  // no ofrecer un clic que va a fallar. `turn`, no `turno` (AGENTS.md §
  // Qué comprueba cada guarda); `dispatchEvent` sin suscriptores no avisa,
  // igual que `app.emit`. Viaja la cuenta real de `vivas`, no el `busy`
  // de la sesión visible.
  createEffect(
    on(vivas, (v) =>
      window.dispatchEvent(
        new window.CustomEvent("harness:turn", { detail: v.length }),
      ),
    ),
  );

  async function settleTurn(session: string, ok?: boolean | null, unsaved = false) {
    const generation = sessionGeneration;
    const revision = advanceTurn(session);
    finishedTurns.set(session, ok);
    batch(() => {
      setSettlingTurns((ids) => [...new Set([...ids, session])]);
      if (ok !== true) {
        const retained = ok === false ? "fallo" : "borrador";
        // «Detener y enviar»: la interrupción la pidió la persona para que
        // saliera lo que ya estaba escrito. Retener aquí dejaría el mensaje
        // parado y el gesto a medias; la marca se suelta al salir la cola.
        const saleAhora = enviarAlCerrar.has(session);
        if (session === sessionId() && !saleAhora) setRetenida(retained);
        if (draftFromDisk === session) draftFromDisk = null;
        const queued = savedQueues.get(session);
        if (queued) savedQueues.set(session, { ...queued, retained: saleAhora ? null : retained });
        if (ok == null) sinDesenlace.add(session);
        else sinDesenlace.delete(session);
      } else if (sinDesenlace.delete(session)) {
        // El registro lo dio por cerrado antes de que llegara su `done`: el
        // borrador era por no saber cómo acabó, y ya se sabe.
        if (session === sessionId() && retenida() === "borrador") setRetenida(null);
        const queued = savedQueues.get(session);
        if (queued?.retained === "borrador") savedQueues.set(session, { ...queued, retained: null });
      }
      marcarQuieta(session);
      anexar(session, (messages) =>
        messages.some((m) => m.paso?.corriendo)
          ? messages.map((m) =>
              m.paso?.corriendo ? { ...m, paso: { ...m.paso, corriendo: false } } : m,
            )
          : messages,
      );
      // Igual que en el `done`: el turno se acabó, y con él la espera de sus
      // hijas. Este camino es el del turno que cerró sin que su evento llegara.
      setEnFondo((ids) => ids.filter((id) => id !== session));
      if (deteniendo() === session) setDeteniendo(null);
      setPermissions((items) => items.filter((permission) => permission.session !== session));
      soltarTerminal(session);
      // `fallo` y no `aviso`: un aviso se pliega dentro del registro del turno,
      // y éste tiene que verse junto a la respuesta que se perderá.
      if (unsaved) anexar(session, (messages) => [...messages, { role: "system", text: t("chat.turn.unsaved"), meta: "fallo" }]);
    });
    const tab = pestanas.open().find((item) => item.id === session);
    const projectId = session === sessionId() ? project() : tab?.project ?? savedQueues.get(session)?.project ?? tareaDelRiel(session)?.folder;
    try {
      // El motor no pudo escribir el turno: el disco no lo tiene, y releerlo
      // borraría del chat la respuesta que la persona acaba de ver llegar.
      if (unsaved) return;
      if (projectId !== undefined) {
        const result = await leerTarea(projectId, session);
        if (generation === sessionGeneration && revision === turnRevisions.get(session))
          loadResult(session, result, true, generation);
      } else soltarHilo(session);
    } catch {
      // El fallo de lectura conserva lo recibido en vivo y no revive el proceso.
    } finally {
      if (generation === sessionGeneration && revision === turnRevisions.get(session)) batch(() => {
        setSettlingTurns((ids) => ids.filter((id) => id !== session));
        setCierres((n) => n + 1);
        void refreshSessions(grupos());
        void releerProyectos();
        if (ok === true) void drainHiddenQueue(session);
      });
    }
  }

  // Lo que reconstruye el turno en curso de una tarea que pasa a verse: lo filtrado y lo que lo acompaña.
  const REPUESTO = new Set(["delta", "reasoning", "tool", "tool_done", "command_output", "command_running", "shell_started", "shell_output", "image", "retry", "notice", "task_launched", "segment_saved"]);
  type PushedBatch = { events?: JournalEvent[]; catchup?: string; resync?: string };
  function applyPushed(batches: PushedBatch[]) {
    for (const lote of batches) {
      if (lote.resync) {
        releerUna(lote.resync);
        continue;
      }
      if (lote.catchup) {
        const session = lote.catchup;
        const events = (lote.events ?? []).filter((e) => {
          const payload = e.payload as Partial<ChatEvent> | null;
          return e.name === "chat" && payload?.session === session && REPUESTO.has(payload.kind ?? "");
        });
        const workspace = (events[0]?.payload as Partial<ChatEvent> | undefined)?.workspace;
        // Reemplaza lo vivo de la tarea, salvo lo que escribió la persona: el motor no lo repite.
        anexar(session, (messages) => {
          const kept = messages.filter((m) => m.role === "user");
          return kept.length === messages.length ? messages : kept;
        }, workspace);
        deliver(events);
        continue;
      }
      // Al mismo oyente y uno a uno, como llegaban de Tauri: lo que agrupa el pintado es del oyente.
      deliver(lote.events ?? []);
    }
  }
  /** `session_resync`: el turno en curso no cupo en el reenvío; se relee lo guardado y se conserva lo vivo. */
  function releerUna(session: string) {
    const generation = sessionGeneration;
    const projectId = esDeLaAbierta(session) ? project() : pestanas.open().find((p) => p.id === session)?.project ?? tareaDelRiel(session)?.folder;
    if (projectId === undefined) return;
    void leerTarea(projectId, session)
      .then((s) => loadResult(session, s, false, generation))
      .catch(() => {});
  }
  // El filtro de la suscripción: de las demás tareas solo llegan inicio y fin, no su flujo token a token.
  let filtroEnviado: string | null = null;
  let filtroEnCola = false;
  const tareasQueSeVen = () => {
    const ids = new Set([...sesionesConPestana(), sessionId() ?? "", ...vivas()]);
    for (const key of liveThreads) ids.add(key.slice(key.indexOf("/") + 1));
    return [...ids].filter((id) => id !== "" && !esProvisional(id)).sort();
  };
  function enviarFiltro() {
    if (!historialPaginado || filtroEnCola) return;
    filtroEnCola = true;
    queueMicrotask(() => {
      filtroEnCola = false;
      if (!historialPaginado) return;
      const sessions = tareasQueSeVen();
      const key = sessions.join("\n");
      if (key === filtroEnviado) return;
      filtroEnviado = key;
      void invoke("service_filter", { sessions }).catch(() => {
        filtroEnviado = null;
      });
    });
  }
  createEffect(on([sesionesConPestana, sessionId, vivas], enviarFiltro, { defer: true }));

  let serviceListenersReady: Promise<unknown> = Promise.resolve();
  onMount(() => {
    let disposed = false;
    let cursor: number | null = null;
    let replay = true;
    let runtime: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failingSince: number | null = null;
    // Con el stream empujado `service_poll` espera en Rust a que haya algo: se vuelve a pedir enseguida.
    let pushed = false;
    const poll = async () => {
      await Promise.resolve();
      await serviceListenersReady;
      if (disposed) return;
      pushed = false;
      try {
        const page = await invoke<{ cursor: number | null; gap: boolean; streams?: boolean; replay: boolean; runtime: string; reset: boolean; push?: boolean; batches?: PushedBatch[] }>("service_poll", { cursor, workspace: null, replay, runtime });
        if (disposed) return;
        if (page.batches) applyPushed(page.batches);
        pushed = page.push === true;
        if (pushed !== historialPaginado) {
          historialPaginado = pushed;
          filtroEnviado = null;
          enviarFiltro();
        }
        cursor = page.cursor;
        replay = page.replay;
        runtime = page.runtime;
        if (page.reset || page.gap || page.streams || failingSince !== null) window.dispatchEvent(new CustomEvent("harness:service-resync"));
        // Un stream de comando cortado (árbol, git) se relee, pero no es salida en vivo perdida.
        if (page.reset || page.gap || page.streams) releerTrasHueco();
        if (page.reset) {
          deltasPorCuadro.vaciar();
          liveThreads.clear();
          enviarFiltro();
          workspaceThreads.clear();
          setHilos((threads) => Object.fromEntries(Object.entries(threads).map(([id, thread]) => [id, { ...thread, vivo: [] }])));
          setPermissions([]);
          if (vivas().length > 0) setError(t("chat.error.service_restarted"));
          void reconcileActiveTurns();
        }
        // Un reinicio sin turnos vivos también corta el stream (`page.gap`); sin
        // esta guarda el aviso de hueco sale sin que nada se haya perdido.
        if (page.gap && vivas().length > 0) setError(t("chat.error.service_gap"));
        if (failingSince !== null) {
          failingSince = null;
          if (error() === t("chat.error.service_unavailable") || error() === t("shell.service.engine_down") || error() === t("shell.service.engine_missing") || error() === t("shell.service.managed") || error() === t("shell.service.machine_off") || error() === t("shell.service.machine_starting")) setError(null);
        }
      } catch (e) {
        // Un sondeo suelto falla al empezar un turno y el siguiente ya contesta.
        failingSince ??= Date.now();
        const sinMotor = claveDe(e) === "shell.service.engine_missing";
        // Una máquina remota apagada no es un fallo: se enciende al enviar algo.
        const apagada = claveDe(e) === "shell.service.machine_off";
        const encendiendo = claveDe(e) === "shell.service.machine_starting";
        const managed = claveDe(e) === "shell.service.managed";
        const caido = sinMotor || managed || apagada || encendiendo || claveDe(e) === "shell.service.engine_down";
        // La computadora en reposo tiene su indicador, también en escritorio.
        if (apagada || encendiendo || asleep(e)) return;
        if (!disposed && Date.now() - failingSince > (caido ? 2_000 : 10_000)) {
          setError(sinMotor ? t("shell.service.engine_missing") : managed ? t("shell.service.managed") : apagada ? t("shell.service.machine_off") : encendiendo ? t("shell.service.machine_starting") : t(caido ? "shell.service.engine_down" : "chat.error.service_unavailable"));
        }
      } finally {
        if (!disposed) timer = setTimeout(() => void poll(), pushed ? 0 : 250);
      }
    };
    void poll();
    onCleanup(() => { disposed = true; if (timer) clearTimeout(timer); });
  });

  async function reconcileActiveTurns() {
    const workspace = workspaceActivo();
    if (!workspace) return;
    const revision = lifecycleRevision;
    const generation = sessionGeneration;
    try {
      const [active, timing] = await Promise.all([
        invoke<string[]>("list_active_turns", { workspace }),
        invoke<LiveTurn[]>("list_live_turns").catch(() => []),
      ]);
      if (generation !== sessionGeneration || revision !== lifecycleRevision) return;
      const enVuelo = timing.filter((turn) => turn.workspace === workspace && active.includes(turn.session));
      setDesdeDeTurno((previous) => ({ ...previous, ...Object.fromEntries(
        enVuelo.map((turn) => [turn.session, turn.started_at]),
      ) }));
      // Una ventana que reabre con un `!` en marcha lo pinta como comando y no
      // como turno del agente; el diario repite después su salida.
      for (const turn of enVuelo) {
        if (turn.shell && !terminales()[turn.session]) {
          ponerTerminal(turn.session, { ...turn.shell, cwd: null, output: "", truncated: false, desde: turn.started_at });
        }
      }
      // El evento efímero no basta al reabrir una ventana.
      const esperandoHijas = new Set(enVuelo.filter((turn) => turn.background).map((turn) => turn.session));
      const conocidas = new Set(enVuelo.filter((turn) => typeof turn.background === "boolean").map((turn) => turn.session));
      setEnFondo((ids) => {
        const siguiente = [...new Set([...ids.filter((id) => !conocidas.has(id) || esperandoHijas.has(id)), ...esperandoHijas])];
        return siguiente.length === ids.length && siguiente.every((id) => ids.includes(id)) ? ids : siguiente;
      });
      for (const id of active) pendingStarts.delete(id);
      const nuevas = active.filter((id) => !vivas().includes(id));
      const finished = vivas().filter((id) => !active.includes(id) && !pendingStarts.has(id) && !drainingQueues.has(id));
      for (const id of nuevas) void reponerGates(id);
      for (const id of active) if (!settlingTurns().includes(id)) marcarViva(id);
      for (const id of finished) void settleTurn(id);
    } catch {
      // Un IPC fallido no demuestra que el turno haya terminado.
    }
  }

  onMount(() => {
    const refresh = () => void reconcileActiveTurns();
    const refrescarAgentes = () => {
      // Al volver a la ventana (o a la pestaña) se releen los agentes: pueden
      // haberse escrito o editado archivos en `.agents/` por fuera de la app.
      window.dispatchEvent(new CustomEvent("harness:encargados"));
      window.dispatchEvent(new CustomEvent("harness:profiles"));
    };
    const alHacerseVisible = () => {
      if (document.visibilityState === "visible") refrescarAgentes();
    };
    const timer = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    window.addEventListener("focus", refrescarAgentes);
    document.addEventListener("visibilitychange", alHacerseVisible);
    onCleanup(() => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("focus", refrescarAgentes);
      document.removeEventListener("visibilitychange", alHacerseVisible);
    });
  });
  createEffect(on(workspaceActivo, () => void reconcileActiveTurns()));

  // Los tres oyentes de Rust. Los nombres van como cadena literal:
  // `scripts/guards/bridge.mjs` comprueba que alguien emita lo que la interfaz
  // escucha, y es lo único que sabe leer; una constante lo deja ciego sin
  // fallar. Se suscriben una vez: las funciones de respuesta leen
  // `sessionId()` y las demás señales al recibir cada evento, y copiar sus
  // valores al montar las dejaría trabajando con la sesión anterior.

  // Las capas nativas son hijas de la ventana, no del documento: una recarga
  // del webview —HMR en desarrollo, o un proceso de contenido que se cae y
  // vuelve— las dejaría flotando sobre la interfaz sin pestaña que las
  // cierre. Aquí es el primer instante en que se sabe que el documento es
  // nuevo. Ver `sites::site_sweep`.
  onMount(() => void invoke("site_sweep").catch(() => {}));
  // Lo mismo con los Tinymist de la vista de Typst: sin visor que los suelte, seguirían vivos.
  onMount(soltarVistasHuerfanas);

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
        detail,
        mcp_app,
        ok,
        request_id,
        origin,
        starts_message,
        message_id,
        task,
      } = e.payload;
      const append = (fn: (messages: Msg[]) => Msg[]) => anexar(session, fn, workspace);
      // Lo que no es texto se ordena detrás de los fragmentos que llegaron antes.
      if (kind !== "delta") deltasPorCuadro.vaciar();
      // Que un turno terminó se apunta ANTES del filtro de abajo: es la mitad
      // que hace posible trabajar en dos tareas. El filtro descarta lo que no
      // se está mirando, correcto para pintar, pero el cierre no es pintura:
      // si se descartara, la tarea que terminó mientras mirabas otra seguiría
      // marcada como viva para siempre, con su caja en «Detener» y sin nada
      // corriendo detrás.
      if (kind === "done") {
        setEnFondo((ids) => ids.filter((id) => id !== session));
        if (!esDelWorkspaceAbierto(workspace)) {
          advanceTurn(session);
          if (workspace) {
            liveThreads.delete(liveThreadKey(workspace, session));
            enviarFiltro();
            const threads = workspaceThreads.get(workspace);
            if (threads) delete threads[session];
          }
          setPermissions((items) => items.filter((permission) => permission.session !== session));
        }
        if (esDelWorkspaceAbierto(workspace)) finishedTurns.set(session, ok);
        // Lo mismo que `settleTurn`, para la cola de un workspace que no se mira.
        const retentions = workspace ? workspaceRetentions.get(workspace) : undefined;
        if (!esDelWorkspaceAbierto(workspace) && ok !== true && retentions?.has(session)) {
          retentions.set(session, ok === false ? "fallo" : "borrador");
        }
        if (esDelWorkspaceAbierto(workspace) && deteniendo() === session) setDeteniendo(null);
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
          marcarViva(session);
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

      if (kind === "started") return;

      if (kind === "task_launched") {
        if (task && id) append(messages => messages.some(message => message.turno === id) ? messages : [
          ...messages, { role: "system", text: "", meta: "task_launched", fromTask: task, turno: id },
        ]);
        if (esDelWorkspaceAbierto(workspace)) void refreshSessionsOnEvent(carpetasDeTarea(session));
        return;
      }

      if (kind === "segment_saved") {
        if (id) append((messages) => tramoGuardado(messages, id));
        return;
      }

      if (kind === "mcp_auth") {
        noteMcpSignIn(session, text);
        return;
      }

      if (kind === "model") {
        if (session === sessionId()) setModel(text);
        return;
      }
      if (kind === "effort") {
        if (session === sessionId()) setEffort(text);
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

      // Un paso que arranca: la fila aparece con lo que ya se sabe —qué
      // herramienta, sobre qué— y gira hasta que vuelva su resultado. Gira
      // solo si trae `id`: es con lo que empareja su `tool_done`, y sin él
      // una fila marcada como corriendo se quedaría girando el resto de la
      // sesión.
      if (kind === "tool") {
        append((m) => [
          ...m,
          {
            role: "system",
            text,
            meta: "usó",
            paso: pasoDe(text, target ?? null, {
              id,
              detalle: detail ?? null,
              mcpApp: mcp_app ?? mcpCallFromName(text),
              corriendo: id !== undefined,
            }),
          },
        ]);
        return;
      }

      // Y el paso que cierra: empareja solo contra una fila que siga
      // corriendo. Los ids de Codex son `item_0`, `item_1`… y reinician en
      // cada turno; sin esa condición el segundo turno completaría las
      // filas del primero. Si no encuentra a quién cerrar, se cierra sola.
      if (kind === "tool_done") {
        const imagenes = detail?.kind === "output" ? detail.images : undefined;
        append((m) => {
          const cerrado = (p: Paso): Paso => ({
            ...p,
            corriendo: false,
            ok,
            detalle: detail ?? p.detalle,
            mcpApp: mcp_app ? { ...p.mcpApp, ...mcp_app, arguments: mcp_app.arguments ?? p.mcpApp?.arguments } : p.mcpApp ?? mcpCallFromName(text),
          });
          let i = m.length - 1;
          while (i >= 0 && !(m[i].paso?.corriendo && m[i].paso?.id === id)) i--;
          const conPaso: Msg[] =
            i < 0
              ? [
                  ...m,
                  {
                    role: "system",
                    text,
                    meta: "usó",
                    paso: cerrado(pasoDe(text, target ?? null, { id })),
                  },
                ]
              : (() => {
                  const copia = [...m];
                  copia[i] = { ...m[i], paso: cerrado(m[i].paso as Paso) };
                  return copia;
                })();
          return imagenes?.length ? anexarImagen(conPaso, imagenes) : conPaso;
        });
        return;
      }

      if (kind === "done") {
        void settleTurn(session, ok, text === "unsaved");
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
          asentar(session, (ms) => ms.some((m) => m.turno === id) ? ms : [
            ...ms,
            {
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
            },
          ]);
        }
        return;
      }

      if (kind === "permission") {
        setPermissionError(null);
        if (!request_id) {
          append((m) => [
            ...m,
            {
              role: "system",
  // Sin nombrar a un agente: un literal escrito mirando a uno nombra al
  // equivocado justo cuando algo va mal. Los de protocolo también piden
  // permiso.
              text: t("shell.turn.permission_no_reply"),
              meta: "fallo",
            },
          ]);
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

      // Sin este corte cae al delta de abajo y la salida de un comando de
      // barra se pinta como respuesta del agente. `meta` trae la fila con que
      // Rust la guarda; la tarjeta en curso se va cuando llega su salida.
      if (kind === "command_output" || kind === "command_running") {
        const fila: Msg = {
          role: "system",
          text,
          meta: kind === "command_running" ? kind : (meta ?? "command_output"),
          agent: filaDe(session)?.provider ?? (session === sessionId() ? agent() : undefined),
        };
        append((m) => [...m.filter((x) => x.meta !== "command_running"), fila]);
        return;
      }

      // `tool` no cae aquí: lo atiende la línea de tiempo, que además tiene que
      // casar el `tool_done` con el paso que abrió.
      // Una entrega de otra tarea espera a que este turno cierre: es la fila que
      // el motor ya dejó en la transcripción, que no se relee hasta el cierre.
      // La prosa del evento es para una ventana anterior.
      if (kind === "notice" && meta === "delivery_pending") {
        append((m) => id && m.some((x) => x.turno === id) ? m : [
          ...m, { role: "system", text: "", meta: "delivery_pending", fromTask: task ?? undefined, turno: id },
        ]);
        return;
      }
      if (kind === "notice") {
        const message = clavesConocidas().has(text) ? t(text) : text;
        append((m) => [...m, { role: "system", text: message, meta: meta?.startsWith("handler_") ? meta : "aviso" }]);
        return;
      }

      // Sin este corte, la presencia cae al delta de abajo —destino de todo lo
      // que no se reconoce— y su etiqueta acaba concatenada dentro de la
      // respuesta del agente. No es conversación: la pinta el riel.
      if (kind === "presence") return;

      // La imagen va en la respuesta, no en el rastro. Si cayera al delta de
      // abajo, el kind se concatenaría al texto.
      if (kind === "image") {
        const imagenes = detail?.kind === "output" ? detail.images ?? [] : [];
        if (imagenes.length > 0) append((m) => anexarImagen(m, imagenes));
        return;
      }

      // El razonamiento no es la respuesta: va a su bloque. Sin este corte cae
      // al delta de abajo y se lee como lo que el agente contestó.
      if (kind === "reasoning") {
        append((m) =>
          anexarRazonamiento(m, {
            text,
            messageId: message_id,
            author: firmas[session] ?? firmas[""] ?? null,
          }),
        );
        return;
      }

      // Sólo `delta` llega a su rama. Un kind que esta ventana no conoce se
      // ignora: el motor puede mandar uno nuevo antes de que exista aquí.
      if (kind !== "delta") return;

      // delta: los fragmentos se CONCATENAN SIN SEPARADOR. Meter "\n" aquí
      // parte cada token en su propia línea y el texto sale destrozado.
      //
      // Salvo que el CLI diga que aquí empieza otro mensaje, o que diga a qué
      // mensaje pertenece el fragmento: ACP manda `message_id`, y su orden de
      // entrega puede meter una herramienta entre dos fragmentos del mismo
      // mensaje. Sin devolver el texto a su globo, el mensaje sale partido.
      deltasPorCuadro.meter(session, workspace ?? workspaceActivo() ?? undefined, {
        text,
        messageId: message_id,
        startsMessage: starts_message,
        author: firmas[session] ?? firmas[""] ?? null,
        model: modelosEnVivo[session] ?? modelosEnVivo[""] ?? null,
      });
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
      anexar(session, (m) => {
        const ultimo = m[m.length - 1];
        if (ultimo?.role === "agent" && !ultimo.turno)
          return [
            ...m.slice(0, -1),
            {
              ...ultimo,
              turno,
              preguntas,
              questionRequestId: request_id,
              agent: conAgente,
            },
          ];
        // Un turno que solo preguntó, sin decir nada más, también es un turno.
        return [
          ...m,
          {
            role: "agent",
            text: "",
            turno,
            preguntas,
            questionRequestId: request_id,
            agent: conAgente,
          },
        ];
      }, workspace ?? workspaceActivo());
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
      cargarComandos(agent());
    });
    onCleanup(() => void usageEv.then((f) => f()));

    // Instalar un agente lo deja usable aquí, no solo en la pantalla
    // donde se instaló. Esta lista se leía una vez en `onMount`: quien
    // conectaba una cuenta desde Ajustes veía ahí su consumo, y en el
    // chat el mismo agente seguía diciendo «no está instalado», con el
    // campo muerto hasta cerrar y volver a abrir la app.
    const agentsEv = listen("providers", () => {
      void invoke<Agent[]>("list_providers").then(setAgents).catch(() => {});
      // Y qué se puede usar, que es lo que decide el menú. Conectar una cuenta
      // desde Configuración añade una entrada aquí; desinstalar un CLI se la
      // lleva. Sin esto había que cerrar la app para verlo.
      void cargarSuperficies(false);
    });
    onCleanup(() => void agentsEv.then((f) => f()));

    // Un plugin instalado o activado trae skills: sin esto `/typst` no se
    // reconoce hasta el siguiente turno.
    const pluginsEv = listen("integrations-changed", () => cargarComandos(agent()));
    onCleanup(() => void pluginsEv.then((f) => f()));

    // Cambió qué cuenta va a correr: cambió qué se puede usar.
    // `surfaces::sin_cuenta` pregunta por la cuenta activa, y la sonda de
    // estado la quita en cuanto una deja de responder
    // (`accounts::account_status`). Sin escuchar esto, el selector sigue
    // ofreciendo un agente que ya no puede correr, y el turno muere
    // contra el guarda con un muro de texto.
    const cuentaEv = listen("account", () => {
      void cargarSuperficies(false);
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
      if (changes.includes("sessions")) void refreshSessionsOnEvent(grupos());
      if (changes.includes("spaces")) void reloadSpaces();
      if (changes.includes("mentions") && input().includes("@")) void refreshTaskCandidates();
      if (changes.includes("projects")) {
        const workspace = workspaceActivo();
        void invoke<Project[]>("list_projects").then((items) => {
          if (workspace === workspaceActivo()) setProjectList(items);
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
      void invoke<Project[]>("list_projects").then((items) => {
        if (workspace === workspaceActivo()) setProjectList(items);
      }).catch((error) => { if (!asleep(error)) setError(prosaDe(error)); });
      void reloadSpaces();
      void cargarSuperficies(false);
      setCuentasTocadas((n) => n + 1);
      window.dispatchEvent(new CustomEvent("harness:tasks-changed"));
      // El mismo aviso que dan `NewAgent.tsx` y `AgentProfile.tsx`: sin él, lo
      // creado o cambiado desde el CLI no sale en el riel hasta cambiar de carpeta.
      if (e.payload.command === "handler.create" || e.payload.command === "handler.update") {
        window.dispatchEvent(new CustomEvent("harness:encargados"));
        window.dispatchEvent(new CustomEvent("harness:profiles"));
      }
      if (e.payload.command === "config.set") {
        void invoke<Startup>("list_workspaces").then((startup) => {
          if (workspace !== workspaceActivo()) return;
          const current = startup.workspaces.find((w) => w.id === workspace);
          aplicarLenguaDeWorkspace(current?.lengua ?? null);
          setWorkspaceMode(current?.default_permission_mode ?? null);
        }).catch((error) => { if (!asleep(error)) setError(prosaDe(error)); });
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
      const generation = sessionGeneration;
      const { session, project, workspace } = e.payload;
      if (!esDelWorkspaceAbierto(workspace)) return;
      // El historial primero, y para todos: una tarea que la otra ventana
      // acaba de crear no está en ningún hilo de esta. Releer solo la abierta
      // la dejaría invisible hasta cambiar de proyecto. Su carpeta basta: el
      // aviso la trae, y releerlas todas esperaba a la más lenta.
      void refreshSessionsOnEvent(carpetasDeTarea(session, project));
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

  async function responderPermiso(p: PermissionRequest, allow: boolean) {
    setRespondiendoPermiso(true);
    setPermissionError(null);
    const workspace = p.workspace ?? workspaceActivo();
    try {
      const current = p.revision === undefined
        ? (await pendientesDe(p.session, workspace))?.permissions.find((x) => (x.request_id === p.requestId || x.id === p.requestId))
        : { revision: p.revision, id: p.durableId };
      // Un motor anterior a los pendientes durables los lista sin `id` ni
      // `revision` y contesta por `request_id`; exigir la revisión dejaba el
      // gate sin forma de aprobarse. El motor nuevo acepta la misma forma.
      const guardado = await invoke<Turn>("respond_permission", {
        session: p.session,
        requestId: current?.id ?? p.requestId,
        revision: current?.revision,
        allow,
      }, opcionesDeLaTarea(p.session, workspace));
      // El `permission_resolved` de esta misma decisión puede haber llegado
      // antes que la respuesta: ese turno ya está pintado.
      const fila: Msg = {
        role: "user",
        text: guardado.text,
        turno: guardado.id ?? undefined,
        permission: guardado.permission ?? undefined,
        author: guardado.author ?? undefined,
      };
      asentar(p.session, (ms) => [...ms.filter((m) => !fila.turno || m.turno !== fila.turno), fila]);
      setPermissions((ps) => ps.filter((x) => x.session !== p.session || x.requestId !== p.requestId));
    } catch (e) {
      const { sinRespuesta } = await import("../features/chat/permissionRecovery");
      const cerrada = sinRespuesta(p, await pendientesDe(p.session, workspace), e);
      if (cerrada) {
        setPermissions(ps => ps.filter(x => x.session !== p.session || x.requestId !== p.requestId));
        if (cerrada !== "respondida") asentar(p.session, ms => [...ms, cerrada]);
        return;
      }
      await reponerGates(p.session, workspace);
      setPermissionError(prosaDe(e));
    } finally {
      setRespondiendoPermiso(false);
    }
  }

  function ponerTerminal(session: string, comando: ComandoEnVivo) {
    setTerminales((ts) => ({ ...ts, [session]: comando }));
  }

  function soltarTerminal(session: string) {
    setTerminales((ts) => {
      if (!(session in ts)) return ts;
      const { [session]: _, ...resto } = ts;
      return resto;
    });
  }

  function quitarDeLaCola(session: string, id: string) {
    const saved = savedQueues.get(session);
    if (saved) savedQueues.set(session, { ...saved, items: saved.items.filter((q) => q.id !== id) });
    if (session === sessionId()) setCola((c) => c.filter((q) => q.id !== id));
  }

  // Lo que se pinta de un `!` en marcha. Más atrás no se lee y volver a pintarlo
  // entero en cada trozo es lo que cuesta.
  const SALIDA_EN_VIVO = 64_000;

  function alComando(session: string, kind: string, ev: { id: string; text: string; meta?: string | null; target?: string | null }) {
    if (kind === "shell_started") {
      adoptarComando(ev.id, session);
      const previo = terminales()[session];
      batch(() => {
        pendingStarts.delete(session);
        advanceTurn(session);
        setSettlingTurns((ids) => ids.filter((id) => id !== session));
        finishedTurns.delete(session);
        marcarViva(session);
        // El diario repite el arranque y los trozos al recargar: se empieza de cero.
        ponerTerminal(session, {
          id: ev.id,
          command: ev.text,
          cwd: ev.target ?? null,
          output: "",
          truncated: false,
          desde: previo?.id === ev.id ? previo.desde : Date.now(),
        });
        const carpeta = ev.target;
        if (carpeta) setCarpetasDeTerminal((cs) => ({ ...cs, [session]: carpeta }));
        const enCola = comandosDeLaCola.get(session);
        if (enCola) quitarDeLaCola(session, enCola);
      });
      return;
    }
    if (kind === "shell_output") {
      setTerminales((ts) => {
        const vivo = ts[session];
        if (!vivo || vivo.id !== ev.id) return ts;
        const output = vivo.output + ev.text;
        const sobra = output.length - SALIDA_EN_VIVO;
        return {
          ...ts,
          [session]: {
            ...vivo,
            output: sobra > 0 ? output.slice(sobra) : output,
            truncated: vivo.truncated || sobra > 0 || ev.meta === "truncated",
          },
        };
      });
      return;
    }
    const vivo = terminales()[session];
    const lanzado = lanzados.get(session);
    lanzados.delete(session);
    comandosDeLaCola.delete(session);
    const detenido = detenidos.delete(session);
    const codigo = ev.meta ? Number(ev.meta) : null;
    const restantes = session === sessionId() ? cola() : savedQueues.get(session)?.items ?? [];
    // Sin superficie utilizable nadie contesta: la salida viaja con el primer mensaje.
    const hayQuienConteste = (superficies() ?? []).some((s) => s.usable && s.provider === lanzado?.provider);
    const contestar = lanzado && codigo !== null && contestaALaTerminal(restantes, detenido, hayQuienConteste) ? lanzado : null;
    // Hasta que se relea el disco: sin esto la tarjeta desaparece un instante.
    if (vivo && codigo !== null) anexar(session, (ms) => [...ms, mensajeDeTerminal(vivo, codigo)]);
    if (contestar) setPorContestar((ss) => [...ss, session]);
    void settleTurn(session, true).then(() => {
      if (contestar) void contestarALaTerminal(session, contestar);
    });
  }

  function mensajeDeTerminal(vivo: ComandoEnVivo, codigo: number): Msg {
    const shell = {
      cwd: vivo.cwd ?? "",
      output: vivo.output,
      exit_code: codigo,
      truncated: vivo.truncated,
      duration_ms: Date.now() - vivo.desde,
    };
    return {
      role: "system",
      text: vivo.command,
      meta: "usó",
      shell,
      paso: pasoDe("command_execution", vivo.command, {
        ok: codigo === 0,
        detalle: { kind: "output", text: shell.output, exit_code: codigo, truncated: shell.truncated, cwd: shell.cwd },
      }),
    };
  }

  // Sin esta marca, entre releer el disco y abrir la respuesta la tarjeta dice que nadie contesta.
  const [porContestar, setPorContestar] = createSignal<readonly string[]>([]);
  /** El turno en que el agente contesta a la salida de la terminal, sin que nadie escriba. */
  async function contestarALaTerminal(session: string, lanzado: TerminalLanzada) {
    try {
      await abrirRespuestaALaTerminal(session, lanzado);
    } finally {
      setPorContestar((ss) => ss.filter((s) => s !== session));
    }
  }

  async function abrirRespuestaALaTerminal(session: string, lanzado: TerminalLanzada) {
    if (vivas().includes(session) || settlingTurns().includes(session)) return;
    pendingStarts.set(session, Symbol());
    marcarViva(session);
    try {
      const abrio = await invoke<boolean>("answer_shell_output", {
        provider: lanzado.provider,
        project: lanzado.project,
        session,
        model: lanzado.model,
        effort: lanzado.effort,
        permissionMode: lanzado.permission_mode,
      }, deLaTarea(session));
      if (abrio) {
        asentar(session, (ms) => [...ms, { role: "system", text: "", meta: "shell_reply", agent: lanzado.provider }]);
        return;
      }
    } catch (error) {
      anexar(session, (ms) => [...ms, { role: "system", ...mensajeDeFallo(error), meta: "fallo" }]);
    }
    pendingStarts.delete(session);
    marcarQuieta(session);
  }

  /** Corre un `!` y devuelve el error, o `null` si corrió. */
  async function ejecutarComando(session: string, lanzado: TerminalLanzada, command: string, queueId: string | null) {
    lanzados.set(session, lanzado);
    pendingStarts.set(session, Symbol());
    // Sin id hasta `shell_started`: hasta entonces la tarea tampoco es del agente.
    batch(() => {
      marcarViva(session);
      ponerTerminal(session, {
        id: "",
        command: command.trim(),
        cwd: carpetasDeTerminal()[session] ?? null,
        output: "",
        truncated: false,
        desde: Date.now(),
      });
    });
    try {
      await invoke<Corrida>("run_shell_command", { project: lanzado.project, session, command, queueId }, deLaTarea(session));
      return null;
    } catch (error) {
      if (lanzados.get(session) === lanzado) {
        lanzados.delete(session);
        pendingStarts.delete(session);
        if (!terminales()[session]?.id) {
          soltarTerminal(session);
          marcarQuieta(session);
        }
      }
      anexar(session, (ms) => [...ms, { role: "system", ...mensajeDeFallo(error), meta: "fallo" }]);
      return error;
    }
  }

  /** La tarea que abrió un `!` de esta ventana toma su fila, su pestaña y, si se sigue mirando, la vista. */
  function adoptarComando(runId: string, session: string) {
    const nace = nacenConComando.get(runId);
    if (!nace) return false;
    nacenConComando.delete(runId);
    nace.session = session;
    if (nace.generation !== sessionGeneration) return true;
    lanzados.set(session, nace.lanzado);
    batch(() => {
      soltarTerminal("");
      setArrancando(false);
      adoptarNacida(session, { provisional: nace.provisional, proyecto: nace.lanzado.project, titulo: nace.titulo, claveBorrador: nace.claveBorrador });
      if (claveAbierta() !== nace.claveBorrador) return;
      setSessionId(session);
      setHablandoCon(null);
      setColaDe(session);
    });
    return true;
  }

  /** Corre un `!` escrito sin tarea: Rust la abre con lo que la caja tiene puesto. Dice si corrió. */
  async function abrirConComando(command: string): Promise<boolean> {
    const proyecto = project();
    const claveBorrador = claveAbierta();
    const encargado = hablandoCon()?.name ?? null;
    const lanzado = { project: proyecto, provider: agent(), model: model() || null, effort: effort() || null, permission_mode: modo() || null };
    const titulo = tituloProvisional(command);
    const runId = crypto.randomUUID();
    const nace: ComandoQueNace = {
      lanzado,
      provisional: pintarNaciendo(proyecto, titulo, lanzado, encargado),
      titulo,
      claveBorrador,
      generation: sessionGeneration,
      session: null,
    };
    nacenConComando.set(runId, nace);
    lifecycleRevision++;
    batch(() => {
      setArrancando(true);
      ponerTerminal("", { id: "", command: command.trim(), cwd: null, output: "", truncated: false, desde: Date.now() });
    });
    try {
      const enOtra = draftOptions();
      const corrida = await invoke<Corrida>("run_shell_command", {
        project: proyecto,
        session: null,
        command,
        queueId: null,
        provider: lanzado.provider,
        model: lanzado.model,
        effort: lanzado.effort,
        permissionMode: lanzado.permission_mode,
        space: espacioPara(escritorio(), enOtra?.headers["x-terminus-machine"]),
        agent: encargado,
        baseRef: draftBases()[claveBorrador] ?? null,
        runId,
      }, enOtra);
      // Sin su `shell_started` no hay nada pintado: se adopta aquí y se lee del disco.
      if (adoptarComando(runId, corrida.session) && nace.generation === sessionGeneration) void settleTurn(corrida.session, true);
      return true;
    } catch (error) {
      // Tras arrancar, la tarea queda con el fallo escrito y llega al releerla.
      if (nace.session) return false;
      nacenConComando.delete(runId);
      batch(() => {
        soltarTerminal("");
        setArrancando(false);
        retirarNaciendo(nace.provisional);
        pestanas.close(nace.provisional);
        olvidarPestana(nace.provisional);
      });
      if (nace.generation !== sessionGeneration) return false;
      // La frase de un modo que el agente no sostiene nombra al agente.
      const label = agents().find((a) => a.id === lanzado.provider)?.label ?? lanzado.provider;
      anexar("", (ms) => [...ms, { role: "system", ...mensajeDeFallo(error, { agent: label }), meta: "fallo" }]);
      return false;
    }
  }

  // Sale de la cola al arrancar (`shell_started`), no al terminar: mientras corre
  // ya se ve en su tarjeta.
  async function ejecutarDeLaCola(item: Encolado) {
    const abierta = sessionId();
    if (!abierta) return;
    setInjecting((items) => [...items, { session: abierta, id: item.id }]);
    comandosDeLaCola.set(abierta, item.id);
    const sesion = configDeLaSesion(abierta);
    const lanzado = {
      project: project(),
      provider: sesion.provider,
      model: sesion.model,
      effort: sesion.effort,
      permission_mode: item.permission_mode,
    };
    const error = await ejecutarComando(abierta, lanzado, item.text.trimStart().slice(1), item.id);
    if (comandosDeLaCola.get(abierta) === item.id) comandosDeLaCola.delete(abierta);
    setInjecting((items) => items.filter((q) => q.id !== item.id));
    const clave = error === null ? null : claveDe(error);
    if (error === null || clave === "chat.shell.not_queued" || clave === "chat.shell.not_from_person") {
      quitarDeLaCola(abierta, item.id);
    } else if (sessionId() === abierta) setRetenida("fallo");
  }

  /** Le teclea al `!` en marcha de una tarea. La terminal no hace eco: lo pinta la ventana. */
  async function teclearAlComando(id: string | null | undefined, texto: string, eco: boolean): Promise<boolean> {
    const vivo = id ? terminales()[id] : null;
    if (!id || !vivo?.id) return false;
    try {
      if (!(await invoke<boolean>("write_shell_input", { session: id, input: texto }, deLaTarea(id)))) return false;
    } catch (e) {
      anexar(id, (m) => [...m, { role: "system", ...mensajeDeFallo(e), meta: "fallo" }]);
      return false;
    }
    // Una tecla suelta (flecha, Enter de menú) no se pinta: la dibuja el propio programa.
    const tecla = texto.length <= 3 && !/^[^\u001b\r\t ]+\r$/.test(texto);
    const linea = tecla ? "" : texto.replace(/\u0004/g, "").replace(/\r$/, "\n");
    const pintado = eco ? linea : linea && "\n";
    if (pintado) {
      setTerminales((ts) => {
        const actual = ts[id];
        if (!actual || actual.id !== vivo.id) return ts;
        return { ...ts, [id]: { ...actual, output: actual.output + pintado } };
      });
    }
    return true;
  }

  async function detener() {
    const id = sessionId();
    if (!busy() || !id || stopping()) return;
    setDeteniendo(id);
    setPermissionError(null);
    if (terminales()[id] || lanzados.has(id)) {
      detenidos.add(id);
      try {
        if (!(await invoke<boolean>("stop_shell_command", { session: id }, deLaTarea(id)))) {
          detenidos.delete(id);
          setDeteniendo(null);
        }
      } catch (e) {
        detenidos.delete(id);
        setDeteniendo(null);
        anexar(id, (m) => [...m, { role: "system", text: t("shell.turn.stop_failed", { error: prosaDe(e) }), meta: "fallo" }]);
      }
      return;
    }
    try {
      await invoke("stop_turn", { project: project(), session: id }, deLaTarea(id));
      await reconcileActiveTurns();
      // Rust ya quitó el gate y cerró su stdin. La hoja desaparece en el mismo
      // gesto, sin esperar a que el proceso termine de emitir su cierre.
      setPermissions((ps) => ps.filter((p) => p.session !== id));
    } catch (e) {
      await reconcileActiveTurns();
      if (!vivas().includes(id)) return;
      setDeteniendo(null);
      anexar(id, (m) => [
        ...m,
        {
          role: "system",
          text: t("shell.turn.stop_failed", { error: prosaDe(e) }),
          meta: "fallo",
        },
      ]);
    }
  }

  // La cola se guarda en la carpeta de la sesión, no en esta máquina: es
  // del trabajo, no una preferencia, y se va con ella al borrarla. Sin
  // sesión el guardado se salta —el primer turno la crea y se guarda de
  // golpe. Lo que NO escribe es una mano vacía que estrena dueño —la
  // sesión recién abierta—: si su `.cola.json` no se pudo leer, guardarla
  // encima borraría lo único que quedaba dentro.
  createEffect(
    on([cola, colaDe] as const, ([items, de], antes) => {
      // `on` corre su cuerpo sin rastrear: leer aquí qué se está mirando
      // no suscribe este efecto a la sesión abierta.
      if (!guardable(de, sessionId())) return;
      // La mano no cambió y está vacía: esto es el estreno de dueño y nada más.
      if (antes && antes[0] === items && items.length === 0) return;
      invoke("save_queue", {
        project: project(),
        session: de,
        queued: items,
      }, deLaTarea(de)).catch((e) =>
        anexar(de, (m) => [
          ...m,
          {
            role: "system",
            text: t("shell.queue.save_failed", { error: prosaDe(e) }),
            meta: "aviso",
          },
        ]),
      );
    }),
  );

  createEffect(() => {
    const id = sessionId();
    if (id && sueltaElBorrador(retenida(), vivas().includes(id), draftFromDisk === id)) {
      draftFromDisk = null;
      setRetenida(null);
    }
  });

  createEffect(() => {
    if (retenida() !== "session" || !cola().length || !sessionId()) return;
    const id = sessionId();
    const proyecto = project();
    const generation = sessionGeneration;
    let cancelled = false;
    let checking = false;
    const timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const ready = await invoke<boolean>("queue_ready", { project: proyecto, session: id }, deLaTarea(id));
        if (ready && !cancelled && generation === sessionGeneration && id === sessionId()) {
          setRetenida(null);
        }
      } catch {
        // Un fallo al consultar no demuestra que la tarea ya esté disponible.
      } finally {
        checking = false;
      }
    }, 1000);
    onCleanup(() => { cancelled = true; clearInterval(timer); });
  });

  // El lote se retira y reserva en la misma actualización: no pueden salir dos turnos.
  createEffect(
    on(
      [cola, colaDe, sessionId, queueBusy, editando, retenida, esperando, cierres] as const,
      ([items, de, mirando, ocupado, edit, ret, esp, cierre]) => {
        if (items.length === 0) {
          // Sin nada en cola no hay nada que retener. Si no se soltara aquí, un
          // fallo dejaría detenida para siempre la cola que venga después.
          if (ret) setRetenida(null);
          // «Detener y enviar» sin nada que enviar ya no tiene promesa que cumplir.
          enviarAlCerrar.delete(mirando ?? "");
          return;
        }
        // El cierre permite reintentar una sesión reservada por otro turno.
        if (ret === "session") {
          if (cierre === cierreDeLaRetencion) return;
          setRetenida(null);
          return;
        }
        // `esperando` retiene la cola igual que un fallo: lo que está en
        // cola se escribió antes de que el agente preguntara. Soltarlo
        // haría correr el turno siguiente sin el dato que pidió.
        if (
          !despachable({
            pendientes: items.length,
            de,
            mirando,
            ocupado,
            editando: edit,
            retenida: ret,
            esperando: esp,
          })
        )
          return;
        const { mensaje, lote, resto } = siguienteLote(items);
        if (!mensaje) return;
        if (esDeLaTerminal(lote[0])) {
          void ejecutarDeLaCola(lote[0]);
          return;
        }
        batch(() => {
          // Lo que no cabe en este turno —lo que viene de otro remitente— se
          // queda en la cola y sale en el siguiente, no se pierde ni se cuela
          // firmado por quien no lo escribió.
          setCola(resto);
          // La promesa de «detener y enviar» se cumple aquí: el cierre de ese
          // turno ya no tiene que dejar paso a una cola que ya salió.
          enviarAlCerrar.delete(mirando ?? "");
          void enviar(mensaje);
        });
      },
    ),
  );

  async function drainHiddenQueue(session: string) {
    const queued = savedQueues.get(session);
    if (!queued?.items.length || session === sessionId() || vivas().includes(session) || drainingQueues.has(session) ||
      settlingTurns().includes(session) || injecting().some((item) => item.session === session)) return;
    if (queued.retained && queued.retained !== "session") return;
    const history = hilos()[session];
    if (!history || preguntasPendientes([...history.base, ...history.vivo])) return;
    const { mensaje: message, lote, resto } = siguienteLote(queued.items);
    // Un `!` no corre en una tarea que nadie mira: espera a que se abra.
    if (!message || esDeLaTerminal(lote[0])) return;
    const generation = sessionGeneration;
    drainingQueues.add(session);
    savedQueues.set(session, { ...queued, items: resto, retained: null });
    marcarViva(session);
    try {
      await invoke("save_queue", { project: queued.project, session, queued: resto }, deLaTarea(session));
      if (generation !== sessionGeneration) return;
      if (!await enviar(message, undefined, { project: queued.project, session })) throw new Error("queue-send-failed");
    } catch (error) {
      if (generation !== sessionGeneration) return;
      const restored = {
        ...queued,
        // Lo que salió vuelve delante de lo que quedó esperando: `savedQueues`
        // ya tiene el resto, y reponer la lista entera lo duplicaría.
        items: [...lote, ...(savedQueues.get(session)?.items ?? [])],
        retained: claveDe(error) === "history.error.busy" ? "session" as const : "fallo" as const,
      };
      savedQueues.set(session, restored);
      if (session === sessionId()) batch(() => {
        setRetenida(restored.retained);
        setCola(restored.items);
        setColaDe(session);
      });
      marcarQuieta(session);
      void invoke("save_queue", { project: queued.project, session, queued: restored.items }, deLaTarea(session)).catch((error) => {
        anexar(session, (messages) => [...messages, { role: "system", text: t("shell.queue.save_failed", { error: prosaDe(error) }), meta: "aviso" }]);
      });
    } finally {
      drainingQueues.delete(session);
    }
  }

  onMount(() => {
    const timer = setInterval(() => {
      for (const [session, queued] of savedQueues) {
        if (queued.retained === "session") void drainHiddenQueue(session);
      }
    }, 1000);
    onCleanup(() => clearInterval(timer));
  });

  // Al cerrar un turno se refresca el historial, y la carpeta: una tarea
  // recién nacida no pasó por `abrirSesion`, y sin carpeta la tarjeta de
  // entrega no tiene contra qué armar la ruta.
  createEffect(
    on([busy, sessionId], ([ocupado, id], antes) => {
      if (ocupado || !id) return;
      // Pasar de una tarea a otra no: `abrirSesion` ya lee su carpeta, y el
      // historial entero parsea cada `session.json` del workspace.
      const previa = antes?.[1];
      if (previa && previa !== id && !esProvisional(previa)) return;
      void refreshFolder(project(), id);
      void refreshSessions(grupos());
    }),
  );

  // Cambiar de tarea NO cierra la tercera columna: todo lo que enseña viene
  // por props derivadas de la tarea (`session()`) y se repinta sola.

  // El historial se recarga cuando cambia la lista de proyectos, no el activo.
  // Antes del motor no: el arranque reinicia las lecturas y las relee en `aplicar`.
  createEffect(on(grupos, (g) => { if (connected()) void refreshSessions(g); }));

  const composerMachine = createMemo(() => {
    const id = sessionId();
    const active = machines().find((m) => m.active)?.id ?? null;
    return id
      ? machineOf(id)?.headers["x-terminus-machine"] ?? active
      : draftMachine();
  });
  const composerOptions = () => {
    const machine = composerMachine();
    const workspace = workspaceActivo();
    return { headers: {
      ...(machine && machine !== "local" ? { "x-terminus-machine": machine } : {}),
      ...(workspace ? { "x-terminus-workspace": workspace } : {}),
    } };
  };
  let composerRevision = 0;
  const catalogosEnVuelo = new Map<string, Promise<void>>();
  createEffect(on([composerMachine, workspaceActivo], () => {
    composerRevision++;
    catalogosEnVuelo.clear();
    batch(() => {
      setCatalogos({});
      setSuperficies(null);
    });
    if (connected() && workspaceActivo()) void cargarSuperficies(false);
  }, { defer: true }));
  // La que dormía ya contesta: lo suyo de verdad reemplaza lo último que dijo.
  createEffect(on(() => machines().find((m) => m.id === composerMachine())?.on, (encendida, antes) => {
    if (encendida && antes === false && connected() && workspaceActivo()) void cargarSuperficies(false);
  }, { defer: true }));

  // El catálogo depende del agente. No se resetea el modelo elegido aquí: al
  // abrir una sesión se fijan agente y modelo juntos, y un efecto que limpiara
  // el modelo correría después y borraría el que se acaba de restaurar.
  //
  // Cada petición cuesta un proceso del CLI (`models::opencode_catalog`) y esto
  // corre por cambio de agente y por panel montado: se reusa el catálogo que ya
  // está, y dos peticiones del mismo agente a la vez son una.
  //
  // `forzar` es de quien sabe que cambió de qué depende la respuesta: la cuenta
  // activa, la clave o el consentimiento del workspace.
  function cargarModelos(a: string, forzar = false) {
    if (!forzar && untrack(() => catalogos()[a])) return Promise.resolve();
    const yaVa = catalogosEnVuelo.get(a);
    if (yaVa) return yaVa;
    const revision = composerRevision;
    const pedido = withLastAnswer(composerMachine(), `list_models:${a}`, () => invoke<AgentModels>("list_models", { provider: a }, composerOptions()))
      .then((catalogo) => {
        if (revision !== composerRevision) return;
        setCatalogos((actuales) => ({ ...actuales, [a]: catalogo }));
        // La primera carga tiene que dejar una elección ejecutable. Este punto
        // conoce qué petición terminó; un catálogo de otro agente no puede
        // completar por accidente el modelo del agente activo.
        if (a !== agent()) return;
        const actual = superficies()?.find((s) => s.id === superficie());
        const disponibles = catalogo.models.filter((m) => esDe(actual, m));
        if (
          disponibles.length > 0 &&
          !disponibles.some((m) => m.id === model())
        ) {
          setModel(disponibles[0].id);
        }
      })
      .catch(() => {
        if (revision !== composerRevision) return;
        setCatalogos((actuales) => ({ ...actuales, [a]: null }));
      })
      .finally(() => {
        if (catalogosEnVuelo.get(a) === pedido) catalogosEnVuelo.delete(a);
      });
    catalogosEnVuelo.set(a, pedido);
    return pedido;
  }

  // Envuelto y no pasado suelto: `on` le daría al segundo parámetro el valor
  // anterior del agente, que es una cadena y fuerza la recarga siempre.
  createEffect(on(agent, (a) => void cargarModelos(a)));

  // Qué modos puede el agente elegido, y que el elegido siga siendo uno
  // de ellos: cambiar de agente puede dejar el modo actual sin sostén
  // —Codex y Antigravity solo pueden automático—, y un desplegable en
  // «Manual» con Codex delante prometería un control que no existe. El
  // backend niega el turno igual (`chat::send_message`), pero enterarse
  // al mandar es tarde: se baja al primero disponible, y se ve.
  createEffect(
    on([agent, composerMachine, workspaceActivo], ([a]) => {
      const revision = composerRevision;
      if (!a) {
        setModos([]);
        return;
      }
      void invoke<ModoDePermiso[]>("list_permission_modes", { provider: a }, composerOptions())
        .then((lista) => {
          if (a !== agent() || revision !== composerRevision) return;
          batch(() => {
            setModos(lista);
            const puede = lista.filter((m) => !m.falta);
            if (!puede.some((m) => m.id === modo())) {
              // Lo elige `modoInicial`: el del workspace o el último que la
              // persona eligió a mano, y si este agente no lo sostiene, el que
              // resolvió el backend.
              setModo(modoInicial(lista, workspaceMode() ?? modoRecordado()));
            }
          });
        })
        .catch(() => { if (revision === composerRevision) setModos([]); });
    }),
  );

  /**
   * La caja en blanco arranca con el modo del workspace si eligió uno, salvo
   * que su borrador ya traiga uno elegido en ella.
   */
  function startWithWorkspaceMode() {
    const mode = workspaceMode();
    if (!mode || sessionId() || borrador().configuration?.mode) return;
    const list = modos();
    setModo(list.some((m) => !m.falta) ? modoInicial(list, mode) : mode);
  }
  createEffect(on(workspaceMode, startWithWorkspaceMode, { defer: true }));

  onMount(() => {
    const onDefaultMode = (e: Event) => {
      const change = (e as CustomEvent<DefaultPermissionModeChange>).detail;
      if (change.workspace === workspaceActivo()) setWorkspaceMode(change.mode);
    };
    window.addEventListener(DEFAULT_PERMISSION_MODE_EVENT, onDefaultMode);
    onCleanup(() => window.removeEventListener(DEFAULT_PERMISSION_MODE_EVENT, onDefaultMode));
  });

  // Qué se puede elegir para trabajar. `inicial` solo en el arranque: ahí no
  // hay nada elegido y hay que empezar por algo que se pueda usar. Después no
  // se toca lo elegido: quien acaba de elegir una superficie no ve cómo se le
  // mueve el selector por una consulta que termina tarde.
  async function cargarSuperficies(inicial: boolean) {
    const revision = composerRevision;
    try {
      const s = await withLastAnswer(composerMachine(), "list_surfaces", () => invoke<Superficie[]>("list_surfaces", {}, composerOptions()));
      if (revision !== composerRevision) return;
      const primera = s.find((x) => x.usable);
      batch(() => {
        setSuperficies(s);
        // Al cambiar de workspace la tarea del frente se reabre mientras esta
        // consulta sigue en vuelo; su agente lo fija `load_session`.
        if (!inicial || sessionId()) return;
        // El arranque no hereda el agente ni el modelo del workspace anterior.
        // Si nada sirve, no se fabrica una selección con la primera fila del
        // catálogo: la caja ofrece conectar algo y ningún modelo se finge.
        setSuperficie(primera?.id ?? "");
        if (!primera) {
          setModel("");
          setEffort("");
        } else if (primera.provider !== agent()) {
          setAgent(primera.provider);
          setModel("");
          setEffort("");
        }
      });
      const agentes = new Set(
        s.filter((x) => x.usable || x.provider === agent()).map((x) => x.provider),
      );
      // Envuelto por lo mismo que el efecto de arriba: `map` le pasaría el
      // índice como `forzar`, y el primero de la lista no forzaría nunca.
      await Promise.all([...agentes].map((a) => cargarModelos(a, !inicial)));
    } catch {
      if (revision !== composerRevision) return;
      setSuperficies([]);
    }
  }

  // La superficie sigue al agente y al modelo, y no al revés: los tres
  // pueden moverse sin pasar por el selector —abrir una tarea fija
  // agente y modelo, y el catálogo llega después de preguntarle al CLI.
  // Sin esto, una tarea de modelo gratuito abriría enseñando «OpenCode»
  // con su desplegable vacío. `superficieDe` conserva lo ya elegido si
  // sigue sirviendo.
  createEffect(
    on([superficies, agent, model, models, sessionId], ([sups, a, m, cat, sesion]) => {
      if (!sups) return;
  // Una conversación nueva empieza por algo que pueda responder. Si la
  // selección dejó de servir tras volver de Configuración, se mueve a la
  // primera usable; si no hay ninguna, se vacía. Solo una tarea guardada
  // conserva su superficie caída: cambiarle el agente en silencio cambiaría
  // la tarea.
      if (!sesion) {
        const elegida = sups.find((s) => s.id === superficie());
        if (!elegida?.usable) {
          const primera = sups.find((s) => s.usable);
          batch(() => {
            setSuperficie(primera?.id ?? "");
            if (primera && primera.provider !== a) {
              setAgent(primera.provider);
              setModel("");
              setEffort("");
            }
          });
          return;
        }
      }
      // Sin ninguna para este agente —una fila retirada de la tabla, o una que
      // la app dejó de saber conducir— la selección se vacía en vez de quedarse
      // en la anterior: enseñar otra superficie sería decir que la tarea corre
      // con algo que no es lo suyo. La caja lo dice y no deja mandar.
      const id = superficieDe(sups, a, m, cat?.models ?? [], superficie());
      if ((id ?? "") !== superficie()) setSuperficie(id ?? "");
    }),
  );

  // El modelo elegido tiene que ser de la superficie elegida: ningún CLI
  // publica con qué modelo corre si no se le pasa, y la única forma de
  // que lo leído sea lo que corre es elegirlo y pasarlo. Se elige dentro
  // de la superficie y no con `models[0]`: con el catálogo partido en
  // dos, el primero de la lista entera puede ser de pago en «Modelos
  // Free». Uno que ya no está en el catálogo sí se cambia.
  createEffect(
    on([superficie, superficies, models], ([id, sups, cat]) => {
      const s = sups?.find((x) => x.id === id);
      const lista = (cat?.models ?? []).filter((m) => esDe(s, m));
      if (lista.length === 0) return;
      if (!lista.some((m) => m.id === model())) setModel(lista[0].id);
    }),
  );

  // Lo que el menú del chat ofrece, y `null` mientras no se ha leído. Se
  // compone aquí y no dentro del JSX: un prop compuesto con `&&` entrega
  // `false`, no `null`, mientras `superficies()` no tiene valor —el
  // compilador de Solid lo booleaniza para memoizarlo—, y `false.find` lanza
  // en el primer render. Mismo defecto que documenta AGENTS.md § monta, con
  // `Setup`.
  const menuDeSuperficies = () => {
    const todas = superficies();
    return todas && paraElMenu(todas, superficie());
  };

  // Autorizar en Configuración cambia qué hay que ofrecer aquí: el catálogo
  // de un agente que manda material fuera sin pedir credencial sale vacío
  // hasta que este workspace lo consiente (`runtime/models.rs`). Sin esto, la caja de
  // chat se quedaba con la lista vacía hasta cambiar de agente y volver.
  // Aceptar es además lo que hace aparecer «Modelos gratuitos»: la misma consulta
  // que decide si se puede usar es la que hay que rehacer.
  onMount(() => {
    const refrescar = () => {
      void cargarSuperficies(false);
    };
    window.addEventListener("harness:consentimiento", refrescar);
    // El modelo local activo va primero en su catálogo: una tarea nueva lo adopta al cambiarlo.
    const motorLocal = listen("local-engine", () => {
      void cargarSuperficies(false).then(() => {
        if (sessionId() || agent() !== "opencode-local") return;
        const activo = catalogos()["opencode-local"]?.models[0]?.id;
        if (activo) setModel(activo);
      });
    });
    onCleanup(() => {
      window.removeEventListener("harness:consentimiento", refrescar);
      void motorLocal.then((f) => f());
    });
  });

  // Lo que el menú de la barra ofrece depende del agente y del workspace, no
  // del proyecto: sus comandos, y las skills que la proyección pone en su carpeta.
  createEffect(on([agent, composerMachine, workspaceActivo], ([a]) => cargarComandos(a)));

  /**
   * Lo que esta tarea le va a adjuntar al turno: lo que ya lee más lo que está
   * puesto en la caja y todavía no ha viajado.
   */
  const fuentesDeLaTarea = createMemo(
    () => unirFuentes(adjuntas(), sourceIds()),
    undefined,
    { equals: sameSources },
  );

  // Las menciones @ salen de la carpeta de trabajo (`session`) y de lo adjunto.
  // Se relee al cambiar de tarea o de fuentes, no en cada turno: recorrer
  // una fuente entera es caro, y el material es de SOLO LECTURA. Se le pasa
  // el proyecto, la sesión y las fuentes, no las rutas ya resueltas: armarlo
  // aquí escribiría la misma regla en dos lenguajes, y su divergencia no
  // daría error, solo resolvería a otro archivo al mandar la mención.
  createEffect(
    on([project, fuentesDeLaTarea, excludedSourceIds, sessionId], ([p, fs, excluidas, session]) => {
      let current = true;
      onCleanup(() => {
        current = false;
      });
      invoke<MentionSources>("list_mentions", {
        project: p,
        sources: fs,
        excludedSources: excluidas,
        session,
      }, deLaTarea(session))
        .then((result) => {
          if (current) setMentionSources(result);
        })
        .catch(() => {
          if (current) setMentionSources(null);
        });
    }),
  );

  // La ocupación de la ventana se deriva del registro cada vez que se abre. No
  // se guarda en la sesión ni se acumula: manda el último turno registrado.
  createEffect(
    on([sessionId, project], ([id, p]) => {
      if (!id || !p) {
        setVentana(null);
        return;
      }
      invoke<SessionUsage>("session_usage", { project: p, session: id }, deLaTarea(id))
        .then((s) => setVentana(ventanaDe(s.records)))
        .catch(() => setVentana(null));
    }),
  );

  /** La fuente de contexto del workspace: su raíz de gobierno, una sola. */
  async function elegirCarpetaDelWorkspace() {
    const r = await open({ directory: true, multiple: false });
    if (typeof r !== "string") return;
    try {
      await invoke("set_workspace_source", { kind: "folder", locator: r });
      await aplicar(await invoke<Startup>("list_workspaces"));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  /**
   * Relee la lista del disco sin tocar nada. El tipo de una carpeta se mide
   * en disco: la que el agente convirtió en repositorio con `git init` se
   * seguía viendo como carpeta hasta reabrir la app, y sin repositorio no hay
   * ni árbol propio ni rama base.
   */
  async function releerProyectos() {
    const workspace = workspaceActivo();
    try {
      const items = await invoke<Project[]>("list_projects");
      if (workspace === workspaceActivo()) setProjectList(items);
    } catch {
      // La lista anterior sigue sirviendo: releer es una puesta al día.
    }
  }

  async function renombrarProyecto(id: string, name: string) {
    try {
      await invoke("rename_project", { id, name });
      setProjectList(await invoke<Project[]>("list_projects"));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  // Abre el proyecto en el panel principal. Cambia además el contexto activo
  // —es `elegirProyecto`—: la tarea que se empiece desde aquí es suya, y
  // mirar un proyecto mientras se escribe contra otro es justo el error que
  // el selector de la caja existe para evitar.
  function abrirProyecto(id: string) {
    elegirProyecto(id);
    setProyectoAbierto(id);
  }

  /** Material que leerá toda tarea del proyecto, no solo la abierta. */
  async function adjuntarAlProyecto(id: string, source: string) {
    try {
      await invoke("attach_known_source", { project: id, source });
      setProjectList(await invoke<Project[]>("list_projects"));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  async function quitarDelProyecto(id: string, source: string) {
    try {
      await invoke("detach_source", { project: id, source });
      setProjectList(await invoke<Project[]>("list_projects"));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  // Registra —o quita— la carpeta de trabajo del proyecto. Avisa al panel del
  // árbol de trabajo, que la enseña sin que alguien reabra nada.
  async function carpetaEditable(id: string, dir: string | null) {
    try {
      await invoke("set_project_work_tree", { id, dir });
      setProjectList(await invoke<Project[]>("list_projects"));
      window.dispatchEvent(new CustomEvent("harness:copia"));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  async function borrarProyecto(id: string) {
    try {
      await invoke("delete_project", { id });
      if (proyectoAbierto() === id) setProyectoAbierto(null);
      if (project() === id) {
        nuevaSesion();
        setProject("");
      }
      const quedan = await invoke<Project[]>("list_projects");
      setProjectList(quedan);
      void reloadSpaces();
      await refreshSessions(["", ...quedan.map((p) => p.id)]);
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  // Elegir proyecto en el selector cambia el contexto entero: sesiones, chat
  // y artefactos son del proyecto y no se arrastran. Es un gesto, no un valor
  // derivado de un efecto sobre `project`: ahí no se distingue elegir de
  // restituir, y abrir una sesión de otro proyecto cambia el mismo valor,
  // corriendo el efecto después y quitándole el id a la sesión recién
  // abierta.
  function elegirProyecto(name: string) {
    // Lo que la tarea que se deja ya lee no es de la conversación en blanco.
    // Su borrador —lo pendiente, lo escrito— se queda en su pestaña y no viaja:
    // el de la conversación en blanco es el suyo, y si tenía algo puesto antes
    // de nombrar el trabajo, sigue ahí.
    batch(() => {
      setAdjuntas([]);
      setProject(name);
      setSessionId(null);
      restoreDraftConfiguration();
      setFolder(null);
      soltarCola();
    });
  }

  // Sin cola en la mano: se llama al moverse de sesión o de proyecto, en un
  // solo lote —de eso depende que no se borre lo que se deja atrás—. Cada
  // asignación suelta corre los efectos antes de la siguiente: `setCola([])`
  // con `colaDe` todavía nombrando la sesión que se abandona es un
  // `save_queue` con la cola vacía, y el `.cola.json` de esa tarea desaparece
  // con lo que se había escrito para ella.
  function soltarCola() {
    batch(() => {
      setColaDe(null);
      setCola([]);
      setRetenida(null);
      setEditando(false);
    });
  }

  // Abrir una sesión de otro proyecto cambia el contexto entero: la sesión
  // pertenece a su proyecto y arrastrarla al activo la sacaría de sitio.
  async function abrirSesion(proyecto: string, id: string, activar = id, propagateError = false) {
    // Rust no sabe de ella todavía: leerla daría un fallo por una fila que la
    // pantalla pinta a propósito.
    if (esProvisional(id)) return;
    setHablandoCon(null);
    // Una tarea se abre en su escritorio: su pestaña va en esa tira.
    const suyo = escritorioDeFila(filaDe(id), spaces());
    if (suyo && suyo !== escritorio()) cambiarEscritorio(suyo, false);
    // Abrir es tener a mano: la tarea gana pestaña si no la tenía, y si la
    // tenía se activa esa — nunca una segunda.
  // Antes de cargar nada: `activar` es un parámetro. Poner la pestaña delante
  // después del `await` enseñaría la conversación un cuadro antes que el
  // archivo que se acaba de pulsar. Juntas: entre una y otra la pestaña nueva
  // queda detrás de la que estaba, y `montadas` la desmontaría.
    batch(() => {
      if (activar === id) pestanas.ensure({ id, project: proyecto, titulo: filaDe(id)?.title ?? "" });
      pestanas.activate(activar);
    });
    if (id === sessionId() && proyecto === project()) {
      // Ya estaba cargada: volver a ella desde una pestaña suya no relee la
      // transcripción ni la cola. Releerlas tiraría lo que el turno vivo lleva
      // dicho y volvería a poner en la caja lo que quedó encolado.
      setProyectoAbierto(null);
      return;
    }
    setProyectoAbierto(null);
    setProject(proyecto);
    setSessionId(id);
    soltarCola();
  // Antes del `await`: el hueco que hay que tapar empieza en el
  // `setSessionId` de arriba, no cuando la lectura del disco tarda. Ver
  // `cargandoHilo`. Solo se marca si su hilo NO está ya en memoria: con
  // varias ventanas, pulsar en una para darle el mando vuelve a pasar por
  // aquí aunque su transcripción lleve rato pintada, y marcarla como «viene
  // en camino» la mandaría al esqueleto y de vuelta.
    if (!hilos()[id]) setCargandoHilo(id);
    const generation = sessionGeneration;
    const current = () => generation === sessionGeneration && sessionId() === id && project() === proyecto;
    try {
      const s = await leerTarea(proyecto, id);
      if (!current()) return;
      // Reanudar conserva con qué corrió: una sesión continuada con otro agente
      // o con otro modelo ya no es la misma sesión.
      setAgent(s.provider);
      setModel(modeloDeSubtarea(s) ?? "");
      setEffort(s.effort ?? "");
      // El chat de un encargado no es una tarea que se reabre para releer
      // su historial: es su conversación de siempre, y su perfil dice con
      // qué prefiere seguir. Una preferencia guardada gana a lo último que
      // corrió — sin tocar los turnos ya escritos, solo la caja.
      if (s.chat_de_agente && s.agent) {
        try {
          const perfiles = await invoke<Record<string, AgentProfileData>>(
            "list_agent_profiles",
            { project: proyecto },
          );
          const perfil = perfiles[s.agent];
          if (!current()) return;
          if (perfil?.provider) setAgent(perfil.provider);
          if (perfil?.model) setModel(perfil.model);
          if (perfil?.effort) setEffort(perfil.effort);
        } catch {
          // Un perfil que no se pudo leer deja la caja con lo de la sesión.
        }
      }
  // Y con cuánta vigilancia corrió: una tarea escrita antes de que esto
  // existiera no lo dice, y ahí se deja vacío. El efecto de arriba lo baja al
  // que el agente sostenga, lo mismo que hace el backend con lo que nadie
  // eligió (`agents::Permisos::resolver`).
      setModo(s.permission_mode ?? "");
      // Lo que esta tarea ya lee. No son pendientes: están guardados en ella.
      setAdjuntas(s.sources ?? []);
      editarBorrador(id, (b) => ({
        ...b,
        excludedSourceIds: s.excluded_sources ?? [],
      }));
      // Y encima, lo que se eligió en su caja sin llegar a mandar nada.
      restoreSessionConfiguration(s);
      // Lo del disco, y sin vaciar lo vivo: si está contestando, lo que lleva
      // dicho sigue en su hilo y se pinta detrás.
      loadResult(id, s, false, generation);
      void refreshFolder(proyecto, id);
    } catch (e) {
      if (!current()) return;
      try {
        const state = await invoke<Session>("load_session", {
          project: proyecto, id, history_request: { version: 1, kind: "state" },
        }, deLaTarea(id));
        if (!current()) return;
        setAgent(state.provider);
        setModel(modeloDeSubtarea(state) ?? "");
        setEffort(state.effort ?? "");
        setModo(state.permission_mode ?? "");
        setAdjuntas(state.sources ?? []);
        restoreSessionConfiguration(state);
        void refreshFolder(proyecto, id);
      } catch { /* Sin estado autoritativo se conserva el error de la lectura original. */ }
      if (!current()) return;
      releer(id, [{ role: "system", text: prosaDe(e) }], false);
      if (propagateError) throw e;
    } finally {
      // Solo si sigue siendo esta la que se espera: con dos aperturas
      // solapadas, la respuesta tardía de la primera apagaría el
      // indicador de la segunda y su hilo se pintaría a medias.
      setCargandoHilo((c) => (c === id ? null : c));
    }
    // Después de la transcripción, que la reemplaza entera: un aviso
    // escrito antes de este punto no dejaría rastro.
    try {
      const cached = savedQueues.get(id);
      const q = cached?.items ?? await invoke<Encolado[]>("load_queue", {
        project: proyecto,
        session: id,
      }, deLaTarea(id));
      if (!current()) return;
      const restored = savedQueues.get(id);
      const retentions = workspaceRetentions.get(workspaceActivo() ?? "");
      const kept = retentions?.get(id);
      retentions?.delete(id);
      const retained = restored ? restored.retained : retencionAlCargar(q.length, kept);
      draftFromDisk = !restored && kept === undefined && retained === "borrador" ? id : null;
      batch(() => {
        setCola(restored?.items ?? q);
        setColaDe(id);
        setRetenida(retained);
      });
    } catch (e) {
      if (!current()) return;
      // Sin esto la cola queda sin dueño: no es «no pude leerla», es que
      // la de esta tarea deja de funcionar —el despacho exige que la cola
      // en la mano sea la de la tarea abierta. Lo no leído se conserva en
      // su archivo: el guardado cuelga del contenido, y adoptar una mano
      // vacía no lo pisa.
      setColaDe(id);
      anexar(id, (m) => [
        ...m,
        {
          role: "system",
          text: t("shell.queue.load_failed", { error: prosaDe(e) }),
          meta: "aviso",
        },
      ]);
    }
  }

  /**
   * Trae la transcripción de una tarea sin abrirla: la usan las ventanas que
   * vuelven de un reparto guardado, para que su panel enseñe lo suyo aunque el
   * mando esté en otra. No toca la sesión abierta —eso lo hace `abrirSesion` al
   * pulsarla—: solo deja su hilo en memoria.
   */
  async function loadThread(project: string, id: string) {
    if (esProvisional(id) || hilos()[id]) return;
    const generation = sessionGeneration;
    try {
      const s = await leerTarea(project, id);
      if (generation !== sessionGeneration) return;
      loadResult(id, s, false, generation);
    } catch {
      // Sin hilo, su panel queda vacío hasta pulsarla, y ahí `abrirSesion` lo
      // reintenta. No hay nada que avisar de una ventana que nadie pidió.
    }
  }

  /**
   * Carga la tarea de delante de cada ventana del reparto, menos `skip`, que es
   * la que abre `abrirSesion`. Es lo que hace que volver a un espacio no deje
   * sus ventanas en blanco, sin cargar ninguna pestaña que no esté delante.
   */
  function loadWindowThreads(skip: string | null) {
    for (const site of paneles.sites()) {
      const id = paneles.activeTabAt(site);
      if (!id || id === skip || id === sessionId()) continue;
      const tab = pestanas.open().find((p) => p.id === id);
      if (tab && isTaskTab(tab)) void loadThread(tab.project, tab.session);
    }
  }

  function hablarConEncargado(enProyecto: string, name: string) {
    abrirBorradorDeAgente(enProyecto, name);
  }

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
        batch(() => {
          if (perfil.provider) setAgent(perfil.provider);
          if (perfil.model) setModel(perfil.model);
          if (perfil.effort) setEffort(perfil.effort);
        });
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
    void cargarSuperficies(false);
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
      startWithWorkspaceMode();
      setFolder(null);
    // Lo que la tarea que se deja ya lee es suyo; el borrador de la
    // conversación en blanco es el suyo y no se toca.
      setAdjuntas([]);
      soltarCola();
      // El hilo sin id es el del primer turno. Si Rust lo negó, se quedaba
      // pintado en toda tarea nueva, de este proyecto o de otro.
      if (!arrancando()) soltarHilo("");
    });
    pedirElCampo();
  }

  function closeActiveTab() {
    if (settings() !== null || alta() !== null) return;
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

  /** El cambio de CLI con el que se está a punto de mandar el siguiente turno. */
  const [traspasoPendiente, setTraspasoPendiente] = createSignal<
    { clave: string; sesion: string; desde: string; opcion: OpcionDeModelo } | null
  >(null);
  // Cambiar de tarea o de borrador cancela la confirmación: lo que se aplique
  // tiene que ser de la tarea que está delante.
  createEffect(on([sessionId, claveAbierta], () => {
    if (traspasoPendiente()) setTraspasoPendiente(null);
  }));

  async function resolverCierre(decision: "guardar" | "descartar") {
    const cierre = cierreSinGuardar();
    if (!cierre) return;
    setCierreSinGuardar(null);
    // Si guardar falla, no se cierra y se trae delante el archivo que falló: su
    // visor enseña el fallo y el borrador sigue en su editor.
    if (decision === "guardar" && !(await pestanas.saveFiles(cierre.sucios))) {
      const pendiente = pestanas.dirtyTabsToClose(cierre.ids)[0];
      if (pendiente) void activarPestana(pendiente);
      return;
    }
    cerrarPestanasYa(cierre.ids);
  }

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
      soltarBorrador(p.id);
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
    if ((p.clase === "inbox" || p.clase === "broadcasts") || p.clase === "observabilidad" || p.clase === "pantalla" || (p.clase === "sitio" && p.navegador)) {
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

  function abrirInbox() {
    if (!customization.enabled("inbox")) return;
    setProyectoAbierto(null);
    pestanas.openInbox(t("alpha.inbox"));
  }
  let initialInboxOpened = false;
  createEffect(() => {
    const ws = workspaceActivo();
    const space = escritorio();
    if (!ws || !space || !customization.ready() || initialInboxOpened || !capabilities().inbox?.initial) return;
    queueMicrotask(() => {
      if (workspaceActivo() !== ws || escritorio() !== space || !customization.ready() || initialInboxOpened) return;
      initialInboxOpened = true;
      if (customization.enabled("inbox")) abrirInbox();
    });
  });

  let attentionScope = customization.scope();
  createEffect(() => {
    const scope = customization.scope();
    const changed = scope !== attentionScope;
    attentionScope = scope;
    const remove = pestanas.open().filter(tab => (tab.clase === "inbox" || tab.clase === "broadcasts") && (changed || !customization.enabled(tab.clase))).map(tab => tab.id);
    if (remove.length) untrack(() => cerrarPestanasYa(remove));
  });
  function openAttentionFeature(id: string) {
    if (!customization.enabled(id)) return;
    if (id === "inbox") abrirInbox();
    else if (id === "broadcasts") { setProyectoAbierto(null); pestanas.openBroadcasts(t("attention.broadcasts")); }
    else if (id === "agents") setSettings("agentes");
    else if (id === "channels") setSettings("integrations");
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
    if ((p.clase === "inbox" || p.clase === "broadcasts") || p.clase === "observabilidad" || p.clase === "pantalla") return p.titulo;
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

  function deleteTask(project: string, id: string) {
    const machine = deLaTarea(id)?.headers["x-terminus-machine"] ?? machines().find(item => item.local || item.active)?.id;
    const target = machines().find(item => item.id === machine);
    const folderNames = new Map(projectList().map(folder => [folder.id, folder.name]));
    setDeleteTarget({
      machineName: machine ? machineName(machine) : t("shell.machines.this_computer"),
      folderName: folder => folderNames.get(folder) || folder || t("shell.sidebar.view.no_folder"),
      project, id, workspace: workspaceActivo(),
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
      soltarBorrador(id);
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
      setProjectList(await invoke<Project[]>("list_projects"));
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
    editarBorrador(claveAbierta(), (b) => ({
      ...b,
      sourceIds:
        idsDelProyecto().includes(id) ||
        b.sourceIds.includes(id) ||
        adjuntas().includes(id)
          ? b.sourceIds
          : [...b.sourceIds, id],
      excludedSourceIds: b.excludedSourceIds.filter((x) => x !== id),
    }));
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
    editarBorrador(claveAbierta(), (b) => ({
      ...b,
      sourceIds: b.sourceIds.filter((x) => x !== id),
      excludedSourceIds:
        idsDelProyecto().includes(id) && !b.excludedSourceIds.includes(id)
          ? [...b.excludedSourceIds, id]
          : b.excludedSourceIds,
    }));
    setAdjuntas((v) => v.filter((x) => x !== id));
    const sid = sessionId();
    if (!sid) return;
    try {
      await invoke("detach_session_source", {
        project: project(),
        session: sid,
        source: id,
      }, deLaTarea(sid));
    } catch (e) {
      asentar(sid, (ms) => [
        ...ms,
        {
          role: "system",
          text: t("chat.scope.source.remove_failed", { error: prosaDe(e) }),
          meta: "fallo",
        },
      ]);
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

  const materialTarget = () => `${workspaceActivo()}:${sessionGeneration}:${sessionId()}:${claveAbierta()}:${JSON.stringify(taskMaterialOptions())}`;
  let taskSourcesRequest = 0;
  createEffect(on(() => ({
    target: materialTarget(),
    workspace: workspaceActivo(),
    options: taskMaterialOptions(),
    ready: !sessionId() || !!taskMaterialOptions(),
    single: (!capabilities().remoteCreate && capabilities().nativeWindow) || machines().length === 1,
    confirmed: contextConfirmed(),
    catalog: sources(),
  }), ({ workspace, options, ready, single, confirmed, catalog }) => {
    const request = ++taskSourcesRequest;
    setTaskSources(null);
    if (!workspace || !ready) return;
    if (single) {
      if (confirmed) setTaskSources(catalog);
      return;
    }
    if (!options) return;
    void invoke<Source[]>("list_sources", {}, options).then((listed) => {
      if (request === taskSourcesRequest) setTaskSources(listed);
    }).catch((e) => {
      if (request === taskSourcesRequest) setError(prosaDe(e));
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
    editarBorrador(claveAbierta(), (b) => ({
      ...b,
      input: [prompt, b.input].filter(Boolean).join("\n\n"),
      archivos: [...b.archivos, context.path],
      sourceIds: [...new Set([...b.sourceIds, ...context.sources])],
      excludedSourceIds: [...new Set([...b.excludedSourceIds, ...context.excluded_sources])],
    }));
  }

  /**
   * Elegir en el único menú del chat: la fila ya trae agente,
   * superficie y modelo, que forman una sola elección. Actualizarlos
   * en un batch impide un render intermedio con el modelo de Claude
   * bajo Codex, o el gratuito bajo la de pago de OpenCode.
   */
  function saveDraftConfiguration(mode?: string, clave = claveAbierta()) {
    editarBorrador(clave, (draft) => ({
      ...draft,
      configuration: {
        agent: agent(), surface: superficie(), model: model(), effort: effort(),
        // Solo elegido a mano: guardado al elegir modelo, taparía el del workspace.
        mode: mode ?? draft.configuration?.mode,
      },
    }));
  }

  /**
   * Lo elegido en la caja de una tarea abierta, que `session.json` no guarda:
   * ahí vive con qué corrió el último turno, no con qué va a correr el
   * siguiente. Sin esto, salir de la tarea y volver revierte la elección.
   *
   * El agente no entra, salvo el traspaso pendiente: si otro cliente cambió el
   * CLI, el pendiente ya no parte del que la sesión tiene y no se aplica.
   */
  function restoreSessionConfiguration(session?: Session) {
    const { configuration, provider } = borrador();
    if (configuration) {
      setModel(configuration.model);
      setEffort(configuration.effort);
      if (configuration.mode) setModo(configuration.mode);
    }
    // El traspaso pendiente manda sobre el de la sesión: al volver a la
    // tarea, el gesto sigue en pie y la caja dice el que se confirmó.
    if (provider && (!session || session.provider === provider.from)) setAgent(provider.to);
  }

  function restoreDraftConfiguration() {
    const configuration = borrador().configuration;
    if (!configuration) return;
    setAgent(configuration.agent);
    setSuperficie(configuration.surface);
    setModel(configuration.model);
    setEffort(configuration.effort);
    if (configuration.mode) setModo(configuration.mode);
  }

  // Sin elegir sale escrito el nivel que el catálogo dice que el agente usa:
  // Codex conserva en su hilo el último pedido, y callarlo dejaba la caja
  // diciendo «medium» con el turno corriendo en el anterior.
  const effortDelTurno = () =>
    effort() || models()?.models.find((m) => m.id === model())?.default_effort || null;

  function chooseEffort(id: string) {
    setEffort(id);
    saveDraftConfiguration();
    // Como el modo en `elegirModo`: el turno vivo arrancó con el nivel de
    // entonces y no lo relee.
    const sesion = sessionId();
    if (sesion && busy()) {
      void invoke("set_effort", {
        project: project(),
        session: sesion,
        effort: effortDelTurno(),
      }, deLaTarea(sesion)).catch(avisar(sesion));
    }
    // El esfuerzo va con el modelo que la persona eligió en esta tarea, nunca
    // con el que la caja puso sola.
    if (sesion && model()) guardarModeloEnLaTarea(sesion, agent(), model(), id || null, true);
    // Como el modelo en `elegirModelo`: es lo que heredan sus temas nuevos.
    const fila = sessionId() ? filaDe(sessionId()!) : undefined;
    if (fila && esChatDeAgente(fila) && fila.agent) {
      void invoke("set_agent_model", {
        project: project(),
        name: fila.agent,
        provider: agent(),
        model: model() || null,
        effort: id || null,
      }).then(notifyProfiles).catch((error) => setError(prosaDe(error)));
    }
  }

  /**
   * El motor anunció `feature` en la máquina de la tarea. La de esta ventana
   * no lleva id en la fila; las demás sí. Sin fila de esa máquina no se puede
   * afirmar que no lo anuncie: `undefined`, no `false`.
   */
  const anunciaEnLaTarea = (id: string, feature: string): boolean | undefined => {
    if (!id) return undefined;
    const machine = filaDe(id)?.machine ?? null;
    const suya = machines().find((m) => (machine ? m.id === machine : m.local));
    if (!suya) return undefined;
    return suya.features?.includes(feature) === true;
  };
  const anunciaTraspaso = (id: string) => anunciaEnLaTarea(id, PROVIDER_HANDOFF_FEATURE);

  /**
   * La elección explícita del chip queda en la tarea (`session_model_v1`), con
   * el modelo y el esfuerzo juntos: un `task send` o el relay que llegan sin
   * modelo siguen con ella. Solo un modelo del CLI con que corre la tarea: con
   * un traspaso confirmado, o en un chat de agente que cambia de CLI, el del
   * otro lo guarda su primer turno. Un motor que no lo anuncia sigue como antes.
   */
  function guardarModeloEnLaTarea(id: string, agente: string, modelo: string, nivel: string | null, effortOnly?: boolean) {
    if (agente !== cliDeLaSesion(id) || borradores()[claveAbierta()]?.provider || !anunciaEnLaTarea(id, SESSION_MODEL_FEATURE)) return;
    const proyecto = project();
    const opciones = opcionesDeLaTarea(id, workspaceActivo());
    void import("../features/chat/handoverSend")
      .then((m) => m.saveSessionModel(proyecto, id, modelo, nivel, opciones, effortOnly))
      .catch(avisar(id));
  }

  const situacionDeTraspaso = (id: string) => ({
    session: id || null,
    running: vivas().includes(id),
    announced: anunciaTraspaso(id) ?? null,
    state: traspasos()[id],
  });

  /**
   * El CLI con el que la tarea corre hoy, según el motor. El pendiente del
   * borrador no cuenta: un `!` no es un turno del agente y no lo gasta.
   */
  const cliDeLaSesion = (id: string) =>
    traspasos()[id]?.provider ?? filaDe(id)?.provider ?? null;

  /**
   * Con qué corre un `!` y con qué el agente contesta su salida: el CLI y el
   * modelo de la sesión, no los del borrador. El traspaso confirmado no se
   * gasta en un comando de terminal.
   */
  const configDeLaSesion = (id: string) => {
    const estado = traspasos()[id];
    const fila = filaDe(id);
    return {
      provider: shellCli(cliDeLaSesion(id), agent()),
      model: estado?.model ?? fila?.model ?? null,
      effort: estado?.effort ?? null,
    };
  };

  /** Por qué no se ofrece el gesto, o `null`. No se deriva del encargado ni del fork: lo dice el motor. */
  const puedeTraspasar = (id: string) => canHandOverTask(situacionDeTraspaso(id));

  /** Aplica lo elegido a la caja del borrador, con o sin traspaso pendiente. */
  function aplicarOpcionDeModelo(opcion: OpcionDeModelo, clave: string, provider?: HandoverPending | null) {
    const nivel = effortAlCambiarDeModelo(effort(), opcion.model);
    batch(() => {
      setSuperficie(opcion.superficie);
      setAgent(opcion.agent);
      setModel(opcion.model.id);
      setEffort(nivel);
      if (provider !== undefined) editarBorrador(clave, (b) => ({ ...b, provider: provider ?? undefined }));
      saveDraftConfiguration(undefined, clave);
    });
    return nivel;
  }

  function elegirModelo(opcion: OpcionDeModelo) {
    const abierta = sessionId();
    const fila = abierta ? filaDe(abierta) : undefined;
    const chatDeAgente = fila && esChatDeAgente(fila);
    // Cambiar de AGENTE en una tarea abierta es un traspaso —la conversación
    // viaja como texto—, no un ajuste del selector: se confirma antes de tocar
    // la caja. El modelo dentro del mismo agente sí cambia, y cada turno guarda
    // con cuál se contestó.
    if (abierta && !chatDeAgente && opcion.agent !== agent()) {
      const actual = traspasos()[abierta]?.provider ?? filaDe(abierta)?.provider ?? null;
      // Volver al CLI que la sesión tiene no es traspaso: solo suelta el
      // pendiente que se hubiera confirmado antes.
      if (opcion.agent === actual) {
        guardarModeloEnLaTarea(abierta, opcion.agent, opcion.model.id, aplicarOpcionDeModelo(opcion, claveAbierta(), null) || null);
        return;
      }
      if (!puedeTraspasar(abierta)) return;
      setTraspasoPendiente({
        clave: claveAbierta(),
        sesion: abierta,
        desde: actual ?? agent(),
        opcion,
      });
      return;
    }
    const nivel = aplicarOpcionDeModelo(opcion, claveAbierta());
    if (abierta) guardarModeloEnLaTarea(abierta, opcion.agent, opcion.model.id, nivel || null);
    if (chatDeAgente && fila.agent) {
      void invoke("set_agent_model", {
        project: project(),
        name: fila.agent,
        provider: opcion.agent,
        model: opcion.model.id,
        effort: nivel || null,
      }).then(notifyProfiles).catch((error) => setError(prosaDe(error)));
    }
  }

  /**
   * El traspaso confirmado deja el CLI en el borrador de esa tarea, no en la
   * preferencia de las nuevas, y se consume en el envío siguiente.
   */
  function confirmarTraspaso() {
    const pedido = traspasoPendiente();
    setTraspasoPendiente(null);
    if (!pedido) return;
    // Cambió la tarea o el borrador mientras se leía la confirmación: no se
    // aplica ni a la nueva ni al que estaba delante.
    if (!handoverMatches(pedido, sessionId(), claveAbierta())) return;
    if (!puedeTraspasar(pedido.sesion)) return;
    const actual = traspasos()[pedido.sesion]?.provider ?? filaDe(pedido.sesion)?.provider ?? null;
    if (actual !== null && pedido.desde !== actual) return;
    aplicarOpcionDeModelo(pedido.opcion, pedido.clave, {
      from: pedido.desde,
      to: pedido.opcion.agent,
    });
  }

  /**
   * Elegir modo en la caja, que además queda recordado para la tarea
   * siguiente. Solo por aquí: `load_session` y el ajuste al cambiar de agente
   * también mueven `modo`, y guardar esos convertiría abrir una tarea vieja en
   * cambiar con qué arrancan las próximas.
   */
  function elegirModo(id: string) {
    recordarModo(id);
    setModo(id);
    saveDraftConfiguration(id);
    const sesion = sessionId();
    if (!sesion || !busy()) return;
    // El turno vivo arrancó con el modo de entonces y no lo relee: sin
    // pedírselo al proceso, la caja diría una cosa y el agente haría otra.
    void invoke("set_permission_mode", {
      project: project(),
      session: sesion,
      mode: id,
    }, deLaTarea(sesion))
      .then(() => {
        if (id === MODO_AUTOMATICO) return aprobarPendientes(sesion);
      })
      .catch(avisar(sesion));
  }

  /**
   * Cambiar de modo no contesta lo que el turno ya pidió: su gate sigue
   * abierto y el turno, esperando. Se contesta como el botón «Aprobar».
   */
  async function aprobarPendientes(sesion: string) {
    for (const p of permissions().filter((x) => x.session === sesion)) {
      // Otro modo elegido mientras volvía el cambio: aprobar ya no es lo pedido.
      if (sessionId() === sesion && modo() !== MODO_AUTOMATICO) return;
      if (!permissions().some((x) => x.requestId === p.requestId)) continue;
      await responderPermiso(p, true);
    }
  }

  /** La fila y la pestaña de una tarea que Rust todavía no creó. Devuelve su id provisional. */
  function pintarNaciendo(proyecto: string, titulo: string, con: { provider: string; model: string | null }, encargado: string | null): string {
    const provisional = idProvisional();
    const ahora = Date.now();
    // Dónde va a nacer, como las filas que luego traiga esa máquina
    // (`@terminus/fleet` `tag`): sin ella, en la web el riel la ponía en un grupo
    // «Esta máquina» aparte hasta que llegaba su fila del disco. La de la
    // ventana no lleva máquina, igual que sus filas.
    const destino = draftMachine() ?? capabilities().remoteCreate?.(workspaceActivo())?.machine ?? null;
    const machine = destino && !machines().find((m) => m.id === destino)?.local ? destino : undefined;
    setNaciendo((ns) => [
      ...ns,
      {
        project: proyecto,
        row: {
          id: provisional,
          title: titulo,
          provider: con.provider,
          model: con.model,
          refs: [],
          created_at: ahora,
          updated_at: ahora,
          turns: 1,
          parent: null,
          subagent: null,
          esperando: false,
          stage: null,
          agent: encargado,
          parent_agent: null,
          chat_de_agente: false,
          ...(machine ? { machine } : {}),
        },
      },
    ]);
    // Y delante, en el mismo gesto: el efecto que reparte las pestañas vuelve
    // a activar la que ya estaba. Nacer sin activarse devuelve la vista a la
    // tarea anterior hasta que Rust contesta. Y conservada: como vista
    // sustituiría a la pestaña de delante, y el siguiente clic, a ella.
    batch(() => {
      pestanas.ensure({ id: provisional, project: proyecto, titulo });
      pestanas.pin(provisional);
      pestanas.activate(provisional);
    });
    return provisional;
  }

  /** La tarea que nació toma lo que la ventana sin id tenía suyo: hilo, borrador, fila y pestaña. */
  function adoptarNacida(id: string, nacida: { provisional: string | null; proyecto: string; titulo: string; claveBorrador: string }) {
    const { provisional, proyecto, claveBorrador } = nacida;
    setDraftBases((bases) => {
      const next = { ...bases };
      delete next[claveBorrador];
      return next;
    });
    // La conversación que nació: su hilo se muda de `""` a su id. Los
    // eventos del turno pueden haber llegado ANTES que el id —Rust crea la
    // sesión y emite con ella mientras el `invoke` vuelve— y ya están en
    // `hilos[id]`; se conservan detrás de lo propio.
    deltasPorCuadro.vaciar();
    setHilos((hs) => {
      const { [""]: sinId, ...resto } = hs;
      const previo = hs[id] ?? SIN_HILO;
      return {
        ...resto,
        [id]: {
          base: [...(sinId?.base ?? []), ...previo.base],
          vivo: [...(sinId?.vivo ?? []), ...previo.vivo],
          guardados: previo.guardados,
        },
      };
    });
    // Y su borrador: lo que quedó sin mandar sigue con ella.
    setBorradores((bs) => {
      const { [claveBorrador]: suyo, ...resto } = bs;
      return suyo ? { ...resto, [id]: suyo } : resto;
    });
    if (provisional) {
      // La fila antes que la pestaña: una pestaña sin fila pide la lista.
      setNaciendo((ns) =>
        ns.map((n) => (n.row.id === provisional ? { ...n, row: { ...n.row, id } } : n)),
      );
      mudarPestana(provisional, id);
      pestanas.commitDraft(provisional, { id, project: proyecto, titulo: nacida.titulo });
      olvidarPestana(provisional);
    } else pestanas.ensure({ id, project: proyecto, titulo: "" });
    void reatarVistaPrevia(proyecto, id);
  }

  /**
   * Lanza un turno. Devuelve si llegó a arrancar: con `false`, quien
   * vació la caja le devuelve los adjuntos. Toma con qué correr del
   * mensaje, no de los selectores: mover el selector con la cola llena
   * no reescribe lo que esos mensajes van a hacer.
   */
  async function enviar(
    m: Omit<Encolado, "id">,
    /**
     * Lo que se contesta, en sus dos formas: `manda` son referencias que Rust
     * resuelve contra la transcripción, y `pinta` es lo mismo ya legible para
     * no dejar la pantalla en blanco mientras vuelve.
     */
    respuestas?: { manda: RespuestaEnviada[]; pinta: Respuesta[] },
    destination?: { project: string; session: string },
    /** La copia del trabajo a la otra máquina, antes de crear la tarea allá. */
    llevar?: (claveBorrador: string) => Promise<CarriedBase | null>,
  ): Promise<boolean> {
    if (!destination && sourceIds().some((id) => !taskSources()?.some((source) => source.id === id))) {
      setError(t("projects.context.task_unavailable"));
      return false;
    }
    // Antes de cualquier `await`: es lo que impide que el despacho de
    // la cola saque dos mensajes en el mismo respiro.

    // Se marca la sesión si ya existe, y si no, la ventana sin id: un
    // turno que reanuda tiene su id desde el principio; el primero de
    // una tarea nueva lo recibe al volver de Rust, más abajo.
    const generation = sessionGeneration;
    const abierta = destination?.session ?? sessionId();
    const creationOptions = abierta ? undefined : draftOptions();
    if (abierta) advanceTurn(abierta);
    else lifecycleRevision++;
    const start = Symbol();
    if (abierta) pendingStarts.set(abierta, start);
    if (abierta) finishedTurns.delete(abierta);
    const proyecto = destination?.project ?? project();
    const agenteDelBorrador = abierta ? null : hablandoCon()?.name ?? null;
    // De qué hilo y de qué borrador es este turno, capturado aquí: el
    // primero de una tarea nueva cambia la sesión abierta a mitad de
    // camino, y hay que soltar la clave con la que se mandó.
    const clave = abierta ?? "";
    const claveBorrador = destination?.session ?? claveAbierta();
    const selectedBase = draftBases()[claveBorrador] ?? null;
    const pendientes = destination ? borradores()[claveBorrador]?.sourceIds ?? [] : sourceIds();
    const excluidas = destination ? borradores()[claveBorrador]?.excludedSourceIds ?? [] : excludedSourceIds();
    if (abierta) marcarViva(abierta);
    else setArrancando(true);
    // Conversar es editar: la pestaña de la tarea deja de ser vista.
    if (abierta) pestanas.pin(abierta);
    // La tarea se pinta antes de que Rust la cree. Lo que la retrasaba no era
    // su nombre —`mentions::titulo_desde` lo saca del encargo antes de lanzar
    // nada— sino el evento `started`, que `chat::acp` emite cuando el proceso
    // del agente ya contestó al saludo.
    const provisional = abierta ? null : pintarNaciendo(proyecto, tituloProvisional(m.text), m, agenteDelBorrador);
    // Con qué se firma este turno. Se pregunta por el agente de ESTE mensaje y
    // no por el del selector: la cola guarda con qué se escribió cada uno, y
    // moverlo a mitad de un turno no puede reescribir hacia atrás quién
    // contestó los que ya estaban esperando.
    const signatureReady = invoke<Signatures>("turn_authors", {
      provider: m.provider,
    }).catch(() => null);
    const firmaDelTurno = respuestas ? await signatureReady : null;
    firmas[abierta ?? ""] = firmaDelTurno?.agent ?? null;
    modelosEnVivo[abierta ?? ""] = m.model || null;
    // El material que entra con este mensaje se dice en el hilo y
    // ahora, no al reabrir la tarea. Solo en una conversación
    // empezada: en el primer turno el preámbulo enumera el material
    // entero.
    const entrando: Msg[] =
      abierta && pendientes.length > 0
        ? [
            {
              role: "system",
              text: "",
              contexto: { entraron: pendientes },
            },
          ]
        : [];
    // El globo puede existir mientras se manda; su procedencia no. Afirmar aquí
    // que una persona contestó fabricaría ese dato si Rust rechazara la
    // relación. Se conserva la misma referencia para completarlo solo después
    // de que `send_message` haya validado y persistido la respuesta.
    const turnoPropio: Msg = {
      role: "user",
      text: m.text,
      task_mentions: m.task_mentions,
      // La línea de dirección se pinta con el globo y no al recargar: quien
      // manda tiene que ver a quién se le entregó en el momento de mandarlo.
      recipients: m.recipients?.length ? m.recipients : undefined,
      author: firmaDelTurno?.person ?? null,
      // Las rutas absolutas preparadas al adjuntar también sirven al releer del disco.
      attachments: m.attachments.length ? m.attachments : undefined,
    };
    // A `base` y no a `vivo`: `send_message` lo persiste antes de volver, así
    // que releer el disco lo trae — y si estuviera en `vivo` se pintaría dos
    // veces al volver a esta tarea mientras contesta.
    asentar(clave, (ms) => [...ms, ...entrando, turnoPropio]);
    // Mandar a una tarea de una máquina apagada la enciende: el proxy espera a que
    // conteste y entrega una sola vez.
    const dormida = abierta ? apagadas()[abierta] ?? null : null;
    if (abierta && dormida) anotar(setEncendiendo, abierta, dormida);
    // Y crear en la elegida en «Ejecutar en» si está apagada: el aviso cuelga de la pestaña que nace.
    const destino = creationOptions?.headers["x-terminus-machine"] ?? null;
    const naceDormida = destino && machines().find((x) => x.id === destino)?.on === false ? destino : null;
    if (provisional && naceDormida) anotar(setEncendiendo, provisional, naceDormida);
    try {
      const llevado = llevar ? await llevar(claveBorrador) : null;
      if (llevar && !llevado) throw CARRY_STOPPED;
      // La respuesta de una persona no existe en la interfaz hasta que Rust la
      // validó y la escribió: primero persistir, y solo entonces pintarla.
      const opciones = abierta ? deLaTarea(abierta) : llevado ? { headers: { "x-terminus-machine": llevado.target } } : creationOptions;
      const attachments = await attachmentsFor(m.attachments, opciones, proyecto);
      if (m.provider === "opencode-zen" && m.model !== "danil-free/reflection/beam-free") {
        const selected = catalogos()[m.provider]?.models.find((model) => model.id === m.model);
        if (!selected || selected.gratis === true) throw new Error(t("surfaces.free_off"));
      }
      const mandarTurno = () => invoke<string>("send_message", {
        provider: m.provider,
        project: proyecto,
        session: abierta,
        prompt: m.text,
        taskMentions: m.task_mentions ?? [],
        // A quién va dirigido. Lista aparte del material: con destinatarios,
        // el turno no lo contesta esta conversación —`chat::send_message` lo
        // entrega al buzón de cada uno y deja aquí a quién se entregó—.
        recipients: m.recipients ?? [],
        model: m.model,
        effort: m.effort,
        permissionMode: m.permission_mode,
        attachments,
        // Viaja con el turno: en el primero la tarea aún no existe, y guardarlo
        // después llegaba tarde a su propio contexto.
        sources: pendientes,
        excludedSources: excluidas,
        respuestas: respuestas?.manda ?? null,
        baseRef: abierta ? null : (llevado?.baseRef ?? selectedBase),
        // La tarea nace en la foto del trabajo llevado y la deshace en cambios sin commit.
        ...(llevado?.unwrapSnapshot ? { unwrapSnapshot: true } : {}),
        // Solo al crear: el encargado sale de haber pulsado su fila en el
        // riel, no de un selector. Una tarea ya abierta lleva el suyo
        // sellado y volver a mandarlo lo reescribiría.
        agent: agenteDelBorrador,
        taskFromAgent: !!agenteDelBorrador,
        // Quién escribió esto, cuando no fue la persona: una entrega que la
        // cola guardó mientras el chat contestaba sale por aquí, y sin este
        // renglón aterriza firmada por quien mira la pantalla.
        fromAgent: m.agent ?? null,
        // Y por dónde lo escribió la persona: sin esto, lo que llegó por
        // Telegram mientras el chat contestaba ya no vuelve por Telegram.
        fromChannel: m.channel ?? null,
        // Y la otra mitad del sobre. El remitente sin dirección de retorno
        // firma la entrega pero no dice dónde se contesta: quien preguntó se
        // queda esperando una respuesta que no vuelve
        // (`docs/specs/handler-mentions.md` § 3).
        replyTo: m.reply_to ?? null,
        hops: m.hops ?? null,
        fromTask: m.from_task ?? null,
        // El escritorio que la persona tenía delante al escribirlo, sellado en el
        // mensaje; lo que llega de otro canal no trae ninguno.
        space: espacioPara(m.space, opciones?.headers?.["x-terminus-machine"]),
      }, opciones);
      // El consentimiento del traspaso va justo antes del turno: el motor lo
      // consume en `send_message` y deja de valer para el siguiente.
      const pendiente = abierta ? borradores()[claveBorrador]?.provider ?? null : null;
      const actual = abierta ? (traspasos()[abierta]?.provider ?? filaDe(abierta)?.provider ?? null) : null;
      const vigente = handoverInForce(pendiente, actual);
      // Otro cliente cambió el CLI: el gesto confirmado ya no parte del que la
      // sesión tiene. Se suelta en vez de traspasar desde otro.
      if (pendiente && !vigente) {
        editarBorrador(claveBorrador, (b) => ({ ...b, provider: undefined }));
      }
      const { sendWithHandover } = await import("../features/chat/handoverSend");
      const traspaso = await sendWithHandover({
        session: abierta,
        pending: vigente?.to ?? null,
        current: actual,
        provider: m.provider,
        command: m.text.trimStart().startsWith("!"),
        setProvider: (provider) =>
          invoke("set_session_provider", { project: proyecto, session: abierta ?? "", provider }, opcionesDeLaTarea(abierta, workspaceActivo())),
        send: mandarTurno,
      });
      const id = traspaso.answer;
      // El gesto quedó consumido: se escribió el consentimiento o el mensaje ya
      // salió con el CLI que pedía. Un `!` no lo consume.
      if (traspaso.settled) {
        editarBorrador(claveBorrador, (b) => ({ ...b, provider: undefined }));
      }
      if (provisional && naceDormida) {
        anotar(setEncendiendo, provisional, null);
        void refetchMachines();
      }
      if (abierta && dormida) {
        anotar(setEncendiendo, abierta, null);
        anotar(setApagadas, abierta, null);
        void refreshSessions(grupos());
        void leerTarea(proyecto, abierta)
          .then((s) => loadResult(abierta, s, false, generation))
          .catch(() => {});
      }
      if (generation !== sessionGeneration) return true;
      if (respuestas) {
        asentar(clave, (ms) =>
          ms.map((mensaje) =>
            mensaje === turnoPropio
              ? { ...mensaje, respuestas: respuestas.pinta }
              : mensaje,
          ),
        );
      }
      // El turno ya tiene a qué colgarse: deja de ser «la ventana sin id».
      firmas[id] = firmas[id] ?? firmas[""] ?? null;
      modelosEnVivo[id] = modelosEnVivo[id] ?? modelosEnVivo[""] ?? null;
      // Antes de adoptarla: su encabezado lee de dónde vino al pintarse.
      if (llevado) carryModule()?.adoptOrigin(claveBorrador, id);
      if (!abierta) adoptarNacida(id, { provisional, proyecto, titulo: tituloProvisional(m.text), claveBorrador });
      if (!finishedTurns.has(id)) marcarViva(id);
      void signatureReady.then((signature) => {
        if (generation !== sessionGeneration) return;
        firmas[id] = signature?.agent ?? null;
        if (!respuestas) {
          asentar(id, (messages) => messages.map((message) =>
            message === turnoPropio ? { ...message, author: signature?.person ?? null } : message,
          ));
        }
      });
      if (!abierta) setArrancando(false);
      // Las fuentes de este mensaje salen del borrador; las de otro
      // que siga esperando, no. Va por id: da igual qué se esté mirando.
      editarBorrador(id, (b) => ({
        ...b,
        sourceIds: b.sourceIds.filter((x) => !pendientes.includes(x)),
      }));
      // Lo que cuelga de la vista, solo si la vista sigue donde
      // arrancó el turno: el primer mensaje crea la tarea en Rust
      // mientras se puede mirar otra, y ponerla delante aquí dejaba
      // `colaDe` nombrando la recién nacida con la cola de la que se
      // mira en la mano —lo escrito para aquélla se guardaba en la
      // carpeta de ésta. Lo de la tarea ya quedó hecho arriba, por id.
      if (
        abierta
          ? sessionId() === abierta
          : claveAbierta() === claveBorrador
      ) {
        setSessionId(id);
        if (!abierta) setHablandoCon(null);
        // Ya viajaron: dejan de ser pendientes y pasan a ser el contexto de la
        // conversación, que se sigue viendo mientras esté abierta.
        if (pendientes.length > 0)
          setAdjuntas((v) => [...new Set([...v, ...pendientes])]);
        // La cola escrita durante el primer turno es de la sesión que ese turno
        // acaba de crear.
        setColaDe(id);
      }
      if (finishedTurns.has(id)) void settleTurn(id, finishedTurns.get(id));
      return true;
    } catch (e) {
      if (abierta && dormida) anotar(setEncendiendo, abierta, null);
      if (provisional && naceDormida) anotar(setEncendiendo, provisional, null);
      // Sin esto queda una tarea que nadie creó: la fila y la pestaña se
      // pintaron contando con que Rust aceptara el turno.
      if (provisional) {
        retirarNaciendo(provisional);
        pestanas.close(provisional);
        olvidarPestana(provisional);
      }
      if (generation !== sessionGeneration) return false;
      if (e === CARRY_STOPPED) {
        // El texto vuelve a la caja: el globo se iría duplicado.
        asentar(clave, (ms) => ms.filter((message) => message !== turnoPropio && !entrando.includes(message)));
        setArrancando(false);
        return false;
      }
      if (destination && claveDe(e) === "history.error.busy") {
        asentar(clave, (ms) => ms.filter((message) => message !== turnoPropio && !entrando.includes(message)));
        marcarQuieta(destination.session);
        throw e;
      }
      if (!respuestas && claveDe(e) === "history.error.busy" && abierta === sessionId()) {
        asentar(clave, (ms) => ms.filter((mensaje) => mensaje !== turnoPropio && !entrando.includes(mensaje)));
        retainBusySession(m, { title: filaDe(abierta ?? "")?.title ?? "" }, abierta);
        return true;
      }
      if (abierta === sessionId()) setRetenida("fallo");
      if (!abierta) setArrancando(false);
      if (abierta) marcarQuieta(abierta);
      asentar(clave, (ms) =>
        // Una respuesta rechazada no deja ni un globo vacío que parezca un
        // turno humano. Los mensajes ordinarios sí se conservan: su texto se
        // escribió de verdad y ayuda a reintentar el fallo.
        respuestas ? ms.filter((mensaje) => mensaje !== turnoPropio) : ms,
      );
      anexar(clave, (ms) => [
        ...ms,
        {
          role: "system",
          // Una negativa de comando llega como clave: la frase nombra lo escrito.
          ...mensajeDeFallo(e, {
            command: comandoEscrito(m.text),
            agent: agents().find((a) => a.id === m.provider)?.label ?? m.provider,
          }),
          meta: "fallo",
        },
      ]);
      if (respuestas) throw e;
      return false;
    } finally {
      if (abierta && pendingStarts.get(abierta) === start) pendingStarts.delete(abierta);
      void reconcileActiveTurns();
    }
  }

  type Pendientes = {
    records?: { permissions: { id: string; request_id: string; state: string; [key: string]: unknown }[] };
    // `id` y `revision` faltan en un motor anterior a los pendientes durables.
    questions: { id?: string; request_id: string; revision?: number; turn: string }[];
    permissions: { id?: string; request_id: string; revision?: number; tool: string; target: string | null }[];
  };
  /** Lo que esa tarea tiene esperando. No lanza: sin respuesta, no hay nada. */
  const pendientesDe = (session: string, workspace = workspaceActivo()) =>
    invoke<Pendientes>("pending_requests", { session }, opcionesDeLaTarea(session, workspace)).catch(() => null);

  /**
   * El `request_id` de la pregunta viva de este turno, si alguien espera.
   * Sin él queda el camino de archivo.
   */
  async function atadura(
    session: string | null,
    turno: string,
  ): Promise<string | undefined> {
    if (!session) return undefined;
    const pendientes = await pendientesDe(session);
    return pendientes?.questions.find((q) => q.turn === turno)?.request_id;
  }

  /**
   * Repinta los gates que esta ventana no vio: el evento del permiso viajó
   * mientras no había nadie escuchando, y sin gate el turno espera una
   * decisión que nadie puede tomar.
   */
  const permissionReads = new Map<string, number>();
  let gateSeq = 0;
  async function reponerGates(session: string, workspace = workspaceActivo()) {
    const generation = sessionGeneration;
    const reading = (permissionReads.get(session) ?? 0) + 1;
    permissionReads.set(session, reading);
    const desde = gateSeq;
    const pendientes = await pendientesDe(session, workspace);
    if (!pendientes || generation !== sessionGeneration || reading !== permissionReads.get(session)) return;
    setPermissions((ps) => mergeGates(ps, session, workspace, pendientes.permissions, desde));
  }

  /**
   * Cierra una pregunta sin contestarla. Al agente se le dice que no hay
   * respuesta: mientras espere, no vuelve la caja de escribir.
   */
  async function cancelarPregunta(turno: string): Promise<void> {
    const sid = sessionId();
    if (!sid) throw new Error(t("shell.answer.no_session"));
    try {
      const guardado = await invoke<Turn>("cancel_question", {
        project: project(),
        session: sid,
        turn: turno,
      }, deLaTarea(sid));
      soltarPreguntas(sid, turno);
      asentar(sid, (ms) => [
        ...ms,
        {
          role: "user",
          text: guardado.text,
          turno: guardado.id ?? undefined,
          respuestas: guardado.answers ?? undefined,
          author: guardado.author ?? undefined,
        },
      ]);
    } catch (error) {
      anexar(sid, (ms) => [
        ...ms,
        { role: "system", ...mensajeDeFallo(error), meta: "fallo" },
      ]);
      throw error;
    }
  }

  /**
   * Contesta lo que el agente preguntó. Es un turno como cualquier
   * otro —gasta tokens, se registra, reanuda la sesión— y sale por el
   * mismo camino. Lo distingue que va atado a la pregunta que lo
   * provocó, y esa atadura es el entregable.
   */
  async function responder(
    turno: string,
    manda: RespuestaEnviada[],
  ): Promise<boolean> {
    const questionSession = sessionId();
    const questionWorkspace = workspaceActivo();
    const mensaje = msgs().find((m) => m.turno === turno);
    if (!mensaje)
      throw new Error(t("shell.answer.question_missing"));
    // Las preguntas por archivo llegan después de que el proceso cerró, pero
    // `done` puede tardar un instante más en apagar `busy`. No se debe exigir
    // `questionRequestId`: ese campo solo existe para el canal vivo de Claude.
    if (busy() && !(mensaje.preguntas && mensaje.preguntas.length > 0))
      throw new Error(t("shell.answer.turn_busy"));
    const preguntas = mensaje?.preguntas ?? [];
    // Sin atadura en esta ventana, la tiene Rust: su registro dura lo que el
    // proceso.
    const viva = mensaje?.questionRequestId
      ? mensaje.questionRequestId
      : await atadura(questionSession, turno);
    if (viva) {
      const sid = questionSession;
      if (!sid) throw new Error(t("shell.answer.no_session"));
      try {
        const pending = (await pendientesDe(sid, questionWorkspace))?.questions.find((q) => (q.request_id === viva || q.id === viva) && q.turn === turno);
        if (!pending) throw new Error(t("shell.answer.question_missing"));
        const guardado = await invoke<Turn>("answer_question", {
          session: sid,
          requestId: pending.id ?? pending.request_id,
          revision: pending.revision,
          respuestas: manda,
        }, opcionesDeLaTarea(questionSession, questionWorkspace));
        soltarPreguntas(sid, turno);
        asentar(sid, (ms) => [
          ...ms,
          {
            role: "user",
            text: guardado.text,
            turno: guardado.id ?? undefined,
            respuestas: guardado.answers ?? undefined,
            author: guardado.author ?? undefined,
          },
        ]);
        return true;
      } catch (error) {
        anexar(sid, (ms) => [
          ...ms,
          { role: "system", ...mensajeDeFallo(error), meta: "fallo" },
        ]);
        throw error;
      }
    }
    const cuando = Date.now();
    const pinta: Respuesta[] = manda.flatMap((r) => {
      const p = preguntas.find((x) => x.id === r.question);
      if (!p) return [];
      const partes = [
        ...r.chosen.map(
          (v: string) => p.options.find((o) => o.value === v)?.label ?? v,
        ),
        ...(r.free_text ? [r.free_text] : []),
      ];
      return [
        {
          turn: turno,
          question: r.question,
          question_text: p.question,
          chosen: r.chosen,
          text: partes.join(" · "),
          // Dicha por una persona, nunca inferida.
          source: "persona",
          when: cuando,
        },
      ];
    });
    if (pinta.length === 0)
      throw new Error(t("shell.answer.options_missing"));
    const sesion = sessionId();
    const salio = await enviar(
      {
        text: "",
        provider: mensaje.agent ?? agent(),
        model: model() || null,
        effort: effortDelTurno(),
        permission_mode: modo() || null,
        attachments: [],
      },
      { manda, pinta },
    );
    if (salio && sesion) soltarPreguntas(sesion, turno);
    return salio;
  }

  const [carryModule, setCarryModule] = createSignal<CarryModule | null>(null);
  const [hojaDeLlevar, setHojaDeLlevar] = createSignal<{ key: string; check: CarryCheck; busy?: boolean } | null>(null);
  const maquinaDeLaVentana = () => capabilities().windowMachine?.()?.id ?? machines().find((m) => m.active)?.id ?? "local";
  async function moduloDeLlevar(): Promise<CarryModule> {
    const mod = carryModule() ?? (await import("../features/machines/carry"));
    setCarryModule(() => mod);
    return mod;
  }
  /** Lo que se eligió hacer después de traer, por la clave de la copia. */
  const despuesDeTraer = new Map<string, "continue" | "branch">();
  const esRemota = (id: string) => {
    const machine = filaDe(id)?.machine;
    return !!machine && machine !== maquinaDeLaVentana();
  };

  /** «Traer a esta Mac»: despierta la otra máquina, pregunta qué hay en el worktree de la tarea y abre la hoja. */
  async function abrirTraer(proyecto: string | undefined, id: string) {
    const fila = filaDe(id);
    const workspace = workspaceActivo();
    const carpeta = projectList().find((p) => p.id === proyecto);
    if (!fila?.machine || !workspace || !carpeta) return;
    const mod = await moduloDeLlevar();
    try {
      const check = await mod.checkBring({ workspace, project: carpeta, source: fila.machine, target: maquinaDeLaVentana(), task: { id, title: fila.title } });
      setHojaDeLlevar({ key: `bring:${id}`, check, busy: vivas().includes(id) });
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  /**
   * «Llevar a otra máquina…» desde el menú de la carpeta: abre su tarea nueva en
   * la máquina elegida (o la primera encendida) y la hoja, aunque no haya nada
   * sin subir. La copia corre al enviar el primer mensaje.
   */
  async function abrirLlevarCarpeta(id: string, machine?: string) {
    const workspace = workspaceActivo();
    const carpeta = projectList().find((p) => p.id === id);
    if (!workspace || !carpeta) return;
    const mod = await moduloDeLlevar();
    const source = machine || mod.sourceOf(carpeta, maquinaDeLaVentana());
    const elegida = runOn(workspace, carpeta);
    const target = elegida && elegida !== source ? elegida : machines().find((m) => m.id !== source && m.on && m.hosts !== false)?.id;
    if (!source || !target) {
      setError(t("shell.machines.carry_none"));
      return;
    }
    nuevaSesion(id);
    setRunOn(workspace, target);
    const check = await mod.checkCarry({ workspace, project: carpeta, source, target }, true).catch(() => null);
    if (check) setHojaDeLlevar({ key: claveAbierta(), check });
    else setError(t("work.failure.export", { machine: machineName(source) }));
  }

  /**
   * Corre la copia de vuelta. Con «Seguir aquí» abre una tarea nueva en esta
   * máquina sobre lo traído, con un resumen corto como primer contexto (D4).
   */
  async function traer(key: string) {
    const mod = carryModule();
    const plan = mod?.carries()[key];
    const task = plan?.check.task;
    if (!mod || !plan || !task) return;
    const result = await mod.runCarry(key);
    if (!result) return;
    const branch = result.imported?.branch ?? plan.job.branchAs ?? null;
    if (despuesDeTraer.get(key) === "branch") {
      despuesDeTraer.delete(key);
      setAviso({ texto: t("work.bring.done", { here: machineName(plan.check.target), branch: branch ?? "" }) });
      return;
    }
    despuesDeTraer.delete(key);
    const leida = await leerTarea(plan.check.project.id, task.id).catch(() => null);
    const ultimo = leida?.turns.filter((turn) => turn.role === "agent" && turn.text.trim()).at(-1)?.text ?? null;
    nuevaSesion(plan.check.project.id);
    setRunOn(workspaceActivo(), plan.check.target);
    const draft = claveAbierta();
    mod.planCarry(draft, plan.check, plan.job, plan.state, result);
    setInput(mod.bringSummary(plan.check, ultimo, branch));
  }

  /** Manda si no hay turno corriendo; encola si lo hay. */
  async function mandar(attachments: string[]): Promise<boolean> {
    // Las dos listas se recortan con el mismo gesto: recortar solo las
    // menciones dejaría las etiquetas de destinatario apuntando al texto de
    // antes del `trim`, y el backend rechaza el tramo que no case.
    const message = trimDraft({ text: input(), task_mentions: borrador().task_mentions, recipients: borrador().recipients });
    const prompt = message.text;
    // Sin proyecto también se manda: elegirlo era un peaje para
    // escribir la primera línea. Nombrar el trabajo se decide cuando
    // hay algo que nombrar: la tarea nace suelta y se mueve después.
    if (!prompt && attachments.length === 0) return false;
    // No es un turno: no toca la cola ni el turno vivo, y los adjuntos se quedan.
    const pregunta = preguntaAlMargen(prompt, sideCommand());
    if (pregunta !== null) {
      setInput("");
      void preguntarAlMargen(pregunta);
      return true;
    }
    if (prompt.startsWith("!")) {
      const comando = comandoDeTerminal(prompt);
      if (!comando.trim()) return false;
      setInput("");
      // Con el agente trabajando espera su turno, como en Claude Code. Los
      // adjuntos se quedan en el borrador: un comando no los lleva.
      if (queueBusy() || cola().length > 0) {
        encolar(`!${comando}`, []);
        return true;
      }
      const id = sessionId();
      if (!id) {
        const corrio = await abrirConComando(comando);
        if (!corrio && !input()) setInput(prompt);
        return corrio;
      }
      // Un `!` corre y contesta con lo que la sesión ya tiene: el traspaso
      // confirmado en el borrador espera a su propio turno y no se gasta aquí.
      const sesion = configDeLaSesion(id);
      const lanzado = { project: project(), provider: sesion.provider, model: sesion.model, effort: sesion.effort, permission_mode: modo() || null };
      return (await ejecutarComando(id, lanzado, comando, null)) === null;
    }
    if (queueBusy() || cola().length > 0) {
      encolarYSoltar(prompt, attachments, message.task_mentions, message.recipients);
      setInput("");
      // Encolado se los lleva puestos: salen del borrador ya.
      setArchivos(archivos().filter((a) => !attachments.includes(a)));
      return true;
    }
    const draftKey = claveAbierta();
    const generation = sessionGeneration;
    if (hojaDeLlevar()?.key === draftKey) return false;
    const llevar = !sessionId() && !!carryModule()?.carries()[draftKey];
    setInput("");
    // Salen con el texto: el globo los pinta antes de que `send_message` vuelva.
    editarBorrador(draftKey, (b) => ({ ...b, archivos: adjuntosSinMandar(b.archivos, attachments) }));
    const sent = await enviar({
      text: prompt,
      task_mentions: message.task_mentions,
      recipients: message.recipients,
      provider: agent(),
      model: model() || null,
      effort: effortDelTurno(),
      permission_mode: modo() || null,
      attachments,
      space: escritorio(),
    }, undefined, undefined, llevar ? (clave) => (carryModule() as CarryModule).runCarry(clave) : undefined);
    if (!sent && generation === sessionGeneration) {
      editarBorrador(draftKey, b => ({
        ...(b.input ? b : { ...b, input: message.text, task_mentions: message.task_mentions, recipients: message.recipients }),
        archivos: adjuntosDevueltos(b.archivos, attachments),
      }));
    }
    return sent;
  }

  /**
   * Una respuesta rápida del agente, mandada como si la persona la hubiera
   * escrito. No toca el borrador, y nunca es un comando `!`: el texto lo
   * escribió el agente y un clic no puede correrlo en la máquina de la persona.
   */
  async function mandarTexto(texto: string): Promise<boolean> {
    if (queueBusy() || cola().length > 0) {
      // En la cola, un `!` de la persona y uno del agente no se distinguen.
      if (texto.trimStart().startsWith("!")) return false;
      encolarYSoltar(texto, []);
      return true;
    }
    return enviar({
      text: texto,
      provider: agent(),
      model: model() || null,
      effort: effortDelTurno(),
      permission_mode: modo() || null,
      attachments: [],
    });
  }

  function encolarYSoltar(text: string, attachments: string[], task_mentions?: TaskMention[], recipients?: Recipient[]) {
    const libre = cola().length === 0 && enFondo().includes(sessionId() ?? "") &&
      !injecting().some((item) => item.session === sessionId());
    const encolado = encolar(text, attachments, task_mentions, recipients);
    if (libre) void mandarAhora(encolado);
  }

  /**
   * Volver a mandar lo último que escribió la persona: es el mismo
   * camino que la caja, no uno paralelo. Repone el texto en el
   * borrador y manda con `mandar`, con el agente, modelo y modo de
   * ahora. Un reenvío por su cuenta divergiría en cuanto algo cambiara.
   */

  /**
   * No reintenta solo, ni encadena: lo dispara un clic en la fila del
   * fallo, solo donde puede arreglar algo (`Chat.tsx`, `gestoDelFallo`).
   * Automático gastaría la suscripción de otra persona sin gesto.
   */

  /**
   * Si no hay nada que reponer —una tarea abierta cuyo primer turno
   * murió antes de guardarse— no hace nada visible en vez de mandar
   * un mensaje vacío.
   */

  /**
   * Reenvía el texto y no los adjuntos: diferencia real de rutas. La
   * caja manda rutas de origen; el turno guarda rutas relativas a la
   * carpeta de trabajo, donde el archivo ya está. Pasarle las
   * relativas al camino de las de origen buscaría donde no hay nada.
   */
  async function reintentar() {
    const previos = msgs();
    for (let i = previos.length - 1; i >= 0; i--) {
      const m = previos[i];
      if (m.meta === "fallo" && m.resume === "deliveries") {
        const abierta = sessionId();
        if (!abierta) return;
        setRetenida(null);
        try {
          await invoke("reintentar_reanudacion_por_entregas", { project: project(), session: abierta }, deLaTarea(abierta));
        } catch (e) {
          setError(prosaDe(e));
        }
        return;
      }
      if (m.role !== "user" || !m.text.trim()) continue;
      editarBorrador(claveAbierta(), b => ({ ...b, input: m.text, task_mentions: m.task_mentions }));
      setRetenida(null);
      await mandar([]);
      return;
    }
  }

  // Con qué se escribió, capturado aquí: el mensaje se lleva agente, modelo y
  // esfuerzo del momento. Los adjuntos viajan como ruta de origen, copiados
  // al enviar: quitarlo de la cola no deja archivos sueltos.
  function encolar(text: string, attachments: string[], task_mentions?: TaskMention[], recipients?: Recipient[]) {
    const id = `${Date.now().toString(36)}-${++encolados}`;
    setCola((c) => [
      ...c,
      {
        id,
        text,
        task_mentions,
        recipients,
        provider: agent(),
        model: model() || null,
        effort: effortDelTurno(),
        permission_mode: modo() || null,
        attachments,
        space: escritorio(),
      },
    ]);
    return id;
  }

  /**
   * Devuelve el mensaje al frente de la cola y la retiene por `session`. En un
   * solo lote: la sesión deja de estar viva en la misma pasada en que la cola
   * queda retenida, o el despacho la sacaría otra vez en el hueco.
   */
  function retainBusySession(
    m: Omit<Encolado, "id"> & { id?: string },
    titular: { title: string },
    abierta: string | null,
  ) {
    cierreDeLaRetencion = cierres();
    batch(() => {
      setCola((c) => [
        { ...m, id: m.id ?? `${Date.now().toString(36)}-${++encolados}` },
        ...c,
      ]);
      setEsperandoA(titular.title);
      setRetenida("session");
      setArrancando(false);
      if (abierta) marcarQuieta(abierta);
    });
  }

  function editarEncolado(id: string, text: string, mentions?: TaskMention[]) {
    if (injecting().some((item) => item.id === id)) return;
    setCola((c) => c.map((q) => (q.id === id ? { ...q, text, task_mentions: mentions ?? editMentions(q, text) } : q)));
  }

  function quitarEncolado(id: string) {
    if (injecting().some((item) => item.id === id)) return;
    setCola((c) => c.filter((q) => q.id !== id));
  }

  /**
   * Deja de ofrecer «Mandar ahora» para ese agente y lo explica una vez. El
   * mensaje no se toca: sigue en la cola y sale cuando cierre el turno — es el
   * camino que el motor ya eligió al negarse.
   */
  function noRecibeAMedias(session: string, provider: string | null, aviso: string, workspace = workspaceActivo()) {
    if (!provider) return;
    const primera = !sinSteer().includes(provider);
    if (primera) setSinSteer((lista) => [...lista, provider]);
    if (!primera) return;
    anexar(session, (ms) => [...ms, { role: "system", text: t(aviso), meta: "steer_refused" }], workspace);
  }

  /**
   * Lo que la persona ya hace a mano cuando el agente no recibe mensajes a
   * medias: parar el turno y mandar lo encolado. No es un steer y no se
   * disfraza: el paso que corría se pierde, y el título del botón lo dice.
   */
  async function detenerYEnviar(id: string) {
    const abierta = sessionId();
    const m = cola().find((q) => q.id === id);
    if (!abierta || !m || !inyectable(m)) return;
    // Lo elegido sale primero; el resto conserva su orden.
    setCola((c) => [m, ...c.filter((q) => q.id !== id)]);
    setRetenida(null);
    // Sin turno vivo no hay nada que detener: la cola sale sola.
    if (!busy()) return;
    enviarAlCerrar.add(abierta);
    await detener();
  }

  /**
   * Mete un encolado en el turno que ya corre. Solo sale de la cola si el
   * backend lo aceptó: un mensaje que se borra de la lista sin haber entrado
   * en ningún sitio desaparece sin que nadie sepa que se perdió.
   */
  async function mandarAhora(id: string) {
    const abierta = sessionId();
    const m = cola().find((q) => q.id === id);
    if (!abierta || !m || !inyectable(m) || injecting().some((item) => item.id === id)) return;
    const sourceProject = project();
    const sourceWorkspace = workspaceActivo();
    // Quién contesta el turno vivo: la fila de la tarea, no el agente con que se
    // escribió lo encolado — el mensaje entra en el turno que corre, no en otro.
    const proveedor = filaDe(abierta)?.provider ?? m.provider;
    setInjecting((items) => [...items, { session: abierta, id }]);
    // Lo último del disco antes de meterlo: con un motor que no devuelve el turno,
    // lo guardado después con su texto es él (`mensajesDelHilo`).
    const tras = [...(hilos()[abierta]?.base ?? [])].reverse().find((msg) => msg.turno)?.turno ?? null;
    try {
      const attachments = await attachmentsFor(m.attachments, deLaTarea(abierta), sourceProject);
      // El turno tal como queda en la transcripción; `null` en un motor que todavía no lo devuelve.
      const guardado = await invoke<Turn | null>("inject_message", {
        project: sourceProject,
        session: abierta,
        prompt: m.text,
        taskMentions: m.task_mentions ?? [],
        queueId: id,
        attachments,
      }, deLaTarea(abierta));
      if (workspaceActivo() !== sourceWorkspace) return;
      // El turno sigue siendo el mismo, pero lo que contesta cambió: sin esto
      // el rótulo sigue contando desde el arranque hasta el próximo sondeo, y
      // bajo el mensaje recién escrito afirma una espera que no es suya.
      // Solo si ya había reloj: apuntarlo aquí encendería una fila quieta.
      setDesdeDeTurno((d) => (abierta in d ? { ...d, [abierta]: Date.now() } : d));
      const saved = savedQueues.get(abierta);
      if (saved) savedQueues.set(abierta, { ...saved, items: saved.items.filter((item) => item.id !== id) });
      if (sessionId() === abierta && project() === sourceProject) setCola((c) => c.filter((q) => q.id !== id));
      // Con su `turno`: la relectura de la tarea a mitad del turno ya lo trae de disco, y sin id salía dos veces.
      anexar(abierta, (ms) => [...ms, {
        role: "user",
        text: m.text,
        task_mentions: m.task_mentions,
        attachments: attachments.length ? attachments : undefined,
        turno: guardado?.id ?? undefined,
        author: guardado?.author ?? undefined,
        inyectado: guardado?.id ? undefined : { tras },
      }]);
    } catch (e) {
      const clave = claveDe(e);
      // El turno acaba de cerrar: el mensaje sigue en la cola y sale como el siguiente.
      if (clave === "chat.steer.not_running" || clave === "chat.steer.stopping") return;
      if (clave === "chat.steer.delivered") {
        const saved = savedQueues.get(abierta);
        if (saved) savedQueues.set(abierta, { ...saved, items: saved.items.filter((item) => item.id !== id) });
        if (sessionId() === abierta && project() === sourceProject) setCola((c) => c.filter((q) => q.id !== id));
        return;
      }
      // Este agente no recibe mensajes a medias: sigue en la cola y sale al cerrar
      // el turno. Cortarlo mataba turnos de Claude que solo esperaban su canal.
      if (clave === "chat.steer.unsupported") {
        noRecibeAMedias(abierta, proveedor, "chat.steer.unsupported", sourceWorkspace);
        return;
      }
      // El ejecutor no pudo saber si entró. Se queda en la cola —borrarlo
      // perdería lo escrito— y se avisa en la lengua de la ventana: la clave es
      // interna y en el hilo se leía tal cual, con un reintento que repetía el
      // mismo rechazo.
      if (detalleDe(e) === ENTREGA_SIN_CONFIRMAR) {
        noRecibeAMedias(abierta, proveedor, "chat.steer.unconfirmed", sourceWorkspace);
        return;
      }
      anexar(abierta, (ms) => [...ms, { role: "system", ...mensajeDeFallo(e), meta: "fallo" }]);
    } finally {
      setInjecting((items) => items.filter((item) => item.id !== id));
      if (workspaceActivo() === sourceWorkspace && finishedTurns.get(abierta) === true) void drainHiddenQueue(abierta);
    }
  }

  /** El proyecto que ocupa el panel principal, ya resuelto. */
  const proyectoDeLaVista = () =>
    projectList().find((p) => p.id === proyectoAbierto()) ?? null;

  // Una conversación escondida recibe el streaming de su turno y retiene todo
  // lo que se leyó en ella: solo se monta la que se ve. Volver a una desmontada
  // la pinta desde `hilos`, la deja en su `lectura` y con lo plegado en su `vista`.
  const seVeLaTarea = (id: string) =>
    celdaDe(id) !== undefined && !tapadoPorElProyecto(paneles.siteOf(id));
  // Mueren al cerrar la pestaña y no al dejar de verse: una pestaña de otra tira
  // o de otro workspace sigue abierta.
  const lecturas = new Map<string, Lectura>();
  const vistas = new Map<string, VistaDeLaConversacion>();
  const vistaDe = (session: string) => {
    const hay = vistas.get(session);
    if (hay) return hay;
    const nueva = vistaNueva();
    vistas.set(session, nueva);
    return nueva;
  };
  const montadas = createMemo<Set<string>>(() => {
    // La que acaba de abrirse todavía no tiene ventana: montarla ya y no un
    // efecto después ahorra pintar dos veces su apertura (`open-task-cost`).
    // Y una ventana que no manda y no tiene hilo —ni viene en camino— es de un
    // reparto que volvió: montarla pintaría una conversación vacía que no es la
    // suya. Se monta al pulsarla, que es cuando su lectura sale (`abrirSesion`).
    const visibles = tareasEnVentanas().filter((p) => {
      const sitio = paneles.siteOf(p.id);
      if (!sitio) return true;
      if (!seVeLaTarea(p.id)) return false;
      return (
        sameSite(sitio, paneles.activeSite()) ||
        hilos()[p.id] !== undefined ||
        cargandoHilo() === p.id
      );
    });
    return new Set(visibles.map((p) => p.id));
  }, new Set(), { equals: (a, b) => a.size === b.size && [...a].every((id) => b.has(id)) });
  const guardarLectura = (session: string | null, lectura: Lectura | null) => {
    if (!session) return;
    if (lectura) lecturas.set(session, lectura);
    else lecturas.delete(session);
  };
  function olvidarPestana(session: string) {
    const soltar = () => {
      lecturas.delete(session);
      vistas.delete(session);
    };
    soltar();
    // Su conversación puede desmontarse después, en la misma actualización, y
    // entregar entonces su lectura.
    queueMicrotask(soltar);
    soltarPreguntas(session);
  }
  // Al nacer, la pestaña cambia de id y su celda se recrea con el nuevo: lo suyo
  // se muda antes, para que la celda nueva lo encuentre.
  function mudarPestana(de: string, a: string) {
    const vista = vistas.get(de);
    if (vista && !vistas.has(a)) vistas.set(a, vista);
    const lectura = lecturas.get(de);
    if (lectura && !lecturas.has(a)) lecturas.set(a, lectura);
    setPreguntasAMedias((m) => {
      const suyas = [...m].filter(([k]) => k.startsWith(`${de}\u0000`));
      if (suyas.length === 0) return m;
      const mudado = new Map(m);
      for (const [k, v] of suyas) {
        mudado.delete(k);
        mudado.set(`${a}${k.slice(de.length)}`, v);
      }
      return mudado;
    });
  }

  /**
   * Con qué proyecto se trabaja, debajo de la caja y no en la cabecera.
   * Componente y no variable con JSX (SYSTEM.md § Las reglas de Solid,
   * regla 9): se pasa como prop a `Chat`.
   */
  const SelectorDeProyecto = (props: { branch?: JSX.Element; locked?: boolean; nueva?: boolean }) => (
    // Del ancho de la caja, no del contenido: `justify-items-center` encoge
    // la rejilla a su hijo más ancho —el aviso «sin fuente de contexto»,
    // 416 px— y la franja del proyecto (`w-full`) queda a esos 416 px bajo
    // una caja de 856: control suelto y centrado, lo que `ProjectPicker` evita.
    <div class="grid w-full max-w-[860px] gap-1">
        <ProjectPicker
          branch={props.branch}
          locked={props.locked}
          projects={props.nueva ? composerProjects() : projectList()}
          project={project()}
          sources={sources()}
          onPick={elegirProyecto}
          onNuevoProyecto={() => setAnadiendoCarpeta(true)}
          onAdministrar={() => setSettings("proyectos")}
          // Solo al crear: una tarea abierta ya vive en la máquina que la corre.
          machine={
            <Show when={props.nueva && !props.locked}>
              {/* Su propio límite: mientras carga, el resto de la vista sigue. */}
              <Suspense fallback={null}>
                <MachinePicker shared workspace={workspaceActivo()} project={projectList().find((p) => p.id === project())} />
              </Suspense>
            </Show>
          }
        />
      {/* A General, no a GitHub: la fuente principal del workspace se elige
          en Configuración → General; mandar a GitHub lleva a conectar un
          proveedor, dejando a la persona en una pantalla sin lo que buscaba. */}
      <Show when={contextConfirmed() && !contextRoot()}>
        <div class="justify-self-center">
          <EmptyContext
            onPickFolder={() => void elegirCarpetaDelWorkspace()}
            onConnect={() => setSettings("general")}
          />
        </div>
      </Show>
    </div>
  );

  /**
   * El atajo tal y como se escribe en el tooltip. Va en el rótulo del botón:
   * es lo único que enseña `⌘D` sin una pantalla de ayuda dedicada.
   */
  const atajoDePartir = (junta: boolean) =>
    isWindows()
      ? `Ctrl+${junta ? "Shift+" : ""}D`
      : `\u2318${junta ? "\u21e7" : ""}D`;

  /**
   * Cómo se nombra el botón de separar, con su atajo dentro: con una sola
   * pestaña no hay «otra cosa» que ver aparte, y un botón apagado sin motivo
   * se lee como un fallo (`AGENTS.md` § Diseño).
   */
  const nombreDeSeparar = (sitio: SitioDePanel) => {
    if (paginaDeAgente()) return t("projects.split.agent_page");
    if (!paneles.canSplit()) return t("projects.split.full");
    if (paneles.activeTabAt(sitio) === null)
      return t("projects.split.alone");
    return t("projects.split.detach", { key: atajoDePartir(false) });
  };

  /**
   * La conversación de UNA tarea, para poder montar más de una: se
   * pinta en el panel principal y en cada tarea separada
   * (`lib/panels.ts`), cada una con su sesión (SYSTEM.md § Las reglas
   * de Solid, regla 9). Arma su propia transcripción, no lee `msgs()`.
   */
  const [threadSearchTargets, setThreadSearchTargets] = createSignal(new Map<string, ThreadSearchTarget>());
  const [searchSurfaces, setSearchSurfaces] = createSignal(new Map<string, SearchSurface>());
  const [delegatedPanels, setDelegatedPanels] = createSignal(new Map<string, () => DelegatedPanelModel>());
  const consumo = createUsage({ agents, agent, busy, reload: cuentasTocadas });
  // Una sola ventana: sus pestañas van en la franja de la ventana, entre la navegación y los controles.
  const tiraDeLaVentana = () => (
          <div
            class="flex min-w-0 flex-1 items-center self-stretch"
            data-tauri-drag-region=""
            data-tira=""
            data-ventana="0,0"
            onPointerDown={() => mandarVentana({ col: 0, fila: 0 })}
          >
            <For each={paneles.columns().map((_, col) => ({ col, fila: 0 }))}>
              {(sitio) => (
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
              )}
            </For>
            {botonDeNuevaPestana()}
          </div>
  );
  // En una tarea, el conmutador del panel derecho abre sus archivos dentro de la tarea.
  // La sesión llega como accesor: leída al llamar, cada cambio de tarea volvería a montar el botón.
  const muestra = (id: string, mode: TaskSideMode) => {
    const panel = archivosDeTarea.panel(id);
    return !!id && panel.open && panel.mode === mode;
  };
  const botonDeArchivos = (sesion: () => string) => (
    <BotonConAtajo
      variant={muestra(sesion(), "files") ? "secondary" : "ghost"}
      size="icon"
      class="relative size-[30px] shrink-0 text-neutral-500"
      onClick={() => archivosDeTarea.present(sesion(), "files")}
      aria-pressed={muestra(sesion(), "files")}
      aria-label={t("code.panel.toggle")}
      accion="workTree"
      etiqueta={t("code.panel.toggle")}
    >
      <FolderOpen size={16} />
    </BotonConAtajo>
  );
  // La tarea nueva abre la carpeta del proyecto; sin carpeta no hay nada que enseñar y el botón queda apagado con su porqué.
  const botonDelArbol = () => {
    const llave = () => (carpetaDelProyecto() ? llaveDeBorrador(project()) : "");
    return (
      <BotonConAtajo
        variant={muestra(llave(), "files") ? "secondary" : "ghost"}
        size="icon"
        class="relative size-[30px] shrink-0 text-neutral-500"
        disabled={!llave()}
        onClick={() => archivosDeTarea.present(llave(), "files")}
        aria-pressed={muestra(llave(), "files")}
        aria-label={t("code.panel.toggle")}
        accion="workTree"
        etiqueta={llave() ? t("code.panel.toggle") : t("shell.work_tree.no_session")}
      >
        <FolderOpen size={16} />
      </BotonConAtajo>
    );
  };
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
    const clavePanel = () => pp.sesion
      ?? (carpetaDeTrabajo(proyectoDeLaCelda() ?? {}) ? llaveDeBorrador(proyectoDeLaCelda()?.id) : "");
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
      onDelete: id => void deleteTask(folder, id),
      onMove: (id, destination) => void moverSesion(folder, id, destination),
      onEtapa: (id, stage) => void etaparSesion(folder, id, stage),
      onRenombrar: (id, title) => void renombrarSesion(folder, id, title),
      onPin: (id, pinned) => fijarSesion(folder, id, pinned),
    });
    const delegatedModel = (): DelegatedPanelModel => ({
      context: `${workspaceActivo()}/${pp.sesion}`,
      rows: delegatedRows(),
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
      return value?.workspace === workspaceActivo() && value.id === pp.sesion ? value.reference : null;
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
      machine={draftMachine() ?? undefined}
      on={machines().find(m => m.id === draftMachine())?.on !== false}
      onScreen={abrirPantalla}
      project={proyectoDeLaCelda()?.name}
      path={carpetaDeTrabajo(proyectoDeLaCelda() ?? {}) || undefined} /></Suspense>)}</Show>}>{(id) => {
      return barraDeLaTarea(<Suspense fallback={null}><TaskLocation
        machine={filaDe(id())?.machine}
        on={!apagadas()[id()] && filaDe(id())?.machine_on !== false}
        onScreen={abrirPantalla}
        onFiles={() => {
          const folder = proyectoDeLaCelda()?.id;
          if (folder) void abrirSesion(folder, id()).then(() => archivosDeTarea.setOpen(id(), true));
        }}
        project={proyectoDeLaCelda()?.name}
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
        soloLectura={pp.soloLectura || !!estadoDelTrabajo()?.history.archived || estadoDelTrabajo()?.available === false || historialAnteriorEnReposo()}
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
        delegatedTask={reference => <DelegatedLaunch reference={reference} rows={delegatedRows()}
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
              onDelete: id => void deleteTask(folderOf(id), id),
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
          const id = pp.sesion, pager = historias.get(id), generation = sessionGeneration;
          if (!pager) return;
          try {
            await pager.latest();
            if (generation === sessionGeneration) pintarHistoria(id, pager, false);
          } catch (e) {
            setError(prosaDe(e));
          }
        }}
        estadoAntiguos={estadoAntiguos()[pp.sesion ?? ""] ?? "idle"}
        onLeyendo={(leyendo) => {
          if (!pp.sesion) return;
          if (leyendo) leyendoLejos.add(pp.sesion);
          else leyendoLejos.delete(pp.sesion);
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
        stopping={deteniendo() !== null && deteniendo() === pp.sesion}
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
        modelOptions={composerOptions()}
        onCreditsPrepare={() => {
          const prepare = capabilities().danilCredits?.prepare;
          if (!prepare) return;
          const revision = composerRevision;
          const options = composerOptions();
          void prepare(options.headers).then(async () => {
            if (revision !== composerRevision) return;
            await cargarSuperficies(false);
            await cargarModelos("opencode-zen", true);
          }).catch(() => setError(t("chat.credits.integration_pending")));
        }}
        /* Lo utilizable, más la superficie de la tarea abierta si dejó de
           serlo: una tarea viva no puede cambiar de agente en silencio. El
           `&&` va dentro del accesor y no aquí — ver `menuDeSuperficies`. */
        superficies={menuDeSuperficies()}
        superficie={superficie()}
        /* La salida del estado vacío: es la sección, no una superficie.
           Apuntaba al id de la primera —«claude», «opencode-zen»—, válido
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
        encendiendo={encendiendoEn(pp.sesion)}
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
        onRecipient={(name, label, trigger) => editarBorrador(claveAbierta(), b => {
          const next = insertRecipient({ text: b.input, task_mentions: b.task_mentions, recipients: b.recipients }, trigger, name, label);
          return { ...b, input: next.text, task_mentions: next.task_mentions, recipients: next.recipients,
            mentionHistory: [...(b.mentionHistory ?? []), { text: b.input, task_mentions: b.task_mentions, recipients: b.recipients }].slice(-100), mentionFuture: [] };
        })}
        onReference={(target, label, trigger) => editarBorrador(claveAbierta(), b => {
          const next = insertMention({ text: b.input, task_mentions: b.task_mentions, recipients: b.recipients }, trigger, target, label);
          return { ...b, input: next.text, task_mentions: next.task_mentions, recipients: next.recipients,
            mentionHistory: [...(b.mentionHistory ?? []), { text: b.input, task_mentions: b.task_mentions, recipients: b.recipients }].slice(-100), mentionFuture: [] };
        })}
        onInput={setInput}
        onSend={mandar}
        onRespuestaRapida={mandarTexto}
        visualScope={JSON.stringify([visualWorkspace, pp.proyecto ?? "", pp.sesion])}
        readVisual={(file) => readChatVisual({ workspace: visualWorkspace, project: pp.proyecto ?? "", session: pp.sesion ?? "" }, file)}
        openVisual={(file) => openChatVisual({ workspace: visualWorkspace, project: pp.proyecto ?? "", session: pp.sesion ?? "" }, file)}
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
          // La pregunta abierta manda sobre las otras dos razones: es la única
          // que no se puede soltar a mano.
          retenida: esperando() ? "pregunta" : retenida(),
          esperandoA: esperandoA(),
          onEditar: editarEncolado,
          onBorrar: quitarEncolado,
          onEditando: setEditando,
          onMandar: () => setRetenida(null),
          // Solo con un turno vivo y con un agente que no haya dicho que no
          // recibe mensajes a medias: sin él, lo escrito sale por el camino
          // normal y el gesto no significaría nada; con él negado, sería un
          // botón que no hace nada.
          onMandarAhora: pp.sesion && vivas().includes(pp.sesion) &&
            !sinSteer().includes(filaDe(pp.sesion)?.provider ?? "")
            ? (id: string) => mandarAhora(id)
            : null,
          // Y donde el motor ya negó el steer, el gesto que queda es el de la
          // persona: parar el turno y enviar. Nada con una pregunta abierta:
          // esa cola espera su respuesta, no un turno nuevo.
          onDetenerYEnviar: pp.sesion && vivas().includes(pp.sesion) && !esperando() &&
            sinSteer().includes(filaDe(pp.sesion)?.provider ?? "")
            ? (id: string) => void detenerYEnviar(id)
            : null,
        }}
        />
      } />
      }
    >
      {(e) => (
        <LazyPart><AgentProfile
          project={proyectoDeLaCelda()?.id ?? ""}
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
              if (elegidoAgent) setAgent(elegidoAgent);
              setModel(elegidoModel ?? "");
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
  const [fondoPropioUrl] = createResource(fondoPropio, async (ruta) => {
    if (!ruta) return null;
    try {
      return (await invoke<Preview>("preview_file", { path: ruta, rel: ruta }, machineOf(ruta))).data_url;
    } catch {
      return null;
    }
  });

  /* El fondo, la imagen y los velos son del workspace: su motor los recuerda
     y se leen al abrirlo, aquí y en la web. */
  createEffect(on(workspaceActivo, (workspace) => void import("../lib/chat-background-engine").then((m) => m.cargarFondoDelWorkspace(workspace))));

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
      <Show when={avisoDeMaquina()}>
        {(aviso) => (
          <p role="status" data-machine-notice="" class="mx-4 mb-2 shrink-0 rounded-sm bg-surface px-3 py-2 text-xs text-neutral-500 shadow-sm">
            {aviso()}
          </p>
        )}
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
        const herramientas = () => <ThreadSearch conversation={task()?.session ?? ""} active={sameSite(site(), paneles.activeSite()) && settings() === null && alta() === null}
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
      <Show when={arrastrando() !== null && cursor() !== null}>
        <div
          aria-hidden="true"
          class="pointer-events-none fixed z-[60] max-w-[220px] truncate rounded-sm border border-border-strong bg-surface-raised px-2 py-1 text-sm font-medium text-neutral-950 shadow-md"
          style={{
            left: `${cursor()!.x + 12}px`,
            top: `${cursor()!.y + 12}px`,
          }}
        >
          {tituloDePestana(arrastrando()!)}
        </div>
      </Show>

      {/* A qué ventana va a caer lo que se arrastra. En el centro —o sobre una
          tira, donde manda la barra de inserción— es el marco del cuadrante
          entero; en un borde que admite partida, media ventana, que es donde
          va a nacer la nueva. No recibe puntero: taparía el gesto que lo pinta. */}
      {/* Con una sola ventana no hay a cuál caer: reordenar ya lo dice la barra de inserción de la tira. */}
      <Show when={paneles.isSplit() && arrastrando() !== null && donde() !== null}>
        <Show
          when={dropSide()}
          fallback={
            <div
              aria-hidden="true"
              class="pointer-events-none z-50 rounded-sm border-2 border-primary/70 bg-primary/5"
              style={estiloDeLaCelda(donde()!.sitio)}
            />
          }
        >
          {(side) => (
            <div
              aria-hidden="true"
              class="pointer-events-none relative z-50"
              style={estiloDeLaCelda(donde()!.sitio)}
            >
              <div
                class={cn(
                  "absolute rounded-sm border-2 border-primary/70 bg-primary/5",
                  side() === "left" && "inset-y-0 left-0 w-1/2",
                  side() === "right" && "inset-y-0 right-0 w-1/2",
                  side() === "up" && "inset-x-0 top-0 h-1/2",
                  side() === "down" && "inset-x-0 bottom-0 h-1/2",
                )}
              />
            </div>
          )}
        </Show>
      </Show>

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
                  proyecto={p.project}
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
                  search={searchSurfaces().get(p.session)}
                  usage={{
                    usage: consumo,
                    agent: sameSite(paneles.siteOf(p.id) ?? null, paneles.activeSite()) ? agent() : (filaDe(p.session)?.agent ?? agent()),
                    onManage: () => { archivosDeTarea.setOpen(p.session, false); setSettings("proveedores-ia"); },
                  }}
                  delegated={() => delegatedPanels().get(`${workspaceActivo()}/${p.session}`)?.()} />}>
                  <Suspense fallback={null}>
                    <TaskFilesCard project={p.project} session={p.session} files={archivosDeTarea}
                      visible={visible()} readOnly={editorDeletionLocked(p.session)}
                      expandedOnly={paneles.isSplit() || compacta()}
                      onSaved={() => window.dispatchEvent(new CustomEvent("harness:copia"))}
                      onExportChat={() => exportarChat(p.session, p.project)}
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
            <VistaDeProyecto
              proyecto={p()}
              materialPedido={materialPedido() === p().id}
              onMaterialVisto={() => setMaterialPedido(null)}
              workspace={workspaceActivo()}
              modelos={modelosParaAgentes()}
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
              onDelete={(id) => void deleteTask(p().id, id)}
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
                    search={undefined}
                    usage={{
                      usage: consumo,
                      agent: agent(),
                      onManage: () => { archivosDeTarea.setOpen(llave(), false); setSettings("proveedores-ia"); },
                    }}
                    delegated={() => undefined} />}>
                    <Suspense fallback={null}>
                      <TaskFilesCard project={proyecto()} session="" panelKey={llave()} preview={{ baseRef: draftBases()[claveAbierta()] }}
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
                        <Suspense fallback={null}><VisorDeArchivo
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
                          fallback={<VisorDeArtefacto path={a().path} rel={a().rel} kind={a().kind} session={a().session} />}
                        >
                          <Suspense fallback={null}><VisorDeArchivo
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

      <Show when={pestanas.open().some(p => p.id === INBOX_TAB_ID) && customization.enabled("inbox") ? customization.scope() : undefined} keyed>
        <div class="min-h-0 min-w-0" classList={{ hidden: celdaDe(INBOX_TAB_ID) === undefined || tapadoPorElProyecto(paneles.siteOf(INBOX_TAB_ID)), "pt-8": llevaTiraInterior(paneles.siteOf(INBOX_TAB_ID)) }} style={celdaDe(INBOX_TAB_ID)}>
          {capabilities().inbox?.render(workspaceDeAgentes)}
        </div>
      </Show>

      <Show when={pestanas.open().some(p => p.id === BROADCASTS_TAB_ID) && customization.enabled("broadcasts") ? customization.scope() : undefined} keyed>
        <div class="min-h-0 min-w-0" classList={{ hidden: celdaDe(BROADCASTS_TAB_ID) === undefined || tapadoPorElProyecto(paneles.siteOf(BROADCASTS_TAB_ID)), "pt-8": llevaTiraInterior(paneles.siteOf(BROADCASTS_TAB_ID)) }} style={celdaDe(BROADCASTS_TAB_ID)}>
          {capabilities().inbox?.broadcasts(workspaceDeAgentes)}
        </div>
      </Show>

      <Show when={pestanas.open().some((p) => p.id === OBSERVABILITY_TAB_ID)}>
        <div
          class="min-h-0 min-w-0"
          classList={{ hidden: celdaDe(OBSERVABILITY_TAB_ID) === undefined || tapadoPorElProyecto(paneles.siteOf(OBSERVABILITY_TAB_ID)), "pt-8": llevaTiraInterior(paneles.siteOf(OBSERVABILITY_TAB_ID)) }}
          style={celdaDe(OBSERVABILITY_TAB_ID)}
        >
          <Observability onManage={() => setSettings("plugins")} />
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
        {/* El error del último gesto, y no caduca solo: uno que se va a los
            segundos no se llega a leer. Lo quita su cruz o el cambio de
            workspace. */}
        <Show when={error()}>
          {(e) => (
            <Toast tone="error" onDismiss={() => setError(null)}>
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

      {/* Cancelar va primero: es el que recibe el foco, y Enter por inercia no
          puede tirar ni escribir nada. */}
      <Show when={cierreSinGuardar()}>{(c) => (
        <Dialog open onOpenChange={(abierto) => { if (!abierto) setCierreSinGuardar(null); }}>
          <DialogContent class="flex flex-col gap-3">
            <DialogTitle class="text-sm font-semibold">{t("projects.tabs.unsaved.title")}</DialogTitle>
            <p class="m-0 text-ui text-neutral-700">{t("projects.tabs.unsaved.body")}</p>
            <ul class="m-0 flex max-h-[40vh] list-none flex-col overflow-y-auto p-0">
              <For each={c().archivos}>{(ruta) => (
                <li class="shrink-0 truncate font-mono text-caption text-neutral-500" title={ruta}>{ruta}</li>
              )}</For>
            </ul>
            <div class="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCierreSinGuardar(null)}>
                {t("projects.tabs.unsaved.cancel")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void resolverCierre("descartar")}>
                {t("projects.tabs.unsaved.discard")}
              </Button>
              <Button size="sm" onClick={() => void resolverCierre("guardar")}>
                {t("projects.tabs.unsaved.save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
              /* Agregar un workspace es la misma alta, no un formulario aparte: el
                 segundo cliente necesita lo mismo que el primero —sus cuentas y su
                 material, que cuelgan de él— y tener dos altas distintas garantiza
                 que una se quede corta. */
              nuevo={alta() === "nueva"}
              onCancelar={alta() === "nueva" ? () => setAlta(null) : undefined}
              /* Por el mismo evento que usa el selector de workspace: quien acaba
                 de crear el primero no tiene por qué saber cómo se recarga esta
                 pantalla. */
              onListo={() => {
                setAlta(null);
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
        <TitleBar
          bordeDeLaBarra={sidebar.colapsado() ? null : bordeDeLaBarra()}
          izquierda={<>
            <BotonConAtajo
              variant="ghost"
              size="icon"
              class="size-[30px] shrink-0 text-neutral-500"
              onClick={sidebar.alternar}
              aria-pressed={!sidebar.colapsado()}
              aria-label={sidebar.colapsado() ? t("shell.sidebar.show") : t("shell.sidebar.hide")}
              accion="sidebar"
              etiqueta={sidebar.colapsado() ? t("shell.sidebar.show") : t("shell.sidebar.hide")}
            >
              <Show when={sidebar.colapsado()} fallback={<PanelLeftClose size={16} />}><PanelLeftOpen size={16} /></Show>
            </BotonConAtajo>
            <Show when={spaces().length > 0}>
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
            </Show>
            {capabilities().sidebarExtra?.()}
          </>}
          finDeIzquierda={<>
            <BotonConAtajo
              variant="ghost"
              size="icon"
              class="size-[30px] shrink-0 text-neutral-500"
              data-global-search-open=""
              aria-expanded={buscando() !== null}
              aria-label={t("search.open")}
              accion="search"
              etiqueta={t("search.open")}
              onClick={() => setBuscando("all")}
            >
              <Search size={15} aria-hidden="true" />
            </BotonConAtajo>
            <Button
              variant="ghost"
              size="icon"
              class="size-[30px] shrink-0 text-neutral-500"
              data-add-project=""
              aria-label={t("projects.add.title")}
              title={t("projects.add.title")}
              onClick={() => setAnadiendoCarpeta(true)}
            >
              <FolderPlus size={15} aria-hidden="true" />
            </Button>
            <Show when={sidebarFilter() || capabilities().inbox}>
              <Suspense>
                <CustomizeMenu
                  filter={sidebarFilter()}
                  catalog={capabilities().inbox ? () => capabilities().inbox!.catalog({get temporary(){return customization.temporary();},get writable(){return customization.selection().writable;},demo:Boolean(capabilities().inbox?.demo),get entries(){return attentionEntries().map(entry=>({...entry,available:entry.available&&customization.selection().writable}));},onToggle:customization.toggle}) : undefined}
                />
              </Suspense>
            </Show>
          </>}
          centro={tiraDeLaVentana()}
          derecha={<GitHubStar />}
        />
        <GlobalSearch
          open={buscando()}
          onClose={() => setBuscando(null)}
          tasks={buscando() === null ? [] : flattenTasks(sesionesDelRiel(), true)}
          folders={proyectosDelRiel()}
          projects={projectList()}
          spaces={spaces()}
          conversations={capabilities().inbox?.search && customization.enabled("inbox") ? capabilities().inbox!.search.conversations : undefined}
          onOpenTask={(p, id) => { setHablandoCon(null); void abrirSesion(p, id); }}
          onOpenFolder={abrirProyecto}
          onNewTask={(id) => nuevaSesion(id)}
          onOpenConversation={(id) => { abrirInbox(); capabilities().inbox?.search.open(id); }}
        />
        {/* Con la sesión de la ventana recién abierta, la hoja para sincronizar el workspace abierto. */}
        <Show when={capabilities().workspaceDirectory?.onSession && signedInCount() > 0}>
          <Suspense fallback={null}>
            <DanilWorkspaceStep />
          </Suspense>
        </Show>
        {/* El velo del marco cubre la columna y el hueco alrededor de la caja: un solo tono también en la esquina. */}
        <div class="tab-veil window-frame relative flex min-h-0 flex-1 overflow-visible">
          <WorkspaceColumn
            attention={attention.list()}
            onManage={() => setSettings("workspaces")}
            onOpenAgents={abrirInbox}
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
              class="h-full min-h-0 w-full min-w-0"
              ref={(el) => createEffect(() => el.toggleAttribute("inert", enCache()))}
              aria-busy={enCache() || undefined}
              data-shell-cache={enCache() ? "" : undefined}
            >
            <Sidebar
              attentionMenu={capabilities().inbox ? collapsed => capabilities().inbox!.sidebarMenu({get entries(){return attentionEntries().filter(entry=>entry.selected);},get active(){return pestanas.active();},collapsed,onOpen:openAttentionFeature}) : undefined}
              projects={proyectosDelRiel()}
              modelos={modelosParaAgentes()}
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
              onDelete={(p, id) => deleteTask(p, id)}
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


      <AnadirCarpeta
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
          setProjectList(await invoke<Project[]>("list_projects"));
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
            workspaceName={workspaceActual()?.name ?? null}
            agentsWorkspace={workspaceDeAgentes()}
            activityMachine={activityMachine()}
            panel={settings() || undefined}
            modelos={modelosParaAgentes()}
            proyecto={proyectoAbierto() ?? project()}
            agentesEnUso={agentesEnUso()}
            onClose={cerrarAjustes}
            proyectos={proyectosEnAjustes}
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
