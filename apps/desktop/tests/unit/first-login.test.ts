/**
 * Login inicial del primer arranque (plan «desk-ligar-locales-al-actualizar», rev. 3 § 2):
 * la organización personal se abre sola si falta, los locales se ligan a ella, lo que ya es de
 * otra organización se queda, lo transitorio se reintenta sin pantalla y el local no se toca.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { firstLoginPhase, FIRST_LOGIN_KEY, linkingOutcome, localCandidateCount, shouldMarkFirstLoginDone } from "../../src/features/shell/first-login.ts";
import { createLinker } from "../../src/features/shell/first-login-link.ts";
import { gateView } from "../../src/features/shell/session-gate.ts";
import { personSessionSource, registerEngineSessionSource } from "../../src/features/shell/session-source.ts";
import { createPersonalOpener, openPersonal, personalOrgOf } from "../../src/features/shell/personal-open.ts";
import { createAccountWorkspaces } from "../../src/features/shell/session-account-workspaces.ts";

globalThis.localStorage ??= (() => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage;
})();

const SUB = "user_01A";
const JKT = "j".repeat(43);
const JWK = { kty: "EC", crv: "P-256", x: "x".repeat(43), y: "y".repeat(43) };
const FEATURES = ["account_workspace_v1", "account_adoption_v1", "account_adoption_proof_v1"];
const DANIL = { context_id: "ctx-danil", org: "org_danil", org_name: "Danil", plan: "pro", email: "ana@danil.ai", family: "fam-1" };
const PERSONAL = { context_id: "ctx-personal", org: "org_personal", org_name: "Cuenta de Ana", plan: "free", email: "ana@danil.ai", family: "fam-1" };
const ORGS = [{ id: "org_danil", type: "team", name: "Danil" }, { id: "org_personal", type: "personal", name: "Cuenta de Ana" }];

/** El motor: dos locales sin organización y uno ya sellado en Danil. */
function engine(candidates = [{ id: "qlocal01", name: "Personal", adoptable: true }, { id: "qlocal02", name: "Maayataan", adoptable: true }]) {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  let left = [...candidates];
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push([command, args]);
    if (command === "machine_list") return [{ id: "local", local: true, features: FEATURES }] as T;
    if (command === "adoption_candidates") return left as T;
    if (command === "adoption_proof") return { jwk: JWK, jkt: JKT, sig: `sig-${args?.nonce}` } as T;
    if (command === "adopt_account_workspace") { left = left.filter((c) => c.id !== args?.id); return undefined as T; }
    if (command === "list_workspaces") return { workspaces: [{ id: "qdanil01", name: "Danil Workspace", account: { org: "org_danil", account_id: "9001" } }] } as T;
    return undefined as T;
  };
  return { invoke, calls, sealed: () => calls.filter(([c]) => c === "adopt_account_workspace").map(([, a]) => a?.id) };
}

type Reply = { status: number; body?: unknown };
/** El borde: `/me` con la personal, el catálogo vacío, el reto y la adopción; `select` contesta lo que se le pida. */
function edge(select: () => Reply | Promise<Reply> = () => ({ status: 200, body: { organization: { id: "org_personal" } } })) {
  let n = 0;
  const posts: { context: string; path: string; body: Record<string, unknown> }[] = [];
  const send = async (context: string, method: string, path: string, body?: unknown) => {
    if (method === "GET" && path === "/v1/identity/me") return { status: 200, body: { id: SUB, organizations: ORGS } };
    if (method === "GET" && path.startsWith("/v1/workspaces")) return { status: 200, body: { items: [], next_cursor: null } };
    posts.push({ context, path, body: body as Record<string, unknown> });
    if (path === "/v1/identity/organizations/select") return select();
    if (path === "/v1/workspaces/adopt/challenge") return { status: 200, body: { nonce: String(++n).padStart(43, "N") } };
    if (path === "/v1/workspaces/adopt") {
      const id = (body as { engine_workspace_id: string }).engine_workspace_id;
      return { status: 201, body: { id: String(5000 + n), engine_workspace_id: id, org: "org_personal", possession: { jkt: JKT } } };
    }
    return { status: 404 };
  };
  return { send, posts, selects: () => posts.filter((p) => p.path === "/v1/identity/organizations/select") };
}

