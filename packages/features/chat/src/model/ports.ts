// Puertos del chat (R3): lo que el chat usa de otras features y del shell, declarado aquí con
// las firmas que llama y en tipos del chat, de `packages/ui` o de `apps/desktop/src/lib`. El shell le
// pasa los stores reales y TypeScript comprueba por estructura que cumplen; nada se importa de ellos.
import type { Accessor, JSX } from "solid-js";
import type { Agent, AgentProfile, Project, Source } from "../../../../../apps/desktop/src/lib/model";
import type { OpcionDeModelo } from "../../../../../apps/desktop/src/lib/models";
import type { JournalEvent } from "../../../../host/src/serviceEvents.ts";
import type { Tab } from "../../../../ui/src/lib/tabs-types";
import type { TaskMention } from "../../../../ui/src/lib/taskMentions";
import type { Carry, CarriedBase, CarryCheck } from "../../../../ui/src/lib/carry.ts";
import type { Draft, DraftConfiguration, HistoryEntry } from "../../../../ui/src/lib/draft.ts";
import type { ConversationHandoffDeps, ConversationScope, HandoffFact, HandoffPresentation, HandoffView } from "../../../../ui/src/lib/handoff.ts";
import type { Machine, ProjectPlace } from "../../../../ui/src/lib/machine.ts";
import type { PickedAt } from "../../../../ui/src/lib/picked-at.ts";
import type { Encolado, Saved, TaskQueuesDeps } from "../../../../ui/src/lib/queue.ts";
import type { PushedBatch, ServiceStreamDeps } from "../../../../ui/src/lib/service-page.ts";
import type { SessionRow } from "../../../../ui/src/lib/session-row.ts";
import type { Startup } from "../../../../ui/src/lib/workspace-startup.ts";

/** `features/composer`: `createComposerStore`. */
export type ComposerPort = {
  chooseEffort: (id: string) => void;
  chooseMode: (id: string) => void;
  effortForTurn: () => string | null;
  installEffects: () => void;
  refreshCommands: (a: string) => void;
  refreshProviders: () => Promise<void>;
  refreshSurfaces: (inicial: boolean) => Promise<void>;
  restoreDraft: (configuration?: DraftConfiguration) => void;
  restoreSessionDraft: (draft: Pick<Draft, "configuration" | "provider">, session?: { provider?: string | null }) => void;
  runtimeFact: (fact: { kind: "model" | "effort" | "mode"; value: string }) => void;
  selectModel: (choice: OpcionDeModelo) => string;
  snapshot: () => DraftConfiguration;
  unavailable: () => void;
};

/** `features/drafts`: `createDraftsStore`. */
export type DraftsPort = {
  acceptSources: (ids: string[]) => string[];
  configure: (configuration: DraftConfiguration, key?: string) => unknown;
  handover: (provider: Draft["provider"] | null | undefined, key?: string) => unknown;
  peek: (key: string) => Draft;
  promote: (from: string, to: string) => unknown;
  replaceAttached: (ids: string[]) => string[];
  reset: () => void;
  restoreFailed: (key: string, message: HistoryEntry, files: string[]) => unknown;
  retryText: (text: string, mentions?: TaskMention[]) => unknown;
  sentSources: (key: string, ids: string[]) => unknown;
  takeFiles: (key: string, files: string[]) => unknown;
};

/** `features/projects`: `createProjectsStore`. */
export type ProjectsPort = {
  changed: () => Promise<Project[]>;
  discardUnconfirmedCache: () => void;
  readyScope: Accessor<{ workspace: string | null; machine: string | null; revision: number } | null>;
  refresh: () => Promise<Project[]>;
  workspaceChanged: (preserveCached?: boolean) => void;
};

/** `features/workspace`: `createWorkspaceStore`. */
type MaterialToken = Readonly<{ generation: number; material: number }>;
type WorkspaceTransition = MaterialToken & Readonly<{ previous: string | null; workspace: string | null }>;
export type WorkspaceContextPort = {
  activate: (token: WorkspaceTransition) => boolean;
  beginMaterial: () => MaterialToken;
  beginTransition: (startup: { active: string | null; workspaces: { id: string; context_root: string | null; default_permission_mode: string | null }[] }) => WorkspaceTransition;
  confirmContext: (token: MaterialToken, candidate: string | null, listed: { id: string; root: boolean; missing: boolean }[]) => void;
  currentMaterial: (token: MaterialToken) => boolean;
  generation: () => number;
  modeChanged: (workspace: string | null, value: string | null, requestedGeneration?: number) => void;
};

/** `features/workspaces`: `createContextSource`. */
export type ContextSourcePort = {
  abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>;
  elegirCarpetaDelWorkspace: () => Promise<void>;
  elegirProyecto: (name: string) => void;
  loadThread: (project: string, id: string) => Promise<void>;
  loadWindowThreads: (skip: string | null) => void;
  releerProyectos: () => Promise<void>;
  soltarCola: () => void;
};

/** `features/conversation-handoff`: `createConversationHandoff`. El chat lo crea y lo devuelve al shell. */
type ConversationHandoffPort = {
  requestStop: (scope: ConversationScope) => Promise<void>;
  replaceWithQueued: (scope: ConversationScope, id: string) => Promise<void>;
  observe: (fact: HandoffFact) => void;
  view: (scope: ConversationScope) => HandoffView;
  presentation: (scope: ConversationScope) => HandoffPresentation;
  blocked: (scope: ConversationScope) => boolean;
  reset: () => void;
  dispose: () => void;
};
export type CreateConversationHandoff = (deps: ConversationHandoffDeps) => ConversationHandoffPort;

