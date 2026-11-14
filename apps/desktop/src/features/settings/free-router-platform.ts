/**
 * Free router v8 1d: la interfaz sigue el recorrido RPC1 `free_router_platform_v1`; la autoridad es `workspaces` por el borde.
 * Un paso fuera de orden, una respuesta de antes de un logout o un valor desconocido dejan el Router cerrado.
 */
import type { EdgeMethod } from "../../lib/edge.ts";

export type FreeRouterScope = {
  /** `accounts.id` de tenancy (BIGINT como cadena). */
  account: string;
  org: string;
  /** `user_*` de la sesión que une el workspace: la persona dueña. */
  sub: string;
  /** Id técnico del workspace del motor. */
  workspace: string;
};

export type EdgeAnswer = { status: number; body?: unknown; retryAfterMs?: number };
/** Una llamada al borde con su método real; las escrituras llevan `key` (Idempotency-Key). */
export type EdgeSend = (method: EdgeMethod, path: string, body?: unknown, key?: string) => Promise<EdgeAnswer>;
/** Una orden RPC1 al motor del workspace; los errores llegan como códigos cerrados. */
export type EngineCall = (command: string, args: Record<string, unknown>) => Promise<unknown>;

export type FreeRouterPolicy = { version: number; policy_id: string; providers: string[] };
export type FreeRouterState =
  | { kind: "ready"; offered: boolean; policy: FreeRouterPolicy; consent: { accepted: boolean; revision: number }; legacyHint?: true }
  | { kind: "not_yet" }
  | { kind: "unavailable"; code: string };

export type Binding = { assignmentId: string; bindingId: string };

/** Un rechazo del borde o del motor, con un código cerrado. */
export type FreeRouterRefusal = { code: string; status?: number };

/** Códigos que el contrato (§3.3, danil-contracts `ba893d59`) permite presentar; cualquier otro es «no disponible». */
const PROBLEMS = new Set([
  "free_router_unavailable", "no_access", "not_offered", "consent_required", "consent_revoked",
  "revision_conflict", "binding_required", "binding_proof_invalid", "rate_limited",
  "temporarily_unavailable", "assignment_conflict",
]);
const UNAVAILABLE = "free_router_unavailable";
export const PLATFORM_FEATURE = "free_router_platform_v1";

/** El motor anuncia el Router de plataforma; sin el rasgo, lo que no es personal queda cerrado. */
export function supportsPlatformFreeRouter(status: unknown): boolean {
  const features = (status as { service_features?: unknown } | null)?.service_features;
  return Array.isArray(features) && features.includes(PLATFORM_FEATURE);
}

const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const int = (v: unknown): number | undefined => (Number.isInteger(v) ? (v as number) : undefined);
const ID = /^[A-Za-z0-9_-]{1,128}$/;
// El motor rechaza con `Err(String)`: el código puede llegar solo, como cadena.
const codeOf = (e: unknown): string => str(e) ?? str(record(e)?.code) ?? str(record(e)?.detail) ?? UNAVAILABLE;
const refusal = (code: string, status?: number): FreeRouterRefusal => ({ code, ...(status === undefined ? {} : { status }) });

function policyOf(v: unknown): FreeRouterPolicy | null {
  const p = record(v);
  const version = int(p?.version);
  const policyId = str(p?.policy_id);
  const providers = Array.isArray(p?.providers) && p.providers.every((x) => typeof x === "string") ? (p.providers as string[]) : null;
  return version !== undefined && policyId && providers ? { version, policy_id: policyId, providers } : null;
}

/** Lee el estado: los campos nuevos compatibles se ignoran; un valor que decide y no se entiende cierra. */
function stateOf(body: unknown): FreeRouterState {
  const b = record(body);
  const consent = record(b?.consent);
  const policy = policyOf(b?.policy);
  const revision = int(consent?.revision);
  if (typeof b?.offered !== "boolean" || typeof consent?.accepted !== "boolean" || revision === undefined || !policy) {
    return { kind: "unavailable", code: UNAVAILABLE };
  }
  return { kind: "ready", offered: b.offered, policy, consent: { accepted: consent.accepted, revision }, ...(b.legacy_hint === true ? { legacyHint: true as const } : {}) };
}

