/**
 * Traslados entre organizaciones (plan de cuentas § 8): el catálogo declara la
 * cuenta nueva con `moved_from`, la ventana vuelve a sellar y después une el Free
 * router a la cuenta nueva. Sin esos campos no hace nada.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMoves, movesFor } from "../../src/features/shell/account-transfers.ts";

const local = [
  { id: "qmoved01", account: { org: "org_old", account_id: "10" } },
  { id: "qstays01", account: { org: "org_old", account_id: "11" } },
];

test("the catalog declares a move with the same engine id and moved_from; anything else is left alone", () => {
  const items = [
    { id: "20", org: "org_new", engine_workspace_id: "qmoved01", moved_from: "10" },
    { id: "21", org: "org_new", engine_workspace_id: "qstays01" },
    { id: "22", org: "org_new", engine_workspace_id: "qother01", moved_from: "99" },
    { id: "23", org: "org_new", engine_workspace_id: "qstays01", moved_from: "77" },
    { id: "24", org: "org_new", engine_workspace_id: "qmoved01", moved_from: { account_id: 10 }, archived: true },
  ];
  assert.deepEqual(movesFor(local, "org_new", items), [
    { id: "qmoved01", from: { org: "org_old", account_id: "10" }, to: { org: "org_new", account_id: "20" } },
  ]);
  assert.deepEqual(movesFor(local, "org_new", [{ id: 30, engine_workspace_id: "qmoved01", moved_from: { account_id: 10 } }]),
    [{ id: "qmoved01", from: { org: "org_old", account_id: "10" }, to: { org: "org_new", account_id: "30" } }]);
  assert.deepEqual(movesFor([{ id: "qmoved01", account: { org: "org_new", account_id: "20" } }], "org_new", items), [], "ya está sellado en la nueva");
  assert.deepEqual(movesFor(local, "org_new", [{ id: "20", org: "org_new", engine_workspace_id: "qmoved01" }]), [], "un servidor sin moved_from");
});

test("reseal goes first and the Free router union follows with the new account; a failed reseal skips the union", async () => {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  let fail = false;
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push([command, args]);
    if (command === "reseal_account_workspace" && fail) throw { detail: "account_conflict" };
    return undefined as T;
  };
  const move = { id: "qmoved01", from: { org: "org_old", account_id: "10" }, to: { org: "org_new", account_id: "20" } };
  assert.equal(await applyMoves(invoke, { "x-terminus-machine": "m1" }, [move], "user_1"), 1);
  assert.deepEqual(calls, [
    ["reseal_account_workspace", { "x-terminus-machine": "m1", id: "qmoved01", from: move.from, to: move.to }],
    ["set_free_router_union", { "x-terminus-machine": "m1", workspace: "qmoved01", platformAccount: "20", org: "org_new", sub: "user_1" }],
  ]);
  calls.length = 0;
  fail = true;
  assert.equal(await applyMoves(invoke, {}, [move], "user_1"), 0);
  assert.deepEqual(calls.map(([c]) => c), ["reseal_account_workspace"]);
  calls.length = 0;
  fail = false;
  await applyMoves(invoke, {}, [move], null);
  assert.deepEqual(calls.map(([c]) => c), ["reseal_account_workspace"], "sin persona no se une");
});
