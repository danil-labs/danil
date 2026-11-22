
import { open } from "@tauri-apps/plugin-dialog";
import { createCeldasDeContenido } from "./conversation-content";
import { createCeldasDeTareas } from "./conversation-tasks";
import { createConversacion } from "./conversation";
import { createServiceListeners } from "./service-listeners";
import { createTabDrag } from "./tab-drag";
import { createWindows } from "./windows";
import { createPanelsGeometry } from "./panels-geometry";
import { createColumnasDePrincipal } from "./principal-columns";
import { createPrincipal } from "./principal";
import { createWindowBackground } from "./window-background";
import { createSpacesState } from "./spaces-state";
import { AgentProfile, CarryOriginLabel, CarryProgress,       MachinePicker,      TaskLocation } from "./lazy-screens";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import {
  batch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  
  
  type JSX,
  
  
  
  onCleanup,
  
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
  
  mensajesDelHilo,
  
  
} from "../../../features/chat/src/model/transcript";
import { createComposerStore } from "../../../features/composer/src";
import { createCloneFolder, createDeskStrip, createNewTask, createSpaceOps, createRailSessions, createWorkspaceSession } from "../../../features/projects/src";
import { createThreadsStore } from "../../../features/chat/src/index.ts";
import type { HandlerTarget } from "../../../features/projects/src/screens/HandlerPolicy";
import { createWorkspaceStore } from "../../../features/workspace/src";
import { createContextSource } from "../../../features/workspaces/src";


import { avisarDeLosArboles } from "../../../features/code/src/queries/refresh";
import TaskFilesRow, {  } from "../../../features/code/src/screens/TaskFilesRow";
import AgentPageTasks from "../../../features/projects/src/screens/AgentPageTasks";

import { createFreeRouterConsent, folderIcon, importCarry, renderAvatar,  renderPdf } from "./chatSlots";
import { launcherOf, taskDescendants } from "@terminus/tasks";
import { bringHereLabel, canBringHere, carryOrigin, machineName, machineOf, machines, machineWakes, refetchMachines, rememberedRunOn, remoteChildScope, runOn, senderTaskId, setRunOn } from "../../../features/machines/src/queries/store";
import { createdTasks } from "../../../features/projects/src/model/agentPageFilters";
import BaseBranchPicker from "../../../features/projects/src/screens/BaseBranchPicker";
import { watchHandlerStatus, watchHandlerStatuses } from "../../../features/projects/src/queries/handlerPresence";
import { EmptyContext, ProjectPicker } from "../../../features/projects/src/screens/Projects";

import { workLabel } from "../../../ui/src/lib/workLabel.ts";
import { DEFAULT_PROFILE, displayName, notifyProfiles, watchProfiles } from "../../../features/projects/src/queries/profiles";
import RecentAgentChats from "../../../features/projects/src/screens/RecentAgentChats";
import { type SessionRow, threadTitle } from "../../../features/projects/src/screens/Sessions";
import TabStrip, {  } from "../../../features/projects/src/screens/Tabs";
import { createTaskWork, ResumeTask } from "../../../features/projects/src/screens/TaskHistory";
import { esChatDeAgente } from "../../../features/projects/src/model/taskTree";
import {
  DEFAULT_PERMISSION_MODE_EVENT,
} from "../../../features/settings/src/screens/DefaultPermissions";


import { listaBasta, reconciliar } from "../../../features/settings/src/model/early-startup";
import { createAttention, topState } from "../shell/attention";