const ACCOUNT = /^[1-9][0-9]{0,18}$/;
const ORG = /^org_[A-Za-z0-9]+$/;
const SUB = /^user_[A-Za-z0-9]+$/;

/**
 * El ámbito de un account para el pase. El servidor usa siempre `claims.org` (la organización activa), y el listado
 * trae accounts de todas las organizaciones: solo vale una fila con la org de la fila activa de esa misma respuesta.
 */
export function platformScope(list: unknown, account: string, sub: string, workspace: string): FreeRouterScope | null {
  const l = record(list);
  const rows = Array.isArray(l?.items) ? l.items.map(record) : [];
  const active = rows.find((r) => r && str(r.id) === str(l?.active_workspace_id));
  const row = rows.find((r) => r && str(r.id) === account);
  const org = str(row?.org);
  if (!active || !org || org !== str(active.org) || !ORG.test(org)) return null;
  if (!ACCOUNT.test(account) || !SUB.test(sub) || !ID.test(workspace)) return null;
  return { account, org, sub, workspace };
}

export type FreeRouterDeps = {
  edge: EdgeSend;
  engine: EngineCall;
  now?: () => number;
  /** Programa la renovación; devuelve cómo cancelarla. */
  schedule?: (run: () => void, ms: number) => () => void;
  /** Espera entre reintentos del mismo intento. */
  sleep?: (ms: number) => Promise<void>;
  key?: () => string;
  /** Presupuesto de reintentos de una llamada (404/501 sin desplegar, 429, 503, red). */
  budgetMs?: number;
};

type Entry = { scope: FreeRouterScope; epoch: number; binding?: Binding; jkt?: string; cancelRenewal?: () => void };

/** Qué hacer ante cada código del pase (kb2w8vft, seldon-host ac5db131); lo que no está aquí corta. */
const RECOVERY: Record<string, "retry" | "relink" | "union"> = {
  "free_router.grant.stale_nonce": "retry",
  "free_router.grant.not_fresh": "retry",
  "free_router.grant.no_pending": "relink",
  "free_router.grant.wrong_owner": "union",
  "free_router.owner_required": "union",
};

