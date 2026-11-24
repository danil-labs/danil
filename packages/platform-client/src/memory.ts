/**
 * La memoria versionada de un workspace en el plano de control (computers,
 * `docs/protocol.md` § «Memoria del workspace»): un repo git por workspace en
 * Cloudflare Artifacts, que la web, el teléfono y la ventana leen y escriben
 * por el Worker aunque todas las máquinas estén apagadas. No pasa por el relay
 * ni por la flota.
 *
 * Las rutas del repo son las de la carpeta del workspace en el motor:
 * `memory/<f>.md`, `projects/<p>/memory/<f>.md`, `agents/<n>/memory/<f>.md` y
 * `projects/<p>/agents/<n>/memory/<f>.md`.
 *
 * Sin APIs del DOM: `fetch` se inyecta (navegador, React Native, Node).
 */
import { bearerCall, errorCodeOf } from "./api.ts";

export type MemoryAuthor = { name: string; email: string };
export type MemoryCommit = { commit: string; message: string; author: MemoryAuthor; at: string };
/** Una versión de una entrada: `oid` null donde se borró. */
export type MemoryVersion = MemoryCommit & { oid: string | null };
export type MemoryFileRef = { path: string; oid: string };
export type MemoryFile = { path: string; ref: string; oid: string; content: string };
export type MemoryWrite = {
  status: "written" | "deleted";
  commit: string | null;
  path: string;
  /** Dónde quedó la versión que pisó esta escritura, si había conflicto. */
  conflict_copy?: string | null;
  /** `false` si el texto era el mismo: sin commit. */
  changed?: boolean;
};

/**
 * La respuesta de una ruta de memoria. Además de las de siempre: `conflict`
 * (un borrado contra una versión que ya cambió; trae el blob actual) y `busy`
 * (el push no entró tras varios intentos: vuelve a intentar en un momento).
 */
export type MemoryAnswer<T> =
  | { kind: "ok"; value: T }
  | { kind: "conflict"; current: string | null }
  | { kind: "busy" }
  | { kind: "disabled" }
  | { kind: "invalid" }
  | { kind: "unauthorized" }
  | { kind: "license" }
  | { kind: "missing" }
  | { kind: "error"; status: number | null };

/** `fetch` con cuerpo: lo mínimo que usan las escrituras. */
export type MemoryFetch = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;

/** Cómo llegar al Worker con la cuenta del workspace: el JWT en la web y el teléfono, el token de cliente en la ventana. */
export type MemorySource = { endpoint: string; getToken: () => Promise<string>; fetch?: MemoryFetch };

async function call<T>(
  source: MemorySource,
  method: string,
  path: string,
  read: (body: unknown) => T,
  body?: unknown,
): Promise<MemoryAnswer<T>> {
  const response = await bearerCall(source, method, path, body);
  if (!response) return { kind: "error", status: null };
  const { json } = response;
  const code = errorCodeOf(json);
  if (response.status === 409 && code === "memory_conflict") {
    const current = (json as { current?: unknown }).current;
    return { kind: "conflict", current: typeof current === "string" ? current : null };
  }
  if (response.status === 503) return code === "memory_disabled" ? { kind: "disabled" } : { kind: "busy" };
  if (response.status === 400) return { kind: "invalid" };
  if (response.status === 401) return { kind: "unauthorized" };
  if (response.status === 403) return { kind: "license" };
  if (response.status === 404) return { kind: "missing" };
  if (!response.ok) return { kind: "error", status: response.status };
  try {
    return { kind: "ok", value: read(json) };
  } catch {
    return { kind: "error", status: response.status };
  }
}

const routeOf = (workspace: string) => `/v1/workspaces/${encodeURIComponent(workspace)}/memory`;
const q = (params: Record<string, string | number | null | undefined>) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
};
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";

function commitOf(raw: unknown): MemoryCommit {
  if (!isObj(raw) || typeof raw.commit !== "string") throw new Error("bad_commit");
  const a = isObj(raw.author) ? raw.author : {};
  return {
    commit: raw.commit,
    message: typeof raw.message === "string" ? raw.message : "",
    author: { name: typeof a.name === "string" ? a.name : "", email: typeof a.email === "string" ? a.email : "" },
    at: typeof raw.at === "string" ? raw.at : "",
  };
}

/** Las entradas de `ref` (por omisión `main`). `commit` null: el workspace aún no tiene memoria en la cuenta. */
export function memoryFiles(source: MemorySource, workspace: string, ref?: string) {
  return call(source, "GET", `${routeOf(workspace)}/files${q({ ref })}`, (body) => {
    if (!isObj(body) || !Array.isArray(body.files)) throw new Error("bad_files");
    const files = body.files.filter((f): f is MemoryFileRef => isObj(f) && typeof f.path === "string" && typeof f.oid === "string");
    return { commit: typeof body.commit === "string" ? body.commit : null, files };
  });
}

export function readMemoryFile(source: MemorySource, workspace: string, path: string, ref?: string) {
  return call(source, "GET", `${routeOf(workspace)}/file${q({ path, ref })}`, (body) => {
    if (!isObj(body) || typeof body.content !== "string" || typeof body.oid !== "string") throw new Error("bad_file");
    return { path, ref: typeof body.ref === "string" ? body.ref : (ref ?? "main"), oid: body.oid, content: body.content } satisfies MemoryFile;
  });
}

/** Las versiones de una entrada, de la más nueva a la más vieja. */
export function memoryHistory(source: MemorySource, workspace: string, path: string, limit?: number) {
  return call(source, "GET", `${routeOf(workspace)}/history${q({ path, limit })}`, (body) => {
    if (!isObj(body) || !Array.isArray(body.versions)) throw new Error("bad_history");
    return body.versions.map((v) => ({ ...commitOf(v), oid: isObj(v) && typeof v.oid === "string" ? v.oid : null }) satisfies MemoryVersion);
  });
}

export function memoryLog(source: MemorySource, workspace: string, limit?: number) {
  return call(source, "GET", `${routeOf(workspace)}/log${q({ limit })}`, (body) => {
    if (!isObj(body) || !Array.isArray(body.commits)) throw new Error("bad_log");
    return body.commits.map(commitOf);
  });
}

function writeOf(body: unknown): MemoryWrite {
  if (!isObj(body) || (body.status !== "written" && body.status !== "deleted") || typeof body.path !== "string") throw new Error("bad_write");
  return {
    status: body.status,
    commit: typeof body.commit === "string" ? body.commit : null,
    path: body.path,
    conflict_copy: typeof body.conflict_copy === "string" ? body.conflict_copy : null,
    changed: body.changed !== false,
  };
}

/** Escribe una entrada. `base`: el `oid` que se leyó, o null si es nueva. */
export function writeMemoryFile(source: MemorySource, workspace: string, path: string, content: string, base: string | null) {
  return call(source, "PUT", `${routeOf(workspace)}/file`, writeOf, { path, content, base });
}

/** Borra una entrada solo si sigue en la versión `base`; si cambió, `conflict`. */
export function deleteMemoryFile(source: MemorySource, workspace: string, path: string, base: string) {
  return call(source, "DELETE", `${routeOf(workspace)}/file${q({ path, base })}`, writeOf);
}
