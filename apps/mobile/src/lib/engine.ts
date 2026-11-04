/**
 * Lo que el teléfono hace con el motor de una máquina, en comandos de
 * `APP_COMMANDS`. Las mismas llamadas que la ventana (`apps/desktop/src`),
 * por el relay o por el bridge. Sin React Native: se prueba en Node.
 */
import type {
  HistoryChunk,
  HistoryRef,
  AccountLimits,
  AccountList,
  LoginEvent,
  AgentList,
  AgentStatusRow,
  Answer,
  AttentionState,
  BaseBranches,
  ChatEvent,
  EngineEvent,
  FilePreview,
  MentionList,
  OpenedSession,
  PendingRequests,
  PermissionModeOption,
  Project,
  ProjectCloneEvent,
  ProviderInfo,
  ProviderModels,
  Question,
  SessionRow,
  ShellRun,
  SlashMenu,
  Space,
  TaskBlockers,
  TaskTree,
  TreeContent,
  TreeFiles,
  Startup,
  Turn,
  Workspace,
  WorkspaceAttention,
  LiveTurn,
} from "@terminus/protocol";
import { type HistoryRead } from "@terminus/chat/history";
import { readDetailText } from "@terminus/chat/historyDetail";
import { readVisualHtml, type VisualPart, type VisualWhole, VISUAL_FILE, VISUAL_TREE } from "@terminus/chat/visual";
import { arrangeSpaces, spaceOrder, type AccountWorkspace, groupWorkspaces, linkedAttention, onlyLinked, registryProjects, withRegistry } from "@terminus/computers";
import {
  ATTACHMENT_MIMES,
  COMMAND_UNSUPPORTED,
  IMAGE_MIMES,
  MAX_UPLOAD_BYTES,
  type ChatBackgroundView,
  chatBackgroundImageUrl,
  chatBackgroundView,
  isImageMime,
  isSingleAttention,
  isUnknownCommand,
} from "@terminus/protocol";
import type { TaskActivity } from "@terminus/design";
import { type FlatRow, flattenTasks, launcherOf, REMOTE_CHILD_FEATURE, type RemoteScope, remoteLauncherOf } from "@terminus/tasks";
import { AUTO_MODE } from "./composer.ts";
import { type Host, HostError } from "./hosts.ts";

/** Una tarea de la lista, con la máquina y la carpeta de donde viene. */
export type Task = SessionRow & {
  /** `computer_id` o `bridge`. */
  host: string;
  /** Hija remota: la `taskKey` de su coordinador en otra máquina (`mergeSnapshots`). */
  remote_launcher?: string | null;
  /** La atención de la familia, si la entrada la carga (`withFamilyActivity`). */
  delegated_activity?: TaskActivity;
  workspace: string;
  /** Id de la carpeta en su máquina; `""` es sin carpeta. */
  folder: string;
  /** `host/folder`: cada motor tiene sus ids, así que entre máquinas la carpeta se nombra con la suya. */
  folderKey: string;
  /** La máquina, solo cuando la persona tiene más de una (para la tarjeta). */
  machine?: string | null;
  machine_on?: boolean;
};

type AgentAppearance = { body?: string | null; avatar?: string | null };
type AgentProfiles = Record<string, AgentAppearance>;

/** Un agente con nombre, juntando sus carpetas y máquinas. */
export type Agent = {
  name: string;
  description: string | null;
  body?: string | null;
  avatar?: string | null;
  status: "working" | "awake" | "asleep";
  liveTasks: number;
  minutesSinceLastTurn: number | null;
  /** `host/folder` donde está. */
  places: ({ host: string; folder: string } & AgentAppearance)[];
};

/** Lo que una máquina sabe de un workspace. */
export type Folder = Project & { key: string; host: string; cloud?: string | null };

export type HostSnapshot = {
  host: string;
  folders: Folder[];
  spaces: Space[];
  tasks: Task[];
  /** Las que la lista esconde bajo su lanzador: salen en el chat de este («N tareas delegadas»). */
  delegated: Task[];
  agents: Agent[];
  /** Tareas con un turno en marcha. */
  live: string[];
  /** Codex, Claude…: para nombrar el proveedor de una tarea y elegir con cuál empieza otra. */
  providers: ProviderInfo[];
  /** Si salió de la copia del relay (máquina apagada): cuándo. */
  cachedAt: number | null;
  /** Lo que el motor de la máquina anuncia (`status.service_features`). */
  features?: readonly string[];
};

const off = (error: unknown) => error instanceof HostError && (error.code === "machine_off" || error.code === "machine_asleep");

/** Una lectura que con la máquina apagada y sin copia es `fallback`, no un error. */
async function read<T>(host: Host, command: Parameters<Host["call"]>[0], workspace: string | null, args: object, fallback: T, at: { cachedAt: number | null }): Promise<T> {
  try {
    const answer = await host.call<T>(command, workspace, args);
    if (answer.cachedAt !== null) at.cachedAt = Math.max(at.cachedAt ?? 0, answer.cachedAt);
    return answer.value ?? fallback;
  } catch (error) {
    if (off(error)) return fallback;
    throw error;
  }
}

/** Los workspaces de una máquina; apagada y sin copia, `null`: no dijo cuáles tiene. */
export async function workspacesOf(host: Host): Promise<{ list: Workspace[] | null; cachedAt: number | null }> {
  const at = { cachedAt: null as number | null };
  const startup = await read<Startup | null>(host, "list_workspaces", null, {}, null, at);
  return { list: startup ? onlyLinked(startup.workspaces ?? [], host.linked) : null, cachedAt: at.cachedAt };
}

/**
 * Un workspace, quizá en varias máquinas: el mismo si su id es igual
 * (`groupWorkspaces`, la regla de la web). `members`, su id en cada máquina,
 * que es el mismo.
 */
export type WorkspaceEntry = {
  id: string;
  name: string;
  members: Map<string, string>;
  hosts: string[];
  /** El modo de permisos que eligió el workspace para las tareas nuevas; `null`, ninguno. */
  defaultPermissionMode: string | null;
};

/**
 * Los workspaces de la persona: lo que listan sus máquinas más el registro de
 * la cuenta (`GET /v1/workspaces`), que trae los de máquinas dormidas. Una
 * máquina que contestó manda sobre el registro; sin registro, lo de antes.
 */
export function workspaceEntries(hosts: readonly { id: string }[], perHost: Record<string, Workspace[] | null>, registry: readonly AccountWorkspace[] | null): WorkspaceEntry[] {
  const order = hosts.map((h) => h.id);
  const answered = new Set(order.filter((id) => perHost[id] != null));
  const groups = groupWorkspaces(hosts.map((h) => ({ machine: h.id, rows: perHost[h.id] ?? [] })));
  return withRegistry(groups, registry, order, answered, (w): Workspace => ({ id: w.id, name: w.name })).map((g) => ({
    id: g.key,
    name: g.row.name ?? g.key,
    members: g.members,
    hosts: [...g.members.keys()],
    // La máquina que contestó manda; si no lo dice, el ajuste del registro de la cuenta.
    defaultPermissionMode: g.row.default_permission_mode || registry?.find((w) => w.id === g.key)?.settings?.default_permission_mode || null,
  }));
}

