import assert from "node:assert/strict";
import test from "node:test";
import {
  formatEngineVersion,
  normalizeVersion,
  parseEngineVersion,
  pickTargetMachine,
  resourcesFromStartup,
} from "../../../../packages/features/settings/src/model/maintenance-version.ts";

test("parseEngineVersion prefers machine_resources.engine and truncates build to 7 chars", () => {
  const info = parseEngineVersion(
    {
      measured_at: 1,
      storage: [],
      engine: { version: "0.3.5", build: "45867e9abcdef" },
    },
    "0.2.0-1111111",
    "0.1.0 2222222",
  );
  assert.deepEqual(info, { version: "0.3.5", build: "45867e9" });
  assert.equal(formatEngineVersion(info!), "v0.3.5 · 45867e9");
});

test("parseEngineVersion falls back to host_version and engineBuild strings", () => {
  assert.deepEqual(parseEngineVersion(undefined, "0.3.4-9abcdef12"), {
    version: "0.3.4",
    build: "9abcdef",
  });
  assert.deepEqual(parseEngineVersion(undefined, undefined, "0.3.4 9abcdef12"), {
    version: "0.3.4",
    build: "9abcdef",
  });
  assert.deepEqual(parseEngineVersion(undefined, "v0.3.4-beta.1"), {
    version: "0.3.4-beta.1",
    build: null,
  });
  assert.equal(formatEngineVersion({ version: "v0.3.4", build: null }), "v0.3.4");
  assert.equal(parseEngineVersion(undefined, null, null), null);
});

test("resourcesFromStartup handles direct and fleet-merged list_workspaces payloads", () => {
  const direct = { measured_at: 1, storage: [], engine: { version: "0.3.5", build: "abc1234" } };
  assert.equal(resourcesFromStartup({ machine_resources: direct }), direct);

  const remote = { measured_at: 2, storage: [], engine: { version: "0.3.6", build: "def5678" } };
  assert.equal(
    resourcesFromStartup({ machine_resources_by_machine: { m1: direct, m2: remote } }, "m2"),
    remote,
  );
  assert.equal(
    resourcesFromStartup({ machine_resources_by_machine: { m1: direct, m2: remote } }),
    direct,
  );
  assert.equal(resourcesFromStartup(null), undefined);
});

test("pickTargetMachine prioritizes local, then active online, then active, then online", () => {
  const remoteOn = { id: "r1", local: false, active: false, on: true, hosts: true };
  const activeOff = { id: "r2", local: false, active: true, on: false, hosts: true };
  const activeOn = { id: "r3", local: false, active: true, on: true, hosts: true };
  const local = { id: "l1", local: true, active: false, on: true, hosts: true };

  assert.equal(pickTargetMachine([remoteOn, activeOn, local])?.id, "l1");
  assert.equal(pickTargetMachine([remoteOn, activeOff, activeOn])?.id, "r3");
  assert.equal(pickTargetMachine([remoteOn, activeOff])?.id, "r2");
  assert.equal(pickTargetMachine([remoteOn])?.id, "r1");
  assert.equal(pickTargetMachine([]), undefined);
  assert.equal(normalizeVersion(" v0.3.5 "), "0.3.5");
});
