/**
 * Con el rasgo de adopción del motor (decisión «la sesión vive en el motor» § 2.5) la ventana no
 * orquesta nada: pinta el estado y el evento del motor. Sin el rasgo, sigue `adoptLocals`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ENGINE_ADOPTION_FEATURE, engineAdoptionDone, engineAdoptionOf, engineAdoptionProgress, engineAdoptionReport, engineOwnsAdoption } from "../../src/features/shell/engine-adoption.ts";
import { createAccountWorkspaces } from "../../src/features/shell/session-account-workspaces.ts";

globalThis.localStorage ??= (() => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage;
})();

const FEATURES = ["account_workspace_v1", "account_adoption_v1", "account_adoption_proof_v1"];
const PERSONAL = { context_id: "ctx-personal", org: "org_personal", org_name: "Cuenta de Ana", plan: "free" };
const RUNNING = {
  state: "running", org: "org_personal", org_name: "Cuenta de Ana", pending: 1,
  items: [
    { id: "q1", name: "Personal", step: "done" },
    { id: "q2", name: "Maayataan", step: "working" },
    { id: "q3", name: "Donde Banco", step: "waiting" },
    { id: "qd", name: "Danil Workspace", step: "stays", org_name: "Danil" },
  ],
};

test("the engine's adoption state becomes the linking rows, the staying rows and the existing notice", () => {
  const a = engineAdoptionOf(RUNNING)!;
  assert.deepEqual(engineAdoptionProgress(a), { org: "org_personal", finished: false, rows: [
    { id: "q1", name: "Personal", step: "done" }, { id: "q2", name: "Maayataan", step: "working" }, { id: "q3", name: "Donde Banco", step: "waiting" },
  ] });
  assert.deepEqual(a.kept, [{ id: "qd", name: "Danil Workspace", org_name: "Danil" }]);
  assert.equal(engineAdoptionReport(a), null, "no notice while it runs");
  const done = engineAdoptionOf({ ...RUNNING, state: "done", pending: 0, items: RUNNING.items.map((i) => i.step === "stays" ? i : { ...i, step: "done" }) })!;
  assert.equal(engineAdoptionProgress(done).finished, true);
  assert.deepEqual(engineAdoptionReport(done, "ctx-personal")?.adopted.map((w) => w.name), ["Personal", "Maayataan", "Donde Banco"]);
  assert.equal(engineAdoptionReport(done, "ctx-personal")?.org_name, "Cuenta de Ana");
  assert.equal(engineAdoptionReport(done, "ctx-personal")?.context, "ctx-personal");
  // Un paso que la ventana no conoce no rompe: queda en espera.
  assert.equal(engineAdoptionOf({ state: "running", items: [{ id: "x", name: "X", step: "quantum" }] })!.items[0].step, "waiting");
  assert.equal(engineAdoptionOf(null), null);
  assert.equal(engineAdoptionOf({ state: "nope" }), null);
});

test("the first login is done when the engine reports done, or partial with nothing left", () => {
  const of = (state: string, pending: number) => engineAdoptionOf({ state, pending, items: [] })!;
  assert.equal(engineAdoptionDone(of("done", 0)), true);
  assert.equal(engineAdoptionDone(of("partial", 0)), true);
  assert.equal(engineAdoptionDone(of("partial", 2)), false);
  assert.equal(engineAdoptionDone(of("running", 0)), false);
  assert.equal(engineAdoptionDone(of("failed", 0)), false);
  assert.equal(engineAdoptionDone(of("idle", 0)), true, "nothing to adopt");
  assert.equal(engineAdoptionDone(of("idle", 3)), false);
});

test("with the engine feature the window does not orchestrate: no challenge, no adopt, no adoption proof", async () => {
  const calls: string[] = [];
  const invoke = async <T>(command: string): Promise<T> => {
    calls.push(command);
    if (command === "machine_list") return [{ id: "local", local: true }] as T;
    if (command === "adoption_candidates") return [{ id: "q1", name: "Personal", adoptable: true }] as T;
    if (command === "list_workspaces") return { workspaces: [] } as T;
    return undefined as T;
  };
  const posts: string[] = [];
  const send = async (_c: string, method: string, path: string) => {
    if (method !== "GET") posts.push(path);
    return { status: 200, body: method === "GET" && path === "/v1/identity/me" ? { id: "p", organizations: [{ id: "org_personal", type: "personal" }] } : { items: [], next_cursor: null } };
  };
  assert.equal(engineOwnsAdoption([...FEATURES, ENGINE_ADOPTION_FEATURE]), true);
  assert.equal(engineOwnsAdoption(FEATURES), false);
  const accounts = createAccountWorkspaces(invoke, true, () => {}, async () => [...FEATURES, ENGINE_ADOPTION_FEATURE]);
  await accounts.refresh([PERSONAL], send, () => "p");
  assert.deepEqual(calls.filter((c) => ["adoption_proof", "adopt_account_workspace"].includes(c)), []);
  assert.deepEqual(posts.filter((p) => p.startsWith("/v1/workspaces/adopt") || p === "/v1/identity/organizations/select"), []);
  assert.equal(await accounts.hasAdoptionCandidates(), false, "the rail does not retry what the engine owns");
});