/**
 * Las carpetas del registro que ninguna máquina listó (sus máquinas duermen y
 * el relay no tiene copia): en la máquina donde nació, si es del workspace, o
 * en la primera que lo tiene. Una tarea nueva ahí enciende esa máquina.
 */
export function withAccountFolders<S extends { folders: Folder[]; spaces: Space[] }>(
  snapshot: S,
  registry: readonly AccountWorkspace[] | null,
  workspace: string,
  members: readonly string[],
): S {
  const known = new Set(snapshot.folders.map((f) => f.id));
  const extra = registryProjects(registry, workspace, known).flatMap((p): Folder[] => {
    const host = p.home_computer_id && members.includes(p.home_computer_id) ? p.home_computer_id : members[0];
    return host ? [{ id: p.id, name: p.name, working_directory: null, key: `${host}/${p.id}`, host }] : [];
  });
  const account = registry?.find(row => row.id === workspace);
  const spaces = account ? arrangeSpaces(snapshot.spaces, spaceOrder(account)) : snapshot.spaces;
  if (!extra.length) return spaces.every((space, i) => space === snapshot.spaces[i]) ? snapshot : { ...snapshot, spaces };
  const keys = extra.map((f) => f.key);
  return { ...snapshot, folders: [...snapshot.folders, ...extra], spaces: spaces.map((s) => ({ ...s, folders: [...s.folders, ...keys] })) };
}

/** El fondo de los chats con `remote`: la imagen en la cuenta de Danil, que se pide con la sesión de la persona. */
export type ChatBackdropView = ChatBackgroundView & { remote: string | null };

const sameOrigin = (url: string, endpoint: string) => {
  try {
    return new URL(url).origin === new URL(endpoint).origin;
  } catch {
    return false;
  }
};

/**
 * Sin patrón elegido, la imagen de la cuenta (`background_url` del registro o
 * `image_url` del motor) manda sobre la copia en línea. Solo del plano de
 * control: la sesión no va a otro origen.
 */
export function withAccountBackground(answer: unknown, accountUrl: string | null, endpoint: string): ChatBackdropView {
  const view = chatBackgroundView(answer);
  if (view.preset) return { ...view, remote: null };
  const remote = [accountUrl, chatBackgroundImageUrl(answer)].find((u): u is string => !!u && sameOrigin(u, endpoint)) ?? null;
  return { ...view, remote };
}

/** El fondo de los chats del workspace en esa máquina y en la cuenta; sin ninguno, ninguno. */
export async function chatBackgroundOf(host: Host, workspace: string, accountUrl: string | null = null, endpoint = ""): Promise<ChatBackdropView> {
  const at = { cachedAt: null as number | null };
  const answer = await read<unknown>(host, "chat_background", workspace, {}, null, at).catch(() => null);
  return withAccountBackground(answer, accountUrl, endpoint);
}

/**
 * Las tareas vivas de una máquina con la regla del riel del escritorio
 * (`flattenTasks`): las que cuelgan de su lanzador no van en `tasks` sino en
 * `delegated`, para el chat de este.
 */
export function tasksOf(byProject: Record<string, (SessionRow & FlatRow)[]>, host: string, workspace: string): { tasks: Task[]; delegated: Task[] } {
  const asTask = (project: string, row: SessionRow): Task => ({ ...row, host, workspace, folder: project, folderKey: `${host}/${project}` });
  const tasks = flattenTasks(byProject).map(({ project, row }) => asTask(project, row));
  const shown = new Set(tasks.map((task) => task.id));
  const delegated = Object.entries(byProject).flatMap(([project, rows]) =>
    rows.filter((row) => !row.archived && !shown.has(row.id) && launcherOf(row)).map((row) => asTask(project, row)));
  return { tasks, delegated };
}

/**
 * Carpetas, spaces, tareas abiertas y agentes de un workspace en una máquina.
 * `list_live_sessions` con `project: ""` solo trae las tareas sin carpeta: se
 * pide una vez por carpeta y otra para `""`, como la ventana.
 */
export async function snapshotOf(host: Host, workspace: string): Promise<HostSnapshot> {
  const at = { cachedAt: null as number | null };
  const [folders, spaces, live, providers] = await Promise.all([
    read<Project[]>(host, "list_projects", workspace, {}, [], at),
    read<Space[]>(host, "list_spaces", workspace, {}, [], at).catch(() => []),
    read<string[]>(host, "list_active_turns", workspace, { workspace }, [], at).catch(() => []),
    read<ProviderInfo[]>(host, "list_providers", workspace, {}, [], at).catch(() => []),
  ]);
  const projects = ["", ...folders.map((f) => f.id)];
  const images = new Map<string, Promise<string | null>>();
  const perFolder = await Promise.all(
    projects.map(async (project) => {
      const [rows, agents, status, profiles] = await Promise.all([
        read<SessionRow[]>(host, "list_live_sessions", workspace, { project, open: [] }, [], at),
        project ? read<AgentList>(host, "list_agents", workspace, { project }, { agents: [] }, at).catch(() => ({ agents: [] })) : { agents: [] },
        project ? read<AgentStatusRow[]>(host, "list_agent_status", workspace, { project }, [], at).catch(() => []) : [],
        project ? read<AgentProfiles>(host, "list_agent_profiles", workspace, { project }, {}, at).catch((): AgentProfiles => ({})) : {} as AgentProfiles,
      ]);
      const faces = await Promise.all((agents.agents ?? []).map(async (agent) => {
        const profile = profiles[agent.name];
        const path = profile?.avatar;
        if (path && !images.has(path)) {
          images.set(path, read<FilePreview | null>(host, "preview_file", workspace, { path, rel: path }, null, at).then((value) => value?.data_url ?? null).catch(() => null));
        }
        return { ...agent, body: profile?.body ?? null, avatar: path ? await images.get(path) : null };
      }));
      return { project, rows, agents: faces, status };
    }),
  );
  const byProject: Record<string, (SessionRow & FlatRow)[]> = {};
  for (const { project, rows } of perFolder) byProject[project] = rows;
  const { tasks, delegated } = tasksOf(byProject, host.id, workspace);

  const agents = new Map<string, Agent>();
  for (const { project, agents: list, status } of perFolder) {
    for (const a of list) {
      const s = status.find((x) => x.name === a.name);
      const known = agents.get(a.name);
      if (known) {
        known.places.push({ host: host.id, folder: project, body: a.body, avatar: a.avatar });
        known.liveTasks += s?.live_tasks ?? 0;
        if (s && rank(s.status) < rank(known.status)) known.status = s.status;
      } else {
        agents.set(a.name, {
          name: a.name,
          description: a.description ?? null,
          body: a.body,
          avatar: a.avatar,
          status: s?.status ?? "asleep",
          liveTasks: s?.live_tasks ?? 0,
          minutesSinceLastTurn: s?.minutes_since_last_turn ?? null,
          places: [{ host: host.id, folder: project, body: a.body, avatar: a.avatar }],
        });
      }
    }
  }
  return {
    host: host.id,
    folders: folders.map((f) => ({ ...f, key: `${host.id}/${f.id}`, host: host.id })),
    spaces,
    tasks,
    delegated,
    agents: [...agents.values()],
    live,
    providers: Array.isArray(providers) ? providers : [],
    cachedAt: at.cachedAt,
    features: host.features?.() ?? [],
  };
}

