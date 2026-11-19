/**
 * Adopción de los locales al iniciar sesión (plan de cuentas § 7.2): primero el
 * servidor con una llave estable, después el sello aquí con la cuenta que
 * devolvió; un servidor sin la ruta no toca nada.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { adoptLocals, prefsAdoptionMemory } from "../../src/features/shell/account-adoption.ts";
import { prefsPendingUnions } from "../../src/features/shell/account-transfers.ts";

function prefs() {
  const store = new Map<string, unknown>();
  const read = <T>(key: string, fallback: T): T => (store.has(key) ? structuredClone(store.get(key)) : fallback) as T;
  const write = (key: string, value: unknown) => void store.set(key, value);
  let n = 0;
  return { memory: prefsAdoptionMemory(read, write, () => `key-${++n}`), pending: prefsPendingUnions(read, write) };
}

const free = { context_id: "c-free", org: "org_free" };
const candidates = [
  { id: "qlocal01", name: "Uno", adoptable: true },
  { id: "old.ws1", name: "Viejo", adoptable: false, reason: "id_format" },
  { id: "qlocal02", name: "Dos", adoptable: true },
];

test("each local is adopted on the server with a stable key, then sealed here, and its Free router union stays pending", async () => {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const posts: { body: unknown; key?: string }[] = [];
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push([command, args]);
    return (command === "adoption_candidates" ? candidates : undefined) as T;
  };
  const send = async (_c: string, method: string, path: string, body?: unknown, key?: string) => {
    assert.equal(`${method} ${path}`, "POST /v1/workspaces/adopt");
    posts.push({ body, key });
    return { status: 201, body: { id: (body as { engine_workspace_id: string }).engine_workspace_id === "qlocal01" ? "5001" : "5002" } };
  };
  const { memory, pending } = prefs();
  const result = await adoptLocals(invoke, { "x-terminus-machine": "m1" }, send, free, memory, pending);
  assert.deepEqual(result, { adopted: ["qlocal01", "qlocal02"], unavailable: false });
  assert.deepEqual(posts.map((p) => p.body), [{ engine_workspace_id: "qlocal01", name: "Uno" }, { engine_workspace_id: "qlocal02", name: "Dos" }], "el no adoptable no se pide");
  assert.deepEqual(calls.filter(([c]) => c === "adopt_account_workspace").map(([, a]) => a), [
    { "x-terminus-machine": "m1", id: "qlocal01", account: { org: "org_free", account_id: "5001" } },
    { "x-terminus-machine": "m1", id: "qlocal02", account: { org: "org_free", account_id: "5002" } },
  ]);
  assert.deepEqual(pending.list().map((u) => [u.id, u.account_id]), [["qlocal01", "5001"], ["qlocal02", "5002"]]);
  // La llave es la misma en el siguiente intento: el servidor devuelve la misma cuenta.
  const again: string[] = [];
  await adoptLocals(invoke, {}, async (_c, _m, _p, _b, key) => { again.push(key ?? ""); return { status: 200, body: { id: "5001" } }; }, free, memory, pending);
  assert.deepEqual(again, posts.map((p) => p.key));
});

test("a server without the route cuts without sealing, and 409 id_taken is not asked again", async () => {
  const sealed: unknown[] = [];
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    if (command === "adopt_account_workspace") sealed.push(args);
    return (command === "adoption_candidates" ? candidates : undefined) as T;
  };
  for (const status of [404, 501]) {
    const { memory, pending } = prefs();
    assert.deepEqual(await adoptLocals(invoke, {}, async () => ({ status }), free, memory, pending), { adopted: [], unavailable: true });
  }
  assert.equal(sealed.length, 0);
  const { memory, pending } = prefs();
  let asked = 0;
  const taken = async () => { asked++; return { status: 409, body: { code: "id_taken" } }; };
  await adoptLocals(invoke, {}, taken, free, memory, pending);
  await adoptLocals(invoke, {}, taken, free, memory, pending);
  assert.equal(asked, 2, "una vez por cada candidato, y no se repite");
  assert.equal(sealed.length, 0);
  assert.deepEqual(pending.list(), []);
});
