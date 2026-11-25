import assert from "node:assert/strict";
import test from "node:test";
import "../helpers/catalog.ts";
import { createActivityProjection } from "../../../../packages/features/chat/src/model/activity.ts";
import { buildActivityTimeline } from "../../../../packages/features/chat/src/model/activityTimeline.ts";
import { lotesDeDeltas, type StreamChunk } from "../../../../packages/features/chat/src/model/deltaFrames.ts";
import type { Msg } from "../../../../packages/features/chat/src/model/messageTypes.ts";
import { sealLiveIntoBase } from "../../../../packages/features/chat/src/model/turnSeal.ts";
import { pasoDe } from "../../../../packages/ui/src/lib/steps.ts";
import { createTabs } from "../../../../packages/ui/src/lib/tabs-store.ts";

test("sealLiveIntoBase preserves intermediate agent outputs (Option B), tool detalle and live reasoning without duplicating saved pieces", () => {
  const previousBase: Msg[] = [{ role: "user", turno: "u1", text: "Analiza el proyecto" }];
  const liveStep = pasoDe("Bash", "pnpm test", { corriendo: false, ok: true, detalle: { kind: "output", text: "206 passed", exit_code: 0, truncated: false } });
  const previousLive: Msg[] = [
    { role: "agent", text: "Voy a correr las pruebas primero.", razonamiento: [{ text: "Paso 1: ejecutar suite" }] },
    { role: "system", text: "Bash", paso: liveStep },
    { role: "agent", text: "Todo está en verde." },
  ];
  // Disco devolvió el turno sin `pieces` intermedios, sin `detalle` en el paso y sin `razonamiento`.
  const incomingBase: Msg[] = [
    ...previousBase,
    { role: "system", text: "Bash", tramo: "a1", paso: pasoDe("Bash", "pnpm test", { corriendo: false, ok: true }) },
    { role: "agent", turno: "a1", text: "Todo está en verde.", duration_ms: 2100 },
  ];

  const sealed = sealLiveIntoBase(previousBase, previousLive, incomingBase);
  const texts = sealed.filter((m) => m.role === "agent").map((m) => m.text);
  assert.deepEqual(texts, ["Voy a correr las pruebas primero.", "Todo está en verde."]);
  const preservedProgress = sealed.find((m) => m.text === "Voy a correr las pruebas primero.");
  assert.equal(preservedProgress?.avanceDe, "a1");
  const sealedStep = sealed.find((m) => m.paso?.nombre === "Bash");
  assert.deepEqual(sealedStep?.paso?.detalle, { kind: "output", text: "206 passed", exit_code: 0, truncated: false });
  const finalAgent = sealed.find((m) => m.turno === "a1");
  assert.deepEqual(finalAgent?.razonamiento, [{ text: "Paso 1: ejecutar suite" }]);

  // Si el disco ya persiste `pieces` intermedios y razonamiento, no duplica nada.
  const incomingWithPieces: Msg[] = [
    ...previousBase,
    { role: "agent", avanceDe: "a1", text: "Voy a correr las pruebas primero." },
    { role: "system", text: "Bash", tramo: "a1", paso: pasoDe("Bash", "pnpm test", { corriendo: false, ok: true }) },
    { role: "agent", turno: "a1", text: "Todo está en verde.", razonamiento: [{ text: "Guardado" }] },
  ];
  const sealedNoDup = sealLiveIntoBase(previousBase, previousLive, incomingWithPieces);
  assert.equal(sealedNoDup.filter((m) => m.role === "agent").length, 2);
  assert.deepEqual(sealedNoDup.find((m) => m.turno === "a1")?.razonamiento, [{ text: "Guardado" }]);
});

test("buildActivityTimeline preserves interleaved reasoning and tool chronology", () => {
  const s1 = pasoDe("Read", "src/a.ts", { ok: true });
  const s2 = pasoDe("Bash", "pnpm test", { ok: true });
  const messages: Msg[] = [
    { role: "agent", text: "", razonamiento: [{ text: "Primero leo a.ts" }] },
    { role: "system", text: "Read", paso: s1 },
    { role: "agent", text: "", razonamiento: [{ text: "Ahora corro tests" }] },
    { role: "system", text: "Bash", paso: s2 },
  ];
  const timeline = buildActivityTimeline(messages, [s1, s2], [{ text: "fallback" }]);
  assert.equal(timeline.length, 4);
  assert.deepEqual(timeline.map((item) => item.kind), ["reasoning", "steps", "reasoning", "steps"]);
  assert.equal(timeline[0].kind === "reasoning" ? timeline[0].bloques[0].text : "", "Primero leo a.ts");
  assert.equal(timeline[1].kind === "steps" ? timeline[1].pasos[0].objetivo : "", "src/a.ts");
  assert.equal(timeline[2].kind === "reasoning" ? timeline[2].bloques[0].text : "", "Ahora corro tests");
  assert.equal(timeline[3].kind === "steps" ? timeline[3].pasos[0].objetivo : "", "pnpm test");
});

