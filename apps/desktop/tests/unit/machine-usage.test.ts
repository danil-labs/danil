/**
 * Lo que el panel «Máquinas» lee de `machine_resources` (`features/shell/machineUsage.ts`),
 * contra la fixture de vm-alberto: cuándo hay presión, cómo se parte la memoria,
 * qué quedó corriendo y la versión del motor. Un host sin los campos nuevos es
 * «Solo disco», nunca viejo.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { active, engineVersion, forgetSamples, hasUsage, heaviest, history, leftovers, level, remember, split, topProcesses, updateState, worst } from "../../../../packages/shell/src/shell/machineUsage.ts";
import { resources } from "../helpers/fixtures/machine-usage.ts";

const GB = 1024 ** 3;

test("pressure levels follow PSI and free memory; a disk-only host has no level", () => {
  assert.equal(level(resources("normal")["vm-alberto"]), "normal");
  assert.equal(level(resources("high")["vm-alberto"]), "high");
  assert.equal(level(resources("critical")["vm-alberto"]), "critical");
  assert.equal(level(resources("high")["vm-roberto"]), null, "an earlier engine is disk only, not outdated");
  assert.equal(hasUsage(resources("high")["vm-roberto"]), false);
  const nearlyFull = { ...resources("normal")["vm-alberto"], memory: { total_bytes: 16 * GB, available_bytes: 0.5 * GB, swap_total_bytes: 0, swap_used_bytes: 0 } };
  assert.equal(level(nearlyFull), "critical", "under 5 % free is critical even without PSI");
});

test("the worst machine lights the button; nothing when every machine is fine", () => {
  const n = resources("normal");
  assert.equal(worst([{ id: "local", resources: n.local }, { id: "vm-alberto", resources: n["vm-alberto"] }]), null);
  const c = resources("critical");
  assert.deepEqual(worst([{ id: "local", resources: c.local }, { id: "vm-roberto", resources: c["vm-roberto"] }, { id: "vm-alberto", resources: c["vm-alberto"] }]), { id: "vm-alberto", level: "critical" });
});

test("memory splits into tasks, engine and the rest, and never adds up past what is used", () => {
  const r = resources("high")["vm-alberto"];
  assert.ok(hasUsage(r));
  const s = split(r);
  const used = s.total - s.available;
  assert.equal(Math.round(used / GB * 10) / 10, 12.9);
  assert.equal(s.engine, 2.1 * GB);
  assert.equal(s.tasks + s.engine + s.other, used);
  const inflated = { ...r, tasks: r.tasks!.map((x) => ({ ...x, memory_bytes: 20 * GB })) };
  assert.ok(hasUsage(inflated));
  const clipped = split(inflated);
  assert.equal(clipped.tasks + clipped.engine + clipped.other, used, "macOS best effort may overcount; the bar clips");
});

test("active tasks sort by memory; finished tasks with live processes are «left running»", () => {
  const r = resources("high")["vm-alberto"];
  assert.deepEqual(active(r).map((x) => x.session), ["s-machines", "s-support", "s-emails", "s-search"]);
  assert.deepEqual(leftovers(r).map((x) => x.session), ["s-inbox", "s-ports"]);
  assert.deepEqual(heaviest(r).map((x) => x.session), ["s-machines", "s-support"]);
  const procs = topProcesses(active(r)[0]);
  assert.deepEqual(procs.map((p) => [p.command, p.count]), [["chrome", 4], ["node · mount-frontend", 1]], "same program grouped: «chrome (4)»");
});

test("the engine's pressure alert raises the level and names what uses the most", () => {
  const normal = resources("normal")["vm-alberto"];
  const alerted = { ...normal, pressure_alert: { since: 0, memory: 22, tasks: [{ workspace: "w", session: "s-a", title: "A", memory_bytes: 3 }, { workspace: "w", session: "s-b", title: "B", memory_bytes: 2 }, { workspace: "w", session: "s-c", title: "C", memory_bytes: 1 }] } };
  assert.equal(level(alerted), "high", "an active alert is pressure even if the last PSI reading dipped");
  assert.deepEqual(heaviest(alerted).map((x) => x.title), ["A", "B"], "the warning text comes from the alert");
  assert.deepEqual(heaviest(resources("high")["vm-alberto"]).map((x) => x.session), ["s-machines", "s-support"]);
});

test("pressure bars use the engine's history, or what this window sampled once a minute", () => {
  forgetSamples();
  const r = resources("high")["vm-alberto"];
  assert.equal(history("vm-alberto", r).length, 10);
  const bare = { ...r, pressure: { cpu: 1, memory: 30, io: 2 } };
  remember("x", { ...bare, measured_at: 0 });
  remember("x", { ...bare, measured_at: 30_000, pressure: { cpu: 1, memory: 31, io: 2 } });
  remember("x", { ...bare, measured_at: 60_000, pressure: { cpu: 1, memory: 40, io: 2 } });
  assert.deepEqual(history("x", bare), [31, 40], "one bar per minute, the last reading of that minute");
});

test("engine version: the engine block, else the control plane's host_version; «update available» is the engine's update_available", () => {
  assert.deepEqual(engineVersion({ measured_at: 0, storage: [], engine: { version: "0.2.73", build: "09a2e33c71", update_available: true } }),
    { version: "0.2.73", build: "09a2e33", updateAvailable: true });
  assert.deepEqual(engineVersion({ measured_at: 0, storage: [], engine: { version: "0.2.73", build: "09a2e33c71" } })?.updateAvailable, false, "without engine_update_v1 only version and build arrive");
  assert.deepEqual(engineVersion(undefined, "v0.2.73-45867e9"), { version: "0.2.73", build: "45867e9", updateAvailable: false });
  assert.equal(engineVersion(undefined, null), null);
});

test("update state comes from the engine: handover, pending, download", () => {
  assert.equal(updateState(undefined), null);
  assert.equal(updateState({ version: "1", available: false, handover_pending: true }), null, "without the capability nothing is promised");
  assert.equal(updateState({ available: true, handover_pending: true }), "scheduled");
  assert.equal(updateState({ available: true, pending: { mode: "when_idle" } }), "scheduled");
  assert.equal(updateState({ available: true, pending: { mode: "now" } }), "now");
  assert.equal(updateState({ available: true, download: { request_id: "r", release: "v1", state: "downloading" } }), "scheduled");
  assert.equal(updateState({ available: true, download: { request_id: "r", release: "v1", state: "rejected", error: "no_release_known" } }), "rejected");
  assert.equal(updateState({ available: true, update_available: true, latest: null }), null);
});
