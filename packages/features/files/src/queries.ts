import { createResource, createSignal, type Accessor } from "solid-js";
import type { MachineConnection } from "@danil/engine-client";
import {
  LARGE_FILE_THRESHOLD_BYTES,
  type FileContentView,
  type FileNodeView,
  type GitStatusKind,
  type TreeContext,
} from "./model.ts";

export interface TreeResult {
  path: string;
  items: FileNodeView[];
}

export function useTree(
  conn: Accessor<MachineConnection | null | undefined> | MachineConnection | null | undefined,
  path: Accessor<string> | string,
  context?: Accessor<TreeContext | undefined> | TreeContext,
) {
  const getConn = () => (typeof conn === "function" ? (conn as Accessor<MachineConnection | null | undefined>)() : conn);
  const getPath = () => (typeof path === "function" ? (path as Accessor<string>)() : path);
  const getContext = () => (typeof context === "function" ? (context as Accessor<TreeContext | undefined>)() : context);

  const source = () => {
    const c = getConn();
    if (!c?.client) return null;
    const p = getPath();
    const ctx = getContext() || {};
    return {
      client: c.client,
      project: ctx.project ?? "",
      session: ctx.sessionId ?? "",
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
      // Árbol sin soporte git o fallo no bloqueante de status
    }

    const statusMap = new Map<string, GitStatusKind>();
    if (Array.isArray(gitStatuses)) {
      for (const st of gitStatuses) {
        if (st && typeof st === "object" && "path" in st && "status" in st) {
          const s = st as { path: string; status: string };
          statusMap.set(s.path, s.status as GitStatusKind);
        }
      }
    }

    const items: FileNodeView[] = [];
    const list = Array.isArray(rawItems)
      ? rawItems
      : rawItems && typeof rawItems === "object" && "items" in rawItems && Array.isArray((rawItems as Record<string, unknown>).items)
        ? ((rawItems as Record<string, unknown>).items as unknown[])
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
        const r = raw as Record<string, unknown>;
        const name = String(r.name ?? r.path ?? "");
        const itemP = String(r.path ?? (itemPath ? `${itemPath}/${name}` : name));
        const isDir = Boolean(r.isDirectory ?? r.is_directory ?? (r.kind === "dir" || r.kind === "directory"));
        const size = typeof r.size === "number" ? r.size : undefined;
        const modifiedAt = typeof r.modifiedAt === "string" ? r.modifiedAt : typeof r.modified_at === "string" ? r.modified_at : undefined;
        const rawStatus = (r.gitStatus ?? r.git_status ?? statusMap.get(itemP) ?? null) as GitStatusKind | null;

        items.push({
          name,
          path: itemP,
          isDirectory: isDir,
          size,
          modifiedAt,
          gitStatus: statusMap.get(itemP) ?? rawStatus,
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

export interface UseFileContentOptions {
  allowLargeFile?: boolean;
}

export function useFileContent(
  conn: Accessor<MachineConnection | null | undefined> | MachineConnection | null | undefined,
  path: Accessor<string | null | undefined> | string | null | undefined,
  context?: Accessor<TreeContext | undefined> | TreeContext,
  options?: Accessor<UseFileContentOptions | undefined> | UseFileContentOptions,
) {
  const getConn = () => (typeof conn === "function" ? (conn as Accessor<MachineConnection | null | undefined>)() : conn);
  const getPath = () => (typeof path === "function" ? (path as Accessor<string | null | undefined>)() : path);
  const getContext = () => (typeof context === "function" ? (context as Accessor<TreeContext | undefined>)() : context);
  const getOptions = () => (typeof options === "function" ? (options as Accessor<UseFileContentOptions | undefined>)() : options);

  const source = () => {
    const c = getConn();
    const p = getPath();
    if (!c?.client || !p) return null;
    const ctx = getContext() || {};
    const opts = getOptions() || {};
    return {
      client: c.client,
      project: ctx.project ?? "",
      session: ctx.sessionId ?? "",
      tree: ctx.tree ?? "",
      path: p,
      allowLargeFile: opts.allowLargeFile ?? false,
    };
  };

  const [data, { refetch }] = createResource(source, async (src) => {
    const { client, project, session, tree, path: filePath, allowLargeFile } = src;

    const raw = await client.tree_show({
      project,
      session,
      tree,
      path: filePath,
    });

    const parsed = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const bytes = typeof parsed.bytes === "number" ? parsed.bytes : 0;
    const isLarge = bytes > LARGE_FILE_THRESHOLD_BYTES;

    // B-019: Protección contra bloqueo por archivos > 5 MB
    let text = typeof parsed.text === "string" ? parsed.text : "";
    let truncated = Boolean(parsed.truncated);

    if (isLarge && !allowLargeFile) {
      truncated = true;
      if (text.length > 64 * 1024) {
        text = text.slice(0, 64 * 1024);
      }
    }

    const content: FileContentView = {
      kind: typeof parsed.kind === "string" ? parsed.kind : "text",
      text,
      dataUrl: typeof parsed.data_url === "string" ? parsed.data_url : null,
      pdf: typeof parsed.pdf === "string" ? parsed.pdf : null,
      bytes,
      truncated,
      isLargeFile: isLarge,
    };

    return content;
  });

  return {
    data,
    refetch,
    loading: () => data.loading,
    error: () => data.error,
  };
}

export function useFileDiff(
  conn: Accessor<MachineConnection | null | undefined> | MachineConnection | null | undefined,
  path: Accessor<string | null | undefined> | string | null | undefined,
  context?: Accessor<TreeContext | undefined> | TreeContext,
) {
  const getConn = () => (typeof conn === "function" ? (conn as Accessor<MachineConnection | null | undefined>)() : conn);
  const getPath = () => (typeof path === "function" ? (path as Accessor<string | null | undefined>)() : path);
  const getContext = () => (typeof context === "function" ? (context as Accessor<TreeContext | undefined>)() : context);

  const source = () => {
    const c = getConn();
    const p = getPath();
    if (!c?.client || !p) return null;
    const ctx = getContext() || {};
    return {
      client: c.client,
      project: ctx.project ?? "",
      session: ctx.sessionId ?? "",
      tree: ctx.tree ?? "",
      path: p,
    };
  };

  const [diff, { refetch }] = createResource(source, async (src) => {
    const { client, project, session, tree, path: filePath } = src;
    const patch = await client.tree_patch({
      project,
      session,
      tree,
      path: filePath,
    });
    return typeof patch === "string" ? patch : "";
  });

  return {
    diff,
    refetch,
    loading: () => diff.loading,
    error: () => diff.error,
  };
}

export function useWriteFile(
  conn: Accessor<MachineConnection | null | undefined> | MachineConnection | null | undefined,
) {
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<unknown | null>(null);

  const save = async (params: {
    path: string;
    text: string;
    project?: string;
    sessionId?: string;
    tree?: string;
  }): Promise<boolean> => {
    const c = typeof conn === "function" ? conn() : conn;
    if (!c?.client) return false;
    setSaving(true);
    setError(null);
    try {
      await c.client.tree_write({
        project: params.project ?? "",
        session: params.sessionId ?? "",
        tree: params.tree ?? "",
        path: params.path,
        text: params.text,
      });
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    save,
    saving,
    error,
  };
}
