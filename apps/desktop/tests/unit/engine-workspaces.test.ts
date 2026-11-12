/**
 * Los workspaces de otras máquinas que el motor de aquí conoce
 * (`light_state_machines_v1`): `state_machines` con un IPC simulado, releído con
 * `state.copy_changed` y su versión; sin el rasgo, nada y manda la flota.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngineWorkspaces, LIGHT_STATE_MACHINES_FEATURE } from "../../src/features/machines/engine-workspaces.ts";

const FOUNDATION = {
  workspace: "fnd00001",
  name: "Danil Foundation",
  local: false,
  machines: [{ computer_id: "cmp_nube", name: "Nube IA", state: "online", provider: "danil", organization: { organization_id: "org_1" }, resources: { machine: "v1" } }],
};
const SOLO = { workspace: "solo", name: "Solo", local: true, machines: [] };

function engine(features: string[]) {
  const calls: { command: string; args?: Record<string, unknown> }[] = [];
  const handlers = new Map<string, () => void>();
  let rows: unknown[] = [SOLO, FOUNDATION];
  let version = 1;
  const state = { failing: false };
  const invoke = async (command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command !== "state_machines" || state.failing) throw { detail: "io" };
    if (args?.version === `v${version}`) return { schema: 1, version: `v${version}`, not_modified: true };
    return { schema: 1, version: `v${version}`, workspaces: rows };
  };
  const listen = async (event: string, handler: () => void) => {
    handlers.set(event, handler);
    return () => handlers.delete(event);
  };
  return {
    state,
    calls,
    invoke,
    listen,
    features: async () => features,
    emit: (event: string) => handlers.get(event)?.(),
    set: (next: unknown[]) => {
      rows = next;
      version += 1;
    },
  };
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

test("with the feature, the engine's workspaces of every session, re-read with its version on state.copy_changed", async () => {
  const fake = engine([LIGHT_STATE_MACHINES_FEATURE]);
  let changes = 0;
  const view = createEngineWorkspaces({ ...fake, onChange: () => changes++ });
  assert.equal(view.workspaces(), null, "nothing before the first answer");
  assert.equal(await view.refresh(), true);
  assert.deepEqual(view.workspaces(), [
    { id: "solo", name: "Solo", local: true, organization: false, machines: [] },
    { id: "fnd00001", name: "Danil Foundation", local: false, organization: true, machines: ["cmp_nube"] },
  ]);
  assert.equal(changes, 1);
  assert.deepEqual([...view.machineStates()], [["cmp_nube", "online"]], "what the engine's view says of each machine, for the fleet until its relay session speaks");

  // Un aviso de una copia sin cambios en la lista: `not_modified`, nada cambia.
  fake.emit("state.copy_changed");
  await sleep(250);
  assert.deepEqual(fake.calls.at(-1), { command: "state_machines", args: { version: "v1" } });
  assert.equal(changes, 1);

  // El motor borró el de la organización: se va de la lista.
  fake.set([SOLO]);
  fake.emit("state.copy_changed");
  fake.emit("state.copy_changed");
  await sleep(250);
  assert.deepEqual(view.workspaces()?.map((w) => w.id), ["solo"]);
  assert.equal(changes, 2);
  assert.equal(fake.calls.filter((c) => c.command === "state_machines").length, 3, "several notices in a row read once");
  view.close();
});

test("an engine without the feature is never asked, and the fleet keeps the rail", async () => {
  const fake = engine([]);
  const view = createEngineWorkspaces(fake);
  assert.equal(await view.refresh(), false);
  assert.equal(view.workspaces(), null);
  assert.deepEqual(fake.calls, []);
  view.close();
});

test("a failed read keeps the last good list", async () => {
  const fake = engine([LIGHT_STATE_MACHINES_FEATURE]);
  const view = createEngineWorkspaces(fake);
  await view.refresh();
  fake.set([SOLO]);
  fake.state.failing = true;
  assert.equal(await view.refresh(), false);
  assert.deepEqual(view.workspaces()?.map((w) => w.id), ["solo", "fnd00001"], "a failure is not a removal");
  view.close();
});
