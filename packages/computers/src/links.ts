/**
 * Qué workspaces de una computadora ve la persona: los vinculados a su cuenta
 * de Danil (`workspaces` de `GET /v1/computers`). El relay ya filtra; esto es
 * la segunda red de cada cliente. Una fila sin `workspaces` es de un plano de
 * control anterior a los vínculos y no se filtra.
 */
import type { Computer } from "./api.ts";

/** Los ids vinculados, o `null` si el plano de control no los dice. */
export function linkedWorkspaces(computer: Pick<Computer, "workspaces">): ReadonlySet<string> | null {
  const list = computer.workspaces;
  return Array.isArray(list) ? new Set(list.filter((id): id is string => typeof id === "string")) : null;
}

/** La organización cuyo servidor atiende `computer`, con su workspace; `null` si la fila no lo dice. */
export function organizationOf(computer: Pick<Computer, "organization">): { id: string; workspace: { id: string; name: string } } | null {
  const raw = computer.organization as { organization_id?: unknown; workspace?: { id?: unknown; name?: unknown } | null } | null | undefined;
  const id = raw?.workspace?.id;
  if (typeof raw?.organization_id !== "string" || typeof id !== "string" || !id) return null;
  const name = typeof raw.workspace?.name === "string" && raw.workspace.name.trim() ? raw.workspace.name.trim() : id;
  return { id: raw.organization_id, workspace: { id, name } };
}

/**
 * Las funciones que el motor de `computer` anuncia (`status.service_features`
 * de su último `hello`). Un plano de control que no las dice da ninguna: la
 * función se apaga, la máquina no se marca desactualizada.
 */
export function serviceFeatures(computer: { service_features?: unknown }): string[] {
  const list = computer.service_features;
  return Array.isArray(list) ? list.filter((f): f is string => typeof f === "string" && !!f) : [];
}

/** Si la cuenta tiene al menos un workspace a la vista en alguna de sus computadoras. */
export function hasLinkedWorkspaces(computers: readonly Pick<Computer, "workspaces">[]): boolean {
  return computers.some((c) => {
    const linked = linkedWorkspaces(c);
    return linked === null || linked.size > 0;
  });
}

/** Las filas de workspaces que la persona puede ver. */
export function onlyLinked<R extends { id: string }>(rows: readonly R[], linked: ReadonlySet<string> | null): R[] {
  return linked ? rows.filter((r) => linked.has(r.id)) : [...rows];
}

/**
 * La respuesta de `list_workspaces` o `workspaces_startup` sin los workspaces
 * que no están vinculados; el activo que no se ve queda en `null`.
 */
export function linkedListing<T>(value: T, linked: ReadonlySet<string> | null): T {
  if (!linked || !value || typeof value !== "object" || Array.isArray(value)) return value;
  const listing = value as { workspaces?: unknown; active?: unknown };
  if (!Array.isArray(listing.workspaces)) return value;
  const workspaces = listing.workspaces.filter((w) => typeof w?.id === "string" && linked.has(w.id));
  // Como el relay: un activo sin vincular pasa al primero que queda; con null la app abriría el alta.
  const first = (workspaces[0] as { id?: string } | undefined)?.id ?? null;
  const active = typeof listing.active === "string" && !linked.has(listing.active) ? first : listing.active;
  return { ...value, workspaces, ...("active" in listing ? { active } : {}) };
}

/** `list_workspace_attention` (una entrada por workspace) sin los que no están vinculados. */
export function linkedAttention<T>(value: T, linked: ReadonlySet<string> | null): T {
  if (!linked || !Array.isArray(value)) return value;
  return value.filter((entry) => {
    const id = (entry as { workspace?: unknown } | null)?.workspace;
    return typeof id !== "string" || linked.has(id);
  }) as T;
}

/**
 * El workspace con que va una llamada: el que nombran sus argumentos, si lo
 * hacen (`workspace`, o un `scope` de texto que no sea `pending`). El relay
 * rechaza (`workspace_mismatch`) la llamada cuyos argumentos nombran otro
 * workspace que el suyo.
 */
export function callWorkspace(workspace: string | null, args: Readonly<Record<string, unknown>>): string | null {
  if (typeof args.workspace === "string" && args.workspace) return args.workspace;
  if (typeof args.scope === "string" && args.scope && args.scope !== "pending") return args.scope;
  return workspace;
}

/** Un evento con `workspace` que no está vinculado no llega; uno sin workspace, sí. */
export function linkedEvent(event: { workspace?: unknown }, linked: ReadonlySet<string> | null): boolean {
  return !linked || typeof event.workspace !== "string" || linked.has(event.workspace);
}

/**
 * Los workspaces que nombra una página del relay (en el sobre, en el `payload`
 * o en las entradas de `attention`) y que `linked` no tiene. El relay ya filtró
 * la página con la lista vigente: si nombra uno que aquí no está, la lista de
 * aquí es vieja (se vinculó después de leer `GET /v1/computers`).
 */
export function unlinkedWorkspaces(events: readonly { name: string; payload?: unknown; workspace?: unknown }[], linked: ReadonlySet<string> | null): string[] {
  if (!linked) return [];
  const named = new Set<string>();
  const add = (value: unknown) => {
    const id = value && typeof value === "object" && !Array.isArray(value) ? (value as { workspace?: unknown }).workspace : undefined;
    if (typeof id === "string" && id && !linked.has(id)) named.add(id);
  };
  for (const e of events) {
    add(e);
    add(e.payload);
    if (e.name === "attention" && Array.isArray(e.payload)) for (const entry of e.payload) add(entry);
  }
  return [...named];
}

/**
 * Los eventos de una página del relay que la persona puede ver: ninguno de un
 * workspace sin vincular, diga su workspace el sobre o el `payload`, y el de
 * `attention` sin las entradas de esos workspaces.
 */
export function linkedEvents<E extends { name: string; payload?: unknown; workspace?: unknown }>(events: readonly E[], linked: ReadonlySet<string> | null): E[] {
  if (!linked) return [...events];
  const inner = (e: E) => (e.payload && typeof e.payload === "object" && !Array.isArray(e.payload) ? (e.payload as { workspace?: unknown }) : {});
  return events
    .filter((e) => linkedEvent(e, linked) && linkedEvent(inner(e), linked))
    .map((e) => (e.name === "attention" ? { ...e, payload: linkedAttention(e.payload, linked) } : e));
}
