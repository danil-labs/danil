/**
 * Adopción de los locales al iniciar sesión (plan de cuentas § 7.2 y A17 § 10.1):
 * el reto del servidor, la prueba que firma el motor, la adopción con esa prueba y,
 * solo si el servidor repite el `jkt` de este motor, el sello aquí con la cuenta
 * que devolvió. Un servidor sin la ruta o con la adopción apagada no toca nada.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { adoptionTarget, adoptLocals, isPersonal, prefsAdoptionMemory } from "../../src/features/shell/account-adoption.ts";
import { prefsPendingUnions } from "../../src/features/shell/account-transfers.ts";
import { accountRefreshKey, createAccountWorkspaces } from "../../src/features/shell/session-account-workspaces.ts";

function prefs() {
  const store = new Map<string, unknown>();
  const read = <T>(key: string, fallback: T): T => (store.has(key) ? structuredClone(store.get(key)) : fallback) as T;
  const write = (key: string, value: unknown) => void store.set(key, value);
  let n = 0;
  return { memory: prefsAdoptionMemory(read, write, () => `key-${++n}`), pending: prefsPendingUnions(read, write) };
}

const free = { context_id: "c-free", org: "org_free" };
const SUB = "user_01A";
const JKT = "jkt_of_this_engine_aaaaaaaaaaaaaaaaaaaaaaaa".slice(0, 43);
const JWK = { kty: "EC", crv: "P-256", x: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", y: "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy" };
const candidates = [
  { id: "qlocal01", name: "Uno", adoptable: true },
  { id: "old.ws1", name: "Viejo", adoptable: false, reason: "id_format" },
  { id: "qlocal02", name: "Dos", adoptable: true },
];

/** El motor: candidatos, una prueba por reto y el sello. */
function engine(list = candidates, proof: unknown = undefined) {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push([command, args]);
    if (command === "adoption_candidates") return list as T;
    if (command === "adoption_proof") return (proof ?? { jwk: JWK, jkt: JKT, sig: `sig-${args?.nonce}` }) as T;
    return undefined as T;
  };
  return { invoke, calls, sealed: () => calls.filter(([c]) => c === "adopt_account_workspace").map(([, a]) => a) };
}

type Reply = { status: number; body?: unknown };
/** El servidor: un reto nuevo por petición y la respuesta de `adopt` que se le pida. */
function server(adopt: (body: Record<string, unknown>) => Reply, challenge: () => Reply = () => ({ status: 200 })) {
  let n = 0;
  const posts: { path: string; body: Record<string, unknown>; key?: string }[] = [];
  const send = async (_c: string, method: string, path: string, body?: unknown, key?: string) => {
    if (method === "GET" && path === "/v1/identity/me") return { status: 200, body: { id: SUB } };
    assert.equal(method, "POST");
    posts.push({ path, body: body as Record<string, unknown>, key });
    if (path === "/v1/workspaces/adopt/challenge") {
      const reply = challenge();
      return reply.status === 200 && reply.body === undefined ? { status: 200, body: { nonce: String(++n).padStart(43, "N"), expires_at: "2026-11-19T00:01:00Z" } } : reply;
    }
    assert.equal(path, "/v1/workspaces/adopt");
    return adopt(body as Record<string, unknown>);
  };
  return { send, posts, adopts: () => posts.filter((p) => p.path === "/v1/workspaces/adopt") };
}

const ok = (body: Record<string, unknown>): Reply => ({
  status: 201,
  body: { id: body.engine_workspace_id === "qlocal01" ? "5001" : "5002", engine_workspace_id: body.engine_workspace_id, org: "org_free", possession: { jkt: JKT } },
});