test("with candidates and the personal org not open, Desk opens it with select, adopts into it and goes back to the org that was active", async () => {
  const e = engine();
  const s = edge();
  let groups: (typeof DANIL)[] = [DANIL];
  let defaultContext = "ctx-danil";
  const opener = createPersonalOpener({
    send: s.send,
    reread: async () => { groups = [DANIL, PERSONAL]; defaultContext = "ctx-personal"; return groups; },
    defaultContext: () => defaultContext,
    groups: () => groups,
  });
  const accounts = createAccountWorkspaces(e.invoke, true, () => {});
  await accounts.refresh(groups, s.send, () => SUB, opener);
  assert.deepEqual(s.selects().map((p) => [p.context, p.body.organization_id]), [["ctx-danil", "org_personal"]], "se abre la personal por la sesión que ya existe");
  assert.deepEqual(e.sealed(), [], "abrir no adopta todavía: lo hace el repaso con la lista nueva");
  await accounts.refresh(groups, s.send, () => SUB, opener);
  assert.deepEqual(e.sealed(), ["qlocal01", "qlocal02"]);
  assert.equal(accounts.adoptionReport()?.org, "org_personal");
  assert.deepEqual(accounts.adoptionProgress()?.rows.map((r) => [r.name, r.step]), [["Personal", "done"], ["Maayataan", "done"]]);
  assert.deepEqual(s.selects().map((p) => [p.context, p.body.organization_id]).at(-1), ["ctx-danil", "org_danil"], "vuelve a la organización que estaba activa");
  assert.equal(linkingOutcome(accounts.adoptionProgress(), accounts.personalOutcome()), "done");
});

test("without candidates there is only the login: no select, no adoption, and the first login is marked done", async () => {
  const e = engine([]);
  const s = edge();
  const opener = createPersonalOpener({ send: s.send, reread: async () => [DANIL], defaultContext: () => "ctx-danil", groups: () => [DANIL] });
  const accounts = createAccountWorkspaces(e.invoke, true, () => {});
  await accounts.refresh([DANIL], s.send, () => SUB, opener);
  assert.equal(s.selects().length, 0, "sin nada que ligar no se cambia de organización");
  assert.equal(accounts.adoptionReport(), null);
  assert.equal(shouldMarkFirstLoginDone({ signedIn: true, remaining: 0 }), true);
  assert.equal(shouldMarkFirstLoginDone({ signedIn: false, remaining: 0 }), false, "sin login no se marca");
  assert.equal(shouldMarkFirstLoginDone({ signedIn: true, remaining: 2 }), false, "con locales sin organización tampoco");
  assert.equal(FIRST_LOGIN_KEY, "onboarding.first_login_v1");
});

test("a workspace that already belongs to an organization stays there and is listed as staying, not as a failure", async () => {
  const e = engine();
  const s = edge();
  const accounts = createAccountWorkspaces(e.invoke, true, () => {});
  await accounts.refresh([DANIL, PERSONAL], s.send, () => SUB);
  assert.ok(!e.sealed().includes("qdanil01"), "el de Danil no se adopta");
  assert.ok(!s.posts.some((p) => p.body?.engine_workspace_id === "qdanil01"), "ni se pide");
  assert.deepEqual(accounts.sealedElsewhere("org_personal"), [{ id: "qdanil01", name: "Danil Workspace", org: "org_danil" }]);
  assert.deepEqual(accounts.adoptionReport()?.failed, [], "quedarse no es un fallo");
});

test("a transient failure opening the personal org shows no screen, leaves the local untouched and is retried", async () => {
  const e = engine();
  let down = true;
  const s = edge(async () => { if (down) throw { detail: "network" }; return { status: 200, body: {} }; });
  let groups: (typeof DANIL)[] = [DANIL];
  const opener = createPersonalOpener({
    send: s.send,
    reread: async () => { if (!down) groups = [DANIL, PERSONAL]; return groups; },
    defaultContext: () => "ctx-danil",
    groups: () => groups,
  });
  const accounts = createAccountWorkspaces(e.invoke, true, () => {});
  await accounts.refresh(groups, s.send, () => SUB, opener);
  assert.deepEqual(accounts.personalOutcome(), { kind: "retry", cause: "network" });
  assert.equal(linkingOutcome(accounts.adoptionProgress(), accounts.personalOutcome()), "background", "se cierra la pantalla y sigue en segundo plano");
  assert.deepEqual(e.sealed(), [], "el local no se toca");
  assert.equal(accounts.adoptionReport(), null, "no hay aviso de error");
  down = false;
  await accounts.refresh(groups, s.send, () => SUB, opener);
  await accounts.refresh(groups, s.send, () => SUB, opener);
  assert.deepEqual(e.sealed(), ["qlocal01", "qlocal02"], "el reintento liga");
});

