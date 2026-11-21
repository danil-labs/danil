// Entrada pública de la feature @danil/feature-workspaces

// Pantallas montadas por el shell
export { WorkspacesScreen } from "./screens/WorkspacesScreen.tsx";
export type { WorkspacesScreenProps } from "./screens/WorkspacesScreen.tsx";
export { WorkspacePickerModal } from "./screens/WorkspacePickerModal.tsx";
export type { WorkspacePickerModalProps } from "./screens/WorkspacePickerModal.tsx";

// Componentes del riel y selectores
export { RailGroups } from "./components/RailGroups.tsx";
export type { RailGroupsProps } from "./components/RailGroups.tsx";
export { WorkspaceItem } from "./components/WorkspaceItem.tsx";
export type { WorkspaceItemProps } from "./components/WorkspaceItem.tsx";
export { CreateWorkspaceDialog } from "./components/CreateWorkspaceDialog.tsx";
export type { CreateWorkspaceDialogProps } from "./components/CreateWorkspaceDialog.tsx";
export { WorkspaceErrorView } from "./components/WorkspaceErrorView.tsx";
export type { WorkspaceErrorViewProps } from "./components/WorkspaceErrorView.tsx";
export { WorkspaceEmptyView } from "./components/WorkspaceEmptyView.tsx";
export type { WorkspaceEmptyViewProps } from "./components/WorkspaceEmptyView.tsx";

// Consultas y acciones sobre la plataforma y el motor
export {
  useOrganizations,
  useWorkspaces,
  groupWorkspacesByOrg,
  createWorkspace,
  selectWorkspace,
  useSelectWorkspace,
  useSelectOrganization,
  useWorkspaceActions,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  selectOrganization,
  getActiveOrganizationId,
  setActiveOrganizationId,
  resolvePlatformClient,
} from "./queries.ts";
export type {
  UseOrganizationsResult,
  UseWorkspacesOptions,
  UseWorkspacesResult,
  CreateWorkspaceParams,
  SelectWorkspaceOptions,
  ClientResolverOptions,
} from "./queries.ts";

// Tipos de vista derivados y utilidades
export { getPlanLabel } from "./model.ts";
export type {
  Workspace,
  Organization,
  WorkspaceGroup,
  WorkspaceSelectionState,
} from "./model.ts";
