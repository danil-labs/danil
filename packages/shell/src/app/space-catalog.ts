import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import { arrangeSpaces } from "@terminus/computers/space-order";
import { displayWorkspaceContext } from "../../../session/src/workspace-context.ts";
import type { Space } from "../../../ui/src/lib/spaces.ts";
import { workspaceSpacesForEngine, type WorkspaceSpace, type WorkspaceSpaceCatalog, type WorkspaceSpaceEdit } from "../../../platform-client/src/workspace-spaces.ts";
import { sessionRailState } from "../shell/session-groups.ts";

type Client = NonNullable<Awaited<ReturnType<typeof workspaceSpacesForEngine>>>;
type Ready = { client: Client; catalog: WorkspaceSpaceCatalog };
type OrderFallback = { saving: Accessor<boolean>; arrange<T extends { id: string }>(items: readonly T[]): T[]; save(ids: string[]): Promise<void> | void };

const ENGINE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function bareSpaceId(id: string): string | null {
  const index = id.indexOf("~");
  const bare = index >= 0 ? id.slice(index + 1) : id;
  return ENGINE_ID.test(bare) ? bare : null;
}

function toCatalogSpace(row: Space): WorkspaceSpace | null {
  const id = bareSpaceId(row.id);
  if (!id) return null;
  const folders = row.folders.filter(folder => ENGINE_ID.test(folder)).slice(0, 500);
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 100) : null;
  return { id, name, folders };
}

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | null)?.status;
}

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
  const [savingOrder, setSavingOrder] = createSignal(false);
  const value = () => {
    const last = ready();
    return last?.scope === scope() ? last?.value : undefined;
  };
  let generation = 0;
  let forbiddenScope: ReturnType<typeof scope> = null;
  let lastImportKey = "";
  let syncing = false;

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

  createEffect(() => {
    scope();
    lastImportKey = "";
    setPendingOrder(null);
    void refresh();
  });
  const timer = setInterval(() => { if (document.visibilityState !== "hidden") void refresh(); }, 15_000);
  const onFocus = () => { void refresh(); };
  window.addEventListener("focus", onFocus);
  onCleanup(() => { generation++; clearInterval(timer); window.removeEventListener("focus", onFocus); });

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

  async function sync(rows: readonly Space[]) {
    const selected = scope();
    const current = value();
    if (!selected || !current || syncing || forbiddenScope === selected) return;
    const known = new Set(current.catalog.spaces.map(item => item.id));
    const missing: WorkspaceSpace[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const entry = toCatalogSpace(row);
      if (!entry || known.has(entry.id) || seen.has(entry.id)) continue;
      seen.add(entry.id);
      missing.push(entry);
    }
    if (!missing.length) return;
    const key = `${selected.context}:${selected.id}:${current.catalog.version}:${missing.map(m => m.id).sort().join(",")}`;
    if (key === lastImportKey) return;
    lastImportKey = key;
    syncing = true;
    try {
      const beforeVersion = current.catalog.version;
      const updated = await mutateWithRetry(catalog => {
        const present = new Set(catalog.spaces.map(item => item.id));
        const pending = missing.filter(item => !present.has(item.id));
        return pending.length ? { kind: "import", spaces: pending } : null;
      });
      if (updated && updated.version > beforeVersion && selected === scope()) onSynced?.();
    } catch (error) {
      if (statusOf(error) === 403) forbiddenScope = selected;
    } finally {
      syncing = false;
    }
  }

  async function create(space: Space) {
    const entry = toCatalogSpace(space);
    if (!entry) return;
    try {
      await mutateWithRetry(catalog =>
        catalog.spaces.some(item => item.id === entry.id) ? null : { kind: "import", spaces: [entry] },
      );
    } catch {
      // Si la cuenta no admite escritura o está sin red, el espacio local sigue vivo.
    }
  }

  async function rename(id: string, name: string): Promise<boolean> {
    const bare = bareSpaceId(id);
    if (!bare || !value()?.catalog.spaces.some(item => item.id === bare)) return false;
    await mutateWithRetry(catalog =>
      catalog.spaces.some(item => item.id === bare) ? { kind: "rename", id: bare, name } : null,
    );
    return true;
  }

  async function remove(id: string) {
    const bare = bareSpaceId(id);
    if (!bare || !value()?.catalog.spaces.some(item => item.id === bare)) return;
    try {
      await mutateWithRetry(catalog =>
        catalog.spaces.some(item => item.id === bare) ? { kind: "delete", id: bare } : null,
      );
    } catch {
      // Un 404/422 o falta de red no revierte el borrado local ya confirmado.
    }
  }

  function project(rows: Space[]): Space[] {
    const catalog = value()?.catalog;
    if (!catalog?.spaces.length) return rows;
    const result = new Map<string, Space>();
    for (const row of rows) {
      const bare = bareSpaceId(row.id);
      if (bare && catalog.spaces.some(space => space.id === bare)) {
        if (!result.has(bare)) result.set(bare, { ...row, id: bare, account: true });
      } else {
        result.set(row.id, row);
      }
    }
    for (const space of catalog.spaces) {
      const row = result.get(space.id);
      result.set(space.id, { created_at: 0, updated_at: 0, folders: [], ...row, id: space.id, name: space.name, account: true });
    }
    return [...result.values()];
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
        const ordered = ids.map(bareSpaceId).filter((id): id is string => !!id && remaining.delete(id));
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
    sync,
    create,
    rename,
    remove,
    project,
    arrange,
    saveOrder,
    saving: (fallback: OrderFallback) => savingOrder() || fallback.saving(),
  };
}