test("each local goes challenge, engine proof, adopt with the proof, then the seal here, and its Free router union stays pending", async () => {
  const e = engine();
  const s = server(ok);
  const { memory, pending } = prefs();
  const result = await adoptLocals(e.invoke, { "x-terminus-machine": "m1" }, s.send, free, memory, pending, SUB);
  assert.deepEqual(result, { adopted: ["qlocal01", "qlocal02"], refused: [], unavailable: false });
  assert.deepEqual(s.posts.map((p) => [p.path, p.body.engine_workspace_id]), [
    ["/v1/workspaces/adopt/challenge", "qlocal01"], ["/v1/workspaces/adopt", "qlocal01"],
    ["/v1/workspaces/adopt/challenge", "qlocal02"], ["/v1/workspaces/adopt", "qlocal02"],
  ], "el no adoptable no se pide");
  // El motor firma el reto de su workspace con la org y el sub de la sesión; nada más viaja.
  const proofs = e.calls.filter(([c]) => c === "adoption_proof").map(([, a]) => a);
  assert.deepEqual(proofs[0], { "x-terminus-machine": "m1", id: "qlocal01", nonce: "1".padStart(43, "N"), org: "org_free", sub: SUB });
  assert.deepEqual(s.adopts()[0].body, { engine_workspace_id: "qlocal01", name: "Uno", proof: { nonce: "1".padStart(43, "N"), jwk: JWK, sig: `sig-${"1".padStart(43, "N")}` } });
  assert.deepEqual(e.sealed(), [
    { "x-terminus-machine": "m1", id: "qlocal01", account: { org: "org_free", account_id: "5001" } },
    { "x-terminus-machine": "m1", id: "qlocal02", account: { org: "org_free", account_id: "5002" } },
  ]);
  assert.deepEqual(pending.list().map((u) => [u.id, u.account_id]), [["qlocal01", "5001"], ["qlocal02", "5002"]]);
  // Cada intento lleva su reto, y su llave: la estable del workspace y el reto.
  const keys = s.adopts().map((p) => p.key);
  assert.deepEqual(keys, ["key-1." + "1".padStart(43, "N"), "key-2." + "2".padStart(43, "N")]);
  assert.ok(keys.every((k) => k && k.length <= 128));
  const again = server(ok);
  await adoptLocals(e.invoke, {}, again.send, free, memory, pending, SUB);
  assert.equal(again.adopts()[0].key, "key-1." + "1".padStart(43, "N"), "misma llave estable, reto nuevo de este servidor");
  assert.notEqual(again.adopts()[0].key, again.adopts()[1].key);
});

test("without the possession echo of this engine nothing is sealed", async () => {
  for (const possession of [undefined, {}, { jkt: "otra_llave" }, { jkt: 1 }]) {
    const e = engine(candidates.slice(0, 1));
    const s = server((body) => ({ status: 201, body: { ...(ok(body).body as object), possession } }));
    const { memory, pending } = prefs();
    const result = await adoptLocals(e.invoke, {}, s.send, free, memory, pending, SUB);
    assert.deepEqual(result.adopted, [], JSON.stringify(possession));
    assert.equal(e.sealed().length, 0);
    assert.deepEqual(pending.list(), []);
  }
});

test("a server without the route, with adoption off or without a personal org cuts without sealing", async () => {
  const cases: [string, Reply][] = [
    ["404", { status: 404 }],
    ["501", { status: 501 }],
    ["503 adoption_disabled", { status: 503, body: { code: "adoption_disabled" } }],
    ["409 adoption_requires_personal", { status: 409, body: { code: "adoption_requires_personal" } }],
    ["409 adoption_requires_free", { status: 409, body: { code: "adoption_requires_free" } }],
  ];
  for (const [name, reply] of cases) {
    // En el reto.
    let e = engine();
    let s = server(ok, () => reply);
    let { memory, pending } = prefs();
    assert.deepEqual(await adoptLocals(e.invoke, {}, s.send, free, memory, pending, SUB), { adopted: [], refused: [], unavailable: true }, `reto ${name}`);
    assert.equal(s.posts.length, 1, "corta en el primero");
    assert.equal(e.calls.filter(([c]) => c === "adoption_proof").length, 0, "sin reto no se firma");
    // En la adopción.
    e = engine();
    s = server(() => reply);
    ({ memory, pending } = prefs());
    assert.deepEqual(await adoptLocals(e.invoke, {}, s.send, free, memory, pending, SUB), { adopted: [], refused: [], unavailable: true }, `adopt ${name}`);
    assert.equal(e.sealed().length, 0);
    assert.deepEqual(pending.list(), []);
  }
  // Un 503 sin `adoption_disabled` es pasajero: sigue con el siguiente.
  const e = engine();
  const s = server(() => ({ status: 503 }));
  const { memory, pending } = prefs();
  assert.equal((await adoptLocals(e.invoke, {}, s.send, free, memory, pending, SUB)).unavailable, false);
  assert.equal(s.adopts().length, 2);
});

