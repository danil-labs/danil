import type { ContextGroup, ContextReply } from "./session-context-types.ts";

/** Una petición de la CLI (`account_requests_v1`), como la entrega `account_request_take`. */
export type AccountRequest = { request_id: string; op: string; args?: { name?: string; org?: string }; key: string; caller_task?: string | null };
export type AccountError = { code: string; options?: unknown[] };
export type AccountOutcome = { result: unknown } | { error: AccountError };
export type CreatedNotice = { name: string; org: string; task: string | null };

type Send = (context: string, method: string, path: string, body?: unknown, key?: string) => Promise<ContextReply>;
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
export type AccountRequestDeps = {
  groups: () => readonly ContextGroup[] | null;
  send: Send;
  /** Sella aquí el workspace que el servidor creó para esta computadora (`create_account_workspace`). */
  createHere: (org: string, accountId: string, id: string, name: string) => Promise<void>;
};

const ADMIN = new Set(["owner", "admin"]);
const option = (g: ContextGroup) => ({ org: g.org, name: g.org_name ?? g.org, email: g.email });

/** Las organizaciones de la persona, con el correo solo cuando dos se llaman igual. */
export function listOrgs(groups: readonly ContextGroup[]) {
  const names = new Map<string, number>();
  for (const g of groups) names.set((g.org_name ?? g.org).toLowerCase(), (names.get((g.org_name ?? g.org).toLowerCase()) ?? 0) + 1);
  return groups.map((g) => {
    const name = g.org_name ?? g.org;
    const row: { org: string; name: string; role: string; email?: string } = { org: g.org, name, role: g.role ?? "member" };
    if ((names.get(name.toLowerCase()) ?? 0) > 1 && g.email) row.email = g.email;
    return row;
  });
}

/** El contexto donde crear: el de `--org` (id o nombre) o el Free personal. */
export function pickGroup(groups: readonly ContextGroup[], org: string | undefined): { group: ContextGroup } | { error: AccountError } {
  if (!groups.length) return { error: { code: "no_session" } };
  const matches = org
    ? groups.filter((g) => g.org === org || (g.org_name ?? "").toLowerCase() === org.toLowerCase())
    : groups.filter((g) => g.plan === "free");
  if (matches.length === 1) return { group: matches[0] };
  if (!org && !matches.length) return { error: { code: "no_session" } };
  return { error: { code: "ambiguous", options: (matches.length ? matches : groups).map(option) } };
}

function failed(reply: ContextReply): AccountError {
  if (reply.empty_reason) return { code: "no_session" };
  const code = (reply.body as { code?: unknown } | undefined)?.code;
  if (reply.status === 403) return { code: "admin_required" };
  if (reply.status === 409 && code === "workspace_limit") return { code: "workspace_limit" };
  // Un borde o un `workspaces` sin la ruta todavía (404, 501): no hay nada que hacer aquí.
  if (reply.status === 404 || reply.status === 501) return { code: "unavailable" };
  return { code: "operation_failed" };
}

/** Ejecuta una petición con la sesión del contexto que toca. El servidor aplica las reglas de admin. */
export async function runAccountRequest(row: AccountRequest, deps: AccountRequestDeps): Promise<{ outcome: AccountOutcome; created?: CreatedNotice }> {
  const groups = deps.groups() ?? [];
  if (row.op === "orgs.list") return { outcome: groups.length ? { result: listOrgs(groups) } : { error: { code: "no_session" } } };
  if (row.op !== "workspace.create") return { outcome: { error: { code: "unsupported_op" } } };
  const name = row.args?.name?.trim();
  if (!name) return { outcome: { error: { code: "operation_failed" } } };
  const picked = pickGroup(groups, row.args?.org);
  if ("error" in picked) return { outcome: { error: picked.error } };
  const { group } = picked;
  if (group.plan !== "free" && group.role && !ADMIN.has(group.role)) return { outcome: { error: { code: "admin_required" } } };
  let reply: ContextReply;
  try {
    // La llave de la CLI es la del servidor: dos despachos de la misma petición crean un solo workspace.
    reply = await deps.send(group.context_id, "POST", "/v1/workspaces", { name, placement: { kind: "member_computer" } }, row.key);
  } catch {
    return { outcome: { error: { code: "operation_failed" } } };
  }
  if (reply.status < 200 || reply.status >= 300 || reply.empty_reason) return { outcome: { error: failed(reply) } };
  const body = (reply.body ?? {}) as { id?: unknown; name?: unknown; engine_workspace_id?: unknown };
  if (typeof body.id !== "string" && typeof body.id !== "number") return { outcome: { error: { code: "operation_failed" } } };
  const accountId = String(body.id);
  const created = typeof body.name === "string" && body.name.trim() ? body.name : name;
  const engineId = typeof body.engine_workspace_id === "string" && body.engine_workspace_id ? body.engine_workspace_id : null;
  // En la computadora de la persona el workspace vive aquí; si el motor no lo admite, el servidor ya lo tiene.
  if (engineId) await deps.createHere(group.org, accountId, engineId, created).catch(() => {});
  return {
    outcome: { result: { workspace: { id: engineId ?? accountId, name: created, org: group.org, account_id: accountId } } },
    created: { name: created, org: group.org_name ?? group.org, task: row.caller_task ?? null },
  };
}

/** Toma y liquida las peticiones pendientes; una a la vez para no despachar dos veces. */
export function createAccountRequests(invoke: Invoke, deps: AccountRequestDeps, onCreated: (notice: CreatedNotice) => void) {
  let running: Promise<void> | null = null;
  let again = false;
  async function drain() {
    do {
      again = false;
      let rows: AccountRequest[] = [];
      try { rows = await invoke<AccountRequest[]>("account_request_take", {}); } catch { return; }
      for (const row of rows) {
        const { outcome, created } = await runAccountRequest(row, deps);
        try {
          await invoke("account_request_settle", { requestId: row.request_id, ...outcome });
          if (created) onCreated(created);
        } catch { /* La CLI ya recibió `request_timeout`; su reintento con la misma llave vuelve a pasar por aquí. */ }
      }
    } while (again);
  }
  return {
    pump: () => {
      if (running) { again = true; return running; }
      running = drain().finally(() => { running = null; });
      return running;
    },
  };
}
