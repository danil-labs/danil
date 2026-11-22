/**
 * Mover un workspace adoptado a otra organización (plan de cuentas § 8, A12 y
 * A17 § 10.3). El paso 1 se pide con el contexto de origen; el paso 2 solo se
 * puede hacer con el contexto del destino y solo lo completa la misma persona
 * cuando es owner o admin allí. Si no, la solicitud queda para que un admin la
 * apruebe en Harness.
 */
import { workspaceCatalog, workspaceTransferAcceptPath, workspaceTransfersPath } from "../../../platform-client/src/workspaces.ts";
import type { Workspace } from "../../../platform-client/src/workspaces.ts";
import { sendIdentityMe } from "../../../platform-client/src/identity.ts";
export type MoveGroup = { context_id: string; org: string; org_name?: string | null; role?: string | null };
export type MoveDestination = { org: string; name: string; context: string | null; immediate: boolean };
export type MoveAccount = { id: string; version: number };
type Reply = { status: number; body?: unknown; empty_reason?: unknown };
export type Send = (context: string, method: string, path: string, body?: unknown, key?: string) => Promise<Reply>;
export type MoveResult = { state: "moved" | "pending"; warning: string | null };

const accountId = (value: unknown) =>
  typeof value === "string" ? /^[1-9][0-9]{0,18}$/.test(value) ? value : null : typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
const version = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const TRANSFER_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const ADMIN = new Set(["owner", "admin"]);

/** La causa que el servidor dio, sin inventarla. */
function moveCause(reply: Reply): string {
  const code = (reply.body as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && code ? code : `http_${reply.status}`;
}

/** La cuenta de plataforma de un workspace local, por su id de motor. */
export async function accountOfEngine(send: Send, context: string, engine: string): Promise<MoveAccount | null> {
  for (const raw of await workspaceCatalog(send, context)) {
    const row = raw as Workspace;
    if (row.engine_workspace_id !== engine) continue;
    const id = accountId(row.id), value = version(row.version);
    return id && value !== null ? { id, version: value } : null;
  }
  return null;
}

/**
 * Los destinos posibles: las organizaciones de la persona (`/v1/identity/me`),
 * sin la de origen. `immediate` es admin u owner allí y tiene contexto en esta
 * ventana para aceptar en el mismo gesto.
 */
export async function moveDestinations(send: Send, source: { context_id: string; org: string }, groups: readonly MoveGroup[]): Promise<MoveDestination[]> {
  const me = await sendIdentityMe(send, source.context_id);
  if (me.status !== 200 || me.empty_reason) throw { detail: moveCause(me) };
  const organizations = (me.body as { organizations?: unknown } | null)?.organizations;
  if (!Array.isArray(organizations)) return [];
  const rows: MoveDestination[] = [];
  for (const raw of organizations) {
    const org = raw as { id?: unknown; name?: unknown; role?: unknown };
    if (typeof org.id !== "string" || org.id === source.org) continue;
    const group = groups.find((g) => g.org === org.id) ?? null;
    const role = typeof org.role === "string" ? org.role : group?.role ?? null;
    rows.push({ org: org.id, name: typeof org.name === "string" && org.name ? org.name : group?.org_name ?? org.id, context: group?.context_id ?? null, immediate: !!group && !!role && ADMIN.has(role) });
  }
  return rows;
}

/**
 * Pide el traspaso y, si la persona es admin del destino y tiene su contexto,
 * lo acepta aquí mismo. Una aceptación que falla deja la solicitud pendiente y
 * su causa en `warning`: el admin la resuelve en Harness.
 */
export async function moveWorkspace(
  send: Send,
  account: MoveAccount,
  source: { context_id: string; org: string },
  target: MoveDestination,
  requestKey = crypto.randomUUID(),
): Promise<MoveResult> {
  const reply = await send(source.context_id, "POST", workspaceTransfersPath(account.id), { to_org: target.org, if_version: account.version }, requestKey);
  if (reply.status < 200 || reply.status >= 300 || reply.empty_reason) throw { detail: moveCause(reply) };
  const body = reply.body as { transfer_id?: unknown; state?: unknown } | null | undefined;
  const transfer = typeof body?.transfer_id === "string" && TRANSFER_ID.test(body.transfer_id) ? body.transfer_id : null;
  if (!transfer) throw { detail: "transfer_reply_invalid" };
  if (body?.state === "accepted") return { state: "moved", warning: null };
  if (!target.immediate || !target.context) return { state: "pending", warning: null };
  const accepted = await send(target.context, "POST", workspaceTransferAcceptPath(transfer), {}, crypto.randomUUID());
  if (accepted.status >= 200 && accepted.status < 300 && !accepted.empty_reason) return { state: "moved", warning: null };
  return { state: "pending", warning: moveCause(accepted) };
}
