import { createStore, produce } from "solid-js/store";

/** A file open in a task's own files panel; `changes` opens it in the diff view. */
type TaskFileTab = {
  id: string;
  tree: string;
  path: string;
  changes: boolean;
  /** The file differs from its base, so the viewer offers its changes. */
  changed: boolean;
  /** An unpinned tab is the preview: the next single click replaces it. */
  pinned: boolean;
};

export type TaskFilesSide = "files" | "changes";

/** Toolbar button identifier for task tools. */
export type TaskSideMode = "files" | "search" | "usage" | "delegated";

/** Right-hand docked panel beside the main chat (mutually exclusive, pushes the main chat smoothly). */
export type TaskDockMode = "none" | "files" | "search" | "subtasks" | "subtask" | "usage";

/** Legacy popover type retained as `"none"` now that all task panels dock beside the main chat. */
export type TaskPopoverMode = "none" | "search" | "subtasks" | "usage";

/** Logical ownership group of a right-hand panel. */
export type TaskSidePanelKind = "files-search" | "subtasks" | "usage";

/** Presentation geometry of the docked side pane below the fixed top bar. */
export type TaskSideLayout =
  | "closed"
  | "files-split"
  | "files-expanded"
  | "subtask-split"
  | "subtask-full"
  | "panel-split"
  | "panel-full";

export type SubtaskTarget = {
  project: string;
  session: string;
};

export function taskSidePanelKind(mode: TaskSideMode): TaskSidePanelKind {
  if (mode === "delegated") return "subtasks";
  if (mode === "usage") return "usage";
  return "files-search";
}

function dockForMode(mode: TaskSideMode): Exclude<TaskDockMode, "none" | "subtask"> {
  if (mode === "delegated") return "subtasks";
  return mode;
}

/** Whether a toolbar trigger is currently active for its corresponding docked panel. */
export function isTaskToolActive(panel: Pick<TaskFilesPanel, "dock" | "popover">, mode: TaskSideMode): boolean {
  if (mode === "delegated") return panel.dock === "subtasks" || panel.dock === "subtask";
  return panel.dock === dockForMode(mode);
}

/**
 * Single owner of the docked right-hand panel geometry below the fixed top bar:
 * - Every task panel (Files, Search, Subtasks list, Subtask chat) docks side-by-side beside the
 *   main chat and smoothly pushes it (never floating over the chat content).
 * - Files only takes full width when explicitly expanded (`expanded`) or on narrow/split windows.
 * - Subtask chat and tool panels dock side-by-side (`*-split`) or full width when narrow (`*-full`).
 */
export function taskSideLayout(
  panel: Pick<TaskFilesPanel, "dock" | "expanded" | "subtask">,
  narrow: boolean,
): TaskSideLayout {
  if (panel.dock === "files") return narrow || panel.expanded ? "files-expanded" : "files-split";
  if (panel.dock === "subtask" && panel.subtask !== null) return narrow ? "subtask-full" : "subtask-split";
  if (panel.dock === "search" || panel.dock === "subtasks" || panel.dock === "usage") {
    return narrow ? "panel-full" : "panel-split";
  }
  return "closed";
}

export type TaskFilesPanel = {
  /** True when either a docked side pane or a compact floating popover is visible. */
  open: boolean;
  /** Mutually exclusive docked panel beside the main chat: Files or Subtask chat. */
  dock: TaskDockMode;
  /** Compact floating popover anchored below the fixed top-right toolbar buttons. */
  popover: TaskPopoverMode;
  expanded: boolean;
  tree: boolean;
  side: TaskFilesSide;
  mode: TaskSideMode;
  tabs: TaskFileTab[];
  active: string | null;
  dirty: string[];
  /** Active subtask chat docked beside the main chat. */
  subtask: SubtaskTarget | null;
};

export const taskFileTabId = (tree: string, path: string, changes: boolean) =>
  `${changes ? "cambios" : "archivo"}\u0000${tree}\u0000${path}`;

/** True when the docked right pane uses proportional split width (file viewer tabs or subtask thread). */
export const taskSideUsesSplitWidth = (panel: Pick<TaskFilesPanel, "dock" | "tabs" | "subtask">) =>
  (panel.dock === "files" && panel.tabs.length > 0) || (panel.dock === "subtask" && panel.subtask !== null);

const emptyPanel = (): TaskFilesPanel => ({
  open: false,
  dock: "none",
  popover: "none",
  expanded: false,
  tree: true,
  side: "files",
  mode: "files",
  tabs: [],
  active: null,
  dirty: [],
  subtask: null,
});

function syncSummary(p: TaskFilesPanel) {
  p.popover = "none";
  p.open = p.dock !== "none";
  if (p.dock === "files") p.mode = "files";
  else if (p.dock === "subtask" || p.dock === "subtasks") p.mode = "delegated";
  else if (p.dock === "search") p.mode = "search";
  else if (p.dock === "usage") p.mode = "usage";
  else p.mode = "files";
}

