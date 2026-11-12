import assert from "node:assert/strict";
import { test } from "node:test";
import { callWorkspace, hasLinkedWorkspaces, linkedAttention, linkedEvent, linkedEvents, linkedListing, linkedWorkspaces, onlyLinked, organizationOf, unlinkedWorkspaces } from "../src/index.ts";

test("los vínculos salen de `workspaces`; sin el campo no se filtra", () => {
  assert.deepEqual([...(linkedWorkspaces({ workspaces: ["w1", "w2"] }) ?? [])], ["w1", "w2"]);
  assert.equal(linkedWorkspaces({}), null);
  assert.equal(linkedWorkspaces({ workspaces: null }), null);
  assert.equal(linkedWorkspaces({ workspaces: [] })?.size, 0);
});

test("los workspaces de organización salen de `workspaces`, el principal primero; sin el campo, de `workspace`", () => {
  const primary = { id: "fqgx1w8m", name: "Danil Workspace" };
  const foundation = { id: "fnd00001", name: "Danil Foundation" };
  assert.deepEqual(organizationOf({ organization: { organization_id: "org_01", workspace: primary, workspaces: [primary, foundation] } }), { id: "org_01", workspaces: [primary, foundation] });
  assert.deepEqual(organizationOf({ organization: { organization_id: "org_01", workspace: primary } }), { id: "org_01", workspaces: [primary] });
  assert.deepEqual(organizationOf({ organization: { organization_id: "org_01", workspace: primary, workspaces: [] } }), { id: "org_01", workspaces: [primary] });
  assert.deepEqual(organizationOf({ organization: { organization_id: "org_01", workspace: primary, workspaces: [foundation, { id: "", name: "x" } as never, { id: "w3", name: " " }] } }), { id: "org_01", workspaces: [primary, foundation, { id: "w3", name: "w3" }] });
  assert.equal(organizationOf({ organization: null }), null);
  assert.equal(organizationOf({}), null);
});

test("la cuenta sin ningún workspace vinculado se distingue de un plano de control anterior", () => {
  assert.equal(hasLinkedWorkspaces([{ workspaces: [] }, { workspaces: [] }]), false);
  assert.equal(hasLinkedWorkspaces([{ workspaces: [] }, { workspaces: ["w1"] }]), true);
  assert.equal(hasLinkedWorkspaces([{ workspaces: [] }, {}]), true);
  assert.equal(hasLinkedWorkspaces([]), false);
});

test("las filas y el activo que no están vinculados se quitan", () => {
  const linked = new Set(["w1"]);
  assert.deepEqual(onlyLinked([{ id: "w1" }, { id: "w2" }], linked), [{ id: "w1" }]);
  assert.deepEqual(onlyLinked([{ id: "w1" }, { id: "w2" }], null), [{ id: "w1" }, { id: "w2" }]);
  const listing = { workspaces: [{ id: "w1", name: "Uno" }, { id: "w2", name: "Dos" }], active: "w2", extra: 1 };
  assert.deepEqual(linkedListing(listing, linked), { workspaces: [{ id: "w1", name: "Uno" }], active: "w1", extra: 1 }, "un activo sin vincular pasa al primero que queda, como en el relay");
  assert.equal(linkedListing({ ...listing, workspaces: [{ id: "w2", name: "Dos" }] }, linked).active, null, "sin ninguno vinculado no hay activo");
  assert.deepEqual(linkedListing({ ...listing, active: "w1" }, linked).active, "w1");
  assert.equal(linkedListing(listing, null), listing);
  assert.equal(linkedListing(null, linked), null);
});

test("la atención y los eventos de un workspace no vinculado no llegan", () => {
  const linked = new Set(["w1"]);
  const attention = [{ workspace: "w1", tasks: [] }, { workspace: "w2", tasks: [] }];
  assert.deepEqual(linkedAttention(attention, linked), [{ workspace: "w1", tasks: [] }]);
  assert.equal(linkedAttention(attention, null), attention);
  assert.equal(linkedEvent({ workspace: "w2" }, linked), false);
  assert.equal(linkedEvent({ workspace: "w1" }, linked), true);
  assert.equal(linkedEvent({ workspace: null }, linked), true);
  assert.equal(linkedEvent({ workspace: "w2" }, null), true);
});

test("una página del relay pierde los eventos de un workspace sin vincular, por el sobre o por el payload", () => {
  const linked = new Set(["w1"]);
  const events = [
    { name: "chat", payload: { workspace: "w1", session: "a" } },
    { name: "chat", payload: { workspace: "w2", session: "b" } },
    { name: "session", workspace: "w2", payload: { session: "c" } },
    { name: "account", payload: { provider: "codex" } },
    { name: "attention", payload: [{ workspace: "w1", tasks: [] }, { workspace: "w2", tasks: [{ session: "b" }] }] },
  ];
  assert.deepEqual(linkedEvents(events, linked), [
    events[0],
    events[3],
    { name: "attention", payload: [{ workspace: "w1", tasks: [] }] },
  ]);
  assert.deepEqual(linkedEvents(events, null), events);
});

test("los workspaces que nombra una página y la lista de aquí no tiene, una vez cada uno", () => {
  const events = [
    { name: "chat", payload: { workspace: "w1", session: "a" } },
    { name: "workspace.changed", workspace: "w2", payload: { workspace: "w2", settings_version: 1 } },
    { name: "attention", payload: [{ workspace: "w1", tasks: [] }, { workspace: "w3", tasks: [] }] },
    { name: "account", payload: { provider: "codex" } },
  ];
  assert.deepEqual(unlinkedWorkspaces(events, new Set(["w1"])), ["w2", "w3"]);
  assert.deepEqual(unlinkedWorkspaces(events, new Set(["w1", "w2", "w3"])), []);
  assert.deepEqual(unlinkedWorkspaces(events, null), []);
});

test("una llamada va con el workspace que nombran sus argumentos", () => {
  assert.equal(callWorkspace("w1", {}), "w1");
  assert.equal(callWorkspace("w1", { workspace: "w2" }), "w2");
  assert.equal(callWorkspace(null, { scope: "w2" }), "w2");
  assert.equal(callWorkspace("w1", { scope: "pending" }), "w1");
  assert.equal(callWorkspace("w1", { scope: { kind: "project" } }), "w1");
});