test("409 id_taken is not asked again, and a rejected proof or another 409 is retried with a new challenge", async () => {
  const e = engine();
  const { memory, pending } = prefs();
  const taken = server(() => ({ status: 409, body: { code: "id_taken" } }));
  assert.deepEqual((await adoptLocals(e.invoke, {}, taken.send, free, memory, pending, SUB)).refused, ["Uno", "Dos"], "se dice cuáles");
  await adoptLocals(e.invoke, {}, taken.send, free, memory, pending, SUB);
  assert.equal(taken.adopts().length, 2, "una vez por cada candidato, y no se repite");
  // El rechazo es de esa organización: con el Free de otro correo se intenta.
  await adoptLocals(e.invoke, {}, taken.send, { context_id: "c-other", org: "org_other" }, memory, pending, SUB);
  assert.equal(taken.adopts().length, 4);
  for (const reply of [{ status: 403, body: { code: "adoption_proof_invalid" } }, { status: 409, body: { code: "version_conflict" } }]) {
    const e2 = engine(candidates.slice(0, 1));
    const s = server(() => reply);
    const p = prefs();
    await adoptLocals(e2.invoke, {}, s.send, free, p.memory, p.pending, SUB);
    await adoptLocals(e2.invoke, {}, s.send, free, p.memory, p.pending, SUB);
    assert.equal(s.adopts().length, 2, `${reply.body.code} se repite en el siguiente repaso`);
    assert.notEqual(s.adopts()[0].body.proof, s.adopts()[1].body.proof);
    assert.equal(e2.sealed().length, 0);
  }
  assert.equal(e.sealed().length, 0);
});

test("a bad challenge or a bad engine proof is not sent, and a reply that does not match what was asked is not sealed", async () => {
  for (const challenge of [{ status: 200, body: { nonce: "corto" } }, { status: 200, body: {} }, { status: 201, body: { nonce: "N".repeat(43) } }]) {
    const s = server(ok, () => challenge);
    const p = prefs();
    await adoptLocals(engine(candidates.slice(0, 1)).invoke, {}, s.send, free, p.memory, p.pending, SUB);
    assert.equal(s.adopts().length, 0, JSON.stringify(challenge));
  }
  for (const proof of [{ jwk: { ...JWK, d: "secreto" }, jkt: JKT, sig: "s" }, { jwk: JWK, sig: "s" }, { jwk: JWK, jkt: "corto", sig: "s" }, { jwk: JWK, jkt: `${JKT}x`, sig: "s" }, { jwk: { ...JWK, x: "corta" }, jkt: JKT, sig: "s" }, { jwk: { ...JWK, crv: "P-384" }, jkt: JKT, sig: "s" }, null]) {
    const s = server(ok);
    const p = prefs();
    await adoptLocals(engine(candidates.slice(0, 1), proof ?? "nada").invoke, {}, s.send, free, p.memory, p.pending, SUB);
    assert.equal(s.adopts().length, 0, JSON.stringify(proof));
  }
  const e = engine(candidates.slice(0, 1));
  const p = prefs();
  for (const body of [
    { id: "5001", engine_workspace_id: "qotro999" },
    { id: "5001", org: "org_ajena" },
    { id: "abc" },
    { id: 2 ** 60 },
    { id: "0" },
  ]) await adoptLocals(e.invoke, {}, server(() => ({ status: 201, body: { ...body, possession: { jkt: JKT } } })).send, free, p.memory, p.pending, SUB);
  assert.equal(e.sealed().length, 0, "ninguna de esas respuestas se sella");
  await adoptLocals(e.invoke, {}, server(() => ({ status: 201, body: { id: 5001, engine_workspace_id: "qlocal01", org: "org_free", possession: { jkt: JKT } } })).send, free, p.memory, p.pending, SUB);
  assert.equal(e.sealed().length, 1);
});

test("a 429 on the challenge ends this pass without marking adoption unavailable", async () => {
  const e = engine();
  const s = server(ok, () => ({ status: 429, body: { code: "rate_limited" } }));
  const p = prefs();
  assert.deepEqual(await adoptLocals(e.invoke, {}, s.send, free, p.memory, p.pending, SUB), { adopted: [], refused: [], unavailable: false });
  assert.equal(s.posts.length, 1, "no pide más retos en este repaso");
  assert.equal(e.calls.filter(([c]) => c === "adoption_proof").length, 0);
  // El siguiente repaso lo vuelve a intentar.
  assert.deepEqual((await adoptLocals(e.invoke, {}, server(ok).send, free, p.memory, p.pending, SUB)).adopted, ["qlocal01", "qlocal02"]);
});