const rank = (s: Agent["status"]) => (s === "working" ? 0 : s === "awake" ? 1 : 2);

/**
 * Junta lo que cada máquina sabe de un mismo workspace, como el panel de la
 * web: las carpetas y tareas de cada una, marcadas con su máquina. Los spaces
 * son los de todas las máquinas (una VM dormida no tiene por qué tenerlos), uno
 * por id o, si los ids difieren, por nombre; una carpeta lleva el mismo id en
 * cada máquina, así que el space la nombra en todas.
 */
export function mergeSnapshots(parts: HostSnapshot[], tagMachines: (host: string) => { machine: string; on: boolean } | null) {
  const spaces: MergedSpace[] = [];
  for (const part of parts) {
    for (const s of part.spaces) {
      const folders = s.folders.flatMap((f) => parts.map((p) => `${p.host}/${f}`));
      const same = spaces.find((m) => Object.values(m.on).includes(s.id) || (!(part.host in m.on) && (m.name ?? "") === (s.name ?? "")));
      if (!same) spaces.push({ ...s, folders, on: { [part.host]: s.id } });
      else {
        same.on[part.host] ??= s.id;
        same.folders = [...new Set([...same.folders, ...folders])];
      }
    }
  }
  const agents = new Map<string, Agent>();
  const tasks: Task[] = [];
  const delegated: Task[] = [];
  const live = new Set<string>();
  let cached: number | null = null;
  for (const part of parts) {
    for (const a of part.agents) {
      const known = agents.get(a.name);
      if (known) {
        known.places.push(...a.places);
        known.liveTasks += a.liveTasks;
        if (rank(a.status) < rank(known.status)) known.status = a.status;
      } else agents.set(a.name, { ...a, places: [...a.places] });
    }
    const tag = tagMachines(part.host);
    for (const task of part.tasks) tasks.push(tag ? { ...task, machine: tag.machine, machine_on: tag.on } : task);
    for (const task of part.delegated) delegated.push(tag ? { ...task, machine: tag.machine, machine_on: tag.on } : task);
    for (const id of part.live) live.add(`${part.host}/${id}`);
    if (part.cachedAt !== null) cached = Math.max(cached ?? 0, part.cachedAt);
  }
  // Una hija remota (otra máquina la mandó crear) va con su coordinador si está a la vista, como en el riel.
  const remote: RemoteScope = {
    announces: (machine) => !!parts.find((p) => p.host === machine)?.features?.includes(REMOTE_CHILD_FEATURE),
    idOf: (machine, task) => taskKey({ host: machine, id: task }),
  };
  const keys = new Set(tasks.map(taskKey));
  for (const task of tasks.splice(0)) {
    const launcher = remoteLauncherOf({ ...task, machine: task.host }, remote);
    (launcher && !task.pinned && keys.has(launcher) ? delegated : tasks).push(launcher ? { ...task, remote_launcher: launcher } : task);
  }
  tasks.sort((a, b) => b.created_at - a.created_at);
  const providers = Object.fromEntries(parts.map((p) => [p.host, p.providers]));
  return { folders: parts.flatMap((p) => p.folders), spaces, agents: [...agents.values()], tasks, delegated, live, providers, cachedAt: cached };
}

/**
 * Un space del workspace en todas sus máquinas: `id` es el de la primera que lo
 * tiene y `on`, su id en cada una (el que se le manda a esa máquina).
 */
export type MergedSpace = Space & { on: Record<string, string> };

/** Si la tarea va en el space, como `enEscritorio` del escritorio: una sin space resuelto va en todos. */
export const taskInSpace = (task: { space?: string | null }, space: MergedSpace | null) => !space || !task.space || Object.values(space.on).includes(task.space);

/** La clave de una tarea entre máquinas: el mismo id puede repetirse en dos. */
export const taskKey = (task: { host: string; id: string }) => `${task.host}/${task.id}`;

// --- Una tarea ---------------------------------------------------------------

export type Permission = { request_id: string; tool: string; target: string | null };
export type PendingQuestion = { request_id: string | null; turn: string; questions: Question[] };

export type TaskView = {
  session: OpenedSession;
  permissions: Permission[];
  questions: PendingQuestion[];
  running: boolean;
  cachedAt: number | null;
  /** Desde cuándo corre su turno, en ms de la máquina; `null` si no se pudo saber: entonces no se muestra tiempo. */
  liveSince: number | null;
};

/** Con estos campos exactos, `null` incluido: la copia del relay se busca por los argumentos y así la comparte con la web. */
const historyRequest = (before: number | null) => ({ version: 1, before, revision: null });

/** La cola guardada, para decir por qué se detuvo. Es una lectura: no enciende la máquina. */
export async function recentTurns(host: Host, workspace: string, folder: string, id: string): Promise<Turn[]> {
  const session = await read<OpenedSession | null>(host, "load_session", workspace, { project: folder, id, history_request: historyRequest(null) }, null, { cachedAt: null });
  return session?.turns ?? [];
}

/** La cola de la tarea. Una máquina apagada sin esa copia aún puede tener la entera, solo para quien no tiene nada que perder. */
async function tailOf(host: Host, workspace: string, folder: string, id: string, holding: boolean, at: { cachedAt: number | null }) {
  const session = await read<OpenedSession | null>(host, "load_session", workspace, { project: folder, id, history_request: historyRequest(null) }, null, at);
  if (session || holding || host.power() === "on") return session;
  return read<OpenedSession | null>(host, "load_session", workspace, { project: folder, id }, null, at);
}

/** Una página anterior. Sin ella en una máquina apagada no es el principio de la conversación: es que no se puede leer ahora. */
export async function loadTurns(host: Host, workspace: string, folder: string, id: string, before: number): Promise<HistoryRead<Turn>> {
  const session = await read<OpenedSession | null>(host, "load_session", workspace, { project: folder, id, history_request: historyRequest(before) }, null, { cachedAt: null });
  if (!session) throw new HostError("machine_off", host.label);
  return { turns: session.turns ?? [], history: session.history };
}

