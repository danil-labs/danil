/**
 * Abre la organización personal cuando hay locales que ligar y no está entre las sesiones
 * (plan «desk-ligar-locales-al-actualizar» § 2.2). `POST /v1/identity/organizations/select`
 * con el portador de Desk admite su contexto si falta y lo deja por omisión; tras adoptar se
 * vuelve a elegir la organización que estaba activa.
 */
type Send = (context: string, method: string, path: string, body?: unknown, key?: string) => Promise<{ status: number; body?: unknown }>;
type Group = { context_id: string; org: string; email?: string | null };
type Log = (...args: unknown[]) => void;
import { type BusyOptions, isBusy, retryBusy } from "./select-busy.ts";

/** `open`: ya está entre las sesiones. `retry`: transitorio, en segundo plano. `later`: inesperado, al siguiente arranque. */
export type PersonalOutcome = { kind: "open"; context: string } | { kind: "retry"; cause: string } | { kind: "later"; cause: string } | { kind: "none"; cause: string };

/** La organización que identity marca `type: "personal"`; con más de una no se adivina. */
export function personalOrgOf(me: unknown): string | null {
  const organizations = (me as { organizations?: unknown } | null)?.organizations;
  if (!Array.isArray(organizations)) return null;
  const ids = organizations.flatMap((raw) => {
    const org = raw as { id?: unknown; type?: unknown };
    return typeof org.id === "string" && org.type === "personal" ? [org.id] : [];
  });
  return ids.length === 1 ? ids[0] : null;
}

const transient = (status: number) => status === 429 || status >= 500;
const codeOf = (body: unknown, status: number) => {
  const code = (body as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : `select_${status}`;
};

export async function openPersonal(groups: readonly Group[], send: Send, reread: () => Promise<readonly Group[] | null>, log: Log = console.warn, busy?: BusyOptions): Promise<PersonalOutcome> {
  if (!groups.length) return { kind: "none", cause: "no_session" };
  // Con dos correos cada uno tiene su personal: el destino no se elige por la persona (plan § 4).
  if (new Set(groups.map((g) => g.email?.trim().toLowerCase() ?? "")).size > 1) return { kind: "none", cause: "several_emails" };
  const via = groups[0].context_id;
  let me: Awaited<ReturnType<Send>>;
  try { me = await send(via, "GET", "/v1/identity/me"); } catch { return { kind: "retry", cause: "network" }; }
  if (me.status !== 200) return transient(me.status) ? { kind: "retry", cause: `me_${me.status}` } : { kind: "later", cause: `me_${me.status}` };
  const org = personalOrgOf(me.body);
  if (!org) return { kind: "none", cause: "no_personal" };
  const open = groups.find((g) => g.org === org);
  if (open) return { kind: "open", context: open.context_id };
  let reply: Awaited<ReturnType<Send>>;
  // `busy`: el motor está ligando y no tuvo el turno; se espera un poco y, si sigue, queda en segundo plano.
  try { reply = await retryBusy(() => send(via, "POST", "/v1/identity/organizations/select", { organization_id: org }), busy); } catch (e) { return { kind: "retry", cause: isBusy(e) ? "busy" : "network" }; }
  if (reply.status < 200 || reply.status >= 300) {
    const cause = codeOf(reply.body, reply.status);
    if (transient(reply.status)) return { kind: "retry", cause };
    log("[first-login] personal organization not opened", { status: reply.status, cause });
    return { kind: "later", cause };
  }
  const after = await reread().catch(() => null);
  const added = after?.find((g) => g.org === org);
  // identity ya admitió el contexto; la lista de la familia puede tardar una lectura más.
  return added ? { kind: "open", context: added.context_id } : { kind: "retry", cause: "context_pending" };
}

export type PersonalOpener = {
  open: (groups: readonly Group[]) => Promise<PersonalOutcome>;
  /** Tras adoptar: la organización que estaba activa vuelve a ser la de por omisión. */
  adopted: () => Promise<void>;
};

export function createPersonalOpener(deps: { send: Send; reread: () => Promise<readonly Group[] | null>; defaultContext: () => string | null; groups: () => readonly Group[] | null; log?: Log; wait?: BusyOptions["wait"] }): PersonalOpener {
  let restore: { context: string; org: string } | null = null;
  // Lo inesperado no se repite en cada foco: espera al siguiente arranque.
  let later: PersonalOutcome | null = null;
  const log = deps.log ?? console.warn;
  return {
    async open(groups) {
      if (later) return later;
      const before = deps.defaultContext();
      const org = groups.find((g) => g.context_id === before)?.org;
      const outcome = await openPersonal(groups, deps.send, deps.reread, log, { wait: deps.wait });
      if (outcome.kind === "open" && before && org) restore = { context: before, org };
      if (outcome.kind === "later") later = outcome;
      return outcome;
    },
    async adopted() {
      const target = restore;
      restore = null;
      if (!target || !deps.groups()?.some((g) => g.context_id === target.context)) return;
      const reply = await retryBusy(() => deps.send(target.context, "POST", "/v1/identity/organizations/select", { organization_id: target.org }), { wait: deps.wait }).catch(() => null);
      if (!reply || reply.status < 200 || reply.status >= 300) log("[first-login] previous organization not restored", { status: reply?.status ?? null });
    },
  };
}
