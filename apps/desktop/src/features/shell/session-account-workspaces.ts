import { escribirPref, leerPref } from "../../lib/prefs.ts";
import { adoptionTarget, adoptLocals, isPersonal, prefsAdoptionMemory } from "./account-adoption.ts";
import { applyMoves, movesFor, prefsPendingUnions, retryUnions } from "./account-transfers.ts";

export type AccountWorkspace = { id: string; name: string; account: { org: string; account_id: string } };
export type FreeWorkspace = { id: string; name: string; account_id: string };
type Group = { context_id: string; org: string; plan: string | null; personal?: boolean };
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Send = (context: string, method: string, path: string, body?: unknown, key?: string) => Promise<{ status: number; body?: unknown; empty_reason?: unknown }>;

export function accountWorkspaces(value: unknown): AccountWorkspace[] {
  const rows = (value as { workspaces?: unknown } | null)?.workspaces;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const w = row as Partial<AccountWorkspace>;
    return typeof w?.id === "string" && typeof w.account?.org === "string" && typeof w.account.account_id === "string" ? [{ id: w.id, name: typeof w.name === "string" && w.name.trim() ? w.name : w.id, account: w.account }] : [];
  });
}

/** Cuándo volver a leer las cuentas: también si identity empieza a decir (o corrige) cuál es la personal con el mismo plan. */
export const accountRefreshKey = (groups: readonly Group[] | null) => JSON.stringify(groups?.map((g) => [g.context_id, g.org, g.plan, isPersonal(g)]) ?? null);

/** Las filas del catálogo de una organización, página a página. Un error corta y devuelve lo leído. */
async function catalog(send: Send, context: string) {
  const items: unknown[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const reply = await send(context, "GET", `/v1/workspaces${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`).catch(() => null);
    if (!reply || reply.status !== 200) break;
    const body = reply.body as { items?: unknown[]; next_cursor?: string | null };
    items.push(...(body.items ?? []));
    cursor = typeof body.next_cursor === "string" ? body.next_cursor : null;
    if (cursor && seen.has(cursor)) break;
    if (cursor) seen.add(cursor);
  } while (cursor);
  return items;
}

/** El destino local se fija explícitamente: abrir un workspace remoto no puede desviar la creación. */
export function createAccountWorkspaces(invoke: Invoke, native: boolean, changed: () => void) {
  let local: string | null = null;
  let extension = false;
  let transfer = false;
  const pending = prefsPendingUnions(leerPref, escribirPref);
  const adoptions = prefsAdoptionMemory(leerPref, escribirPref, () => crypto.randomUUID());
  let adoption = false;
  // El contexto (un inicio de sesión) donde el servidor dijo que hoy no adopta: uno nuevo vuelve a intentar.
  let adoptionUnavailable: string | null = null;
  let version = 0;
  // El último repaso no terminó (un error o una página del catálogo que no fue 200): `free` no es confiable.
  let failed = false;
  let rows: AccountWorkspace[] = [];
  let free = new Map<string, FreeWorkspace>();
  const header = () => ({ "x-terminus-machine": local });
  return {
    known: () => rows.map((w) => w.id),
    available: (org: string) => rows.filter((w) => w.account.org === org),
    free: (context: string) => extension ? free.get(context) : undefined,
    /** Lo que el primer arranque necesita para distinguir un rechazo permanente de «todavía no». */
    status: () => ({ machine: !!local, extension, failed }),
    async refresh(groups: readonly Group[], send: Send, personOf: (context: string) => string | null = () => null) {
      if (!native) return;
      const epoch = ++version;
      free = new Map();
      failed = false;
      try {
        const machines = await invoke<{ id: string; local?: boolean; features?: string[] }[]>("machine_list");
        const self = machines.find((m) => m.local);
        if (epoch !== version) return;
        if (!self) { local = null; extension = false; transfer = false; changed(); return; }
        local = self.id;
        extension = self.features?.includes("account_workspace_v1") ?? false;
        transfer = self.features?.includes("account_transfer_v1") ?? false;
        // Sin la prueba de posesión (A17) el servidor no adopta: hace falta el rasgo nuevo del motor.
        adoption = !!(self.features?.includes("account_adoption_v1") && self.features.includes("account_adoption_proof_v1"));
        // Al iniciar sesión, antes de lanzar turnos: los locales pasan a la organización personal Free.
        const personal = adoptionTarget(groups);
        if (adoption && personal && adoptionUnavailable !== personal.context_id) {
          const done = await adoptLocals(invoke, header(), send, personal, adoptions, pending, personOf(personal.context_id));
          if (epoch !== version) return;
          adoptionUnavailable = done.unavailable ? personal.context_id : null;
        }
        const value = await invoke("list_workspaces", header());
        if (epoch !== version) return;
        rows = accountWorkspaces(value);
        changed();
        // Traslados entre organizaciones (plan de cuentas § 8): solo con workspaces sellados aquí.
        if (transfer && rows.length) {
          let moved = 0;
          for (const group of groups) {
            const items = await catalog(send, group.context_id);
            if (epoch !== version) return;
            moved += await applyMoves(invoke, header(), movesFor(rows, group.org, group.context_id, items), pending);
          }
          if (moved && epoch === version) { rows = accountWorkspaces(await invoke("list_workspaces", header())); changed(); }
        }
        // La unión del Free router va aparte del traslado: si falló, el repaso la vuelve a pedir.
        if (transfer || adoption) await retryUnions(invoke, header(), pending, personOf);
        const next = new Map<string, FreeWorkspace>();
        if (extension) for (const group of groups.filter(isPersonal)) {
          let cursor: string | null = null;
          const seen = new Set<string>();
          do {
            const reply = await send(group.context_id, "GET", `/v1/workspaces${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
            if (epoch !== version) return;
            if (reply.status !== 200) { failed = true; break; }
            const body = reply.body as { items?: { id?: unknown; org?: unknown; name?: unknown; engine_workspace_id?: unknown }[]; next_cursor?: string | null };
            const row = body.items?.find((w) => w.org === group.org && typeof w.id === "string" && typeof w.engine_workspace_id === "string" && !!w.engine_workspace_id);
            if (row) { next.set(group.context_id, { id: row.engine_workspace_id as string, name: typeof row.name === "string" ? row.name : row.engine_workspace_id as string, account_id: row.id as string }); break; }
            cursor = typeof body.next_cursor === "string" ? body.next_cursor : null;
            if (cursor && seen.has(cursor)) break;
            if (cursor) seen.add(cursor);
          } while (cursor);
        }
        free = next;
        changed();
      } catch { failed = true; /* Un motor anterior conserva su riel; no ofrece crear sin capacidad anunciada. */ }
    },
    /** Lo que el servidor creó para esta computadora (una petición de la CLI) queda sellado aquí. */
    async createHere(org: string, accountId: string, id: string, name: string) {
      if (!native || !extension || !local) return;
      await invoke("create_account_workspace", { ...header(), id, name, account: { org, account_id: accountId } });
    },
    async create(group: Group, refresh: () => Promise<void>) {
      const row = free.get(group.context_id);
      if (!native || !extension || !local || !row || !isPersonal(group)) throw { detail: "not_available_yet" };
      await invoke("create_account_workspace", { ...header(), id: row.id, name: row.name, account: { org: group.org, account_id: row.account_id } });
      await refresh();
      return row.id;
    },
  };
}
