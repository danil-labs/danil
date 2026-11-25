import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { RESPONSES } from "../helpers/mount-guard.mjs";

const until = async (read) => { for (let i = 0; i < 240; i++) { if (read()) return true; await sleep(50); } return false; };

const context = { context_id: "acme", org: "org_acme", org_name: "Acme", plan: "pro", workspaces: "all" };

test("the rail lists the catalog's workspaces with the organization machine off; hidden ones stay in «+», machine-only ones never appear", async () => {
  const hiddenKey = JSON.stringify(["ana@example.com", "org_acme", "hidden-1"]);
  const app = await boot("listo", "rail-catalog-only", {
    ...RESPONSES,
    danil_session_status: { state: "connected", sessions: [{ family: "acme-family", email: "ana@example.com", contexts: [context] }] },
    danil_edge_fetch: ({ path }) => {
      if (path === "/v1/identity/me") return { status: 200, body: { id: "person" } };
      if (path === "/v1/workspaces") return { status: 200, body: { items: [
        { id: "acc-1", org: "org_acme", name: "Con máquina apagada", engine_workspace_id: "cat-1" },
        { id: "acc-2", org: "org_acme", name: "Oculto", engine_workspace_id: "hidden-1" },
      ] } };
      return { status: 404, body: {} };
    },
  }, undefined, { "harness.layout.workspaces.hidden": JSON.stringify([hiddenKey]) });
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector('[data-workspace-tile="cat-1"]')), "the catalog tile paints without its machine");
  assert.equal(doc.querySelector('[data-workspace-tile="hidden-1"]'), null, "a hidden workspace leaves the rail");
  assert.equal(doc.querySelector('[data-workspace-tile="w"]'), null, "the machine's own index is not a rail tile");

  doc.querySelector("[data-add-workspace]").click();
  assert.ok(await until(() => doc.querySelector('[data-hidden-workspace="hidden-1"]')), "«Ocultos» still lists it");
  assert.equal(doc.querySelector('[data-add-danil="cat-1"]'), null, "an added workspace is not offered to add again");
  assert.deepEqual(app.failures, []);
});
