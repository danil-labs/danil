export {
  type AgentOption,
  type SidebarContext,
  type SidebarGroup,
  type SidebarGrouping,
  type SidebarSection,
  type SidebarStatusKey,
  type SidebarTask,
  type SidebarView,
  DEFAULT_SIDEBAR_VIEW,
  GROUPINGS,
  activityOf,
  agentOptions,
  applySidebarView,
  groupKey,
  isPinned,
  needsYou,
  nonDefaultCount,
  sameAgent,
  sanitizeSidebarView,
  statusKeyOf,
} from "./view.ts";
export { REMOTE_CHILD_FEATURE, type RemoteParent, type RemoteRow, type RemoteScope, remoteLauncherOf, remoteParentOf, withRemoteLaunchers } from "./remote.ts";
export { type FlatRow, type FlatTask, type LauncherRow, delegatedOf, flattenTasks, folderCounts, isSubtask, launcherOf } from "./flat.ts";
export {
  type AgentPresence,
  type DockAgent,
  DOCK_DEFAULT_CAPACITY,
  DOCK_GAP,
  DOCK_SLOT,
  agentFolder,
  dockCapacity,
  orderDockAgents,
  planDock,
} from "./dock.ts";
export { type CardOptions, type CardTask, type TaskCard, groupCardOptions, taskCard } from "./card.ts";
export { dockStatusText, groupLabel, groupingLabel, scopeLabel, sectionLabel, statusGroupLabel } from "./labels.ts";
export {
  type ModelCatalog,
  type PreviewAction,
  type PreviewTask,
  type TaskPreview,
  type TitledTask,
  modelName,
  previewLabel,
  taskPreview,
  taskTitle,
} from "./preview.ts";
export { type CardPull, type CheckState, type PullTone, type TaskGit, type TaskGitSession, cardPull, resolveTaskGit } from "./pull.ts";
export { type KnState, type ReviewState, type TaskGitStatus, UNKNOWN_TASK_GIT, canFinishTask, mergeRemoteGit, readTaskGit, retainGitObservation, sameGit } from "./git.ts";

export { type AttentionRow, delegatedAttention, delegatedFamilies, withFamilyActivity } from "./family.ts";
export { type TaskTreeRow, type TaskBranch, taskIdentity, taskParent, buildTaskTree, withTaskAncestors, taskDescendants } from "./tree.ts";

export { type WorkState, WORK_STATES, workStateOf } from "./workState.ts";
