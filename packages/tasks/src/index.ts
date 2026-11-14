export {
  type AgentOption,
  type SidebarContext,
  type SidebarGroup,
  type SidebarGrouping,
  type SidebarSection,
  type SidebarSort,
  type SidebarStatusKey,
  type SidebarTask,
  type SidebarView,
  DEFAULT_SIDEBAR_VIEW,
  GROUPINGS,
  SORTS,
  activityOf,
  agentOptions,
  applySidebarView,
  groupKey,
  isPinned,
  lastActivity,
  needsYou,
  nonDefaultCount,
  sameAgent,
  sanitizeSidebarView,
  statusKeyOf,
  statusRank,
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
  dockSources,
  orderDockAgents,
  planDock,
} from "./dock.ts";
export { type CardOptions, type CardTask, type TaskCard, groupCardOptions, taskCard } from "./card.ts";
export { dockStatusText, groupLabel, groupingLabel, scopeLabel, sectionLabel, sortLabel, statusGroupLabel } from "./labels.ts";
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
export { type ModelSession, type Surface, type SurfaceModel, chipModel, menuSurfaces, surfaceHas, surfaceOf } from "./surfaces.ts";

export { DANIL_CREDITS_MODEL, type CreditsBalanceState, type DanilService, creditsBalanceState, danilServiceOf } from "./danil-services.ts";
export { modelPresentation, routerDiscovery, routerAvailable, routerOfferState, type RouterOfferState } from "./model-presentation.ts";
export {
  FREE_ROUTER_MODEL,
  FREE_ROUTER_OPENCODE,
  FREE_ROUTER_PREFIX,
  OPENCODE,
  RETIRED_AGENTS,
  canonicalAgentId,
  isFreeRouterAgent,
  isFreeRouterModel,
  isRetiredAgent,
} from "./agents.ts";