export function createFreeRouterPlatform(deps: FreeRouterDeps) {
  const now = deps.now ?? Date.now;
  const schedule = deps.schedule ?? ((run, ms) => {
    const t = setTimeout(run, ms);
    // La renovación no mantiene vivo un proceso que ya terminó (pruebas, Node).
    (t as unknown as { unref?: () => void }).unref?.();
    return () => clearTimeout(t);
  });
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const key = deps.key ?? (() => crypto.randomUUID());
  const budgetMs = deps.budgetMs ?? 20_000;
  const entries = new Map<string, Entry>();
  let epochs = 0;
  const base = (account: string) => `/v1/workspaces/${account}/free-router`;
  const idOf = (s: FreeRouterScope) => `${s.account}\n${s.workspace}\n${s.sub}`;

  /** Un intento con su clave: repite lo transitorio dentro del presupuesto y nunca lo definitivo. */
  async function send(method: EdgeMethod, path: string, body?: unknown, intent?: string, budget = budgetMs): Promise<unknown> {
    const deadline = now() + budget;
    for (let attempt = 0; ; attempt++) {
      let last: FreeRouterRefusal;
      let wait = 0;
      let answer: EdgeAnswer | undefined;
      try {
        answer = await deps.edge(method, path, body, method === "GET" ? undefined : intent);
      } catch {
        // Sin respuesta (red): la misma intención se repite con su clave.
        answer = undefined;
      }
      if (!answer) last = refusal("temporarily_unavailable");
      else {
        if (answer.status >= 200 && answer.status < 300) return answer.body ?? null;
        const code = str(record(answer.body)?.code);
        const known = code && PROBLEMS.has(code) ? code : undefined;
        if ((answer.status === 404 || answer.status === 501) && (!code || code === "route_not_found")) last = refusal("not_yet", answer.status);
        else if (answer.status === 429 || answer.status >= 500) last = refusal(known ?? "temporarily_unavailable", answer.status);
        else throw refusal(known ?? UNAVAILABLE, answer.status);
        wait = answer.retryAfterMs ?? 0;
      }
      const delay = Math.max(wait, Math.min(30_000, 500 * 2 ** attempt));
      if (now() + delay > deadline) throw last;
      await sleep(delay);
    }
  }

  async function engine(command: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      return record(await deps.engine(command, args)) ?? {};
    } catch (e) {
      throw refusal(codeOf(e));
    }
  }

  function entry(scope: FreeRouterScope): Entry {
    const id = idOf(scope);
    let e = entries.get(id);
    if (!e) entries.set(id, (e = { scope, epoch: ++epochs }));
    return e;
  }
  /** Una respuesta de antes de un logout o de un cambio de unión no se usa. */
  function current(e: Entry, epoch: number) {
    if (entries.get(idOf(e.scope)) !== e || e.epoch !== epoch) throw refusal("stale");
  }

  async function read(account: string): Promise<FreeRouterState> {
    try {
      return stateOf(await send("GET", base(account)));
    } catch (e) {
      const code = codeOf(e);
      return code === "not_yet" ? { kind: "not_yet" } : { kind: "unavailable", code: PROBLEMS.has(code) ? code : UNAVAILABLE };
    }
  }

  /** Aceptar es una intención con CAS: un conflicto de revisión vuelve a quien llama, que relee. */
  async function accept(account: string, consent: { revision: number } & FreeRouterPolicy) {
    const body = record(await send("PUT", `${base(account)}/consent`, consent, key()));
    if (body?.accepted !== true || int(body.revision) === undefined) throw refusal(UNAVAILABLE);
    return { accepted: true as const, revision: body.revision as number };
  }

  const union = (scope: FreeRouterScope) =>
    engine("set_free_router_union", { workspace: scope.workspace, platformAccount: scope.account, org: scope.org, sub: scope.sub });

  /** Pasos 2 a 4: reto central, prueba del motor sobre ese nonce y alta del binding. */
  async function bind(e: Entry, epoch: number): Promise<Binding> {
    const { scope } = e;
    const path = `${base(scope.account)}/engine-workspaces/${scope.workspace}`;
    for (let proof = 0; ; proof++) {
      const challenge = record(await send("POST", `${path}/challenge`, {}, key()));
      const nonce = str(challenge?.nonce);
      if (!nonce) throw refusal(UNAVAILABLE);
      current(e, epoch);
      const signed = await engine("prove_free_router_binding", { workspace: scope.workspace, nonce });
      current(e, epoch);
      try {
        // Una prueba es una intención: una respuesta perdida se repite con su misma clave.
        const reply = record(await send("PUT", path, { nonce, jwk: signed.jwk, sig: signed.sig }, key()));
        const assignmentId = str(reply?.assignment_id);
        const bindingId = str(reply?.binding_id);
        if (!assignmentId || !bindingId || !ID.test(assignmentId) || !ID.test(bindingId)) throw refusal(UNAVAILABLE);
        current(e, epoch);
        e.binding = { assignmentId, bindingId };
        e.jkt = undefined;
        return e.binding;
      } catch (err) {
        // Un reto caducado o ya consumido: un reto nuevo, una vez. Nunca se reenvía la prueba vieja.
        if (codeOf(err) !== "binding_proof_invalid" || proof > 0) throw err;
      }
    }
  }

  /** Paso 1 y después 2 a 4. */
  async function link(scope: FreeRouterScope): Promise<Binding> {
    const e = entry(scope);
    const epoch = e.epoch;
    await union(scope);
    current(e, epoch);
    return bind(e, epoch);
  }

  /** Paso 5 una vez: nonce de la generación local, pase central e instalación; programa la renovación. */
  async function grantOnce(e: Entry, epoch: number): Promise<void> {
    const { scope } = e;
    const local = await engine("free_router_binding", { workspace: scope.workspace });
    const nonce = str(local.nonce);
    const jkt = str(local.jkt);
    if (!nonce || !jkt) throw refusal(UNAVAILABLE);
    current(e, epoch);
    // Otra llave es otro motor (reinició): su binding ya no sirve y hay que vincular de nuevo.
    if (e.jkt && e.jkt !== jkt) throw refusal("free_router.grant.no_pending");
    e.jkt = jkt;
    const reply = record(await send("POST", `${base(scope.account)}/grant`, { binding_id: e.binding!.bindingId, nonce }, key()));
    const token = str(reply?.grant);
    const expires = Date.parse(str(reply?.expires_at) ?? "");
    if (!token || !Number.isFinite(expires)) throw refusal(UNAVAILABLE);
    current(e, epoch);
    // `{sealed:false}` es una renovación de un binding ya confirmado: también queda instalado.
    await engine("set_free_router_grant", { workspace: scope.workspace, token });
    current(e, epoch);
    // Paso 6: renovar con menos de media vida; la renovación nunca restaura una generación invalidada.
    e.cancelRenewal?.();
    e.cancelRenewal = schedule(() => {
      e.cancelRenewal = undefined;
      grant(scope).catch(() => {});
    }, Math.max(0, (expires - now()) / 2));
  }

  /** Paso 5 con la recuperación que admite cada código, una vez cada una; lo demás deja el Router cerrado. */
  async function grant(scope: FreeRouterScope): Promise<void> {
    const e = entries.get(idOf(scope));
    if (!e?.binding) throw refusal("binding_required");
    const epoch = e.epoch;
    const used = new Set<string>();
    for (;;) {
      try {
        return await grantOnce(e, epoch);
      } catch (err) {
        const recovery = RECOVERY[codeOf(err)];
        if (!recovery || used.has(recovery)) throw err;
        used.add(recovery);
        current(e, epoch);
        if (recovery === "relink") await bind(e, epoch);
        else if (recovery === "union") await union(scope);
        current(e, epoch);
      }
    }
  }

  function stop(e: Entry) {
    e.cancelRenewal?.();
    e.cancelRenewal = undefined;
  }

  /** Paso 7: retirar es el DELETE en la plataforma y después `clear`. Un `clear` sin DELETE no es una retirada. */
  async function withdraw(scope: FreeRouterScope): Promise<void> {
    const e = entries.get(idOf(scope));
    if (e) stop(e);
    await send("DELETE", `${base(scope.account)}/consent`, undefined, key());
    await engine("clear_free_router_grant", { workspace: scope.workspace });
  }

  /**
   * Paso 8: la unión pasa a `null` antes de nada y luego se espera, con un presupuesto corto, la baja de los bindings de
   * esa sesión: después del logout ya no hay token, y lo que quede cae solo a las 24 h. No retira el consentimiento.
   */
  async function signOut(sub: string, cloudBudgetMs = 3_000): Promise<void> {
    const mine = [...entries.values()].filter((e) => e.scope.sub === sub);
    for (const e of mine) {
      stop(e);
      entries.delete(idOf(e.scope));
      e.epoch = ++epochs;
    }
    await Promise.all(mine.map((e) => engine("set_free_router_union", { workspace: e.scope.workspace }).catch(() => {})));
    await Promise.all(mine.map((e) => {
      if (!e.binding) return undefined;
      const path = `${base(e.scope.account)}/engine-workspaces/${e.scope.workspace}/bindings/${e.binding.bindingId}`;
      return send("DELETE", path, undefined, key(), cloudBudgetMs).catch(() => {});
    }));
  }

  return { read, accept, link, grant, withdraw, signOut };
}

export type FreeRouterPlatform = ReturnType<typeof createFreeRouterPlatform>;
