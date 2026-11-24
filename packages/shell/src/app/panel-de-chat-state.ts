import { t } from "../../../../apps/desktop/src/lib/i18n";
import { type HandlerList } from "../../../ui/src/lib/model";
import { type AgentProfile, type HandlerStatus } from "../../../ui/src/lib/model.ts";
import { type SenderTask } from "../../../../apps/desktop/src/lib/recipients";
import { esProvisional } from "../../../../apps/desktop/src/lib/taskDraft";
import { type TaskFilesPanel, type TaskFilesSide, type TaskSideMode } from "../../../ui/src/lib/taskFiles.ts";
import { invoke } from "../../../engine-client/src/client.ts";
import { conservar } from "../../../session/src/sessionRefresh";
import { type Encolado } from "../../../ui/src/lib/queue.ts";
import { type AlmacenDePreguntas } from "../../../features/chat/src/components/Questions.tsx";
import { MACHINE_UNANNOUNCED, agentSwitchBlocked } from "../../../features/chat/src/model/handover";
import { type HandoverState } from "../../../features/chat/src/model/handover.ts";
import { type Lectura } from "../../../features/chat/src/model/threadWindow.ts";
import { mensajesDelHilo } from "../../../features/chat/src/model/transcript";
import { type Msg } from "../../../features/chat/src/screens/Chat";
import { type PermissionRequest, type VistaDeLaConversacion } from "../../../features/chat/src/screens/Chat.tsx";
import { delegatedDescendants, type DelegatedListProps, type DelegatedPanelModel } from "../../../features/projects/src/screens/DelegatedTasks";
import { type createCloneFolder, type createDeskStrip, type createNewTask, type createSessionMutations, type createWorkspaceSession } from "../../../features/projects/src";
import { type createTaskWork } from "../../../features/projects/src/screens/TaskHistory";
import { type HandlerTarget } from "../../../features/projects/src/screens/HandlerPolicy";
import { type Preview } from "../../../ui/src/lib/preview.ts";
import { type SessionRow } from "../../../ui/src/lib/session-row.ts";
import { launcherOf, taskDescendants } from "../../../ui/src/lib/tasks/index.ts";
import { createEffect, createMemo, createResource, createSignal, onCleanup, type Accessor, type Setter } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type PanelDeChatStateDeps = { DEFAULT_PROFILE: AgentProfile; abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; almacenDePreguntas: (session: () => string | null) => AlmacenDePreguntas; archivosDeTarea: { panel: (task: string) => TaskFilesPanel; setOpen: (task: string, open: boolean) => void; present: (task: string, mode: TaskSideMode) => void; toggle: (task: string) => void; setExpanded: (task: string, expanded: boolean) => void; setTree: (task: string, tree: boolean) => void; setSide: (task: string, side: TaskFilesSide) => void; open: (task: string, file: { tree: string; path: string; changes: boolean; changed?: boolean; pinned?: boolean; }) => void; pin: (task: string, id: string) => void; activate: (task: string, id: string) => void; setDirty: (task: string, id: string, dirty: boolean) => void; close: (task: string, ids: string[]) => string[]; renamed: (task: string, tree: string, from: string, to: string) => void; removed: (task: string, tree: string, path: string) => void; dirtyOf: (task: string) => string[]; forget: (task: string) => void; }; attention: ReturnType<typeof createWorkspaceSession>["attention"]; carpetaDelProyecto: () => string | null; cola: Accessor<Encolado[]>; colaDe: Accessor<string | null>; composerProjects: ReturnType<typeof createWorkspaceSession>["composerProjects"]; createTaskWork: typeof createTaskWork; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; deleteTask: (project: string, id: string, members?: number) => void; esChatDeAgente: (s: { chat_de_agente?: boolean; }) => boolean; esperando: ReturnType<typeof createCloneFolder>["esperando"]; etaparSesion: ReturnType<typeof createSessionMutations>["etaparSesion"]; fijarSesion: (proyecto: string, id: string, pinned: boolean) => Promise<void>; filaDe: (id: string) => SessionRow | undefined; fondoDelAgente: ReturnType<typeof createWorkspaceSession>["fondoDelAgente"]; hablandoCon: ReturnType<typeof createWorkspaceSession>["hablandoCon"]; hablarConEncargado: (enProyecto: string, name: string) => void; hilos: ReturnType<typeof createDeskStrip>["hilos"]; lecturas: Map<string, Lectura>; llaveDeBorrador: (proyecto: string | undefined) => string; machineOf: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; moverSesion: (de: string, id: string, a: string) => Promise<void>; opcionesDeLaTarea: (id: string | null | undefined, workspace: string | null | undefined) => { headers: { [k: string]: string; }; }; origenes: ReturnType<typeof createDeskStrip>["origenes"]; permissions: Accessor<PermissionRequest[]>; preguntadas: ReturnType<typeof createCloneFolder>["preguntadas"]; project: ReturnType<typeof createWorkspaceSession>["project"]; projectList: ReturnType<typeof createWorkspaceSession>["projectList"]; renombrarSesion: (proyecto: string, id: string, title: string) => Promise<boolean>; requestedProfile: ReturnType<typeof createNewTask>["requestedProfile"]; senderTaskId: (machine: string, task: string) => string; sesiones: ReturnType<typeof createWorkspaceSession>["sesiones"]; sesionesConEstado: () => { [k: string]: SessionRow[]; }; sessionId: ReturnType<typeof createWorkspaceSession>["sessionId"]; setDelegatedPanels: Setter<Map<string, () => DelegatedPanelModel>>; setFondoDelAgente: ReturnType<typeof createWorkspaceSession>["setFondoDelAgente"]; setRequestedProfile: ReturnType<typeof createNewTask>["setRequestedProfile"]; situacionDeTraspaso: (id: string) => { session: string | null; running: boolean; announced: boolean | null; state: HandoverState; }; tareaDelRiel: (id: string) => SenderTask | null; vistaDe: (session: string) => VistaDeLaConversacion; vivas: Accessor<string[]>; watchHandlerStatus: (selectedHandler: () => { project: string; name: string; } | null) => () => HandlerStatus; watchProfiles: (project: string) => () => Record<string, AgentProfile>; workspaceActivo: ReturnType<typeof createWorkspaceSession>["workspaceActivo"] };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 191–466, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createPanelDeChatState(deps: PanelDeChatStateDeps) {
  const { DEFAULT_PROFILE, abrirSesion, almacenDePreguntas, archivosDeTarea, attention, carpetaDelProyecto, cola, colaDe, composerProjects, createTaskWork, deLaTarea, deleteTask, esChatDeAgente, esperando, etaparSesion, fijarSesion, filaDe, fondoDelAgente, hablandoCon, hablarConEncargado, hilos, lecturas, llaveDeBorrador, machineOf, moverSesion, opcionesDeLaTarea, origenes, permissions, preguntadas, project, projectList, renombrarSesion, requestedProfile, senderTaskId, sesiones, sesionesConEstado, sessionId, setDelegatedPanels, setFondoDelAgente, setRequestedProfile, situacionDeTraspaso, tareaDelRiel, vistaDe, vivas, watchHandlerStatus, watchProfiles, workspaceActivo } = deps;
  const estadoDePanelDeChat = (pp: {
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
    return { visualWorkspace, esperandoAqui, proyectoDeLaCelda, clavePanel, estadoDelTrabajo, refreshWork, delegation, delegationData, delegatedRows, delegatedList, coordinatingTask, recuperable, origenArchivada, esRepositorio, encargadoDeLaCelda, bloqueoDeTraspaso, motivoDeTraspaso, identidadVisualDeLaCelda, estadoDelEncargado, profiles, cellProfile, chatBackground, declared, viewingProfile, setViewingProfile, handlerPolicy, lecturaDeLaCelda, preguntasDeLaCelda, vistaDeLaCelda, mensajes, historialAnteriorEnReposo, soloPorSerAnterior, seguirConElAgente };
  };
  return { estadoDePanelDeChat };
}
