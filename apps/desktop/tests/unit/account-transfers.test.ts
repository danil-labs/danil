/**
 * Traslados entre organizaciones (plan de cuentas § 8): el catálogo declara la
 * cuenta nueva con `moved_from`, la ventana vuelve a sellar y deja pendiente la
 * unión del Free router con la cuenta nueva, que se reintenta hasta que pasa.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { accountId, applyMoves, movesFor, type PendingUnion, prefsPendingUnions, retryUnions } from "../../../../packages/shell/src/shell/account-transfers.ts";

const local = [
  { id: "qmoved01", account: { org: "org_old", account_id: "10" } },
  { id: "qstays01", account: { org: "org_old", account_id: "11" } },
];

function memoryPending() {
  const store = new Map<string, unknown>();
  return prefsPendingUnions((key, fallback) => (store.has(key) ? structuredClone(store.get(key)) : fallback) as never, (key, value) => store.set(key, value));
}

test("account ids are decimal text or safe integers only", () => {
  assert.equal(accountId("1000000000001"), "1000000000001");
  assert.equal(accountId(10), "10");
  assert.equal(accountId(2 ** 53 + 2), null);
  assert.equal(accountId("01"), null);
  assert.equal(accountId(1.5), null);
});

test("the catalog declares a move with the same engine id and moved_from; anything else is left alone", () => {
  const items = [
    { id: "20", org: "org_new", engine_workspace_id: "qmoved01", moved_from: "10" },
    { id: "21", org: "org_new", engine_workspace_id: "qstays01" },
    { id: "22", org: "org_new", engine_workspace_id: "qother01", moved_from: "99" },
    { id: "23", org: "org_new", engine_workspace_id: "qstays01", moved_from: "77" },
    { id: "24", org: "org_new", engine_workspace_id: "qmoved01", moved_from: { account_id: "10" }, archived: true },
  ];
  assert.deepEqual(movesFor(local, "org_new", "c-new", items), [
    { id: "qmoved01", context: "c-new", from: { org: "org_old", account_id: "10" }, to: { org: "org_new", account_id: "20" } },
  ]);
  assert.deepEqual(movesFor(local, "org_new", "c-new", [{ id: 30, engine_workspace_id: "qmoved01", moved_from: { org: "org_old", account_id: 10 } }]),
    [{ id: "qmoved01", context: "c-new", from: { org: "org_old", account_id: "10" }, to: { org: "org_new", account_id: "30" } }]);
  assert.deepEqual(movesFor(local, "org_new", "c-new", [{ id: "30", engine_workspace_id: "qmoved01", moved_from: { org: "org_other", account_id: "10" } }]), [], "otra organización de origen");
  assert.deepEqual(movesFor(local, "org_new", "c-new", [{ id: "30", engine_workspace_id: "qmoved01", moved_from: 2 ** 53 + 2 }]), [], "un número que perdió precisión");
  assert.deepEqual(movesFor([{ id: "qmoved01", account: { org: "org_new", account_id: "20" } }], "org_new", "c-new", items), [], "ya está sellado en la nueva");
  assert.deepEqual(movesFor(local, "org_new", "c-new", [{ id: "20", org: "org_new", engine_workspace_id: "qmoved01" }]), [], "un servidor sin moved_from");
});

test("reseal goes first and a failed union is retried on the next pass with the new account", async () => {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  let unionFails = true;
  let resealFails = false;
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push([command, args]);
    if (command === "reseal_account_workspace" && resealFails) throw { detail: "account_conflict" };
    if (command === "set_free_router_union" && unionFails) throw { detail: "unavailable" };
    return undefined as T;
  };
  const pending = memoryPending();
  const move = { id: "qmoved01", context: "c-new", from: { org: "org_old", account_id: "10" }, to: { org: "org_new", account_id: "20" } };
  const person = (context: string) => (context === "c-new" ? "user_1" : null);
  assert.equal(await applyMoves(invoke, { "x-terminus-machine": "m1" }, [move], pending), 1);
  await retryUnions(invoke, { "x-terminus-machine": "m1" }, pending, person);
  assert.deepEqual(calls.map(([c]) => c), ["reseal_account_workspace", "set_free_router_union"]);
  assert.deepEqual(pending.list(), [{ id: "qmoved01", context: "c-new", org: "org_new", account_id: "20" } satisfies PendingUnion]);
  // El siguiente repaso: el catálogo ya no declara traslado (ya está sellado), pero la unión sigue pendiente.
  calls.length = 0;
  unionFails = false;
  await retryUnions(invoke, { "x-terminus-machine": "m1" }, pending, person);
  assert.deepEqual(calls, [["set_free_router_union", { "x-terminus-machine": "m1", workspace: "qmoved01", platformAccount: "20", org: "org_new", sub: "user_1" }]]);
  assert.deepEqual(pending.list(), []);
  // Un re-sellado que falla no deja unión pendiente.
  calls.length = 0;
  resealFails = true;
  assert.equal(await applyMoves(invoke, {}, [move], pending), 0);
  assert.deepEqual(pending.list(), []);
});