/**
 * El contenido entero de un campo que no cupo en la página; `null` si no se puede traer de una
 * vez. En fila: el relay acota las lecturas de historial simultáneas.
 */
export function loadDetail(host: Host, workspace: string, folder: string, id: string, ref: HistoryRef, turnId: string | undefined): Promise<string | null> {
  const part = async (current: HistoryRef, offset: number) =>
    (await host.call<HistoryChunk>("load_session", workspace, { project: folder, id, history_request: { ...current, kind: "detail", offset } })).value;
  return readDetailText({ part, turns: (before) => loadTurns(host, workspace, folder, id, before) }, ref, turnId);
}

export async function loadTask(host: Host, workspace: string, folder: string, id: string, holding = false): Promise<TaskView> {
  const at = { cachedAt: null as number | null };
  const [session, pending, live, liveTurns] = await Promise.all([
    tailOf(host, workspace, folder, id, holding, at),
    read<PendingRequests | null>(host, "pending_requests", workspace, { session: id }, null, at).catch((): PendingRequests | null => null),
    read<string[]>(host, "list_active_turns", workspace, { workspace }, [], at).catch((): string[] => []),
    read<LiveTurn[]>(host, "list_live_turns", workspace, {}, [], at).catch((): LiveTurn[] => []),
  ]);
  if (!session) throw new HostError("machine_off", host.label);
  const turns = session.turns ?? [];
  // Las preguntas por archivo sobreviven al proceso; las respuestas guardadas
  // son la fuente de verdad, igual que en escritorio.
  const answered = new Set(turns.flatMap((t) => t.answers ?? []).map((a) => JSON.stringify([a.turn, a.question])));
  const questions: PendingQuestion[] = turns.flatMap((t) => {
    if (!t.id) return [];
    const remaining = (t.questions ?? []).filter((q) => !answered.has(JSON.stringify([t.id, q.id])));
    return remaining.length ? [{
      turn: t.id,
      request_id: pending?.questions.find((q) => q.turn === t.id)?.request_id ?? null,
      questions: remaining,
    }] : [];
  });
  return { session, permissions: pending?.permissions ?? [], questions, running: live.includes(id) && host.power() === "on", cachedAt: at.cachedAt, liveSince: liveTurns.find((turn) => turn.session === id)?.started_at ?? null };
}

/**
 * Una lectura que se pide desde muchos lados (volver al frente, el foco, un evento, la
 * máquina que cambia) sin pisarse: con una en marcha, las que se piden mientras tanto se
 * juntan (`merge`) en una sola que corre al terminar, y todas esperan a esa. Así nunca
 * hay dos a la vez y la última petición siempre ve una lectura que empezó después de ella.
 */
export function coalesced<T>(run: (arg: T) => Promise<void>, merge: (a: T, b: T) => T): (arg: T) => Promise<void> {
  let running: Promise<void> | null = null;
  let queued: { arg: T } | null = null;
  return (arg) => {
    if (running) {
      queued = { arg: queued ? merge(queued.arg, arg) : arg };
      return running;
    }
    running = (async () => {
      try {
        let current = arg;
        for (;;) {
          await run(current);
          if (!queued) return;
          current = queued.arg;
          queued = null;
        }
      } finally {
        running = null;
        queued = null;
      }
    })();
    return running;
  };
}

/** Lo que el cuadro de escribir elige para un mensaje, como la ventana. */
export type Draft = {
  prompt: string;
  provider: string;
  model: string | null;
  /** `null` deja decidir al agente («Auto»). */
  effort: string | null;
  permissionMode: string | null;
  /** Rutas en la máquina que devolvió `prepare_attachments`. */
  attachments: string[];
};

/** El proveedor y el modelo con que sigue una tarea: los de su último turno. */
export function taskDefaults(view: TaskView): { provider: string; model: string | null } {
  const model = [...view.session.turns].reverse().find((t) => t.model)?.model ?? view.session.model ?? view.session.observed_model ?? null;
  return { provider: view.session.provider, model };
}

/** Un mensaje a una tarea parada: abre otro turno con lo que eligió el cuadro. */
export async function sendToTask(host: Host, workspace: string, folder: string, session: string, draft: Draft) {
  const { value } = await host.call<string>("send_message", workspace, {
    ...MESSAGE_DEFAULTS,
    provider: draft.provider,
    project: folder,
    session,
    prompt: draft.prompt,
    model: draft.model,
    effort: draft.effort,
    permissionMode: draft.permissionMode,
    attachments: draft.attachments,
  });
  return value;
}

/**
 * Cambiar el CLI de una tarea (`provider_handoff_v1`): deja el consentimiento
 * de un solo uso para el siguiente turno, que abre sesión nueva con la
 * conversación como texto o retoma la aparcada.
 */
export async function setSessionProvider(host: Host, workspace: string, folder: string, session: string, provider: string) {
  await host.call("set_session_provider", workspace, { project: folder, session, provider });
}

/** «Mandar ahora»: el mensaje entra en el turno que corre, sin esperar a que termine. */
export async function injectIntoTask(host: Host, workspace: string, folder: string, session: string, prompt: string, attachments: string[] = []) {
  await host.call("inject_message", workspace, { project: folder, session, prompt, queueId: null, attachments, taskMentions: [], recipients: [] });
}

const MESSAGE_DEFAULTS = {
  taskMentions: [],
  recipients: [],
  effort: null,
  permissionMode: null,
  attachments: [],
  sources: [],
  excludedSources: [],
  respuestas: null,
  baseRef: null,
  agent: null,
  taskFromAgent: false,
  fromAgent: null,
  fromChannel: null,
  replyTo: null,
  hops: null,
  fromTask: null,
  space: null,
};

/** El proveedor y el modelo de una tarea nueva: los de la más reciente, o el primer proveedor disponible. */
export async function defaultsFor(host: Host, workspace: string, tasks: Task[], agent: string | null) {
  const mine = tasks.filter((t) => t.host === host.id && t.workspace === workspace && t.provider);
  const newest = (agent ? mine.find((t) => t.agent === agent) : undefined) ?? mine[0];
  if (newest) return { provider: newest.provider, model: newest.model };
  const at = { cachedAt: null as number | null };
  const providers = await read<ProviderInfo[]>(host, "list_providers", workspace, {}, [], at);
  const first = providers.find((p) => p.available && p.driver);
  if (!first) throw new HostError("no_provider");
  return { provider: first.id, model: null };
}

