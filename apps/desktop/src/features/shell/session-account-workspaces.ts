import { createSignal } from "solid-js";
import { escribirPref, leerPref } from "../../lib/prefs.ts";
import { adoptionTarget, adoptionTargetOf, adoptLocals, prefsAdoptionMemory, type AdoptionClaimed, type AdoptionFailure } from "./account-adoption.ts";
import { applyMoves, movesFor, prefsPendingUnions, retryUnions } from "./account-transfers.ts";
import { engineOwnsAdoption } from "./engine-adoption.ts";
import { engineFeatures } from "./engine-features.ts";
import type { AdoptionProgress } from "./first-login.ts";
import type { PersonalOpener, PersonalOutcome } from "./personal-open.ts";
import { workspacesPagePath } from "../../platform/workspaces.ts";

export type AccountWorkspace = { id: string; name: string; account: { org: string; account_id: string } };
export type FreeWorkspace = { id: string; name: string; account_id: string };
/** Lo que el aviso de la adopción enseña: lo traído, lo que no y por qué. */
export type AdoptionReport = {
  context: string;
  org: string;
  org_name: string | null;
  adopted: AdoptionClaimed[];
  refused: AdoptionFailure[];
  failed: AdoptionFailure[];
  unavailable: boolean;
  cause: string | null;
};
type Group = { context_id: string; org: string; org_name?: string | null; plan: string | null; email?: string | null };
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