test("adoption that the server turned off is retried after a new sign-in, not in the same one", async () => {
  globalThis.localStorage ??= (() => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage;
  })();
  const invoke = async <T>(command: string): Promise<T> =>
    (command === "machine_list" ? [{ id: "local", local: true, features: ["account_workspace_v1", "account_adoption_v1", "account_adoption_proof_v1"] }]
      : command === "adoption_candidates" ? candidates.slice(0, 1)
      : command === "list_workspaces" ? { workspaces: [] } : undefined) as T;
  let challenges = 0;
  const send = async (_c: string, method: string, path: string) => {
    if (path === "/v1/workspaces/adopt/challenge") { challenges++; return { status: 503, body: { code: "adoption_disabled" } }; }
    return method === "GET" ? { status: 200, body: path === "/v1/identity/me" ? { id: SUB } : { items: [] } } : { status: 500 };
  };
  const accounts = createAccountWorkspaces(invoke, true, () => {});
  const group = (context_id: string) => [{ context_id, org: "org_free", plan: "free" }];
  await accounts.refresh(group("ctx-1"), send, () => SUB);
  await accounts.refresh(group("ctx-1"), send, () => SUB);
  assert.equal(challenges, 1, "en la misma sesión no se repite");
  await accounts.refresh(group("ctx-2"), send, () => SUB);
  assert.equal(challenges, 2, "un inicio de sesión nuevo vuelve a intentar");
});

test("without a known person the sub comes from /v1/identity/me, and without it nothing is asked", async () => {
  const e = engine(candidates.slice(0, 1));
  const s = server(ok);
  const p = prefs();
  assert.deepEqual((await adoptLocals(e.invoke, {}, s.send, free, p.memory, p.pending)).adopted, ["qlocal01"]);
  assert.equal(e.calls.find(([c]) => c === "adoption_proof")?.[1]?.sub, SUB);
  let asked = 0;
  const nobody = async (_c: string, method: string) => { asked++; return method === "GET" ? { status: 401 } : { status: 200 }; };
  const q = prefs();
  assert.deepEqual(await adoptLocals(engine().invoke, {}, nobody, free, q.memory, q.pending), { adopted: [], refused: [], unavailable: false });
  assert.equal(asked, 1, "solo la lectura de la persona");
});

test("locals are adopted only when there is exactly one Free org", () => {
  const g = (org: string, plan: string | null) => ({ context_id: `c-${org}`, org, plan });
  assert.equal(adoptionTarget([g("org_free", "free"), g("org_acme", "paid")])?.org, "org_free");
  assert.equal(adoptionTarget([g("org_a", "free"), g("org_b", "free")]), undefined, "dos correos con su Free: elige la persona");
  assert.equal(adoptionTarget([g("org_acme", "paid")]), undefined);
});

test("the personal org is recognized by `personal`, whatever its plan, and by Free only when identity does not say", () => {
  const g = (org: string, plan: string | null, personal?: boolean) => ({ context_id: `c-${org}`, org, plan, ...(personal === undefined ? {} : { personal }) });
  assert.equal(adoptionTarget([g("org_mine", "pro", true), g("org_acme", "team", false)])?.org, "org_mine", "a personal org upgraded to Pro is still the target");
  assert.equal(adoptionTarget([g("org_free", "free", false)]), undefined, "identity saying it is not personal wins over the plan");
  assert.equal(isPersonal(g("org_old", "free")), true, "an older identity without the field falls back to the Free plan");
  assert.equal(isPersonal(g("org_old", "pro")), false);
});

test("the accounts are read again when identity starts saying which org is personal, with the same plan", () => {
  const g = (personal?: boolean) => [{ context_id: "c1", org: "org_mine", plan: "pro", ...(personal === undefined ? {} : { personal }) }];
  assert.notEqual(accountRefreshKey(g()), accountRefreshKey(g(true)), "personal: true arrives after the identity deploy");
  assert.notEqual(accountRefreshKey([{ context_id: "c1", org: "o", plan: "free" }]), accountRefreshKey([{ context_id: "c1", org: "o", plan: "free", personal: false }]), "a correction with the same plan");
  assert.equal(accountRefreshKey([{ context_id: "c1", org: "o", plan: "free" }]), accountRefreshKey([{ context_id: "c1", org: "o", plan: "free", personal: true }]), "same meaning, no extra read");
  assert.equal(accountRefreshKey(null), "null");
});