/** Lo que el cuadro propone sin preguntar a la máquina: el proveedor y el modelo de su tarea más reciente (o del agente). */
export function suggestedDefaults(tasks: Task[], host: string, workspace: string, agent: string | null): { provider: string | null; model: string | null } {
  const mine = tasks.filter((t) => t.host === host && t.workspace === workspace && t.provider);
  const newest = (agent ? mine.find((t) => t.agent === agent) : undefined) ?? mine[0];
  return { provider: newest?.provider ?? null, model: newest?.model ?? null };
}

/** Una tarea nueva en una carpeta: `send_message` sin sesión. El motor devuelve su id. */
export async function createTask(
  host: Host,
  workspace: string,
  args: { folder: string; prompt: string; provider: string; model: string | null; agent: string | null; space: string | null } & Partial<Pick<Draft, "effort" | "permissionMode" | "attachments">> & { baseRef?: string | null; unwrapSnapshot?: boolean },
) {
  const { value } = await host.call<string>("send_message", workspace, {
    ...MESSAGE_DEFAULTS,
    provider: args.provider,
    project: args.folder,
    session: null,
    prompt: args.prompt,
    model: args.model,
    effort: args.effort ?? null,
    permissionMode: args.permissionMode ?? null,
    attachments: args.attachments ?? [],
    baseRef: args.baseRef ?? null,
    ...(args.unwrapSnapshot ? { unwrapSnapshot: true } : {}),
    agent: args.agent,
    taskFromAgent: Boolean(args.agent),
    space: args.space,
  });
  if (typeof value !== "string" || !value) throw new HostError("operation_failed");
  return value;
}

/**
 * Comparte con la cuenta un space de esa máquina (`share_space`): desde ahí tiene
 * el mismo id en todas, y una tarea nueva en otra máquina puede nacer en él.
 */
export async function shareSpace(host: Host, workspace: string, id: string) {
  await host.call("share_space", workspace, { id });
}

export function stopTask(host: Host, workspace: string, folder: string, id: string) {
  return host.call("stop_turn", workspace, { project: folder, session: id });
}

export function respondPermission(host: Host, workspace: string, id: string, requestId: string, allow: boolean) {
  return host.call("respond_permission", workspace, { session: id, requestId, allow });
}

/**
 * Elegir modo con el turno en marcha, como `elegirModo` del escritorio: el
 * turno vivo arrancó con el modo de entonces y no lo relee, así que se le pide
 * al motor. Pasar a automático además contesta lo que el turno ya pidió, como
 * el botón «Aprobar»; si mientras tanto se eligió otro modo (`still` en falso), ya no.
 */
export async function switchLiveMode(host: Host, workspace: string, folder: string, id: string, mode: string, still: () => boolean = () => true) {
  await host.call("set_permission_mode", workspace, { project: folder, session: id, mode });
  if (mode !== AUTO_MODE) return;
  const now = await loadTask(host, workspace, folder, id);
  for (const p of now.permissions) {
    if (!still()) return;
    await respondPermission(host, workspace, id, p.request_id, true);
  }
}

export async function answerQuestion(host: Host, workspace: string, folder: string, id: string, pending: PendingQuestion, chosen: Record<string, string[]>, free: Record<string, string>) {
  const respuestas: Answer[] = pending.questions.map((q) => ({
    turn: pending.turn,
    question: q.id,
    chosen: chosen[q.id] ?? [],
    free_text: free[q.id]?.trim() || null,
  }));
  // El proceso puede haber terminado o la pregunta haberse respondido en otro cliente.
  const current = await loadTask(host, workspace, folder, id);
  const question = current.questions.find((q) => q.turn === pending.turn);
  // Una pregunta que ya no entra en la cola no prueba que esté contestada: la respuesta no se descarta en silencio.
  if (!question && !current.session.turns.some((turn) => turn.id === pending.turn)) throw new HostError("question_unverified");
  if (!question) return;
  const remaining = respuestas.filter((a) => question.questions.some((q) => q.id === a.question));
  if (question.request_id) {
    return host.call("answer_question", workspace, { session: id, requestId: question.request_id, respuestas: remaining });
  }
  return host.call("send_message", workspace, {
    ...MESSAGE_DEFAULTS,
    project: folder,
    session: id,
    provider: current.session.provider,
    model: taskDefaults(current).model,
    prompt: "",
    respuestas: remaining,
  });
}

export function markSeen(host: Host, workspace: string, id: string) {
  // Marcar vista no es una intención: con la máquina apagada se pierde, y no pasa nada.
  return host.call("mark_task_seen", workspace, { workspace, session: id }).catch(() => {});
}

export async function attentionOf(host: Host): Promise<WorkspaceAttention[]> {
  const at = { cachedAt: null as number | null };
  const list = await read<WorkspaceAttention[]>(host, "list_workspace_attention", null, {}, [], at).catch(() => []);
  return linkedAttention(list, host.linked);
}

// --- Fijar, renombrar y archivar (la vista previa) ------------------------------

/** Fijar o desfijar, como la ventana (`set_session_pinned`). Con la máquina apagada, el relay lo aplaza. */
export async function setPinned(host: Host, workspace: string, folder: string, id: string, pinned: boolean) {
  await host.call("set_session_pinned", workspace, { project: folder, id, pinned });
}

/** Cambiarle el nombre, como la ventana (`rename_session`). Con la máquina apagada, el relay lo aplaza. */
export async function renameTask(host: Host, workspace: string, folder: string, id: string, title: string) {
  await host.call("rename_session", workspace, { project: folder, id, title });
}

/**
 * Archivar, como «Archivar» de la tarjeta del escritorio: primero pregunta qué
 * lo impide (`task_blockers`); con cambios sin guardar no archiva y lo dice,
 * para decidir desde la ventana. Con la máquina apagada no la enciende: el
 * relay guarda el archivado y lo aplica al conectarse.
 */
export async function archiveTask(host: Host, workspace: string, folder: string, id: string): Promise<{ archived: true } | { blocked: TaskBlockers["unsaved"] }> {
  if (host.power() === "off") {
    await host.call("set_task_archived", workspace, { project: folder, id, archived: true, space: null });
    return { archived: true };
  }
  const { value, cachedAt } = await host.call<TaskBlockers | null>("task_blockers", workspace, { project: folder, id, finish: false });
  if (!value || cachedAt !== null || !Array.isArray(value.unsaved)) throw new HostError("task_status_unavailable");
  const unsaved = value.unsaved;
  if (unsaved.length) return { blocked: unsaved };
  await host.call("set_task_archived", workspace, { project: folder, id, archived: true, space: null });
  return { archived: true };
}

// --- El cuadro de escribir -----------------------------------------------------

/** Los proveedores con los que se puede empezar algo en esa máquina. */
export const usableProviders = (providers: ProviderInfo[]) => providers.filter((p) => p.available && p.driver);

