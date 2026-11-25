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

/** What the side pane shows. Only one is visible at a time, while each panel keeps its own state. */
export type TaskSideMode = "files" | "search" | "usage" | "delegated";

/** Logical ownership group of the right-hand panel: files & search vs subtasks vs usage. */
export type TaskSidePanelKind = "files-search" | "subtasks" | "usage";

/** Presentation geometry of the task side pane, keeping the top bar untouched. */
export type TaskSideLayout = "closed" | "replace" | "floating" | "split-thread";

export type SubtaskTarget = {
  project: string;
  session: string;
};

export function taskSidePanelKind(mode: TaskSideMode): TaskSidePanelKind {
  if (mode === "delegated") return "subtasks";
  if (mode === "usage") return "usage";
  return "files-search";
}

/**
 * Single owner of how each side panel appears below the fixed top bar:
 * - Files opens in place of the conversation ("replace").
 * - Search, Usage and the Subtasks list open as floating Danil cards ("floating").
 * - Selecting a subtask splits the conversation area with a vertical divider ("split-thread", or "replace" when narrow).
 */
export function taskSideLayout(
  panel: Pick<TaskFilesPanel, "open" | "mode" | "subtask">,
  narrow: boolean,
): TaskSideLayout {
  if (!panel.open) return "closed";
  if (panel.mode === "files") return "replace";
  if (panel.mode === "delegated" && panel.subtask !== null) return narrow ? "replace" : "split-thread";
  return "floating";
}

export type TaskFilesPanel = {
  open: boolean;
  expanded: boolean;
  tree: boolean;
  side: TaskFilesSide;
  mode: TaskSideMode;
  tabs: TaskFileTab[];
  active: string | null;
  dirty: string[];
  /** Independent state of the dedicated Subtasks panel: null shows the list, a target opens its live split thread. */
  subtask: SubtaskTarget | null;
};

export const taskFileTabId = (tree: string, path: string, changes: boolean) =>
  `${changes ? "cambios" : "archivo"}\u0000${tree}\u0000${path}`;

/** True when the right pane should occupy a proportional split width (file viewer tabs or live subtask thread). */
export const taskSideUsesSplitWidth = (panel: Pick<TaskFilesPanel, "mode" | "tabs" | "subtask">) =>
  (panel.mode === "files" && panel.tabs.length > 0) || (panel.mode === "delegated" && panel.subtask !== null);

const emptyPanel = (): TaskFilesPanel => ({
  open: false, expanded: false, tree: true, side: "files", mode: "files", tabs: [], active: null, dirty: [], subtask: null,
});

/** Per-task state of the right-side panels, in memory; only the widths persist (`lib/prefs.ts`). */
export function createTaskFiles() {
  const [panels, setPanels] = createStore<Record<string, TaskFilesPanel>>({});
  const panel = (task: string): TaskFilesPanel => panels[task] ?? emptyPanel();
  const edit = (task: string, change: (p: TaskFilesPanel) => void) =>
    setPanels(produce((all) => {
      all[task] ??= emptyPanel();
      change(all[task]);
    }));

  /** Opens `mode`, or closes the side pane when that mode is already showing. Independent panel states are preserved. */
  const present = (task: string, mode: TaskSideMode) => edit(task, (p) => {
    if (p.open && p.mode === mode) {
      p.open = false;
      p.expanded = false;
      return;
    }
    p.open = true;
    p.mode = mode;
    if (mode !== "files") p.expanded = false;
  });

  return {
    panel,
    setOpen: (task: string, open: boolean) => edit(task, (p) => {
      p.open = open;
      if (!open) p.expanded = false;
      else p.mode = "files";
    }),
    present,
    toggle: (task: string) => present(task, "files"),
    openSubtask: (task: string, target: SubtaskTarget) => edit(task, (p) => {
      p.open = true;
      p.mode = "delegated";
      p.expanded = false;
      p.subtask = { project: target.project, session: target.session };
    }),
    showSubtaskList: (task: string) => edit(task, (p) => {
      p.open = true;
      p.mode = "delegated";
      p.expanded = false;
      p.subtask = null;
    }),
    clearSubtask: (task: string) => edit(task, (p) => {
      p.subtask = null;
    }),
    activeSubtasks: () => Object.values(panels)
      .filter((p) => p.open && p.mode === "delegated" && p.subtask !== null)
      .map((p) => p.subtask!.session),
    setExpanded: (task: string, expanded: boolean) => edit(task, (p) => { p.expanded = expanded && p.mode === "files" && p.tabs.length > 0; }),
    setTree: (task: string, tree: boolean) => edit(task, (p) => { p.tree = tree || p.tabs.length === 0; }),
    setSide: (task: string, side: TaskFilesSide) => edit(task, (p) => { p.side = side; p.tree = true; }),
    open: (task: string, file: { tree: string; path: string; changes: boolean; changed?: boolean; pinned?: boolean }) => edit(task, (p) => {
      p.open = true;
      p.mode = "files";
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
