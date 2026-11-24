import assert from "node:assert/strict";
import { test } from "node:test";
import { Fleet } from "@terminus/fleet";
import "../helpers/catalog.ts";
import { createRouter } from "../../../../packages/features/machines/src/queries/router.ts";
import {
  deriveMachineAvailability,
  isNoMachineError,
} from "../../../../packages/features/machines/src/model/availability.ts";

test("deriveMachineAvailability separates loading, unavailable, no_machines, offline and ready", () => {
  assert.deepEqual(
    deriveMachineAvailability({ permitted: true, settled: false, serviceError: false, machines: [] }),
    { kind: "loading" },
  );
  assert.deepEqual(
    deriveMachineAvailability({ permitted: false, settled: false, serviceError: false, machines: [] }),
    { kind: "unavailable", reason: "not_permitted" },
  );
  assert.deepEqual(
    deriveMachineAvailability({ permitted: true, settled: true, serviceError: true, machines: [] }),
    { kind: "unavailable", reason: "service_error" },
  );
  assert.deepEqual(
    deriveMachineAvailability({ permitted: true, settled: true, serviceError: false, machines: [] }),
    { kind: "no_machines", scope: "context" },
  );
  assert.deepEqual(
    deriveMachineAvailability({
      permitted: true,
      settled: true,
      serviceError: false,
      machines: [
        { power: "on", child: true },
        { power: "outdated", wakes: false },
      ],
    }),
    { kind: "no_machines", scope: "context" },
  );
  assert.deepEqual(
    deriveMachineAvailability({
      permitted: true,
      settled: true,
      serviceError: false,
      machines: [{ power: "off", wakes: true }, { power: "off", wakes: false }],
    }),
    { kind: "offline", wakeable: true, count: 2 },
  );
  assert.deepEqual(
    deriveMachineAvailability({
      permitted: true,
      settled: true,
      serviceError: false,
      machines: [{ power: "off", wakes: false }],
    }),
    { kind: "offline", wakeable: false, count: 1 },
  );
  assert.deepEqual(
    deriveMachineAvailability({
      permitted: true,
      settled: true,
      serviceError: false,
      machines: [{ power: "on", wakes: true }, { power: "off", wakes: false }],
    }),
    { kind: "ready", online: 1, total: 2 },
  );
});

test("isNoMachineError matches only no_machine errors", () => {
  assert.equal(isNoMachineError({ what: "none", detail: "no_machine" }), true);
  assert.equal(isNoMachineError({ what: "off", detail: "machine_off" }), false);
  assert.equal(isNoMachineError(new Error("boom")), false);
  assert.equal(isNoMachineError(null), false);
});

test("web router resolves list_workspaces from catalogWorkspaces when 0 machines exist", async () => {
  const fleet = new Fleet({
    self: null,
    connect: () => {
      throw new Error("no machines should connect");
    },
  });
  fleet.setMachines([]);
  const router = createRouter({
    self: null,
    fleet,
    native: null,
    catalogWorkspaces: () => [
      { id: "ws-free-1", name: "Personal", org: "org-free" },
      { id: "ws-free-2", name: "Notas", org: "org-free" },
    ],
  });

  const listed = (await router.handle("list_workspaces")) as {
    workspaces: { id: string; name: string; account?: { org?: string } }[];
    active: string | null;
  };
  assert.deepEqual(
    listed.workspaces.map((w) => [w.id, w.name, w.account?.org]),
    [
      ["ws-free-1", "Personal", "org-free"],
      ["ws-free-2", "Notas", "org-free"],
    ],
  );
  assert.equal(listed.active, "ws-free-1");
  assert.equal(router.unlisted(), true, "marks unlisted so an arriving machine refreshes full metadata");

  const startup = (await router.handle("workspaces_startup")) as {
    workspaces: { id: string }[];
    active: string | null;
  };
  assert.deepEqual(startup.workspaces.map((w) => w.id), ["ws-free-1", "ws-free-2"]);
  assert.equal(startup.active, "ws-free-1");
});

test("web router resolves empty workspace list cleanly when catalog is confirmed empty and 0 machines exist", async () => {
  const fleet = new Fleet({
    self: null,
    connect: () => {
      throw new Error("no machines should connect");
    },
  });
  fleet.setMachines([]);
  const router = createRouter({
    self: null,
    fleet,
    native: null,
    catalogWorkspaces: () => [],
  });

  const listed = (await router.handle("list_workspaces")) as {
    workspaces: unknown[];
    active: string | null;
  };
  assert.deepEqual(listed, { workspaces: [], active: null });
});

test("web router still rejects list_workspaces when 0 machines exist and no catalog is available", async () => {
  const fleet = new Fleet({
    self: null,
    connect: () => {
      throw new Error("no machines should connect");
    },
  });
  fleet.setMachines([]);
  const router = createRouter({
    self: null,
    fleet,
    native: null,
  });

  await assert.rejects(() => router.handle("list_workspaces"), { detail: "machine_off" });
});

test("context router lists workspaces in a 0-machine context without throwing machine_off", async () => {
  const fleet = new Fleet({
    self: null,
    connect: () => {
      throw new Error("no machines should connect");
    },
  });
  fleet.setMachines([]);
  const router = createRouter({
    self: null,
    fleet,
    native: null,
    contextInfo: (ctx) => (ctx === "ctx-free" ? { org: "org-free", plan: null } : null),
    catalogWorkspaces: () => [{ id: "ws-1", name: "Personal", org: "org-free" }],
    contextCatalogWorkspaces: (ctx) =>
      ctx === "ctx-free" ? [{ id: "ws-1", name: "Personal", org: "org-free" }] : null,
  });

  const listed = (await router.handle("list_workspaces", {}, { headers: { "x-danil-context": "ctx-free" } })) as {
    workspaces: { id: string; name: string }[];
    active: string | null;
  };
  assert.deepEqual(listed.workspaces.map((w) => [w.id, w.name]), [["ws-1", "Personal"]]);
  assert.equal(listed.active, "ws-1");
});
