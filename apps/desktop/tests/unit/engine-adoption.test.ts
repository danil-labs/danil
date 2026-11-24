/**
 * Con `engine_adoption_v1` y la sesión en el motor (`person_session_v1`), el motor adopta solo
 * (decisión «la sesión vive en el motor» § 2.5): la ventana pinta su estado y su evento y no
 * orquesta nada. Sin el rasgo, sigue `adoptLocals`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ENGINE_ADOPTION_FEATURE, engineAdoptionDone, engineAdoptionOf, engineAdoptionProgress, engineAdoptionReport, engineOwnsAdoption } from "../../../../packages/shell/src/shell/engine-adoption.ts";
import { createAccountWorkspaces } from "../../../../packages/shell/src/shell/session-account-workspaces.ts";

globalThis.localStorage ??= (() => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage;
})();

const FEATURES = ["account_workspace_v1", "account_adoption_v1", "account_adoption_proof_v1"];
const ENGINE = [...FEATURES, ENGINE_ADOPTION_FEATURE, "person_session_v1"];
const PERSONAL = { context_id: "ctx-personal", org: "org_personal", org_name: "Cuenta de Ana", plan: "free" };
const LOCALS = [{ id: "q1", name: "Personal" }, { id: "q2", name: "Maayataan" }, { id: "q3", name: "Donde Banco" }];
/** La forma de `engine_adoption_status` en danil-engine 1e96f512 (`danil/adoption.rs`). */
const status = (state: string, extra: Record<string, unknown> = {}) => ({ state, org: "org_personal", adopted: [], already: [], failed: [], attempted: 0, updated_at: 1, ...extra });

test("the engine's state becomes the linking rows and the existing notice", () => {
  const running = engineAdoptionOf(status("running"))!;
  assert.deepEqual(engineAdoptionProgress(running, LOCALS).rows.map((r) => r.step), ["working", "working", "working"], "the engine does not report per workspace");
  assert.equal(engineAdoptionReport(running), null, "no notice while it runs");
  const partial = engineAdoptionOf(status("partial", { adopted: [LOCALS[0]], already: [LOCALS[1]], failed: [{ ...LOCALS[2], reason: "network" }], attempted: 3, cause: null }))!;
  assert.deepEqual(engineAdoptionProgress(partial, LOCALS), { org: "org_personal", finished: true, rows: [
    { id: "q1", name: "Personal", step: "done" }, { id: "q2", name: "Maayataan", step: "done" }, { id: "q3", name: "Donde Banco", step: "later" },
  ] });
  const report = engineAdoptionReport(partial, "ctx-personal", "Cuenta de Ana")!;
  assert.deepEqual(report.adopted, [LOCALS[0]], "what the platform already had is not counted as brought");
  assert.deepEqual(report.failed.map((f) => f.reason), ["network"]);
  assert.equal(report.org_name, "Cuenta de Ana");
  assert.deepEqual(engineAdoptionReport(engineAdoptionOf(status("partial", { failed: [{ id: "q9", name: "X", reason: "id_taken" }] }))!)?.refused.map((r) => r.reason), ["id_taken"]);
  assert.equal(engineAdoptionOf({ state: "nope" }), null);
  assert.equal(engineAdoptionOf(null), null);
});

test("the first login is done when the engine reports done, or partial with no locals left", () => {
  const of = (state: string) => engineAdoptionOf(status(state))!;
  assert.equal(engineAdoptionDone(of("done"), 3), true);
  assert.equal(engineAdoptionDone(of("partial"), 0), true);
  assert.equal(engineAdoptionDone(of("partial"), 2), false);
  assert.equal(engineAdoptionDone(of("partial"), null), false, "unknown is not done");
  assert.equal(engineAdoptionDone(of("running"), 0), false);
  assert.equal(engineAdoptionDone(of("idle"), 0), true, "nothing to adopt");
});

test("the engine owns adoption only with its own session too", () => {
  assert.equal(engineOwnsAdoption(ENGINE), true);
  assert.equal(engineOwnsAdoption([...FEATURES, ENGINE_ADOPTION_FEATURE]), false, "without person_session_v1 the engine has no session to adopt with");
  assert.equal(engineOwnsAdoption(FEATURES), false);
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
  const accounts = createAccountWorkspaces(invoke, true, () => {}, async () => ENGINE);
  await accounts.refresh([PERSONAL], send, () => "p");
  assert.deepEqual(calls.filter((c) => ["adoption_proof", "adopt_account_workspace"].includes(c)), []);
  assert.deepEqual(posts.filter((p) => p.startsWith("/v1/workspaces/adopt") || p === "/v1/identity/organizations/select"), []);
  assert.equal(await accounts.hasAdoptionCandidates(), false, "the rail does not retry what the engine owns");
});