test("an unexpected answer is logged, nothing is touched and it waits for the next start", async () => {
  const e = engine();
  const s = edge(() => ({ status: 409, body: { code: "organization_auth_required" } }));
  const logged: unknown[][] = [];
  const outcome = await openPersonal([DANIL], s.send, async () => [DANIL], (...args) => void logged.push(args));
  assert.deepEqual(outcome, { kind: "later", cause: "organization_auth_required" });
  assert.equal(logged.length, 1, "se registra la causa");
  assert.deepEqual(e.sealed(), []);
  assert.equal(linkingOutcome(null, outcome), "background");
  const opener = createPersonalOpener({ send: s.send, reread: async () => [DANIL], defaultContext: () => "ctx-danil", groups: () => [DANIL], log: () => {} });
  await opener.open([DANIL]);
  await opener.open([DANIL]);
  assert.equal(s.selects().length, 2, "una vez por openPersonal y una por el abridor: no se repite en cada foco");
  // Un servidor que no responde (503) también es transitorio.
  assert.deepEqual(await openPersonal([DANIL], edge(() => ({ status: 503 })).send, async () => [DANIL]), { kind: "retry", cause: "select_503" });
  // Dos correos: cada uno con su personal; no se elige por la persona (riesgo § 4).
  assert.deepEqual(await openPersonal([DANIL, { ...PERSONAL, email: "otra@danil.ai", family: "fam-2" }], s.send, async () => []), { kind: "none", cause: "several_emails" });
});

test("id_taken is logged, the local stays as it is, and it is asked again on the next start, not in this one", async () => {
  const e = engine([{ id: "qlocal01", name: "Personal", adoptable: true }]);
  let adopts = 0;
  const base = edge();
  const send = async (context: string, method: string, path: string, body?: unknown) => {
    if (path === "/v1/workspaces/adopt") { adopts++; return { status: 409, body: { code: "id_taken" } }; }
    return base.send(context, method, path, body);
  };
  const warned: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => void warned.push(args);
  try {
    const first = createAccountWorkspaces(e.invoke, true, () => {});
    await first.refresh([PERSONAL], send, () => SUB);
    await first.refresh([PERSONAL], send, () => SUB);
    assert.equal(adopts, 1, "en esta ejecución no se insiste");
    assert.deepEqual(e.sealed(), [], "el local queda igual");
    assert.ok(warned.some(([, detail]) => (detail as { reason?: string }).reason === "id_taken"), "se registra con la causa");
    const next = createAccountWorkspaces(e.invoke, true, () => {});
    next.forgetRefusals();
    await next.refresh([PERSONAL], send, () => SUB);
    assert.equal(adopts, 2, "el siguiente arranque lo vuelve a pedir");
  } finally {
    console.warn = warn;
    localStorage.clear();
  }
});

test("the personal org is the one identity marks as personal, not a Free team", () => {
  assert.equal(personalOrgOf({ organizations: ORGS }), "org_personal");
  assert.equal(personalOrgOf({ organizations: [{ id: "org_team", type: "team", plan: "free" }] }), null);
  assert.equal(personalOrgOf({ organizations: [{ id: "a", type: "personal" }, { id: "b", type: "personal" }] }), null, "dos personales: no se adivina");
});

test("with a saved session the screen offers «Continue as», without one it offers sign in, and once done it does not come back", () => {
  assert.deepEqual(firstLoginPhase({ done: false, status: { state: "connected", email: "ana@danil.ai" }, signedInThisRun: false }), { t: "continue", email: "ana@danil.ai" });
  assert.deepEqual(firstLoginPhase({ done: false, status: { state: "connected", sessions: [{ email: "ana@danil.ai" }] }, signedInThisRun: false }), { t: "continue", email: "ana@danil.ai" });
  assert.deepEqual(firstLoginPhase({ done: false, status: { state: "disconnected" }, signedInThisRun: false }), { t: "sign_in" });
  assert.deepEqual(firstLoginPhase({ done: false, status: null, signedInThisRun: false }), { t: "sign_in" });
  assert.deepEqual(firstLoginPhase({ done: false, status: { state: "connected", email: "ana@danil.ai" }, signedInThisRun: true }), { t: "linking" }, "quien acaba de entrar en el alta no repite el login");
  assert.deepEqual(firstLoginPhase({ done: true, status: { state: "disconnected" }, signedInThisRun: false }), { t: "hidden" });
});

