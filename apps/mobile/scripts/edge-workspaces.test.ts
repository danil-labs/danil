/**
 * El catálogo del borde y el contexto de la sesión, antes de pintar.
 *
 *   node --test apps/mobile/scripts/edge-workspaces.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { contextFor, sessionSetOf } from "../src/lib/edge-sessions.ts";
import { catalogPage, placeWorkspaces, workspaceRead } from "../src/lib/edge-workspaces.ts";
import type { Computer } from "@terminus/computers";

const SET = {
  default_context: "ctx_p",
  items: [
    {
      session_id: "ses_a",
      contexts: [
        { context_id: "ctx_p", org: "org_p", personal: true },
        { context_id: "ctx_x", org: "org_x", role: "member" },
        { context_id: "", org: "org_drop" },
      ],
    },
  ],
};

test("el contexto activo es el de la organización elegida; si no, el de omisión", () => {
  const set = sessionSetOf(SET);
  assert.deepEqual(set.contexts.map((context) => context.id), ["ctx_p", "ctx_x"]);
  assert.equal(contextFor(set, "org_x"), "ctx_x");
  assert.equal(contextFor(set, null), "ctx_p");
  assert.equal(contextFor(sessionSetOf({ items: [{ contexts: [{ context_id: "ctx_a", org: "org_a" }, { context_id: "ctx_b", org: "org_b" }] }] }), null), null);
  assert.equal(contextFor(sessionSetOf({ items: [{ contexts: [{ context_id: "solo", org: "org_solo" }] }] }), null), "solo");
});

test("el catálogo usa el id del motor y deja fuera lo archivado y lo que no está en el motor", () => {
  const page = catalogPage({
    items: [
      { id: "12", name: "Nube", role: "member", engine_workspace_id: "ws_cloud", runs_on: ["cloud"] },
      { id: "13", name: "Mía", engine_workspace_id: "ws_mine", placement: { kind: "member_computer" } },
      { id: "14", name: "Viejo", engine_workspace_id: "ws_old", state: "archived", archived: true },
      { id: "15", name: "Ajeno", role: "member" },
    ],
    next_cursor: null,
  });
  assert.deepEqual(page.rows.map((row) => row.id), ["ws_cloud", "ws_mine"]);
  assert.deepEqual(page.rows[1].runs_on, ["personal"]);
  assert.equal(workspaceRead([{ rows: [], empty: "no_workspace_access" }]).kind, "workspace");
  assert.equal(workspaceRead([{ rows: [], empty: "no_organization" }]).kind, "organization");
  assert.equal(workspaceRead([page]).kind, "ok");
});

test("una máquina personal no recibe un workspace que solo corre en la nube", () => {
  const cloud = { computer_id: "mch_cloud", name: "Nube", state: "stopped", kind: "organization" } as Computer;
  const own = { computer_id: "mch_own", name: "Mac", state: "online", kind: "personal" } as Computer;
  const rows = catalogPage({
    items: [
      { id: "12", name: "Nube", engine_workspace_id: "ws_cloud", runs_on: ["cloud"] },
      { id: "13", name: "Mía", engine_workspace_id: "ws_mine", runs_on: ["personal"] },
    ],
  }).rows;
  const placed = placeWorkspaces(rows, [cloud, own]);
  assert.deepEqual(placed.machines.find((machine) => machine.computer_id === "mch_cloud")?.workspaces, ["ws_cloud"]);
  assert.deepEqual(placed.machines.find((machine) => machine.computer_id === "mch_own")?.workspaces, ["ws_mine"]);
  assert.deepEqual(placed.registry.find((workspace) => workspace.id === "ws_cloud")?.computers, ["mch_cloud"]);
});
