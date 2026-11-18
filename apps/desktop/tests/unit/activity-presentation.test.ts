import assert from "node:assert/strict";
import test from "node:test";
import "../helpers/catalog.ts";
import { currentActivityAction, observedActivityAction, presentActivity } from "../../src/features/chat/activityPresentation.ts";
import { pasoDe } from "../../src/lib/steps.ts";

test("stop request suppresses animation and stale action before authoritative completion", () => {
  const action = { kind: "step" as const, step: pasoDe("command_execution", "pnpm test:unit") };
  assert.deepEqual(presentActivity({ active: true, stopping: true, action }), { label: "Trabajo", animate: false });
  assert.deepEqual(presentActivity({ active: false, action }), { label: "Trabajo", animate: false });
});

test("a single observed action names its subject without aggregate counts", () => {
  const action = observedActivityAction({ role: "system", text: "Read", paso: { ...pasoDe("Read", "src/features/chat/Chat.tsx"), corriendo: true } });
  assert.equal(presentActivity({ active: true, action }).label, "Leyendo Chat.tsx");
  assert.equal(presentActivity({ active: true, action: observedActivityAction({ role: "agent", text: "", razonamiento: [{ text: "x" }] }) }).label, "Pensando…");
  assert.equal(presentActivity({ active: true, action: observedActivityAction({ role: "agent", text: "previous answer", razonamiento: [{ text: "new reasoning" }] }, "thinking") }).label, "Pensando…");
});

test("unknown recovery cannot invent thinking or a command from queue inputs", () => {
  assert.equal(observedActivityAction({ role: "user", text: "continue" }), null);
  assert.equal(presentActivity({ active: true }).label, "Preparando…");
  assert.equal(presentActivity({ active: true, blocked: true }).animate, false);
  assert.equal(presentActivity({ active: true, paused: true }).animate, false);
});

for (const corriendo of [false, undefined]) test(`a completed command is not the current work of an active turn (${corriendo})`, () => {
  const action = { kind: "step" as const, step: { ...pasoDe("command_execution", "pwd"), corriendo } };
  assert.deepEqual(presentActivity({ active: true, action }), { label: "Pensando…", animate: true });
  assert.deepEqual(presentActivity({ active: false, action }), { label: "Trabajo", animate: false });
  assert.deepEqual(presentActivity({ active: true, stopping: true, action }), { label: "Trabajo", animate: false });
  assert.deepEqual(presentActivity({ active: true, blocked: true, action }), { label: "Actividad", animate: false });
  assert.equal(presentActivity({ active: true, action: { kind: "thinking" } }).label, "Pensando…");
});


test("finished activity uses the actual duration as its only caption", () => {
  assert.deepEqual(presentActivity({ active: false, duration: "1m 4s" }), { label: "Trabajó durante 1m 4s", animate: false });
  assert.deepEqual(presentActivity({ active: false, duration: null }), { label: "Trabajo", animate: false });
  assert.equal(presentActivity({ active: false, stopping: true, duration: "1m 4s" }).label, "Trabajó durante 1m 4s");
});

test("a stop quiets current work without claiming execution finished or fabricating duration", () => {
  const action = { kind: "step" as const, step: { ...pasoDe("command_execution", "pwd"), corriendo: true } };
  assert.deepEqual(presentActivity({ active: true, stopping: true, blocked: true, action }), { label: "Trabajo", animate: false });
  assert.equal(action.step.corriendo, true);
  assert.deepEqual(presentActivity({ active: true }), { label: "Preparando…", animate: true });
});


test("completed tools resume thinking unless another tool remains active", () => {
  const finished = pasoDe("Bash", "pwd", { corriendo: false });
  const running = pasoDe("Read", "large-file.ts", { corriendo: true });
  assert.deepEqual(currentActivityAction({ kind: "step", step: finished }, [finished]), { kind: "thinking" });
  assert.deepEqual(currentActivityAction({ kind: "step", step: finished }, [running, finished]), { kind: "step", step: running });
  assert.deepEqual(currentActivityAction({ kind: "responding" }, [running]), { kind: "responding" });
  assert.equal(currentActivityAction(null, []), null);
});
