import { createEffect, createMemo, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { arrangeSpaces } from "../../../platform-client/src/space-order.ts";
import { displayWorkspaceContext } from "../../../../apps/desktop/src/lib/workspace-context.ts";
import type { Space } from "../../../../apps/desktop/src/lib/spaces.ts";
import { workspaceSpacesForEngine, type WorkspaceSpaceCatalog, type WorkspaceSpaceEdit } from "../../../platform-client/src/workspace-spaces.ts";
import { sessionRailState } from "../shell/session-groups.ts";
import {
  buildInitialSeed, buildTaskSpacesBackfill, buildTaskSpacesBackfillEdit,
  canonicalRef, cleanFolders, projectCatalogSessions, projectCatalogSpaces, statusOf, type SessionLike,
} from "./space-catalog-projection.ts";

export { buildInitialSeed, buildTaskSpacesBackfill, buildTaskSpacesBackfillEdit, canonicalRef, projectCatalogSessions, projectCatalogSpaces };

const BACKFILL_DEBOUNCE_MS = 400;

type Client = NonNullable<Awaited<ReturnType<typeof workspaceSpacesForEngine>>>;
type Ready = { client: Client; catalog: WorkspaceSpaceCatalog };
type OrderFallback = { saving: Accessor<boolean>; arrange<T extends { id: string }>(items: readonly T[]): T[]; save(ids: string[]): Promise<void> | void };

export function createSpaceCatalog(
  workspace: Accessor<string | null>,
  onSynced?: () => void,
  onOrderFailure?: () => void,
) {
  const scope = createMemo(() => {
    const context = displayWorkspaceContext();
    const rail = sessionRailState();
    const group = rail?.groups()?.find(item => item.context_id === context);
    const id = workspace();
    return context && id && group && rail ? { context, org: group.org, id, send: rail.sessions.send } : null;
  }, null, { equals: (a, b) => a?.context === b?.context && a?.org === b?.org && a?.id === b?.id && a?.send === b?.send });

  const [ready, setReady] = createSignal<{ scope: ReturnType<typeof scope>; value: Ready }>();
  const [pendingOrder, setPendingOrder] = createSignal<{ scope: ReturnType<typeof scope>; ids: string[] } | null>(null);
  const [pendingTasks, setPendingTasks] = createSignal<{ scope: ReturnType<typeof scope>; map: Record<string, string | null> } | null>(null);
  const [savingOrder, setSavingOrder] = createSignal(false);
  const value = () => {
    const last = ready();
    return last?.scope === scope() ? last?.value : undefined;
  };
  const activePendingTasks = () => {
    const entry = pendingTasks();
    return entry && entry.scope === scope() ? entry.map : {};
  };
  let generation = 0;
  let forbiddenScope: ReturnType<typeof scope> = null;
  let lastImportKey = "";
  let syncing = false;
  const attemptedBackfill = new Set<string>();
  let backfillTimer: ReturnType<typeof setTimeout> | null = null;
  let backfilling = false;
  let latestBackfillSessions: Record<string, readonly SessionLike[]> | null = null;
  const clearBackfillTimer = () => {
    if (backfillTimer !== null) { clearTimeout(backfillTimer); backfillTimer = null; }
  };

  const refresh = async (): Promise<Ready | undefined> => {
    const selected = scope();
    const request = ++generation;
    if (!selected) return undefined;
    try {
      const client = value()?.client ?? await workspaceSpacesForEngine(selected.send, selected.context, selected.org, selected.id);
      if (!client) return undefined;
      const catalog = await client.read();
      if (scope() === selected && generation === request) {
        const next = { client, catalog };
        setReady({ scope: selected, value: next });
        return next;
      }
      return value();
    } catch {
      // Si la cuenta queda sin red, la última copia sigue disponible.
      return value();
    }
  };

  createEffect(on(scope, () => {
    lastImportKey = "";
    attemptedBackfill.clear();
    latestBackfillSessions = null;
    clearBackfillTimer();
    setPendingOrder(null);
    setPendingTasks(null);
    void refresh();
  }));
  const timer = setInterval(() => { if (document.visibilityState !== "hidden") void refresh(); }, 15_000);
  const onFocus = () => { void refresh(); };
  window.addEventListener("focus", onFocus);
  onCleanup(() => { generation++; clearInterval(timer); clearBackfillTimer(); window.removeEventListener("focus", onFocus); });

  async function commit(edit: WorkspaceSpaceEdit, base: Ready, selected: NonNullable<ReturnType<typeof scope>>): Promise<WorkspaceSpaceCatalog> {
    const request = ++generation;
    const catalog = await base.client.update(base.catalog.version, edit);
    if (selected === scope() && request === generation) {
      setReady({ scope: selected, value: { ...base, catalog } });
    }
    return catalog;
  }

  async function mutateWithRetry(build: (current: WorkspaceSpaceCatalog) => WorkspaceSpaceEdit | null): Promise<WorkspaceSpaceCatalog | null> {
    const selected = scope();
    if (!selected) return null;
    let current = value() ?? await refresh();
    if (!current || selected !== scope()) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const edit = build(current.catalog);
      if (!edit) return current.catalog;
      try {
        return await commit(edit, current, selected);
      } catch (error) {
        if (statusOf(error) === 409 && attempt === 0) {
          current = await refresh();
          if (!current || selected !== scope()) return null;
          continue;
        }
        throw error;
      }
    }
    return current.catalog;
  }

  /** Siembra única (solo cuando el usuario aún está en version 0 sin spaces en el servicio). */
  async function sync(rows: readonly Space[], sesiones: Record<string, readonly SessionLike[]> = {}) {
    const selected = scope();
    const current = value();
    if (!selected || !current || syncing || forbiddenScope === selected) return;
    if (current.catalog.version > 0 || current.catalog.spaces.length > 0) return;
    const seed = buildInitialSeed(rows, sesiones);
    if (!seed) return;
    const key = `${selected.context}:${selected.id}:${seed.spaces.map(m => m.id).sort().join(",")}`;
    if (key === lastImportKey) return;
    lastImportKey = key;
    syncing = true;
    try {
      const updated = await mutateWithRetry(catalog =>
        catalog.version === 0 && catalog.spaces.length === 0
          ? { kind: "import", spaces: seed.spaces, task_spaces: seed.task_spaces }
          : null,
      );
      if (updated && updated.version > 0 && selected === scope()) onSynced?.();
    } catch (error) {
      if (statusOf(error) === 403) forbiddenScope = selected;
    } finally {
      syncing = false;
    }
  }

  async function flushBackfill() {
    const selected = scope();
    const current = value();
    const sesiones = latestBackfillSessions;
    if (!selected || !current || !sesiones || syncing || backfilling || forbiddenScope === selected || current.catalog.spaces.length === 0) return;
    latestBackfillSessions = null;
    backfilling = true;
    let sentKeys: string[] = [];
    try {
      await mutateWithRetry(catalog => {
        const edit = buildTaskSpacesBackfillEdit(catalog, activePendingTasks(), sesiones, attemptedBackfill, selected.id);
        sentKeys = edit?.kind === "import" && edit.task_spaces ? Object.keys(edit.task_spaces) : [];
        return edit;
      });
    } catch (error) {
      if (statusOf(error) === 403) forbiddenScope = selected;
    } finally {
      if (scope() === selected) { for (const key of sentKeys) attemptedBackfill.add(key); }
      backfilling = false;
      if (latestBackfillSessions && scope() === selected && forbiddenScope !== selected) {
        scheduleBackfill(latestBackfillSessions);
      }
    }
  }

  /** Programa un backfill idempotente (con debounce) de `task_spaces` faltantes hacia `workspaces`. */
  function scheduleBackfill(sesiones: Record<string, readonly SessionLike[]>) {
    const selected = scope();
    const current = value();
    if (!selected || !current || syncing || forbiddenScope === selected || current.catalog.spaces.length === 0) return;
    if (!buildTaskSpacesBackfill(current.catalog, activePendingTasks(), sesiones, attemptedBackfill, selected.id)) return;
    latestBackfillSessions = sesiones;
    if (backfilling) return;
    clearBackfillTimer();
    backfillTimer = setTimeout(() => { backfillTimer = null; void flushBackfill(); }, BACKFILL_DEBOUNCE_MS);
  }

  async function createSpace(name: string, folders: string[], seedRows: readonly Space[] = []): Promise<Space | null> {
    const selected = scope();
    const current = value();
    if (!selected || !current) return null;
    if (current.catalog.version === 0 && current.catalog.spaces.length === 0 && seedRows.length > 0) {
      const seed = buildInitialSeed(seedRows, {});
      if (seed) {
        await mutateWithRetry(catalog =>
          catalog.version === 0 && catalog.spaces.length === 0
            ? { kind: "import", spaces: seed.spaces }
            : null,
        );
      }
    }
    const beforeIds = new Set((value()?.catalog.spaces ?? []).map(item => item.id));
    const trimmed = name.trim();
    const updated = await mutateWithRetry(() => ({
      kind: "create",
      name: trimmed ? trimmed.slice(0, 100) : null,
      folders: cleanFolders(folders),
    }));
    if (!updated) return null;
    const created = updated.spaces.find(item => !beforeIds.has(item.id)) ?? updated.spaces.at(-1);
    return created
      ? { id: created.id, name: created.name, folders: [...created.folders], created_at: 0, updated_at: 0, account: true }
      : null;
  }

  async function rename(id: string, name: string): Promise<boolean> {
    const bare = canonicalRef(id);
    if (!bare || !value()) return false;
    await mutateWithRetry(catalog =>
      catalog.spaces.some(item => item.id === bare) ? { kind: "rename", id: bare, name } : null,
    );
    return true;
  }

  async function setFolders(id: string, folders: string[]): Promise<boolean> {
    const bare = canonicalRef(id);
    if (!bare || !value()) return false;
    const nextFolders = cleanFolders(folders);
    await mutateWithRetry(catalog =>
      catalog.spaces.some(item => item.id === bare) ? { kind: "set_folders", id: bare, folders: nextFolders } : null,
    );
    return true;
  }

  async function addFolder(id: string, folder: string): Promise<boolean> {
    const bare = canonicalRef(id);
    const bareFolder = canonicalRef(folder);
    if (!bare || !bareFolder || !value()) return false;
    await mutateWithRetry(catalog => {
      const target = catalog.spaces.find(item => item.id === bare);
      if (!target || target.folders.includes(bareFolder)) return null;
      return { kind: "set_folders", id: bare, folders: [...target.folders, bareFolder] };
    });
    return true;
  }

  async function remove(id: string): Promise<{ ungrouped: number } | null> {
    const bare = canonicalRef(id);
    const current = value();
    if (!bare || !current) return null;
    const ungrouped = Object.values(current.catalog.task_spaces).filter(spaceId => spaceId === bare).length;
    await mutateWithRetry(catalog =>
      catalog.spaces.some(item => item.id === bare) ? { kind: "delete", id: bare } : null,
    );
    return { ungrouped };
  }

  async function assignTask(taskId: string, spaceId: string | null): Promise<boolean> {
    const selected = scope();
    const current = value();
    const taskRef = canonicalRef(taskId);
    if (!selected || !current || !taskRef) return false;
    const bareSpace = spaceId ? canonicalRef(spaceId) : null;
    if (spaceId && !bareSpace) return false;
    setPendingTasks(prev => ({
      scope: selected,
      map: { ...(prev?.scope === selected ? prev.map : {}), [taskRef]: bareSpace },
    }));
    const request = ++generation;
    try {
      const catalog = await current.client.assignTask(taskRef, bareSpace);
      if (scope() === selected && generation === request) {
        setReady({ scope: selected, value: { ...current, catalog } });
      }
      return true;
    } finally {
      setPendingTasks(prev => {
        if (!prev || prev.scope !== selected || !(taskRef in prev.map)) return prev;
        const { [taskRef]: _, ...rest } = prev.map;
        return Object.keys(rest).length ? { scope: selected, map: rest } : null;
      });
    }
  }

  function taskCreation(requested: string | null | undefined) {
    const current = value();
    if (!current || current.catalog.spaces.length === 0) {
      return { engineSpace: requested ?? null, record: (_taskId: string) => {} };
    }
    const bare = canonicalRef(requested);
    const target = bare && current.catalog.spaces.some(item => item.id === bare) ? bare : null;
    return {
      engineSpace: null,
      record: (taskId: string) => {
        if (target) void assignTask(taskId, target).catch(() => {});
      },
    };
  }

  function project(rows: Space[]): Space[] {
    return projectCatalogSpaces(value()?.catalog, rows);
  }

  function projectSessions<T extends SessionLike>(sesiones: Record<string, T[]>): Record<string, T[]> {
    return projectCatalogSessions(value()?.catalog, activePendingTasks(), sesiones);
  }

  function arrange(rows: Space[], fallback: OrderFallback): Space[] {
    const projected = project(rows);
    const selected = scope();
    const pending = pendingOrder();
    const optimistic = pending && pending.scope === selected ? pending.ids : null;
    const catalog = value()?.catalog;
    const ids = optimistic ?? (catalog?.order.length ? catalog.order : null);
    if (!ids) return fallback.arrange(projected);
    return arrangeSpaces(projected, ids);
  }

  async function saveOrder(ids: string[], fallback: OrderFallback) {
    const selected = scope();
    const catalog = value()?.catalog;
    if (!selected || !catalog?.order.length) {
      await fallback.save(ids);
      return;
    }
    if (savingOrder()) return;
    setSavingOrder(true);
    setPendingOrder({ scope: selected, ids });
    try {
      await mutateWithRetry(current => {
        const remaining = new Set(current.order);
        const ordered = ids.map(canonicalRef).filter((id): id is string => !!id && remaining.delete(id));
        if (!ordered.length) return null;
        return { kind: "reorder", order: [...ordered, ...remaining] };
      });
    } catch {
      if (scope() === selected) onOrderFailure?.();
    } finally {
      setPendingOrder(null);
      setSavingOrder(false);
    }
  }

  return {
    catalog: () => value()?.catalog,
    isManaged: () => !!value(),
    sync,
    scheduleBackfill,
    createSpace,
    rename,
    setFolders,
    addFolder,
    remove,
    assignTask,
    taskCreation,
    project,
    projectSessions,
    arrange,
    saveOrder,
    saving: (fallback: OrderFallback) => savingOrder() || fallback.saving(),
  };
}