test("createActivityProjection hides failed turn without tools/reasoning and keeps collapsed tools when work ran before error", () => {
  // Caso 1: fallo directo sin tools ni razonamiento -> se quita «Trabajó» por completo.
  const withoutWork = createActivityProjection();
  const user: Msg = { role: "user", turno: "u1", text: "Hola" };
  withoutWork.begin("w", "s1", 1000, [user], true);
  const failure: Msg = { role: "system", meta: "fallo", text: "Se acabó el cupo." };
  withoutWork.observe("w", "s1", [], [failure]);
  withoutWork.finish("w", "s1", "failed");
  assert.deepEqual(withoutWork.project("w", "s1", [user, failure]), []);

  // Caso 2: corrió tools y luego falló por cupo -> conserva actividad con outcome "failed" para mostrar colapsada.
  const withWork = createActivityProjection();
  withWork.begin("w", "s2", 1000, [user], true);
  const toolMsg: Msg = { role: "system", text: "Read", paso: pasoDe("Read", "src/app.ts", { ok: true }) };
  withWork.observe("w", "s2", [], [toolMsg]);
  withWork.observe("w", "s2", [toolMsg], [toolMsg, failure]);
  withWork.finish("w", "s2", "failed");
  const projected = withWork.project("w", "s2", [user, toolMsg, failure]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].active, false);
  assert.equal(projected[0].outcome, "failed");
  assert.equal(projected[0].messages.some((m) => m.paso?.nombre === "Read"), true);
});

test("lotesDeDeltas batches delta and reasoning chunks in exact arrival order", () => {
  const delivered: StreamChunk[][] = [];
  const queue: (() => void)[] = [];
  const batches = lotesDeDeltas(
    (_session, _workspace, chunks) => { delivered.push(chunks); },
    (fn) => {
      queue.push(fn);
      return () => { const i = queue.indexOf(fn); if (i >= 0) queue.splice(i, 1); };
    },
  );
  batches.meter("s1", "w", { kind: "reasoning", text: "plan 1", author: null });
  batches.meter("s1", "w", { kind: "reasoning", text: " + 2", author: null });
  batches.meter("s1", "w", { kind: "delta", text: "hola ", author: null });
  batches.meter("s1", "w", { kind: "delta", text: "mundo", author: null });
  assert.equal(delivered.length, 0);
  while (queue.length) queue.shift()?.();
  assert.equal(delivered.length, 1);
  assert.deepEqual(delivered[0].map((c) => [c.kind, c.text]), [
    ["reasoning", "plan 1"],
    ["reasoning", " + 2"],
    ["delta", "hola "],
    ["delta", "mundo"],
  ]);
});

test("createTabs preserves mountKey across provisional-to-real commitDraft without persisting mountKey", () => {
  const stored = new Map<string, string>();
  const storage = {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => { stored.set(k, v); },
    removeItem: (k: string) => { stored.delete(k); },
    key: (i: number) => [...stored.keys()][i] ?? null,
    get length() { return stored.size; },
    clear: () => stored.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });

  const tabs = createTabs();
  tabs.load("w1", "space1");
  tabs.ensure({ id: "provisional:1", project: "p1", titulo: "Borrador" });
  const before = tabs.open()[0];
  assert.equal(before.clase, "tarea");
  const initialMountKey = before.mountKey;
  assert.equal(initialMountKey, "provisional:1");

  tabs.commitDraft("provisional:1", { id: "real-session-1", project: "p1", titulo: "Tarea real" });
  const after = tabs.open()[0];
  assert.equal(after.id, "real-session-1");
  assert.equal(after.session, "real-session-1");
  assert.equal(after.clase === "tarea" ? after.mountKey : undefined, initialMountKey);

  // Al persistir en localStorage, no guarda la propiedad efímera `mountKey`.
  const persistedRaw = [...stored.values()].find((v) => v.includes("real-session-1"));
  assert.ok(persistedRaw);
  assert.equal(persistedRaw.includes("mountKey"), false);
});