/** Las filas del catálogo de una organización, página a página. Un error corta y devuelve lo leído. */
async function catalog(send: Send, context: string) {
  const items: unknown[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const reply = await send(context, "GET", workspacesPagePath(cursor)).catch(() => null);
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
/** `features`: lo que anuncia el motor de esta ventana; si no contesta, la fila de `machine_list`, que por la flota puede venir sin rasgos. */
export function createAccountWorkspaces(invoke: Invoke, native: boolean, changed: () => void, features: () => Promise<readonly string[] | null> = engineFeatures) {
  let local: string | null = null;
  let extension = false;
  let transfer = false;
  const pending = prefsPendingUnions(leerPref, escribirPref);
  const adoptions = prefsAdoptionMemory(leerPref, escribirPref, () => crypto.randomUUID());
  let adoption = false;
  let adopting = false;
  // El motor adopta solo: la ventana no pide retos, pruebas ni sellos.
  let engineAdopts = false;
  // Hasta que la persona confirma la cuenta en el primer login: el sello no se deshace.
  let held = false;
  // El contexto (un inicio de sesión) donde el servidor dijo que hoy no adopta: uno nuevo vuelve a intentar.
  let adoptionUnavailable: string | null = null;
  const [adoptionReport, setAdoptionReport] = createSignal<AdoptionReport | null>(null);
  const [adoptionProgress, setAdoptionProgress] = createSignal<AdoptionProgress | null>(null);
  const [personalOutcome, setPersonalOutcome] = createSignal<PersonalOutcome | null>(null);
  let reported: string | null = null;
  // Por qué no se adoptó en el último repaso: se registra una vez por causa, nunca en silencio.
  let skipped: string | null = null;
  const skip = (cause: string | null) => {
    if (cause && cause !== skipped) console.warn("[adoption] not run", { cause });
    skipped = cause;
  };
  let version = 0;
  // El último repaso no terminó (un error o una página del catálogo que no fue 200): `free` no es confiable.
  let failed = false;
  let rows: AccountWorkspace[] = [];
  let free = new Map<string, FreeWorkspace>();
  const header = () => ({ "x-terminus-machine": local });
  async function hasAdoptionCandidates() {
    // Con el servidor diciendo que hoy no adopta, no se insiste: el aviso ofrece reintentar.
    if (!native || !extension || !adoption || engineAdopts || adoptionUnavailable) return false;
    try {
      return (await invoke<{ adoptable?: boolean }[]>("adoption_candidates", header())).some((candidate) => candidate.adoptable !== false);
    } catch {
      return false;
    }
  }
  const step = (org: string) => (id: string, name: string, next: "waiting" | "working" | "done") => setAdoptionProgress((now) => {
    const rows = (now?.org === org && !now.finished ? now.rows : []).filter((r) => r.id !== id);
    const at = now?.org === org && !now.finished ? now.rows.findIndex((r) => r.id === id) : -1;
    rows.splice(at < 0 ? rows.length : at, 0, { id, name, step: next });
    return { org, finished: false, rows };
  });
  return {
    adoptionReport,
    clearAdoptionReport: () => setAdoptionReport(null),
    /** Un reintento del aviso no espera al siguiente inicio de sesión. */
    clearAdoptionUnavailable: () => { adoptionUnavailable = null; },
    /** El avance de cada local en la pantalla del primer login, y si abrir la personal quedó pendiente. */
    adoptionProgress,
    personalOutcome,
    hold: (value: boolean) => { held = value; },
    forgetRefusals: () => adoptions.forget?.(),
    /** ¿Queda algo por traer? El alta espera a que identity ligue la organización personal. */
    hasAdoptionCandidates,
    known: () => rows.map((w) => w.id),
    available: (org: string) => rows.filter((w) => w.account.org === org),
    /** Los sellados aquí en otra organización: se quedan en ella. */
    sealedElsewhere: (org: string) => rows.filter((w) => w.account.org !== org).map((w) => ({ id: w.id, name: w.name, org: w.account.org })),
    free: (context: string) => extension ? free.get(context) : undefined,
    /** Lo que el primer arranque necesita para distinguir un rechazo permanente de «todavía no». */
    status: () => ({ machine: !!local, extension, failed }),
    async refresh(groups: readonly Group[], send: Send, personOf: (context: string) => string | null = () => null, opener?: PersonalOpener) {
      if (!native) return;
      const epoch = ++version;
      free = new Map();
      failed = false;
      try {
        const machines = await invoke<{ id: string; local?: boolean; features?: string[] }[]>("machine_list");
        const self = machines.find((m) => m.local);
        const announced = self && features ? await features().catch(() => null) : null;
        if (self && announced) self.features = [...announced];
        engineAdopts ||= engineOwnsAdoption(announced);
        if (epoch !== version) return;
        if (!self) { local = null; extension = false; transfer = false; changed(); return; }
        local = self.id;
        // La fila propia por la flota puede venir sin `features`: lo que el motor anunció en esta ejecución se conserva.
        extension ||= self.features?.includes("account_workspace_v1") ?? false;
        transfer = self.features?.includes("account_transfer_v1") ?? false;
        // Sin la prueba de posesión (A17) el servidor no adopta: hace falta el rasgo nuevo del motor.
        adoption ||= !!(self.features?.includes("account_adoption_v1") && self.features.includes("account_adoption_proof_v1"));
        // Al iniciar sesión, antes de lanzar turnos: los locales pasan a la organización personal.
        const personal = adoption && !engineAdopts ? await adoptionTargetOf(groups, send) : engineAdopts ? undefined : adoptionTarget(groups);
        skip(engineAdopts ? null : !adoption ? "engine_features" : !groups.length ? "no_session" : held ? null : !personal && !opener ? "no_personal" : null);
        // Sin la personal abierta no se adoptaba nada: se abre y el repaso con la lista nueva liga.
        if (adoption && !engineAdopts && !held && !personal && opener && !adopting && (await hasAdoptionCandidates())) {
          const opened = await opener.open(groups);
          setPersonalOutcome(opened);
          if (opened.kind !== "open") skip(`personal_${opened.kind}:${opened.cause}`);
          if (opened.kind === "open" || epoch !== version) return;
        }
        if (adoption && !engineAdopts && !held && personal && !adopting && adoptionUnavailable !== personal.context_id) {
          adopting = true;
          try {
            const done = await adoptLocals(invoke, header(), send, personal, adoptions, pending, personOf(personal.context_id), step(personal.org));
            setAdoptionProgress((now) => now && now.org === personal.org ? { ...now, finished: true, rows: now.rows.map((r) => r.step === "done" ? r : { ...r, step: "later" }) } : now);
            for (const f of [...done.refused, ...done.failed]) console.warn("[adoption] local not linked", { id: f.id, reason: f.reason });
            if (done.attempted > 0) await opener?.adopted();
            if (epoch !== version) return;
            adoptionUnavailable = done.unavailable ? personal.context_id : null;
            // Un aviso, nunca una pregunta. Si no se trajo nada y todo está en orden, no hay aviso.
            const noticeable = done.adopted.length > 0 || done.refused.length > 0 || done.failed.length > 0 || done.unavailable;
            if (noticeable && (done.attempted > 0 || done.failed.length > 0)) {
              const report: AdoptionReport = { context: personal.context_id, org: personal.org, org_name: personal.org_name ?? null,
                adopted: done.adopted, refused: done.refused, failed: done.failed, unavailable: done.unavailable, cause: done.cause };
              const key = JSON.stringify([report.org, report.adopted, report.refused, report.failed, report.unavailable, report.cause]);
              // El repaso corre al volver el foco: el mismo resultado no vuelve a abrir el aviso.
              if (key !== reported) { reported = key; setAdoptionReport(report); }
            }
          } finally { adopting = false; }
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
        if (extension) for (const group of groups.filter((g) => g.plan === "free")) {
          let cursor: string | null = null;
          const seen = new Set<string>();
          do {
            const reply = await send(group.context_id, "GET", workspacesPagePath(cursor));
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
      if (!native || !extension || !local || !row || group.plan !== "free") throw { detail: "not_available_yet" };
      await invoke("create_account_workspace", { ...header(), id: row.id, name: row.name, account: { org: group.org, account_id: row.account_id } });
      await refresh();
      return row.id;
    },
  };
}
