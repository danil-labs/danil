import { createResource, type Accessor } from "solid-js";
import type { MachineConnection } from "@danil/engine-client";

export interface TreeQueryContext {
  project?: string;
  session?: string;
  tree?: string;
}

export interface TreeItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: string;
  gitStatus?: "modified" | "added" | "deleted" | "untracked" | "ignored" | null;
}

export interface TreeResult {
  path: string;
  items: TreeItem[];
}

export function useTree(
  conn: Accessor<MachineConnection | null | undefined> | MachineConnection | null | undefined,
  path: Accessor<string> | string,
  context?: Accessor<TreeQueryContext | undefined> | TreeQueryContext,
) {
  const getConn = () => (typeof conn === "function" ? (conn as Accessor<MachineConnection | null | undefined>)() : conn);
  const getPath = () => (typeof path === "function" ? (path as Accessor<string>)() : path);
  const getContext = () => (typeof context === "function" ? (context as Accessor<TreeQueryContext | undefined>)() : context);

  const source = () => {
    const c = getConn();
    if (!c?.client) return null;
    const p = getPath();
    const ctx = getContext() || {};
    return {
      client: c.client,
      project: ctx.project ?? "",
      session: ctx.session ?? "",
      tree: ctx.tree ?? "",
      path: p,
    };
  };

  const [data, { refetch }] = createResource(source, async (src) => {
    const { client, project, session, tree, path: itemPath } = src;

    let rawItems: unknown;
    if (!itemPath || itemPath === "" || itemPath === ".") {
      rawItems = await client.tree_files({ project, session, tree });
    } else {
      rawItems = await client.tree_folder({ project, session, tree, path: itemPath, offset: 0 });
    }

    let gitStatuses: unknown[] = [];
    try {
      gitStatuses = await client.tree_git_status({ project, session, tree });
    } catch {
      // Sin git status disponible
    }

    const statusMap = new Map<string, "modified" | "added" | "deleted" | "untracked" | "ignored">();
    if (Array.isArray(gitStatuses)) {
      for (const st of gitStatuses) {
        if (st && typeof st === "object" && "path" in st && "status" in st) {
          const s = st as { path: string; status: string };
          statusMap.set(s.path, s.status as any);
        }
      }
    }

    const items: TreeItem[] = [];
    const list = Array.isArray(rawItems)
      ? rawItems
      : rawItems && typeof rawItems === "object" && "items" in rawItems && Array.isArray((rawItems as any).items)
        ? (rawItems as any).items
        : [];

    for (const raw of list) {
      if (typeof raw === "string") {
        const itemP = itemPath ? `${itemPath}/${raw}` : raw;
        items.push({
          name: raw,
          path: itemP,
          isDirectory: false,
          gitStatus: statusMap.get(itemP) ?? null,
        });
      } else if (raw && typeof raw === "object") {
        const r = raw as Record<string, any>;
        const name = r.name ?? r.path ?? "";
        const itemP = r.path ?? (itemPath ? `${itemPath}/${name}` : name);
        items.push({
          name,
          path: itemP,
          isDirectory: Boolean(r.isDirectory ?? r.is_directory ?? (r.kind === "dir" || r.kind === "directory")),
          size: typeof r.size === "number" ? r.size : undefined,
          modifiedAt: r.modifiedAt ?? r.modified_at,
          gitStatus: statusMap.get(itemP) ?? (r.gitStatus ?? r.git_status ?? null),
        });
      }
    }

    return {
      path: itemPath,
      items,
    };
  });

  return {
    data,
    refetch,
    loading: () => data.loading,
    error: () => data.error,
  };
}