import { openChatVisual, readChatVisual } from "../../../features/chat/src/queries/readVisual";
import {   soltarVistasHuerfanas } from "../../../features/code/src/queries/typst";
import { createConversationHandoff } from "../../../features/conversation-handoff/src";
import { createDraftsStore } from "../../../features/drafts/src";
import { asleep, withLastAnswer } from "../../../features/machines/src/queries/lastAnswer";
import { unconfirmedOpen } from "../../../features/machines/src/model/unconfirmedOpen";
import { createBatchDelivery, createServiceStream } from "../../../features/service-stream/src";
import PantallaDeBloqueo from "../shell/LockScreen";
import { createSidebar } from "../shell/Sidebar";
import { createUsage } from "../shell/usage";
import { createEngineQueue, createTaskQueues } from "../../../features/task-queues/src";
import { connected } from "../../../../apps/desktop/src/lib/engineConnection";
import { pedirElCampo } from "../../../../apps/desktop/src/lib/focus";
import {  t } from "../../../../apps/desktop/src/lib/i18n";
import {  invoke } from "../../../engine-client/src/client.ts";
import { carpetaDeTrabajo, type HandlerList } from "../../../../apps/desktop/src/lib/model";
import { capabilities } from "../../../host/src/platform";
import { type SenderTask } from "../../../../apps/desktop/src/lib/recipients";
import { conservar } from "../../../session/src/sessionRefresh";
import { comandosConAlMargen } from "../../../../apps/desktop/src/lib/side-question";
import {
  esProvisional,
  proyectoDeNuevaTarea,
} from "../../../../apps/desktop/src/lib/taskDraft";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import {
  
  
  
  LOCATION_BAR,
  
} from "../../../host/src/window";
import { Button } from "../../../ui/src/Button";
import { prosaDe } from "../../../ui/src/Failure";
import { LazyPart } from "../../../ui/src/LazyPart";
import { createChatEvents, createSleepSession, createThreadStream, createThreadSide, createAttachments, createAttachmentsMount, createResync, createResyncCommands, createShellCommand, createDraftSend, createHandover, createSend, createSendGates, createSendNow, createPanelDeChat } from "../../../features/chat/src";

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

  const {
    activeSpace,
    bordeDeLaBarra,
    buscando,
    enCache,
    escritorio,
    guardarCache,
    idsDeContenido,
    medirBordeDeLaBarra,
    multipleSpaces,
    pestanaActiva,
    setBuscando,
    setEnCache,
    setEscritorio,
    setSidebarFilter,
    setSpaces,
    shellCache,
    sidebarFilter,
    spaces,
    workspaceActual,
  } = createSpacesState({
    bloqueo,
    pestanas,
    projectCatalog,
    projectList,
    proyectoAbierto,
    sesiones,
    setError,
    setSesiones,
    workspaceActivo,
  });

  let cabeceraDeConversacion: HTMLDivElement | undefined;
  let controlesIzquierdos: HTMLDivElement | undefined;
  let controlesDerechos: HTMLDivElement | undefined;
  const { adjuntosEn, altosEnPantalla, anchosEnPantalla, celdaDe, cerrarBorrador, compacta, deLaTarea, enBorrador, enMaquina, espacioPara, estiloDeLaCelda, filaDe, filasEnPantalla, llevaTiraInterior, opcionesDeLaTarea, paginaDeAgente, paneles, pegadasEn, pestanaDelanteEn, pestanasDe, pestanasEnPantalla, reservaDerechaDeTiras, reservaIzquierdaDeTiras, setAntesDelBorrador, sitiosEnBlanco, tapadoPorElProyecto, tareaDelRiel, ventanas, vueltaDelBorrador } = createPanelsGeometry({ hablandoCon, naciendo, pestanas, sesiones, sessionId, get activarPestana() { return activarPestana; }, get cabeceraDeConversacion() { return cabeceraDeConversacion; }, set cabeceraDeConversacion(v) { cabeceraDeConversacion = v; }, get controlesDerechos() { return controlesDerechos; }, set controlesDerechos(v) { controlesDerechos = v; }, get controlesIzquierdos() { return controlesIzquierdos; }, set controlesIzquierdos(v) { controlesIzquierdos = v; }, get proyectoDeLaVista() { return proyectoDeLaVista; } });
  const { tareasEnVentanas, proyectoDePestana, sesionesConPestana, agentesEnUso, pedidas, esperandoFila, cambiarEscritorio, carpetaDelEscritorio, asentarEscritorio, reloadSpaces, senalDe, claveDelHilo, claveAbierta, drafts, borrador, input, setInput, navigateMentionHistory, sourceIds, excludedSourceIds, archivos, setArchivos, agregarArchivos, adjuntas, materialPendiente, contexto, composer, agents, agent, superficies, superficie, catalogos, models, modelosParaAgentes, model, effort, modo, modos, skills, cliCommands, sideCommand, threads, hilos, hiloAbierto, msgs, cargandoHilo, origenes, apagadas, machineWaits, traspasos, conAntiguos, conRecientes, estadoAntiguos, colaSuelta, leerTarea, cargarAntiguos, soltarHilo, avisar, loadResult, soltarPestanaGuardada } = createDeskStrip({ abrirSesion: (proyecto, id, activar, propagateError) => abrirSesion(proyecto, id, activar, propagateError), activarPestana: (p) => activarPestana(p), activeSpace, adjuntosEn, attention, composerMachine: () => composerMachine(), connected, createComposerStore, createDraftsStore, createThreadsStore, deLaTarea: (id) => deLaTarea(id), escritorio, filaDe: (id) => filaDe(id), grupos, hablandoCon, irAlBlanco: (enProyecto) => irAlBlanco(enProyecto), get liveThreads() { return liveThreads; }, loadWindowThreads: (skip) => loadWindowThreads(skip), machines, modoInicial, modoRecordado, recordarModo, naciendo, olvidarPestana: (session) => olvidarPestana(session), paneles, pegadasEn, pestanaActiva, pestanas, project, projectList, refreshSessions: (proyectos) => refreshSessions(proyectos), get serviceStream() { return serviceStream; }, sesiones, sessionId, setEscritorio, setProyectoAbierto, setSpaces, spaces, taskSources, topState, vivas: () => vivas(), withLastAnswer, workspaceActivo, workspaceContext, workspaceMode, });
  const { aviso, setAviso, deletingSpace, setDeletingSpace, createSpace, renameSpace, removeFromActiveSpace, moveToSpace, spaceDeleted } = createSpaceOps({ abrirSesion: (proyecto, id, activar, propagateError) => abrirSesion(proyecto, id, activar, propagateError), activeSpace, cambiarEscritorio, deLaTarea: (id) => deLaTarea(id), escritorio, grupos, machineOf: (id) => machineOf(id), refreshSessions: (proyectos) => refreshSessions(proyectos), reloadSpaces, setBuscando, setError, setSpaces, soltarPestanaGuardada, spaces, workspaceActivo });

  let lifecycleRevision = 0;
  const { advanceTurn, alMargen, almacenDePreguntas, arrancando, busy, carpetasDeTerminal, cerrarAlMargen, cola, colaDe, comandosDeLaCola, conversationScope, desdeDeTurno, detenidos, editando, enFondo, engineCanDispatch, esDeLaAbierta, esDelWorkspaceAbierto, esperaMaquinaEn, finishedTurns, folder, handoff, handoffAt, injecting, lanzados, liveThreadKey, liveThreads, marcarQuieta, marcarViva, mentionSources, nacenConComando, pasarAlHilo, pendingStarts, permissionError, permissions, placeCandidates, preguntarAlMargen, queueBusy, recipientCandidates, refreshTaskCandidates, reintento, releerCola, respondiendoPermiso, resumeQueue, retenidaPorElMotor, rosterDelProyecto, setArrancando, setCarpetasDeTerminal, setDesdeDeTurno, setEnFondo, setFolder, setInjecting, setMentionSources, setPermissionError, setPermissions, setPreguntasAMedias, setReintento, setRespondiendoPermiso, setSettlingTurns, setSinSteer, setTerminales, setVentana, setVivas, settlingTurns, sinSteer, soltarPreguntas, stopping, taskCandidates, taskQueues, terminales, turnClosed, turnRevisions, turnStarted, ventana, vivas } = createThreadStream({ apagadas, claveAbierta, createConversationHandoff, createEngineQueue, createTaskQueues, deLaTarea, filaDe, input, leerTarea, loadResult, machineName, machineOf, machineWaits, machineWakes, machines, opcionesDeLaTarea, pestanas, project, projectList, sesiones, sessionId, setInput, tareaDelRiel, threads, watchHandlerStatuses, watchProfiles, workspaceActivo, workspaceContext, get enviarFiltro() { return enviarFiltro; }, get lifecycleRevision() { return lifecycleRevision; }, set lifecycleRevision(v) { lifecycleRevision = v; }, get mandarElegido() { return mandarElegido; }, get reconcileActiveTurns() { return reconcileActiveTurns; } });
  const { abrirObservabilidad, abrirPantalla, activarPestana, cerrarPestanasYa, irAPestanaDe, irAVentanaVecina, mandarVentana, partirLaActiva, partirVentana, puedeSepararseDe, reabrirPestana } = createWindows({ carpetaDelEscritorio, drafts, filaDe, paginaDeAgente, paneles, pestanaActiva, pestanas, project, sessionId, setProyectoAbierto, soltarHilo, vivas, get abrirSesion() { return abrirSesion; }, get irAlBlanco() { return irAlBlanco; }, get olvidarPestana() { return olvidarPestana; } });

  const { activityMachine, activityNotice, anadiendoCarpeta, carpetaDelProyecto, inicioDeCarpeta, setActivityMachine, setActivityNotice, setAnadiendoCarpeta, setInicioDeCarpeta, setSettings, settings, sidebar } = createThreadSide({ createSidebar, alta, archivosDeTarea, closeActiveTab: () => closeActiveTab(), irAPestanaDe, irAVentanaVecina, juntarLaActiva, llaveDeBorrador, nuevaSesion: (enProyecto) => nuevaSesion(enProyecto), partirLaActiva, project, projectList, reabrirPestana, sessionId, setBuscando, workspaceActivo });
  const { clonEnCurso, setClonEnCurso, cuentasTocadas, setCuentasTocadas, firmas, modelosEnVivo, esperando, preguntadas, sesionesConEstado, sessionLists, refreshSessions, carpetasDeTarea, refreshSessionsOnEvent, releerTrasHueco, previewDeAdjunto, miniaturaDeAdjunto, documentosEn, opcionesDeAdjunto, } = createCloneFolder({ attention, avisarDeLosArboles, claveDelHilo, colaSuelta, deLaTarea: (id) => deLaTarea(id), draftOptions, esperandoFila, grupos, hiloAbierto, hilos, leerTarea, loadResult, machines, msgs, naciendo, pedidas, pestanas, project, remoteChildScope, retoques, sesiones, sesionesConPestana, sessionId, setSesiones, unconfirmedOpen, vivas: () => vivas(), workspaceActivo, workspaceContext, });


  const { aplicar, attachmentsFor, pegarImagen, recargarMaterial, refreshFolder, retryStartupRead } = createAttachments({ adjuntosEn, asentarEscritorio, asleep, composer, confirmContext, deLaTarea, documentosEn, draftOptions, drafts, enCache, enMaquina, finishedTurns, grupos, guardarCache, handoff, hilos, machineName, machines, paneles, pegadasEn, pestanas, projectCatalog, refetchMachines, refreshSessions, sessionId, sessionLists, setAlta, setAviso, setBloqueo, setCuentasTocadas, setDesdeDeTurno, setDraftBases, setEnCache, setError, setEscritorio, setFolder, setMaterialError, setProject, setProjectReadError, setProyectoAbierto, setSesiones, setSessionId, setSettlingTurns, setSources, setSpaces, setStartupReadError, setTaskSourcesError, setVentana, setVivas, shellCache, taskQueues, threads, workspaceActivo, workspaceContext, get abrirSesion() { return abrirSesion; }, get lifecycleRevision() { return lifecycleRevision; }, set lifecycleRevision(v) { lifecycleRevision = v; }, get loadThread() { return loadThread; }, get loadWindowThreads() { return loadWindowThreads; }, get reconcileActiveTurns() { return reconcileActiveTurns; }, get soltarCola() { return soltarCola; } });

  const { applyPushed, settleTurn } = createAttachmentsMount({ advanceTurn, agent, aplicar, asleep, bloqueo, closeActiveTab: () => closeActiveTab(), composer, conversationScope, createBatchDelivery, enCache, finishedTurns, grupos, handoff, hilos, leerTarea, listaBasta, loadResult, marcarQuieta, pestanas, project, projectCatalog, recargarMaterial, reconciliar, refreshSessions, sessionId, setBloqueo, setEnCache, setEnFondo, setPermissions, setSesiones, setSettings, setSettlingTurns, setStartupReadError, soltarHilo, tareaDelRiel, taskQueues, threads, turnRevisions, vivas, workspaceContext, get mandarElegido() { return mandarElegido; }, get releerProyectos() { return releerProyectos; }, get releerUna() { return releerUna; }, get soltarTerminal() { return soltarTerminal; } });
  let serviceListenersReady: Promise<unknown> = Promise.resolve();
  const { enviarFiltro, reconcileActiveTurns, reconcileSoon, releerUna, serviceStream } = createResync({ applyPushed, asleep, conversationScope, createServiceStream, esDeLaAbierta, handoff, leerTarea, liveThreads, loadResult, machines, marcarViva, pendingStarts, pestanas, project, recargarMaterial, releerTrasHueco, sesionesConPestana, sessionId, setConnectionError, setDesdeDeTurno, setEnFondo, setError, setPermissions, settleTurn, settlingTurns, soltarVistasHuerfanas, tareaDelRiel, terminales, threads, vivas, workspaceActivo, workspaceContext, get lifecycleRevision() { return lifecycleRevision; }, set lifecycleRevision(v) { lifecycleRevision = v; }, get ponerTerminal() { return ponerTerminal; }, get reponerGates() { return reponerGates; }, get serviceListenersReady() { return serviceListenersReady; }, set serviceListenersReady(v) { serviceListenersReady = v; } });

  const { alEventoDeChat } = createChatEvents({ advanceTurn, agent, avisarDeLosArboles, carpetasDeTarea, cola, composer, conversationScope, editando, enFondo, enviarFiltro, esDelWorkspaceAbierto, filaDe, finishedTurns, firmas, handoff, liveThreadKey, liveThreads, marcarViva, modelosEnVivo, noteMcpSignIn, pendingStarts, permissions, refreshSessionsOnEvent, reintento, releerCola, releerUna, sessionId, setEnFondo, setPermissionError, setPermissions, setReintento, setSettlingTurns, settleTurn, threads, turnClosed, turnStarted, workspaceActivo, get alComando() { return alComando; }, get gateSeq() { return gateSeq; }, set gateSeq(v) { gateSeq = v; }, get mandarAhora() { return mandarAhora; }, get permissionReads() { return permissionReads; }, get reponerGates() { return reponerGates; } });

  createServiceListeners({ agent, alEventoDeChat, aplicar, carpetasDeTarea, composer, esDeLaAbierta, esDelWorkspaceAbierto, filaDe, grupos, input, leerTarea, loadResult, pestanas, project, projectCatalog, reconcileSoon, refreshSessions, refreshSessionsOnEvent, refreshTaskCandidates, releerTrasHueco, reloadSpaces, sessionId, setCuentasTocadas, setError, setProjectReadError, setStartupReadError, setVentana, threads, vivas, workspaceActivo, workspaceContext, get abrirEnlace() { return abrirEnlace; }, get abrirRuta() { return abrirRuta; }, get abrirSesion() { return abrirSesion; }, get mandarTexto() { return mandarTexto; }, get serviceListenersReady() { return serviceListenersReady; }, set serviceListenersReady(v) { serviceListenersReady = v; } });

  const { alComando, ponerTerminal, porContestar, quitarDeLaCola, responderPermiso, setPorContestar, soltarTerminal } = createResyncCommands({ advanceTurn, cola, comandosDeLaCola, detenidos, engineCanDispatch, finishedTurns, lanzados, marcarViva, opcionesDeLaTarea, pendingStarts, retenidaPorElMotor, sessionId, setCarpetasDeTerminal, setPermissionError, setPermissions, setRespondiendoPermiso, setSettlingTurns, setTerminales, settleTurn, superficies, taskQueues, terminales, threads, workspaceActivo, get adoptarComando() { return adoptarComando; }, get contestarALaTerminal() { return contestarALaTerminal; }, get pendientesDe() { return pendientesDe; }, get reanudarCola() { return reanudarCola; }, get reponerGates() { return reponerGates; } });
  const { abrirConComando, adoptarComando, composerMachine, contestarALaTerminal, detener, ejecutarComando, enviarDeLaCola, mandarCola, mandarElegido, razonDeLaCola, teclearAlComando } = createShellCommand({ DEFAULT_PERMISSION_MODE_EVENT, agent, agents, busy, carpetasDeTerminal, claveAbierta, cola, comandosDeLaCola, composer, conversationScope, deLaTarea, draftBases, draftMachine, draftOptions, effort, enCache, engineCanDispatch, escritorio, espacioPara, esperando, grupos, hablandoCon, handoff, handoffAt, injecting, lanzados, machineOf, machines, marcarQuieta, marcarViva, model, modo, nacenConComando, pendingStarts, pestanas, ponerTerminal, project, projectCatalog, quitarDeLaCola, refreshFolder, refreshSessions, retenidaPorElMotor, retirarNaciendo, sesiones, sessionId, setArrancando, setHablandoCon, setInjecting, setPermissionError, setPorContestar, setSessionId, setTerminales, settleTurn, settlingTurns, soltarTerminal, stopping, taskQueues, terminales, threads, vivas, workspaceActivo, workspaceContext, get adoptarNacida() { return adoptarNacida; }, get configDeLaSesion() { return configDeLaSesion; }, get detenerYEnviar() { return detenerYEnviar; }, get enviar() { return enviar; }, get lifecycleRevision() { return lifecycleRevision; }, set lifecycleRevision(v) { lifecycleRevision = v; }, get olvidarPestana() { return olvidarPestana; }, get pintarNaciendo() { return pintarNaciendo; }, get reanudarCola() { return reanudarCola; } });

  const { abrirBorradorDeAgente, requestedProfile, setRequestedProfile, proyectosEnAjustes, cerrarAjustes, openAgentProfile, enLaMaquinaDelGrupo, nuevaSesion, irAlBlanco, closeActiveTab, cerrarPestana, cerrarPestanas, cierreSinGuardar, setCierreSinGuardar, } = createNewTask({ abrirProyecto: (id) => abrirProyecto(id), alta, arrancando, borrarProyecto: (id) => borrarProyecto(id), carpetaDelEscritorio, cerrarBorrador, cerrarPestanasYa, composer, drafts, enBorrador, hablandoCon, hablarConEncargado: (enProyecto, name) => hablarConEncargado(enProyecto, name), multipleSpaces, ocultarDelSelector, ocultosAqui, paneles, pedirElCampo, pestanaActiva, pestanas, project, proyectosDelRiel: () => proyectosDelRiel(), proyectoDeNuevaTarea, removeFromActiveSpace: (folder) => removeFromActiveSpace(folder), renombrarProyecto: (id, name) => renombrarProyecto(id, name), restoreDraftConfiguration: () => restoreDraftConfiguration(), setAnadiendoCarpeta, setAntesDelBorrador, setCuentasTocadas, setFolder, setHablandoCon, setMaterialPedido, setProject, setProyectoAbierto, setRunOn, setSessionId, setSettings, settings, soltarCola: () => soltarCola(), soltarHilo, tareasActivas, workspaceActivo, });

  const { elegirCarpetaDelWorkspace, releerProyectos, renombrarProyecto, abrirProyecto, adjuntarAlProyecto, quitarDelProyecto, carpetaEditable, borrarProyecto, elegirProyecto, soltarCola, abrirSesion, loadThread, loadWindowThreads, hablarConEncargado } = createContextSource({ abrirBorradorDeAgente, adjuntas, aplicar, cambiarEscritorio, cola, composer, deLaTarea, drafts, engineCanDispatch, escritorio, excludedSourceIds, filaDe, hilos, leerTarea, loadResult, nuevaSesion, open, paneles, pestanas, project, projectCatalog, proyectoAbierto, refreshFolder, refreshSessions, releerCola, reloadSpaces, sessionId, setError, setFolder, setHablandoCon, setMentionSources, setProject, setProjectReadError, setProyectoAbierto, setSessionId, setVentana, sourceIds, spaces, taskQueues, threads, workspaceActivo, workspaceContext, get restoreDraftConfiguration() { return restoreDraftConfiguration; }, get restoreSessionConfiguration() { return restoreSessionConfiguration; } });

  const { resolverCierre, setTraspasoPendiente, traspasoPendiente } = createDraftSend({ activarPestana, cerrarPestanasYa, cierreSinGuardar, claveAbierta, pestanas, sessionId, setCierreSinGuardar });


  /** Recoge la ventana activa en la de al lado. Es el atajo de deshacer. */
  function juntarLaActiva() {
    if (!paneles.join()) return;
    const id = paneles.activeTabAt(paneles.activeSite());
    const p = id ? pestanas.open().find((x) => x.id === id) : null;
    if (p) void activarPestana(p);
  }

  const { abrirEnlace, abrirPorRel, abrirRuta, abrirSitio, adjuntarFuente, archivoBorrado, archivoMovido, arrastrando, arrastrarPestana, arrastrarTarea, botonDeNuevaPestana, cambiarRama, cursor, deleteTarget, deleteTask, deletedTaskMembers, dirtyTaskFiles, donde, dropSide, editorDeletionLocked, etaparSesion, exportarChat, fijarSesion, forkDesde, marcaDe, materialTarget, moverSesion, quitarFuente, reatarVistaPrevia, renombrarSesion, setDeleteTarget, setDeletingEditors, tabDrag, taskMaterialOptions, tituloDePestana } = createTabDrag({ abrirBorradorDeAgente, abrirSesion, activarPestana, activeSpace, archivosDeTarea, cerrarPestana, claveAbierta, contextConfirmed, deLaTarea, draftBases, draftOptions, drafts, escritorio, filaDe, folder, irAlBlanco, nuevaSesion, opcionesDeLaTarea, paneles, pestanas, pestanasEnPantalla, project, projectCatalog, projectList, proyectoAbierto, readRevision, refreshSessions, sesiones, sessionId, setError, setProject, setProyectoAbierto, setRetoques, setTaskSources, setTaskSourcesError, soltarHilo, sources, threads, workspaceActivo, workspaceContext, get maquinaDeLaVentana() { return maquinaDeLaVentana; }, get olvidarPestana() { return olvidarPestana; } });

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

  const { imagenDeVentana, veloDeVentana } = createWindowBackground({ fondoDelAgente, machineOf, workspaceActivo });

  const { CeldasDeContenido } = createCeldasDeContenido({ PanelDeChat, abrirSesion, adjuntarAlProyecto, agent, agents, anchoDeArchivos, anchoDelArbol, archivosDeTarea, carpetaDelProyecto, carpetaEditable, celdaDe, cerrarPestanasYa, claveAbierta, compacta, consumo, deleteTask, draftBases, editorDeletionLocked, estiloDeLaCelda, etaparSesion, fijarSesion, hablarConEncargado, idsDeContenido, llaveDeBorrador, llevaTiraInterior, mandarVentana, materialPedido, modelosParaAgentes, moverSesion, nuevaSesion, paneles, permissions, pestanas, project, projectList, proyectoDeLaVista, quitarDelProyecto, renombrarSesion, sesionesConEstado, sessionId, setMaterialPedido, setSettings, sitiosEnBlanco, sources, tapadoPorElProyecto, vivas, workspaceActivo });

  const { CeldasDeTareas } = createCeldasDeTareas({ PanelDeChat, agent, anchoDeArchivos, anchoDelArbol, archivoBorrado, archivoMovido, archivosDeTarea, arrastrando, celdaDe, compacta, consumo, cursor, delegatedPanels, donde, dropSide, editorDeletionLocked, estiloDeLaCelda, exportarChat, filaDe, llevaTiraInterior, mandarVentana, montadas, paneles, proyectoDePestana, searchSurfaces, setSettings, tapadoPorElProyecto, tareasEnVentanas, tituloDePestana, workspaceActivo });

  const { Conversacion } = createConversacion({ CeldasDeContenido, CeldasDeTareas, activarPestana, agent, alta, altosEnPantalla, anchosEnPantalla, archivosDeTarea, arrastrarPestana, botonDeArchivos, botonDeNuevaPestana, botonDelArbol, carpetaDelProyecto, cerrarBorrador, cerrarPestana, cerrarPestanas, consumo, delegatedPanels, enBorrador, estiloDeLaCelda, filaDe, filasEnPantalla, llaveDeBorrador, llevaTiraInterior, mandarVentana, marcaDe, muestra, nombreDeSeparar, paginaDeAgente, paneles, partirVentana, permissions, pestanaDelanteEn, pestanas, pestanasDe, preguntadas, project, puedeSepararseDe, reabrirPestana, reservaDerechaDeTiras, reservaIzquierdaDeTiras, setSearchSurfaces, settings, tapadoPorElProyecto, threadSearchTargets, ventanas, vivas, vueltaDelBorrador, workspaceActivo, get cabeceraDeConversacion() { return cabeceraDeConversacion; }, set cabeceraDeConversacion(v) { cabeceraDeConversacion = v; }, get controlesDerechos() { return controlesDerechos; }, set controlesDerechos(v) { controlesDerechos = v; }, get controlesIzquierdos() { return controlesIzquierdos; }, set controlesIzquierdos(v) { controlesIzquierdos = v; } });

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