/** Los modelos de un proveedor y sus niveles de razonamiento; apagada y sin copia, ninguno. */
export async function modelsOf(host: Host, workspace: string, provider: string): Promise<ProviderModels> {
  const at = { cachedAt: null as number | null };
  const value = await read<ProviderModels | null>(host, "list_models", workspace, { provider }, null, at).catch(() => null);
  return value && Array.isArray(value.models) ? value : { provider, models: [] };
}

export async function permissionModesOf(host: Host, workspace: string, provider: string): Promise<PermissionModeOption[]> {
  const at = { cachedAt: null as number | null };
  const value = await read<PermissionModeOption[]>(host, "list_permission_modes", workspace, { provider }, [], at).catch(() => []);
  return Array.isArray(value) ? value : [];
}

/** La barra de `/`: los comandos del CLI y las skills. */
export async function slashMenuOf(host: Host, workspace: string, provider: string): Promise<SlashMenu> {
  const at = { cachedAt: null as number | null };
  const value = await read<SlashMenu | null>(host, "list_slash_menu", workspace, { provider }, null, at).catch(() => null);
  return { commands: value?.commands ?? [], skills: value?.skills ?? [], side_question: value?.side_question ?? null };
}

/** Lo que se puede nombrar con `@` en una carpeta: archivos y carpetas. */
export async function mentionsOf(host: Host, workspace: string, folder: string, session: string | null): Promise<MentionList> {
  const at = { cachedAt: null as number | null };
  const value = await read<MentionList | null>(host, "list_mentions", workspace, { project: folder, sources: null, excludedSources: null, session }, null, at).catch(() => null);
  return { fuentes: value?.fuentes ?? [], truncado: value?.truncado ?? false };
}

/** Una rama elegible. `detail` es texto o `null`: el booleano del motor no llega a la hoja. */
export type BranchChoice = { reference: string; name: string; remote: boolean; detail: string | null };

export type BranchList = { branches: BranchChoice[]; selected: string | null };

/**
 * Normaliza `project_base_branches`. El motor manda `remote: true | false`.
 * Un doble viejo mandaba el nombre del remoto. Buscar o pintar ese booleano
 * deja la hoja en blanco.
 */
