/**
 * El primer arranque con sesión (plan de cuentas F1.2): se sella el workspace
 * de la organización personal Free y nunca se crea uno local.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { sealFirstFreeWorkspace } from "../../src/features/shell/first-free-workspace.ts";

const FREE = { family: "f1", email: "ana@norte.mx", contexts: [{ context_id: "c1", org: "org_1", org_name: "Ana", plan: "free" }] };

function engine({ sessions = [FREE], catalogAfter = 0, sealed = [] as string[] } = {}) {
  const calls: string[] = [];
  const state = { reads: 0, sealed: [...sealed], created: [] as unknown[] };
  const invoke = async <T>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
    calls.push(command);
    const reply = (() => {
      switch (command) {
        case "danil_session_status": return { state: sessions.length ? "connected" : "disconnected", sessions };
        case "machine_list": return [{ id: "m1", local: true, features: ["account_workspace_v1"] }];
        case "list_workspaces": return { workspaces: state.sealed.map((id) => ({ id, name: "Personal", account: { org: "org_1", account_id: "42" } })), active: null };
        case "danil_edge_fetch": {
          if (args.path !== "/v1/workspaces") return { status: 404 };
          const ready = state.reads++ >= catalogAfter;
          return { status: 200, body: { items: ready ? [{ id: "42", org: "org_1", name: "Personal", engine_workspace_id: "ws_free" }] : [], next_cursor: null } };
        }
        case "create_account_workspace": state.created.push(args); state.sealed.push(args.id as string); return { id: args.id };
        default: throw new Error(`unexpected ${command}`);
      }
    })();
    return reply as T;
  };
  return { invoke, calls, state };
}

test("with a session, the personal Free workspace is sealed here and nothing local is created", async () => {
  const e = engine();
  const w = await sealFirstFreeWorkspace(e.invoke, { wait: async () => {} });
  assert.deepEqual(w, { id: "ws_free", name: "Personal" });
  assert.deepEqual(e.state.created, [{ "x-terminus-machine": "m1", id: "ws_free", name: "Personal", account: { org: "org_1", account_id: "42" } }]);
  assert.equal(e.calls.includes("add_workspace"), false);
});

test("a new account waits a bounded time for its Free workspace in the catalog", async () => {
  const e = engine({ catalogAfter: 2 });
  let waits = 0;
  const w = await sealFirstFreeWorkspace(e.invoke, { wait: async () => void waits++ });
  assert.equal(w.id, "ws_free");
  assert.equal(waits, 2);

  const never = engine({ catalogAfter: 99 });
  await assert.rejects(sealFirstFreeWorkspace(never.invoke, { attempts: 3, wait: async () => {} }), { detail: "not_available_yet", message_key: "onboarding.workspace.not_available_yet" });
  assert.deepEqual(never.state.created, []);
});

test("without a session it fails at once and creates nothing", async () => {
  const e = engine({ sessions: [] });
  let waits = 0;
  await assert.rejects(sealFirstFreeWorkspace(e.invoke, { wait: async () => void waits++ }), { detail: "no_session" });
  assert.equal(waits, 0);
  assert.deepEqual(e.state.created, []);
});

test("an onboarding cut after sealing only reactivates the sealed workspace", async () => {
  const e = engine({ sealed: ["ws_free"] });
  const w = await sealFirstFreeWorkspace(e.invoke, { wait: async () => {} });
  assert.equal(w.id, "ws_free");
  assert.deepEqual(e.state.created, []);
});
