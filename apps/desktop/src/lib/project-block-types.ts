// Tipos que los bloques de projects usan y que viven en otra feature.
// Un solo sitio: la feature no importa a otra (R3).
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