export function branchChoices(value: { branches?: unknown; selected?: unknown } | null): BranchList {
  const raw = Array.isArray(value?.branches) ? value.branches : [];
  const branches = raw.flatMap((item): BranchChoice[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as { reference?: unknown; name?: unknown; remote?: unknown };
    const reference = typeof row.reference === "string" ? row.reference : "";
    if (!reference) return [];
    const fallback = reference.replace(/^refs\/(heads|remotes)\//, "");
    const name = typeof row.name === "string" && row.name ? row.name : fallback;
    const remote = row.remote === true || (typeof row.remote === "string" && row.remote.length > 0) || reference.startsWith("refs/remotes/");
    const detail = typeof row.remote === "string" && row.remote ? row.remote : remote ? reference.split("/")[2] ?? null : null;
    return [{ reference, name, remote, detail }];
  });
  return { branches, selected: typeof value?.selected === "string" ? value.selected : null };
}

/** Las ramas desde las que puede empezar una tarea nueva en una carpeta con git. */
export async function baseBranchesOf(host: Host, workspace: string, folder: string): Promise<BranchList> {
  const at = { cachedAt: null as number | null };
  const value = await read<BaseBranches | null>(host, "project_base_branches", workspace, { project: folder, refresh: false, details: false }, null, at).catch(() => null);
  return branchChoices(value);
}

/**
 * `!` en el cuadro: un comando de terminal en la carpeta. Sin sesión crea la
 * tarea, con lo que eligió el cuadro, como la ventana.
 */
export async function runShell(
  host: Host,
  workspace: string,
  args: { folder: string; session: string | null; command: string; provider?: string | null; model?: string | null; effort?: string | null; permissionMode?: string | null; space?: string | null; agent?: string | null; baseRef?: string | null },
): Promise<ShellRun> {
  const { value } = await host.call<ShellRun | null>("run_shell_command", workspace, {
    project: args.folder,
    session: args.session,
    command: args.command,
    queueId: null,
    provider: args.provider ?? null,
    model: args.model ?? null,
    effort: args.effort ?? null,
    permissionMode: args.permissionMode ?? null,
    space: args.space ?? null,
    agent: args.agent ?? null,
    baseRef: args.baseRef ?? null,
    runId: null,
  });
  if (!value?.session) throw new HostError("operation_failed");
  return value;
}

export function stopShell(host: Host, workspace: string, session: string) {
  return host.call("stop_shell_command", workspace, { session });
}

/**
 * Un archivo del teléfono a la máquina: viaja en base64 (`guardar_adjunto`) y
 * queda como adjunto del workspace (`prepare_attachments`). Devuelve la ruta
 * para `attachments`. Con un motor anterior, el documento no cabe: las
 * imágenes siguen por `guardar_imagen_pegada`, y el resto se rechaza. El
 * socket corta en 16 MiB por mensaje: `MAX_ATTACHMENT_BYTES` deja margen.
 */
export { ATTACHMENT_MIMES, IMAGE_MIMES };
/** 16 MiB de mensaje en base64 son unos 11 MB de archivo. */
export const MAX_ATTACHMENT_BYTES = MAX_UPLOAD_BYTES;

export async function uploadAttachment(
  host: Host,
  workspace: string,
  folder: string,
  file: { mime: string; base64: string; name?: string },
): Promise<string> {
  const saved = await (async () => {
    try {
      return await host.call<string>("guardar_adjunto", workspace, {
        mime: file.mime,
        nombre: file.name ?? null,
        datos: file.base64,
      });
    } catch (error) {
      if (!isUnknownCommand(error)) throw error;
      if (!isImageMime(file.mime)) throw new HostError(COMMAND_UNSUPPORTED, "guardar_adjunto");
      return host.call<string>("guardar_imagen_pegada", workspace, { mime: file.mime, datos: file.base64 });
    }
  })();
  if (typeof saved.value !== "string" || !saved.value) throw new HostError("operation_failed");
  const prepared = await host.call<string[]>("prepare_attachments", workspace, { project: folder, paths: [saved.value] });
  const path = Array.isArray(prepared.value) ? prepared.value[0] : null;
  if (!path) throw new HostError("operation_failed");
  return path;
}

// --- Lo enriquecido del chat ----------------------------------------------------

/**
 * Un archivo que el mensaje nombra por su ruta en la máquina: imagen (con
 * `data_url`), PDF (`pdf` en base64), HTML o texto. Los adjuntos viejos,
 * `entradas/…`, los resuelve `attachment_preview` dentro de la tarea.
 */
export async function previewFile(host: Host, workspace: string, path: string, task?: { folder: string; session: string }): Promise<FilePreview> {
  const answer = path.startsWith("entradas/") && task
    ? await host.call<FilePreview>("attachment_preview", workspace, { project: task.folder, id: task.session, rel: path })
    : await host.call<FilePreview>("preview_file", workspace, { path, rel: path });
  if (!answer.value) throw new HostError("operation_failed");
  return answer.value;
}

/** El HTML de una visualización del chat, por partes o de una vez; el mismo lector que la ventana. */
export async function readVisual(host: Host, workspace: string, folder: string, session: string, file: string): Promise<string> {
  if (file.length > 128 || !VISUAL_FILE.test(file)) throw new HostError("invalid_visual_file");
  try {
    return await readVisualHtml({
      part: async (offset, size, revision) =>
        (await host.call<VisualPart>("chat_visual_part", workspace, { project: folder, session, file, offset, size, revision: revision ?? null })).value,
      whole: async () =>
        (await host.call<VisualWhole>("tree_show", workspace, { project: folder, session, tree: VISUAL_TREE, path: file })).value,
    });
  } catch (error) {
    const detail = error && typeof error === "object" && "detail" in error ? error.detail : null;
    if (detail === "invalid_visual_file" || detail === "visual_too_large" || detail === "visual_read_failed") throw new HostError(detail);
    throw error;
  }
}

// --- Los archivos de la tarea -----------------------------------------------------

/** Los árboles de la tarea: su copia de trabajo y los que declare. Los que ya no están en disco no se enseñan. */
export async function taskTrees(host: Host, workspace: string, folder: string, session: string): Promise<TaskTree[]> {
  const answer = await host.call<TaskTree[]>("list_task_trees", workspace, { project: folder, session });
  return (answer.value ?? []).filter((tree) => !tree.missing);
}

/** Las rutas de un árbol de la tarea. */
export async function treeFiles(host: Host, workspace: string, folder: string, session: string, tree: string): Promise<TreeFiles> {
  const answer = await host.call<TreeFiles>("tree_files", workspace, { project: folder, session, tree });
  if (!answer.value) throw new HostError("operation_failed");
  return answer.value;
}

/** Un archivo de un árbol de la tarea: texto, o su imagen en `data_url`. */
export async function treeFile(host: Host, workspace: string, folder: string, session: string, tree: string, path: string): Promise<TreeContent> {
  const answer = await host.call<TreeContent>("tree_show", workspace, { project: folder, session, tree, path });
  if (!answer.value) throw new HostError("operation_failed");
  return answer.value;
}

// --- Cuentas de IA ---------------------------------------------------------------

/**
 * El workspace con que van las llamadas de cuentas a una máquina. En el motor
 * las cuentas son de un workspace, y por el relay toda llamada tiene que decir
 * el suyo: sin él, `add_account` contesta «Por el relay, la llamada tiene que
 * decir de qué workspace es.» y `list_accounts` una lista vacía (medido en
 * vm-alberto, motor 1198b04). Es el abierto en el teléfono si la máquina lo
 * tiene; si no, el primero suyo vinculado a la cuenta; `null` si no tiene ninguno.
 */
export function accountWorkspace(host: Pick<Host, "linked">, current: string | null): string | null {
  if (!host.linked) return current;
  if (current && host.linked.has(current)) return current;
  return [...host.linked][0] ?? null;
}

export async function accountsOf(host: Host, workspace: string | null, provider: string): Promise<AccountList | null> {
  const at = { cachedAt: null as number | null };
  return read<AccountList | null>(host, "list_accounts", workspace, { provider }, null, at);
}

/** El próximo turno corre con esta cuenta. No enciende la máquina. */
export async function setActiveAccount(host: Host, workspace: string | null, provider: string, id: string) {
  await host.call("set_active_account", accountWorkspace(host, workspace), { provider, id });
}

export async function limitsSnapshotOf(host: Host, workspace: string | null, provider: string, id: string) {
  return host.call<AccountLimits | null>("account_limits", workspace, { provider, id, force: false }).catch(() => ({ value: null, cachedAt: null }));
}

export async function limitsOf(host: Host, workspace: string | null, provider: string, id: string): Promise<AccountLimits | null> {
  return (await limitsSnapshotOf(host, workspace, provider, id)).value;
}

/** Cerrar la sesión de una cuenta en una máquina (`remove_account`), como la ✕ de la chapa en la web. */
export async function signOutAccount(host: Host, workspace: string | null, provider: string, id: string) {
  await host.call("remove_account", workspace, { provider, id });
}

/**
 * Iniciar sesión en una máquina sin pantalla, en dos pasos para conocer el id
 * antes de que lleguen sus eventos: la cuenta nace vacía (`add_account`) y el
 * CLI arranca por tubería (`login_account`, modo `tuberia`). Lo que sigue
 * llega en eventos `account` de esa máquina: el enlace (`url`), el código a
 * comparar (`confirm`) o a pegar (`code`) y el final (`done`, con texto si falló).
 */
export async function addAccount(host: Host, workspace: string | null, provider: string): Promise<string> {
  const { value } = await host.call<{ id: string } | null>("add_account", workspace, { provider, label: "" });
  if (!value?.id) throw new HostError("operation_failed");
  return value.id;
}

export async function beginLogin(host: Host, workspace: string | null, provider: string, id: string) {
  await host.call("login_account", workspace, { provider, id, mode: "tuberia" });
}

export async function submitLoginCode(host: Host, workspace: string | null, id: string, code: string) {
  await host.call("submit_login_code", workspace, { id, code });
}

/** Cancelar un inicio de sesión a medias y no dejar la cuenta vacía. */
export async function cancelLogin(host: Host, workspace: string | null, provider: string, id: string) {
  await host.call("cancel_login", workspace, { id }).catch(() => {});
  await host.call("discard_account", workspace, { provider, id }).catch(() => {});
}

/** Lo que el teléfono sabe de un inicio de sesión en curso, de los eventos `account`. */
export type LoginProgress = { url: string | null; confirm: string | null; askCode: boolean; notice: string | null; error: string | null; done: boolean };

export const LOGIN_START: LoginProgress = { url: null, confirm: null, askCode: false, notice: null, error: null, done: false };

/** Un evento `account` sobre el inicio de sesión: el enlace, el código, un aviso o el final (con texto si falló). */
export function loginStep<T extends LoginProgress>(login: T, event: LoginEvent): T {
  if (event.kind === "url") return { ...login, url: event.text };
  if (event.kind === "confirm") return { ...login, confirm: event.text };
  if (event.kind === "code") return { ...login, askCode: true };
  if (event.kind === "notice") return { ...login, notice: event.text };
  return event.text ? { ...login, error: event.text, done: true } : { ...login, done: true };
}

/**
 * Lo que dice un fallo de la máquina, sin el código genérico delante: el motor
 * contesta frases (`command_failed` con la frase en `detail`) o un `Failure`
 * (`what`, `detail`). Solo sin frase queda el código.
 */
export function failureText(error: unknown): string {
  if (error instanceof HostError) {
    const detail = error.detail as Record<string, unknown> | string | null | undefined;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (detail && typeof detail === "object") {
      for (const key of ["what", "message", "detail"]) {
        const text = detail[key];
        if (typeof text === "string" && text.trim()) return text;
      }
    }
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

// --- Avisos ------------------------------------------------------------------

export type Notice = { host: string; workspace: string; session: string; folder: string | null; state: AttentionState | "finished" };

const NEEDS_YOU = new Set<AttentionState>(["approving", "asked", "failed"]);

/**
 * Convierte los eventos de una máquina en avisos: una tarea que entra en
 * `approving`, `asked` o `failed` (de `attention`), o un turno que termina
 * bien (`chat` con `done`). El motor marca `unseen` en cuanto arranca el turno,
 * así que «terminó» sale de `done` y no de `attention`.
 */
export function noticer(host: string, initial: WorkspaceAttention[] = []) {
  let known = new Map<string, AttentionState>();
  const folders = new Map<string, string>();
  const index = (list: WorkspaceAttention[]) => {
    const next = new Map<string, AttentionState>();
    for (const w of list) for (const task of w.tasks) {
      next.set(`${w.workspace}/${task.session}`, task.state);
      folders.set(task.session, task.project);
    }
    return next;
  };
  known = index(initial);
  return {
    reset(list: WorkspaceAttention[]) {
      known = index(list);
    },
    take(event: EngineEvent): Notice[] {
      if (event.name === "attention" && Array.isArray(event.payload)) {
        const list = event.payload as WorkspaceAttention[];
        // Una entrada suelta cambia solo su workspace; la lista entera reemplaza lo que se sabía.
        const next = isSingleAttention(list) ? new Map([...known].filter(([key]) => !list.some((w) => key.startsWith(`${w.workspace}/`)))) : new Map<string, AttentionState>();
        for (const [key, state] of index(list)) next.set(key, state);
        const notices: Notice[] = [];
        for (const w of list) for (const task of w.tasks) {
          const key = `${w.workspace}/${task.session}`;
          if (NEEDS_YOU.has(task.state) && known.get(key) !== task.state) {
            notices.push({ host, workspace: w.workspace, session: task.session, folder: task.project, state: task.state });
          }
        }
        known = next;
        return notices;
      }
      const payload = event.payload as { session?: string; project?: string; workspace?: string } | null;
      if (event.name === "session" && payload?.session && payload.project !== undefined) folders.set(payload.session, payload.project);
      if (event.name === "chat") {
        const chat = event.payload as ChatEvent;
        if (chat.kind === "done" && chat.ok === true && chat.workspace) {
          return [{ host, workspace: chat.workspace, session: chat.session, folder: folders.get(chat.session) ?? null, state: "finished" }];
        }
      }
      return [];
    },
  };
}

// --- Carpetas nuevas -----------------------------------------------------------

/** Dónde crea y clona carpetas esa máquina (`SELDON_PROJECTS_DIR` en una VM administrada). */
export async function projectDirectoryOf(host: Host, workspace: string): Promise<string | null> {
  const at = { cachedAt: null as number | null };
  return read<string | null>(host, "get_project_directory", workspace, {}, null, at).catch(() => null);
}

/** «Nueva carpeta»: una carpeta vacía en la carpeta de proyectos de la máquina. */
export async function createFolder(host: Host, workspace: string, name: string, space: string | null): Promise<Project> {
  const { value } = await host.call<Project>("create_project", workspace, { name, space });
  return value;
}

/** Cada cuánto se pregunta por el clon, por si se perdió un evento con la conexión caída. */
export const CLONE_STATUS_EVERY = 5_000;

/**
 * «Clonar repo»: `start_project_clone` contesta enseguida y el clon sigue en la
 * máquina; el avance llega en el evento `project_clone` y, si se pierde,
 * `project_clone_status` lo recupera. Resuelve con la carpeta o rechaza con el
 * error del motor (`clone_cancelled` si se canceló). `operation` es un UUID:
 * repetirlo no clona dos veces.
 */
export async function cloneRepo(
  host: Host,
  workspace: string,
  args: { operation: string; url: string; name: string; space: string | null; id?: string | null },
  onProgress: (event: ProjectCloneEvent) => void,
  every = CLONE_STATUS_EVERY,
): Promise<Project> {
  let ended = false;
  let finish: (event: ProjectCloneEvent) => void = () => {};
  const finished = new Promise<ProjectCloneEvent>((done) => {
    finish = (event) => {
      ended = true;
      done(event);
    };
  });
  const seen = (event: ProjectCloneEvent | null | undefined) => {
    if (ended || !event || event.operation !== args.operation) return;
    if (event.done) finish(event);
    else onProgress(event);
  };
  const off = host.onEvents((events) => {
    for (const event of events) if (event.name === "project_clone") seen(event.payload as ProjectCloneEvent);
  });
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    await host.call("start_project_clone", workspace, { ...args, workspace, directory: null, portfolio: null, gitHost: null, id: args.id ?? null });
    const ask = async () => {
      const answer = await host.call<ProjectCloneEvent | null>("project_clone_status", workspace, { operation: args.operation, workspace }).catch(() => null);
      if (answer && answer.value === null && !ended) finish({ operation: args.operation, phase: "done", percent: null, done: true, error: "clone_lost" });
      else seen(answer?.value);
    };
    void ask();
    timer = setInterval(() => void ask(), every);
    const last = await finished;
    if (last.error || !last.project) throw new HostError("clone_failed", last.error ?? "clone_lost");
    return last.project;
  } finally {
    clearInterval(timer);
    off();
  }
}

export function cancelClone(host: Host, workspace: string, operation: string) {
  return host.call("cancel_project_clone", workspace, { operation, workspace });
}

/** Finalizar siempre comprueba los bloqueos en la máquina; leer o fallar no la enciende. */
export async function finishTask(host: Host, workspace: string, folder: string, id: string): Promise<{ finished: true } | { blocked: TaskBlockers }> {
  if (host.power() !== "on") throw new HostError("machine_asleep", host.label);
  const { value, cachedAt } = await host.call<TaskBlockers>("task_blockers", workspace, { project: folder, id, finish: true });
  if (!value || cachedAt !== null || !Array.isArray(value.unsaved)) throw new HostError("task_status_unavailable");
  if (value.not_finished || value.unsaved.length) return { blocked: value };
  await host.call("finish_task", workspace, { project: folder, id });
  return { finished: true };
}

/** El borrado es explícito, en línea y sin forzar el descarte de archivos. */
export async function deleteTask(host: Host, workspace: string, folder: string, id: string) {
  if (host.power() !== "on") throw new HostError("machine_asleep", host.label);
  await host.call("delete_session", workspace, { project: folder, id, force: false });
}
