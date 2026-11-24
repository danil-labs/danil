import type { ContextGroup } from "./session-context-types.ts";

/** Una petición de la CLI (`account_requests_v1`), como la entrega `account_request_take`. */
export type AccountRequest = { request_id: string; op: string; args?: { name?: string; org?: string }; key: string; caller_task?: string | null };
type AccountError = { code: string; options?: unknown[] };
export type AccountOutcome = { result: unknown } | { error: AccountError };
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type AccountRequestDeps = { groups: () => readonly ContextGroup[] | null };

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

function runAccountRequest(row: AccountRequest, deps: AccountRequestDeps): AccountOutcome {
  const groups = deps.groups() ?? [];
  if (row.op === "orgs.list") return groups.length ? { result: listOrgs(groups) } : { error: { code: "no_session" } };
  if (row.op === "workspace.create") return { error: { code: "unavailable" } };
  return { error: { code: "unsupported_op" } };
}

/** Toma y liquida las peticiones pendientes; una a la vez para no despachar dos veces. */
export function createAccountRequests(rpc: Invoke, deps: AccountRequestDeps) {
  let running: Promise<void> | null = null;
  let again = false;
  async function drain() {
    do {
      again = false;
      let rows: AccountRequest[] = [];
      try { rows = await rpc<AccountRequest[]>("account_request_take", {}); } catch { return; }
      for (const row of rows) {
        const outcome = runAccountRequest(row, deps);
        try {
          await rpc("account_request_settle", { requestId: row.request_id, ...outcome });
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
