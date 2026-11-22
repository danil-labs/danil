// Tipos que los bloques de projects usan y que viven en otra feature.
// Un solo sitio: la feature no importa a otra (R3).
import type { createComposerStore } from "../../../../packages/features/composer/src/index.ts";
import type { createDraftsStore } from "../../../../packages/features/drafts/src/index.ts";
import type { createThreadsStore } from "../../../../packages/features/threads/src/index.ts";
import type { createPanels } from "./panels.ts";
import type { createTabs } from "./tabs.ts";
import type { createTaskFiles } from "./taskFiles.ts";

export type ComposerStore = ReturnType<typeof createComposerStore>;
export type DraftsStore = ReturnType<typeof createDraftsStore>;
export type ThreadsStore = ReturnType<typeof createThreadsStore>;
export type PanelsStore = ReturnType<typeof createPanels>;
export type TabsStore = ReturnType<typeof createTabs>;
export type TaskFilesStore = ReturnType<typeof createTaskFiles>;
export type { createComposerStore, createDraftsStore, createThreadsStore };

export type { Machine, ProjectPlace } from "../../../../packages/features/machines/src/queries.ts";
export type { ComposerConfiguration } from "../../../../packages/features/composer/src/index.ts";
export type { Draft, DraftConfiguration } from "../../../../packages/features/drafts/src/index.ts";
export type { ChatEvent, HandoverPending, HandoverState, Msg, PermissionRequest, Session, TranscriptOrigin } from "../../../../packages/features/chat/src/index.ts";
export type { MachineWait, createThreadsCore } from "../../../../packages/features/threads/src/queries.ts";
export type { OptimisticHistoryState, TranscriptMetadata } from "../../../../packages/features/threads/src/model.ts";
export type { Author } from "../../../../packages/features/chat/src/model/messageTypes.ts";
export type { Preview } from "../../../../packages/features/artifacts/src/components/Preview.tsx";
export type { ChatExportado } from "../../../../packages/features/chat/src/model/transcript.ts";
export type { ContextoDeProyectos } from "../../../../packages/features/settings/src/screens/ManageProjects.tsx";
export type { Capabilities } from "../../../../packages/host/src/platform.ts";
export type { SearchFilter } from "../../../../packages/shell/src/shell/GlobalSearch.tsx";
export function clave(turno: string, pregunta: string) {
  return JSON.stringify([turno, pregunta]);
}
export { threadPreview } from "./nextSteps.ts";
