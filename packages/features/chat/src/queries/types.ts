// Tipos de otras features que el chat recibe del shell por `deps` (R3: un `import type` por módulo, y R3 lo cuenta).
// Se tipan por referencia a lo que ya existe; nada se reescribe aquí.
import type { createComposerStore } from "../../../composer/src";
import type { ConversationScope, createConversationHandoff } from "../../../conversation-handoff/src";
import type { Draft, createDraftsStore } from "../../../drafts/src";
import type * as carry from "../../../machines/src/queries/carry";
import type { machines, runOn } from "../../../machines/src/queries/store";
import type { MachinePicker } from "../../../machines/src/screens/MachinePicker";
import type { HandlerTarget, PickedAt, createCloneFolder, createDeskStrip, createNewTask, createProjectsStore, createSessionMutations, createTaskWork, createWorkspaceSession } from "../../../projects/src";
import type { Preview } from "../../../artifacts/src";
import type { watchProfiles } from "../../../projects/src/queries/profiles";
import type { InicioDeCarpeta } from "../../../projects/src/screens/AddWorkdir";
import type { ProjectPicker } from "../../../projects/src/screens/Projects";
import type { SessionRow } from "../../../projects/src/screens/Sessions";
import type TabStrip from "../../../projects/src/screens/Tabs";
import type { ServicePage, createBatchDelivery, createServiceStream } from "../../../service-stream/src";
import type { listaBasta, reconciliar } from "../../../settings/src/model/early-startup";
import type { Startup } from "../../../settings/src/queries/workspaces-store";
import type { DefaultPermissionModeChange } from "../../../settings/src/screens/DefaultPermissions";
import type { createEngineQueue, createTaskQueues } from "../../../task-queues/src";
import type { createThreadsStore } from "./threads-store.ts";
import type { createWorkspaceStore } from "../../../workspace/src";
import type { createContextSource } from "../../../workspaces/src";

export type {
  ConversationScope, DefaultPermissionModeChange, Draft, InicioDeCarpeta, MachinePicker, PickedAt, ProjectPicker, ServicePage, SessionRow, Startup, TabStrip,
  HandlerTarget, Preview, createBatchDelivery, createCloneFolder, createSessionMutations, createTaskWork, createComposerStore, createDeskStrip, createNewTask, createWorkspaceSession, createContextSource, createConversationHandoff, createDraftsStore, createEngineQueue, createProjectsStore,
  createServiceStream, createTaskQueues, createThreadsStore, createWorkspaceStore, listaBasta, machines, reconciliar, runOn, watchProfiles,
};
export type CarryModule = typeof carry;
export type CarriedBase = carry.CarriedBase;
export type CarryCheck = carry.CarryCheck;
export type Hilo = ReturnType<ReturnType<typeof createThreadsStore>["current"]>;
export type MachineWait = ReturnType<ReturnType<typeof createThreadsStore>["machineWaits"]>[string];
