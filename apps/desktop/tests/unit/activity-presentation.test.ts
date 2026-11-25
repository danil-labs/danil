import assert from "node:assert/strict";
import test from "node:test";
import "../helpers/catalog.ts";
import { currentActivityAction, observedActivityAction, presentActivity } from "../../../../packages/features/chat/src/model/activityPresentation.ts";
import { pasoDe } from "../../src/lib/steps.ts";

test("stop request suppresses animation and shows stopping caption before authoritative completion", () => {
  const action = { kind: "step" as const, step: pasoDe("command_execution", "pnpm test:unit") };
  assert.deepEqual(presentActivity({ active: true, stopping: true, action }), { label: "Deteniendo…", animate: false });
  assert.deepEqual(presentActivity({ active: false, action }), { label: "Trabajo", animate: false });
});

test("a single observed action names its subject without aggregate counts and shows parallel count only when > 1", () => {
  const action = observedActivityAction({ role: "system", text: "Read", paso: { ...pasoDe("Read", "src/features/chat/Chat.tsx"), corriendo: true } });
  assert.equal(presentActivity({ active: true, action }).label, "Leyendo Chat.tsx");
  assert.equal(presentActivity({ active: true, action, runningSteps: 3 }).label, "Leyendo Chat.tsx (+2)");
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
  assert.deepEqual(presentActivity({ active: true, stopping: true, action }), { label: "Deteniendo…", animate: false });
  assert.deepEqual(presentActivity({ active: true, blocked: true, action }), { label: "Actividad", animate: false });
  assert.equal(presentActivity({ active: true, action: { kind: "thinking" } }).label, "Pensando…");
});


test("finished activity uses duration on success and activity-before-error on failure", () => {
  assert.deepEqual(presentActivity({ active: false, duration: "1m 4s" }), { label: "Trabajó durante 1m 4s", animate: false });
  assert.deepEqual(presentActivity({ active: false, duration: null }), { label: "Trabajo", animate: false });
  assert.equal(presentActivity({ active: false, stopping: true, duration: "1m 4s" }).label, "Trabajó durante 1m 4s");
  assert.deepEqual(presentActivity({ active: false, outcome: "failed", duration: "1m 4s" }), { label: "Actividad antes del error", animate: false });
});

test("a stop quiets current work without claiming execution finished or fabricating duration", () => {
  const action = { kind: "step" as const, step: { ...pasoDe("command_execution", "pwd"), corriendo: true } };
  assert.deepEqual(presentActivity({ active: true, stopping: true, blocked: true, action }), { label: "Deteniendo…", animate: false });
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
