/**
 * Mover un workspace adoptado (plan de cuentas § 8, A17 § 10.3): el paso 1 va
 * con el contexto de origen; el paso 2, solo con el del destino y solo si aquí
 * se es owner o admin. Si no, la solicitud queda pendiente para Harness.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { accountOfEngine, moveDestinations, moveWorkspace } from "../../src/features/shell/account-move.ts";

const source = { context_id: "ctx-src", org: "org_src" };
const groups = [
  { context_id: "ctx-src", org: "org_src", org_name: "Origen", role: "member" },
  { context_id: "ctx-team", org: "org_team", org_name: "Equipo", role: "admin" },
  { context_id: "ctx-other", org: "org_other", org_name: "Otra", role: "member" },
];

type Call = { context: string; method: string; path: string; body?: unknown };
function fake(handler: (call: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  const send = async (context: string, method: string, path: string, body?: unknown) => {
    const call = { context, method, path, body };
    calls.push(call);
    return handler(call);
  };
  return { send, calls };
}

test("finds the platform account by engine id and ignores the other rows", async () => {
  const { send } = fake((call) => call.path === "/v1/workspaces"
    ? { status: 200, body: { items: [{ id: "42", engine_workspace_id: "otro", version: 3 }, { id: "43", engine_workspace_id: "qmine001", version: 7 }], next_cursor: null } }
    : { status: 404 });
  assert.deepEqual(await accountOfEngine(send, source.context_id, "qmine001"), { id: "43", version: 7 });
  assert.equal(await accountOfEngine(send, source.context_id, "qmissing"), null);
});

test("destinations leave the source out and only an owner or admin with its context moves in place", async () => {
  const { send, calls } = fake((call) => call.path === "/v1/identity/me"
    ? { status: 200, body: { organizations: [{ id: "org_src", name: "Origen", role: "owner" }, { id: "org_team", name: "Equipo", role: "admin" }, { id: "org_other", name: "Otra", role: "member" }, { id: "org_far", name: "Lejos", role: "owner" }] } }
    : { status: 404 });
  assert.deepEqual(await moveDestinations(send, source, groups), [
    { org: "org_team", name: "Equipo", context: "ctx-team", immediate: true },
    { org: "org_other", name: "Otra", context: "ctx-other", immediate: false },
    // Sin contexto en esta ventana no se puede aceptar aquí, aunque sea admin.
    { org: "org_far", name: "Lejos", context: null, immediate: false },
  ]);
  assert.equal(calls[0].context, source.context_id, "se lee con el contexto de origen");
});

test("an admin of the destination completes both steps with the two contexts", async () => {
  const { send, calls } = fake((call) => call.path.includes("/transfers") && call.method === "POST"
    ? call.path.endsWith("/accept")
      ? { status: 200, body: { state: "accepted", workspace: { id: "43" } } }
      : { status: 201, body: { state: "pending", transfer_id: "8e32f46e-1111-2222-3333-444444444444" } }
    : { status: 404 });
  const result = await moveWorkspace(send, { id: "42", version: 5 }, source, { org: "org_team", name: "Equipo", context: "ctx-team", immediate: true }, "key-1");
  assert.deepEqual(result, { state: "moved", warning: null });
  assert.deepEqual(calls.map((call) => [call.context, call.method, call.path]), [
    ["ctx-src", "POST", "/v1/workspaces/42/transfers"],
    ["ctx-team", "POST", "/v1/workspaces/transfers/8e32f46e-1111-2222-3333-444444444444/accept"],
  ]);
  assert.deepEqual(calls[0].body, { to_org: "org_team", if_version: 5 });
  assert.deepEqual(calls[1].body, {});
});

test("without being admin of the destination the request stays pending for Harness", async () => {
  const { send, calls } = fake(() => ({ status: 201, body: { state: "pending", transfer_id: "8e32f46e-1111-2222-3333-444444444444" } }));
  const result = await moveWorkspace(send, { id: "42", version: 5 }, source, { org: "org_other", name: "Otra", context: "ctx-other", immediate: false }, "key-1");
  assert.deepEqual(result, { state: "pending", warning: null });
  assert.equal(calls.length, 1, "no se acepta sin ser admin");
});

test("an acceptance that fails leaves the request pending with its cause, and a refused request throws", async () => {
  const accept = fake((call) => call.path.endsWith("/accept")
    ? { status: 403, body: { code: "admin_required" } }
    : { status: 200, body: { state: "pending", transfer_id: "8e32f46e-1111-2222-3333-444444444444" } });
  assert.deepEqual(
    await moveWorkspace(accept.send, { id: "42", version: 5 }, source, { org: "org_team", name: "Equipo", context: "ctx-team", immediate: true }, "key-1"),
    { state: "pending", warning: "admin_required" },
  );
  const refused = fake(() => ({ status: 403, body: { code: "workspace_owner_required" } }));
  await assert.rejects(moveWorkspace(refused.send, { id: "42", version: 5 }, source, { org: "org_team", name: "Equipo", context: "ctx-team", immediate: true }), { detail: "workspace_owner_required" });
  const noTransfer = fake(() => ({ status: 201, body: { state: "pending" } }));
  await assert.rejects(moveWorkspace(noTransfer.send, { id: "42", version: 5 }, source, { org: "org_team", name: "Equipo", context: null, immediate: false }), { detail: "transfer_reply_invalid" });
});
