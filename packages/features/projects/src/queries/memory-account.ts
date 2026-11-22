/**
 * La memoria versionada de un workspace en la cuenta de Danil (computers,
 * `/v1/workspaces/:id/memory/*`), directo al Worker: ni relay ni flota.
 *
 * - En la web, con la sesión de la persona (`capabilities().accountMemory`).
 * - En la ventana, con el token de cliente de la CUENTA del workspace
 *   (`danil_workspace_account` + `account_relay_token`). Un workspace sin cuenta
 *   de Danil no tiene historial: solo su memoria local.
 */
import {
  entriesIn,
  type MemoryFileRef,
  type MemorySource,
  memoryDirs,
  memoryFiles,
  parseMemoryEntry,
  readMemoryFile,
} from "@terminus/computers";
import { invoke } from "../../../../engine-client/src/client.ts";
import type { MemoriaEntrada, MemoriaScope } from "../../../../../apps/desktop/src/lib/model";
import { capabilities } from "../../../../host/src/platform";

/** La memoria de un workspace en la cuenta: a dónde hablar y de qué workspace. */
export type MemoriaDeCuenta = { source: MemorySource; workspace: string };

type ClientToken = { token: string; expires_at: number; endpoint: string };
type WorkspaceAccountOf = { account?: string | null; signed_in?: boolean };

const MARGEN_MS = 60_000;

/** Por workspace: el token de cliente se pide una vez y se renueva antes de vencer. */
const deEscritorio = new Map<string, Promise<MemoriaDeCuenta | null>>();

/** La memoria de cuenta de `workspace`, o null si este workspace no tiene cuenta de Danil aquí. */
export function memoriaDeCuenta(workspace: string | null | undefined): Promise<MemoriaDeCuenta | null> {
  if (!workspace) return Promise.resolve(null);
  const web = capabilities().accountMemory;
  if (web) return Promise.resolve({ source: web, workspace });
  let pending = deEscritorio.get(workspace);
  if (!pending) {
    pending = desdeElEscritorio(workspace);
    deEscritorio.set(workspace, pending);
    // Un fallo (sin sesión, motor viejo) se vuelve a preguntar la próxima vez.
    void pending.then((r) => r === null && deEscritorio.delete(workspace));
  }
  return pending;
}

async function desdeElEscritorio(workspace: string): Promise<MemoriaDeCuenta | null> {
  const of = (await invoke<WorkspaceAccountOf>("danil_workspace_account", { workspace }).catch(() => null)) ?? null;
  if (!of?.signed_in) return null;
  const account = of.account ?? null;
  let token: ClientToken | null = null;
  const pedir = async () => {
    if (token && token.expires_at - Date.now() > MARGEN_MS) return token;
    token = await invoke<ClientToken>("account_relay_token", account ? { account } : {});
    return token;
  };
  try {
    const first = await pedir();
    return { source: { endpoint: first.endpoint, getToken: async () => (await pedir()).token }, workspace };
  } catch {
    // Un motor sin `danil_client_token`, o un plano de control sin tokens de cliente.
    return null;
  }
}

/** Una entrada leída de la cuenta: la forma de la lista del motor, con su ruta y su versión para escribir encima. */
export type EntradaDeCuenta = MemoriaEntrada & { path: string; oid: string };

/**
 * La carpeta del repo que corresponde a ese alcance: la primera que ya tiene
 * entradas (un encargado puede ser del proyecto o del workspace), o la primera.
 */
export function carpetaDe(files: MemoryFileRef[], project: string, scope: MemoriaScope): string {
  const dirs = memoryDirs(project, scope);
  return dirs.find((d) => entriesIn(files, d).length > 0) ?? (dirs[0] as string);
}

/** Lo que el motor llama `EntryView`, armado desde un archivo del repo. */
export function entradaDesdeTexto(path: string, oid: string, raw: string, workspace: string, project: string): EntradaDeCuenta {
  const p = parseMemoryEntry(raw);
  const o = p.origin;
  return {
    path,
    oid,
    file: path.slice(path.lastIndexOf("/") + 1),
    type: p.type,
    modified: p.modified ?? "",
    origin: {
      workspace: o.workspace ?? workspace,
      project: o.project ?? project,
      task: o.task ?? null,
      provider: o.agent ?? null,
      handler: o.handler ?? null,
      branch: o.branch ?? null,
      commit: o.commit ?? null,
    },
    text: p.body.trim(),
    in_index: true,
  };
}

const EN_PARALELO = 6;

/** Las entradas de un alcance leídas de la cuenta, de la más nueva a la más vieja. */
export async function entradasDeCuenta(
  cuenta: MemoriaDeCuenta,
  project: string,
  scope: MemoriaScope,
): Promise<{ carpeta: string; entradas: EntradaDeCuenta[] }> {
  const listed = await memoryFiles(cuenta.source, cuenta.workspace);
  if (listed.kind !== "ok") throw listed;
  const carpeta = carpetaDe(listed.value.files, project, scope);
  const files = entriesIn(listed.value.files, carpeta);
  const out: EntradaDeCuenta[] = [];
  for (let i = 0; i < files.length; i += EN_PARALELO) {
    const lote = await Promise.all(
      files.slice(i, i + EN_PARALELO).map(async (f) => {
        const read = await readMemoryFile(cuenta.source, cuenta.workspace, f.path, listed.value.commit ?? undefined);
        return read.kind === "ok" ? entradaDesdeTexto(f.path, read.value.oid, read.value.content, cuenta.workspace, project) : null;
      }),
    );
    for (const e of lote) if (e) out.push(e);
  }
  out.sort((a, b) => b.modified.localeCompare(a.modified));
  return { carpeta, entradas: out };
}
