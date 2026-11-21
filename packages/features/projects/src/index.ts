// Única entrada pública de @danil/feature-projects (03-structure).
// Exporta pantallas y piezas que el shell monta.

// Pantallas
export { ProjectsScreen } from "./screens/ProjectsScreen.tsx";
export type { ProjectsScreenProps } from "./screens/ProjectsScreen.tsx";

// Componentes
export { DeleteTaskDialog } from "./components/DeleteTaskDialog.tsx";
export type { DeleteTaskDialogProps } from "./components/DeleteTaskDialog.tsx";
export { DeleteTaskMember } from "./components/DeleteTaskMember.tsx";
export type { DeleteTaskMemberProps } from "./components/DeleteTaskMember.tsx";
export { ProjectItemView } from "./components/ProjectItemView.tsx";
export type { ProjectItemViewProps } from "./components/ProjectItemView.tsx";
export { TaskItemView } from "./components/TaskItemView.tsx";
export type { TaskItemViewProps } from "./components/TaskItemView.tsx";
export { TaskErrorView } from "./components/TaskErrorView.tsx";
export type { TaskErrorViewProps } from "./components/TaskErrorView.tsx";

// Ciclo de vida de tareas (task_lifecycle)
export {
  executeTaskDeletionLifecycle,
  TaskLifecycleError,
} from "./lifecycle/index.ts";
export type { TaskLifecycleErrorDetails } from "./lifecycle/index.ts";

// Queries y Store reactivo
export {
  useProjects,
  getProjectsStore,
  removeTasksFromStore,
  fetchProjectsAndTasks,
  inspectTaskDeletion,
  applyTaskDeletion,
  createDebouncedInspection,
} from "./queries.ts";
export type { ProjectsState, UseProjectsResult } from "./queries.ts";

// Tipos del modelo de vista
export type {
  ProjectItem,
  TaskRecord,
  WorkspaceProjectsCatalog,
  TaskIntegrationStatus,
  DeleteMemberInspection,
  DeleteTaskMemberItem,
  DeleteTaskPreview,
  DeleteTaskFailureItem,
  DeleteTaskResult,
  DeleteTaskTarget,
  RawProjectsOutput,
  RawLiveSessionsOutput,
  RawSessionParams,
  RawDeleteParams,
  RawFinishParams,
  Workspace,
} from "./model.ts";
