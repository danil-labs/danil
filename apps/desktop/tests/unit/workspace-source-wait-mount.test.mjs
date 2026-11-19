import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as immediate } from "node:timers/promises";
import { engine, relay } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { RESPONSES } from "../helpers/mount-guard.mjs";

const until = async (read) => { for (let i = 0; i < 100; i++) { if (read()) return true; await sleep(50); } return false; };

test("an unsettled organization machine times out in the picker, retries and paints its late list", async (t) => {
  const table = { ...engine, list_workspaces: undefined };
  const fake = relay({ table });
  const app = await boot("listo", "organization-source-timeout", { ...RESPONSES,
    danil_session_status: { state: "connected", sessions: [{ family: "family", email: "one@example.com", contexts: [{ context_id: "a", org: "org_A", org_name: "Acme", plan: "paid" }] }] },
    danil_edge_fetch: ({ path }) => {
      if (path === "/v1/identity/me") return { status: 200, body: { id: "person" } };
      if (path === "/v1/capabilities") return { status: 200, body: { contract: "mvp-v1", items: [{ name: "machines", version: 1, status: "available" }] } };
      if (path === "/v1/machines") return { status: 200, body: { items: [{ machine_id: "m1", kind: "organization", organization_id: "org_A", name: "Acme", state: "running", connection: "connected" }], next_cursor: null } };
      if (path.endsWith("/tickets")) return { status: 201, body: { ticket: "one-use", url: "wss://connect.danil.ai/v1/machines/m1/session", expires_at: new Date(Date.now() + 30000).toISOString(), session_expires_at: new Date(Date.now() + 60000).toISOString(), protocol: "danil.machine-session.v1" } };
      return { status: 404, body: {} };
    },
  }, undefined, {}, { beforeImport(w) { w.WebSocket = fake.Socket; globalThis.WebSocket = fake.Socket; } });
  const doc = app.w.document;
  assert.ok(await until(() => fake.calls.some((c) => c.command === "list_workspaces")), "the organization inventory is attributed before opening the picker");
  await sleep(50);
  let late;
  table.list_workspaces = () => new Promise((resolve) => { late = resolve; });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const flush = async () => { for (let i = 0; i < 12; i++) { t.mock.timers.tick(0); await immediate(); } };
  doc.querySelector("[data-add-workspace]").click();
  await flush();
  [...doc.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === "Agregar workspace").click();
  await flush();
  const railIds = () => [...doc.querySelectorAll("[data-workspace-tile]")].map((tile) => tile.dataset.workspaceTile).sort();
  const beforeRail = railIds();
  const group = () => doc.querySelector('[data-session-context="a"]');
  assert.ok(group());
  t.mock.timers.tick(9999); await flush();
  assert.ok(!group().textContent.includes("no responde"));
  t.mock.timers.tick(1); await flush();
  assert.ok(group().textContent.includes("La máquina de Acme no responde. Intenta de nuevo en un momento."));
  assert.ok(doc.querySelector('[data-workspace-tile="w"]'), "the local rail stays intact");
  assert.deepEqual(railIds(), beforeRail);
  const before = fake.calls.filter((c) => c.command === "list_workspaces").length;
  [...group().querySelectorAll("button")].find((b) => b.textContent === "Reintentar").click();
  await flush();
  assert.ok(!group().textContent.includes("no responde"));
  assert.ok(group().textContent.includes("Cargando"));
  assert.deepEqual(railIds(), beforeRail);
  assert.ok(fake.calls.filter((c) => c.command === "list_workspaces").length > before);
  assert.equal(typeof late, "function");
  late({ workspaces: [{ id: "late-workspace", name: "Late workspace" }] });
  await flush();
  assert.ok(group().querySelector('[data-add-danil="late-workspace"]'));
  assert.ok(!group().textContent.includes("no responde"));
  assert.deepEqual(railIds(), beforeRail);
});