/** `features/task-queues`: `createTaskQueues` y `createEngineQueue`. El chat los crea y los devuelve al shell. */
type TaskQueuesPort = {
  items: Accessor<Encolado[]>;
  owner: Accessor<string | null>;
  editing: Accessor<boolean>;
  saved: (session: string) => Readonly<Saved> | undefined;
  openSession: (session: string, project: string, isCurrent?: () => boolean, fromEngine?: boolean) => Promise<void>;
  detach: () => void;
  remove: (id: string, session?: string | null) => void;
  persist: (session: string, project: string, queued: Encolado[]) => Promise<unknown>;
  adopt: (session: string) => string;
  editMode: (value: boolean) => boolean;
  enqueue: (message: Encolado, front?: boolean) => Encolado[];
  edit: (id: string, text: string, mentions?: TaskMention[]) => Encolado[];
  prioritize: (id: string) => Encolado[];
  workspaceChanged: () => void;
  dispose: () => void;
};
export type CreateTaskQueues = (deps: TaskQueuesDeps) => TaskQueuesPort;
type Route = { headers: Record<string, string> } | undefined;
type EngineScope = { project: string; session: string; route?: Route };
export type CreateEngineQueue = (env: {
  invoke: <T>(command: string, args: Record<string, unknown>, options?: Route) => Promise<T>;
  machines: () => readonly Machine[];
  machineOf: (session: string) => Route;
  nativeWindow: () => boolean;
  notStoppableYet: (session: string) => void;
}) => {
  engineCanDispatch: (session: string | null | undefined) => boolean;
  turnStarted: (scope: EngineScope) => void;
  stopTurn: (scope: EngineScope) => Promise<false | undefined>;
  turnClosed: (session: string) => void;
  resumeQueue: (scope: EngineScope) => Promise<unknown>;
};

/** `features/service-stream`: `createServiceStream` y `createBatchDelivery`. */
export type CreateServiceStream = (deps: ServiceStreamDeps) => { paged: () => boolean; filterChanged: () => void; start: () => void; dispose: () => void };
export type CreateBatchDelivery = (deps: { resync: (session: string) => void; replay: (session: string, workspace?: string | null, replayId?: string) => void; deliver: (events: readonly JournalEvent[]) => void }) => (batches: PushedBatch[]) => void;

/** `features/machines`: la lista compartida, dónde corre una tarea y carry. */
export type MachinesPort = () => Machine[];
export type RunOnPort = (workspace: string | null, project?: ProjectPlace) => string | null;
/** Lo que chat ve de carry: las piezas de `Carry` (`ui/src/lib/carry.ts`), sin importar `features/machines`. */
type CarryJob = Carry["job"];
type CarryState = Carry["state"];
type CarryResult = NonNullable<Carry["ready"]>;
type Selection = CarryJob["selection"];
export type CarryPort = {
  adoptOrigin: (key: string, session: string) => void;
  bringSummary: (check: CarryCheck, lastAgentMessage: string | null, branch: string | null) => string;
  carries: Accessor<Record<string, Carry>>;
  checkBring: (input: { workspace: string; project: Project; source: string; target: string; task: { id: string; title: string } }) => Promise<CarryCheck>;
  checkCarry: (input: { workspace: string; project: Project; source: string; target: string }, force?: boolean) => Promise<CarryCheck | null>;
  jobFor: (check: CarryCheck, choice: { selection: Selection; partSize: number; task: string | null; branchAs: string | null }) => CarryJob;
  planCarry: (key: string, check: CarryCheck, job: CarryJob, state: CarryState, ready?: CarryResult | null) => void;
  runCarry: (key: string) => Promise<CarriedBase | null>;
  sourceOf: (project: Project, windowMachine: string) => string | null;
};
export type MachinePickerPort = (props: { workspace: string | null; project?: ProjectPlace; onChange?: () => void }) => JSX.Element;

/** `features/projects`: perfiles y las piezas que el panel pinta. */
export type WatchProfilesPort = (project: string) => () => Record<string, AgentProfile>;
export type ProjectPickerPort = (props: {
  branch?: JSX.Element; locked?: boolean; projects: Project[]; project: string; sources: Source[]; onPick: (id: string) => void; onNuevoProyecto: () => void;
  machine?: JSX.Element; activity?: Record<string, number>; picked?: PickedAt; hidden?: ReadonlySet<string>; onShow?: (id: string) => void; taskCounts?: Record<string, number>;
}) => JSX.Element;
export type TabStripPort = (props: {
  tabs: Tab[]; pinnedIds?: ReadonlySet<string>; onPin?: (id: string) => void; session: (id: string) => SessionRow | undefined; activeId: string | null; liveIds: string[]; approvingIds: string[];
  waitingIds: string[]; onPick: (id: string) => void; onClose: (id: string) => void; dirtyIds: ReadonlySet<string>; onCloseMany: (ids: string[]) => void; canReopen: boolean; onReopen: () => void;
  onDrag?: (id: string, e: PointerEvent) => void; dropIndex?: number | null; draftLabel?: string; onCloseDraft?: () => void;
}) => JSX.Element;

/** `features/settings`: la lectura temprana de workspaces. */
export type ListaBastaPort = (lista: Startup) => boolean;
export type ReconciliarPort = (previa: Startup | null, arranque: Startup) => "aplicar" | "nada";

/** `packages/shell`: el consumo por cuenta y el riel. */
export type CreateUsagePort<Usage> = (props: { agents: () => Agent[]; agent: () => string; busy: () => boolean; reload: () => number; workspace: () => string | null }) => Usage;
export type CreateSidebarPort = () => { colapsado: () => boolean; alternar: () => boolean | void };