test("until the person confirms the account nothing is sealed, and the count only includes locals this engine can link", async () => {
  const e = engine();
  const s = edge();
  const accounts = createAccountWorkspaces(e.invoke, true, () => {});
  accounts.hold(true);
  await accounts.refresh([DANIL, PERSONAL], s.send, () => SUB);
  assert.deepEqual(e.sealed(), [], "con otra cuenta, los locales no pueden quedar ya en esta personal");
  assert.equal(s.posts.length, 0);
  accounts.hold(false);
  await accounts.refresh([DANIL, PERSONAL], s.send, () => SUB);
  assert.deepEqual(e.sealed(), ["qlocal01", "qlocal02"]);
  const old = async <T>(command: string): Promise<T> => (command === "machine_list" ? [{ id: "local", local: true, features: ["account_workspace_v1"] }] : [{ id: "x" }]) as T;
  assert.equal(await localCandidateCount(old), 0, "un motor sin la prueba de posesión no liga");
  assert.equal(await localCandidateCount(engine().invoke), 2);
});

test("a later fleet read of this machine without features does not turn adoption off for this run", async () => {
  const e = engine();
  let features: string[] | undefined = FEATURES;
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> =>
    command === "machine_list" ? [{ id: "local", local: true, ...(features ? { features } : {}) }] as T : e.invoke<T>(command, args);
  const s = edge();
  const accounts = createAccountWorkspaces(invoke, true, () => {});
  accounts.hold(true);
  await accounts.refresh([DANIL, PERSONAL], s.send, () => SUB);
  features = undefined;
  accounts.hold(false);
  await accounts.refresh([DANIL, PERSONAL], s.send, () => SUB);
  assert.deepEqual(e.sealed(), ["qlocal01", "qlocal02"]);
  assert.equal(await localCandidateCount(invoke, async () => FEATURES), 0, "ya ligados, no queda nada");
});

test("adoption reads the features from the engine, not from the fleet row, which may come without them", async () => {
  const e = engine();
  // La fila propia por la flota: sin `features` (el inventario de computers no responde en esa Mac).
  const fleet = async <T>(command: string, args?: Record<string, unknown>): Promise<T> =>
    command === "machine_list" ? [{ id: "local", local: true, active: true, on: true, hosts: true }] as T : e.invoke<T>(command, args);
  const s = edge();
  const accounts = createAccountWorkspaces(fleet, true, () => {}, async () => FEATURES);
  await accounts.refresh([DANIL, PERSONAL], s.send, () => SUB);
  assert.deepEqual(e.sealed(), ["qlocal01", "qlocal02"], "con el motor anunciando la prueba de posesión, se adopta");
  assert.equal(await localCandidateCount(fleet, async () => FEATURES), 0);
});

test("when adoption cannot run it says why, and the first login is not marked done", async () => {
  const e = engine();
  const fleet = async <T>(command: string, args?: Record<string, unknown>): Promise<T> =>
    command === "machine_list" ? [{ id: "local", local: true }] as T : e.invoke<T>(command, args);
  const warned: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => void warned.push(args);
  try {
    const accounts = createAccountWorkspaces(fleet, true, () => {}, async () => null);
    await accounts.refresh([DANIL, PERSONAL], edge().send, () => SUB);
    await accounts.refresh([DANIL, PERSONAL], edge().send, () => SUB);
    assert.deepEqual(warned.filter(([m]) => m === "[adoption] not run").map(([, d]) => d), [{ cause: "engine_features" }], "una vez por causa");
    const none = createAccountWorkspaces(engine().invoke, true, () => {}, async () => FEATURES);
    await none.refresh([], edge().send, () => SUB);
    assert.ok(warned.some(([m, d]) => m === "[adoption] not run" && (d as { cause: string }).cause === "no_session"));
  } finally {
    console.warn = warn;
  }
  assert.equal(await localCandidateCount(fleet, async () => null), null, "sin saber qué anuncia el motor no se sabe cuántos quedan");
  assert.equal(shouldMarkFirstLoginDone({ signedIn: true, remaining: null }), false);
});