/** Per-task state of the right-side dock, in memory; only the widths persist (`lib/prefs.ts`). */
export function createTaskFiles() {
  const [panels, setPanels] = createStore<Record<string, TaskFilesPanel>>({});
  const panel = (task: string): TaskFilesPanel => panels[task] ?? emptyPanel();
  const edit = (task: string, change: (p: TaskFilesPanel) => void) =>
    setPanels(produce((all) => {
      all[task] ??= emptyPanel();
      change(all[task]);
      syncSummary(all[task]);
    }));

  /**
   * Toggles a right-hand docked panel beside the main chat (all mutually exclusive):
   * clicking the active tool closes the dock; clicking another smoothly switches panels.
   */
  const present = (task: string, mode: TaskSideMode) => edit(task, (p) => {
    const next = dockForMode(mode);
    if (p.dock === next) {
      p.dock = "none";
      p.expanded = false;
    } else {
      p.dock = next;
      p.expanded = false;
    }
  });

  return {
    panel,
    setOpen: (task: string, open: boolean) => edit(task, (p) => {
      if (open) {
        p.dock = "files";
      } else {
        p.dock = "none";
        p.expanded = false;
        p.subtask = null;
      }
    }),
    closeDock: (task: string) => edit(task, (p) => {
      p.dock = "none";
      p.expanded = false;
      p.subtask = null;
    }),
    closePopover: (task: string) => edit(task, (p) => {
      if (p.dock === "search" || p.dock === "subtasks" || p.dock === "usage") {
        p.dock = "none";
        p.expanded = false;
      }
    }),
    present,
    toggle: (task: string) => present(task, "files"),
    openSubtask: (task: string, target: SubtaskTarget) => edit(task, (p) => {
      p.dock = "subtask";
      p.expanded = false;
      p.subtask = { project: target.project, session: target.session };
    }),
    showSubtaskList: (task: string) => edit(task, (p) => {
      p.dock = "subtasks";
      p.expanded = false;
    }),
    clearSubtask: (task: string) => edit(task, (p) => {
      p.subtask = null;
      if (p.dock === "subtask") p.dock = "none";
    }),
    activeSubtasks: () => Object.values(panels)
      .filter((p) => p.dock === "subtask" && p.subtask !== null)
      .map((p) => p.subtask!.session),
    setExpanded: (task: string, expanded: boolean) => edit(task, (p) => { p.expanded = expanded && p.dock === "files" && p.tabs.length > 0; }),
    setTree: (task: string, tree: boolean) => edit(task, (p) => { p.tree = tree || p.tabs.length === 0; }),
    setSide: (task: string, side: TaskFilesSide) => edit(task, (p) => { p.side = side; p.tree = true; }),
    open: (task: string, file: { tree: string; path: string; changes: boolean; changed?: boolean; pinned?: boolean }) => edit(task, (p) => {
      p.dock = "files";
      p.popover = "none";
      const id = taskFileTabId(file.tree, file.path, file.changes);
      const existing = p.tabs.find((tab) => tab.id === id);
      if (existing) {
        if (file.pinned) existing.pinned = true;
        if (file.changed) existing.changed = true;
      } else {
        const tab = { id, tree: file.tree, path: file.path, changes: file.changes, changed: file.changes || Boolean(file.changed), pinned: Boolean(file.pinned) };
        const kept = p.tabs.filter((other) => other.pinned || p.dirty.includes(other.id));
        const at = p.tabs.findIndex((other) => !kept.includes(other));
        if (at < 0) kept.push(tab);
        else kept.splice(Math.min(at, kept.length), 0, tab);
        p.tabs = kept;
      }
      p.active = id;
    }),
    pin: (task: string, id: string) => edit(task, (p) => {
      const tab = p.tabs.find((other) => other.id === id);
      if (tab) tab.pinned = true;
    }),
    activate: (task: string, id: string) => edit(task, (p) => { if (p.tabs.some((tab) => tab.id === id)) p.active = id; }),
    setDirty: (task: string, id: string, dirty: boolean) => edit(task, (p) => {
      p.dirty = p.dirty.filter((other) => other !== id);
      if (!dirty) return;
      p.dirty.push(id);
      const tab = p.tabs.find((other) => other.id === id);
      if (tab) tab.pinned = true;
    }),
    /** Closes the tabs that have no unsaved edits and returns the ones that do. */
    close: (task: string, ids: string[]): string[] => {
      const blocked = ids.filter((id) => panel(task).dirty.includes(id));
      edit(task, (p) => {
        const index = p.tabs.findIndex((tab) => tab.id === p.active);
        p.tabs = p.tabs.filter((tab) => !ids.includes(tab.id) || blocked.includes(tab.id));
        if (!p.tabs.some((tab) => tab.id === p.active)) p.active = (p.tabs[index] ?? p.tabs[index - 1] ?? p.tabs.at(-1))?.id ?? null;
        if (p.tabs.length === 0) { p.expanded = false; p.tree = true; }
      });
      return blocked;
    },
    renamed: (task: string, tree: string, from: string, to: string) => edit(task, (p) => {
      for (const tab of p.tabs) {
        if (tab.tree !== tree) continue;
        if (tab.path === from || tab.path.startsWith(`${from}/`)) {
          const previous = tab.id;
          tab.path = to + tab.path.slice(from.length);
          tab.id = taskFileTabId(tab.tree, tab.path, tab.changes);
          if (p.active === previous) p.active = tab.id;
          p.dirty = p.dirty.map((id) => (id === previous ? tab.id : id));
        }
      }
    }),
    removed: (task: string, tree: string, path: string) => edit(task, (p) => {
      const gone = p.tabs.filter((tab) => tab.tree === tree && (tab.path === path || tab.path.startsWith(`${path}/`))).map((tab) => tab.id);
      p.tabs = p.tabs.filter((tab) => !gone.includes(tab.id));
      p.dirty = p.dirty.filter((id) => !gone.includes(id));
      if (!p.tabs.some((tab) => tab.id === p.active)) p.active = p.tabs.at(-1)?.id ?? null;
      if (p.tabs.length === 0) { p.expanded = false; p.tree = true; }
    }),
    dirtyOf: (task: string) => panel(task).dirty,
    forget: (task: string) => setPanels(produce(all => { delete all[task]; })),
  };
}

export type TaskFiles = ReturnType<typeof createTaskFiles>;
