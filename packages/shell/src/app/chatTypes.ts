// Tipos de otras features que el shell compone para el chat (R3).
// Se tipan por referencia a lo que ya existe; nada se reescribe aquí.
import type { createComposerStore } from "../../../features/composer/src";
import type { ConversationScope, createConversationHandoff } from "../../../features/conversation-handoff/src";
import type { Draft, createDraftsStore } from "../../../features/drafts/src";
import type * as carry from "../../../features/machines/src/queries/carry";
import type { machines, runOn } from "../../../features/machines/src/queries/store";
import type { MachinePicker } from "../../../features/machines/src/screens/MachinePicker";
import type { PickedAt, createProjectsStore } from "../../../features/projects/src";
import type { watchProfiles } from "../../../features/projects/src/queries/profiles";
import type { InicioDeCarpeta } from "../../../features/projects/src/screens/AddWorkdir";
import type { ProjectPicker } from "../../../features/projects/src/screens/Projects";
import type { SessionRow } from "../../../features/projects/src/screens/Sessions";
import type { DelegatedPanelModel } from "../../../features/projects/src/screens/DelegatedTasks";
import type TabStrip from "../../../features/projects/src/screens/Tabs";
import type { ServicePage, createBatchDelivery, createServiceStream } from "../../../features/service-stream/src";
import type { listaBasta, reconciliar } from "../../../features/settings/src/model/early-startup";
import type { Startup } from "../../../features/settings/src/queries/workspaces-store";
import type { DefaultPermissionModeChange } from "../../../features/settings/src/screens/DefaultPermissions";
import type { createEngineQueue, createTaskQueues } from "../../../features/task-queues/src";
import type { createThreadsStore } from "../../../features/chat/src/queries/threads-store.ts";
import type { createWorkspaceStore } from "../../../features/workspace/src";
import type { createContextSource } from "../../../features/workspaces/src";

export type {
  ConversationScope, DefaultPermissionModeChange, DelegatedPanelModel, Draft, InicioDeCarpeta, MachinePicker, PickedAt, ProjectPicker, ServicePage, SessionRow, Startup, TabStrip,
  createBatchDelivery, createComposerStore, createContextSource, createConversationHandoff, createDraftsStore, createEngineQueue, createProjectsStore,
  createServiceStream, createTaskQueues, createThreadsStore, createWorkspaceStore, listaBasta, machines, reconciliar, runOn, watchProfiles,
};
export type CarryModule = typeof carry;
export type CarriedBase = carry.CarriedBase;
export type CarryCheck = carry.CarryCheck;
export type Hilo = ReturnType<ReturnType<typeof createThreadsStore>["current"]>;
export type MachineWait = ReturnType<ReturnType<typeof createThreadsStore>["machineWaits"]>[string];
