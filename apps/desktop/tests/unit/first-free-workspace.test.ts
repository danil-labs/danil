/**
 * El primer arranque con sesión (plan de cuentas F1.2): se sella el workspace
 * de la organización personal Free y nunca se crea uno local. Solo se
 * reintenta lo que puede cambiar; cada rechazo permanente sale con su código.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { FIRST_FREE_DELAYS, sealFirstFreeWorkspace } from "../../src/features/shell/first-free-workspace.ts";

const data = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) },
});

type Family = { family: string; email: string; contexts: { context_id: string; org: string; org_name: string; plan: string | null; personal?: boolean }[] };
const FREE: Family = { family: "f1", email: "ana@norte.mx", contexts: [{ context_id: "c1", org: "org_1", org_name: "Ana", plan: "free" }] };

function engine(o: { sessions?: Family[]; statusFailsOnce?: boolean; features?: string[]; noMachine?: boolean; catalogAfter?: number; catalogStatus?: number; sealed?: string[] } = {}) {
  const sessions = o.sessions ?? [FREE];
  const state = { reads: 0, statusFailed: false, sealed: [...(o.sealed ?? [])], created: [] as unknown[], edge: [] as string[] };
  const invoke = async <T>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
    const reply = (() => {
      switch (command) {
        case "danil_session_status":
          if (o.statusFailsOnce && !state.statusFailed) { state.statusFailed = true; throw new Error("engine restarting"); }
          return { state: sessions.length ? "connected" : "disconnected", sessions };
        case "machine_list": return o.noMachine ? [] : [{ id: "m1", local: true, features: o.features ?? ["account_workspace_v1"] }];
        case "list_workspaces": return { workspaces: state.sealed.map((id) => ({ id, name: "Personal", account: { org: "org_1", account_id: "42" } })), active: null };
        case "adoption_candidates": return [];
        case "danil_edge_fetch": {
          state.edge.push(`${args.method} ${args.path}`);
          if (args.path === "/v1/identity/me") return { status: 200, body: { id: "p1" } };
          if (args.path === "/v1/workspaces") {
            if (o.catalogStatus) return { status: o.catalogStatus };
            const ready = state.reads++ >= (o.catalogAfter ?? 0);
            return { status: 200, body: { items: ready ? [{ id: "42", org: "org_1", name: "Personal", engine_workspace_id: "ws_free" }] : [], next_cursor: null } };
          }
          // La persona ya tiene una lista de agregados: el Free entra por `PUT …/added/{id}`.
          if (args.path === "/v1/workspaces/preferences") return { status: 200, body: { version: 3, added: ["ws_other"] } };
          return { status: 204 };
        }
        case "create_account_workspace": state.created.push(args); state.sealed.push(args.id as string); return { id: args.id };
        default: throw new Error(`unexpected ${command}`);
      }
    })();
    return reply as T;
  };
  return { invoke, state };
}

const noWait = { wait: async () => {} };

test("with a session, the personal Free workspace is sealed here and added to the person's list", async () => {
  const e = engine();
  const w = await sealFirstFreeWorkspace(e.invoke, noWait);
  assert.deepEqual(w, { id: "ws_free", name: "Personal" });
  assert.deepEqual(e.state.created, [{ "x-terminus-machine": "m1", id: "ws_free", name: "Personal", account: { org: "org_1", account_id: "42" } }]);
  assert.ok(e.state.edge.includes("PUT /v1/workspaces/preferences/added/ws_free"), `an existing rail list gets it like createFree: ${e.state.edge.join(", ")}`);
});

test("an engine with local adoption seals the Free workspace without adopting anything", async () => {
  const e = engine({ features: ["account_workspace_v1", "account_adoption_v1", "account_adoption_proof_v1"] });
  const w = await sealFirstFreeWorkspace(e.invoke, noWait);
  assert.equal(w.id, "ws_free");
  assert.equal(e.state.edge.some((call) => call.includes("/adopt")), false);
});

test("a session status that fails once is retried, not taken as signed out", async () => {
  const e = engine({ statusFailsOnce: true });
  const waits: number[] = [];
  const w = await sealFirstFreeWorkspace(e.invoke, { wait: async (ms) => void waits.push(ms) });
  assert.equal(w.id, "ws_free");
  assert.deepEqual(waits, [FIRST_FREE_DELAYS[0]]);
});

test("a new account waits with backoff for its Free workspace, bounded", async () => {
  const e = engine({ catalogAfter: 3 });
  const waits: number[] = [];
  assert.equal((await sealFirstFreeWorkspace(e.invoke, { wait: async (ms) => void waits.push(ms) })).id, "ws_free");
  assert.deepEqual(waits, FIRST_FREE_DELAYS.slice(0, 3));
  assert.ok(waits[1] > waits[0], "the wait grows");

  const never = engine({ catalogAfter: 99 });
  const all: number[] = [];
  await assert.rejects(sealFirstFreeWorkspace(never.invoke, { wait: async (ms) => void all.push(ms) }), { detail: "not_available_yet", message_key: "onboarding.workspace.not_available_yet" });
  assert.deepEqual(all, FIRST_FREE_DELAYS);
  assert.deepEqual(never.state.created, []);
});

const permanent: [string, Parameters<typeof engine>[0]][] = [
  ["no_session", { sessions: [] }],
  ["no_free_org", { sessions: [{ ...FREE, contexts: [{ ...FREE.contexts[0], plan: "teams" }] }] }],
  ["no_free_org", { sessions: [{ ...FREE, contexts: [{ ...FREE.contexts[0], personal: false }] }] }],
  ["several_free_orgs", { sessions: [{ ...FREE, contexts: [...FREE.contexts, { context_id: "c2", org: "org_2", org_name: "Ana 2", plan: "free" }] }] }],
  ["engine_unsupported", { features: [] }],
  ["engine_unsupported", { noMachine: true }],
  ["refresh_failed", { catalogStatus: 503 }],
];
for (const [detail, setup] of permanent) {
  test(`${detail} fails at once without waiting or creating anything (${JSON.stringify(setup)})`, async () => {
    const e = engine(setup);
    let waits = 0;
    await assert.rejects(sealFirstFreeWorkspace(e.invoke, { wait: async () => void waits++ }), { detail, message_key: `onboarding.workspace.${detail}` });
    assert.equal(waits, 0);
    assert.deepEqual(e.state.created, []);
  });
}

test("signed out without a family list fails at once; connected with families still loading is retried", async () => {
  const out = engine({ sessions: [] });
  const outInvoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> =>
    command === "danil_session_status" ? ({ state: "disconnected", name: "Mac" } as T) : out.invoke<T>(command, args);
  await assert.rejects(sealFirstFreeWorkspace(outInvoke, { wait: async () => assert.fail("no wait") }), { detail: "no_session" });

  const e = engine();
  let first = true;
  const loading = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    if (command === "danil_session_status" && first) { first = false; return { state: "connected" } as T; }
    return e.invoke<T>(command, args);
  };
  assert.equal((await sealFirstFreeWorkspace(loading, noWait)).id, "ws_free");
});

test("a personal org upgraded to Pro is entered like the Free one", async () => {
  const e = engine({ sessions: [{ ...FREE, contexts: [{ ...FREE.contexts[0], plan: "pro", personal: true }] }] });
  const w = await sealFirstFreeWorkspace(e.invoke, noWait);
  assert.equal(w.id, "ws_free");
  assert.equal(e.state.created.length, 1);
});

test("an onboarding cut after sealing only reactivates the sealed workspace", async () => {
  const e = engine({ sealed: ["ws_free"] });
  const w = await sealFirstFreeWorkspace(e.invoke, noWait);
  assert.equal(w.id, "ws_free");
  assert.deepEqual(e.state.created, []);
});