test("the linker opens the personal org, links the seven locals and reports, with an empty fleet inventory", async () => {
  const seven = Array.from({ length: 7 }, (_, i) => ({ id: `qlocal0${i + 1}`, name: `Local ${i + 1}`, adoptable: true }));
  const e = engine(seven);
  let opened = false;
  const status = () => ({ state: "connected", default_context: opened ? "ctx-personal" : "ctx-danil", sessions: [{ family: "f1", email: "ana@danil.ai", contexts: [DANIL, ...(opened ? [PERSONAL] : [])] }] });
  const base = edge(() => { opened = true; return { status: 200, body: {} }; });
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    if (command === "machine_list") return [{ id: "local", local: true }] as T;
    if (command === "danil_session_status") return status() as T;
    if (command === "danil_edge_fetch") {
      const a = args as { method: string; path: string; body?: unknown; context: string };
      return base.send(a.context, a.method, a.path, a.body) as Promise<T>;
    }
    return e.invoke<T>(command, args);
  };
  const linker = createLinker(invoke, async () => FEATURES, { wait: async () => {} });
  assert.equal(await linker.run(), "done");
  assert.equal(e.sealed().length, 7);
  assert.equal(linker.report()?.adopted.length, 7);
  assert.equal(linker.report()?.org, "org_personal");
  assert.deepEqual(base.selects().map((p) => p.body.organization_id), ["org_personal", "org_danil"]);
});

test("the gate shows loading until the session is known, the login without one, and the app only with one", () => {
  assert.deepEqual(gateView({ status: undefined, done: true, signedInThisRun: false, linked: false }), { t: "loading" });
  assert.deepEqual(gateView({ status: null, done: true, signedInThisRun: false, linked: false }), { t: "sign_in" }, "sin poder leer la sesión se pide, no se abre");
  assert.deepEqual(gateView({ status: { state: "disconnected" }, done: true, signedInThisRun: false, linked: false }), { t: "sign_in" }, "cerrar sesión con la app abierta vuelve al login");
  assert.deepEqual(gateView({ status: { state: "connected", email: "ana@danil.ai" }, done: true, signedInThisRun: false, linked: false }), { t: "open" });
  assert.deepEqual(gateView({ status: { state: "connected", email: "ana@danil.ai" }, done: false, signedInThisRun: false, linked: false }), { t: "continue", email: "ana@danil.ai" });
  assert.deepEqual(gateView({ status: { state: "connected", email: "ana@danil.ai" }, done: false, signedInThisRun: false, linked: true }), { t: "open" }, "ligado en esta ejecución, aunque quede algo para el siguiente arranque");
});

test("the session is read through one source: desk_auth today, and the engine once it announces person_session_v1", async () => {
  const deskConnected = { state: "connected", email: "ana@danil.ai" };
  const calls: string[] = [];
  const invoke = async <T>(command: string): Promise<T> => { calls.push(command); return (command === "danil_session_status" ? deskConnected : undefined) as T; };
  const today = await personSessionSource(invoke, async () => FEATURES);
  assert.equal(today.origin, "desk");
  assert.deepEqual(await today.read(), deskConnected);
  // El motor ya es dueño de la sesión: lo que guarde el llavero de Desk no cuenta (decisión § 2.6).
  const engineOwned = await personSessionSource(invoke, async () => [...FEATURES, "person_session_v1"]);
  assert.equal(engineOwned.origin, "engine");
  assert.deepEqual(await engineOwned.read(), { state: "disconnected" }, "sin el adaptador del motor, sin sesión: no se abre con la del llavero");
  await assert.rejects(engineOwned.signIn(), (e: { detail?: string }) => e.detail === "not_available_yet");
  registerEngineSessionSource({ origin: "engine", read: async () => ({ state: "connected", email: "cli@danil.ai" }), signIn: async () => {}, changes: async () => () => {} });
  assert.deepEqual(await (await personSessionSource(invoke, async () => ["person_session_v1"])).read(), { state: "connected", email: "cli@danil.ai" }, "T6 cambia el origen sin tocar el gate");
  registerEngineSessionSource(null);
  // Sin saber qué anuncia el motor, se queda el origen de hoy.
  assert.equal((await personSessionSource(invoke, async () => null)).origin, "desk");
});
