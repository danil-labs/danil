/**
 * El motor falso de la cola (`tests/helpers/fake-engine.mjs`) frente a la copia
 * del contrato `chat_queue_v1` (`contracts/chat-queue-v1/`): la copia no
 * diverge del hash anotado en su `PIN`, el falso con estado contesta cada
 * escenario del mock como dice el guion, y el reproductor estricto rechaza la
 * llamada que no toca.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BUSY, CONTRACT, contractFile, createFakeEngine, FEATURE, replayOnFake, scriptedEngine } from "../helpers/fake-engine.mjs";

const pin = readFileSync(new URL("PIN", CONTRACT), "utf8").split("\n").filter((line) => line && !line.startsWith("#"));
const field = (name) => pin.find((line) => line.startsWith(`${name} `))?.slice(name.length + 1);
const MOCK = contractFile("chat_queue_v1.mock.json");
const EXAMPLES = contractFile("chat_queue_v1.examples.json");

test("the chat_queue_v1 copy matches the hash pinned with its origin", () => {
  assert.match(field("commit") ?? "", /^[0-9a-f]{40}$/u, "PIN sin commit");
  assert.equal(field("repo"), "danil-labs/danil-engine");
  const files = pin.filter((line) => line.startsWith("file ")).map((line) => line.split(" "));
  assert.deepEqual(files.map(([, copy]) => copy).sort(), ["chat_queue_v1.examples.json", "chat_queue_v1.json", "chat_queue_v1.mock.json"]);
  for (const [, copy, , sha256] of files) {
    const actual = createHash("sha256").update(readFileSync(new URL(copy, CONTRACT))).digest("hex");
    assert.equal(actual, sha256, `${copy} diverge de ${field("commit")}: vuelve a copiarlo o actualiza el PIN`);
  }
  assert.deepEqual(contractFile("chat_queue_v1.json").features, [FEATURE]);
});

for (const scenario of MOCK.scenarios) {
  test(`the stateful fake engine answers the mock scenario ${scenario.name} as scripted`, async () => {
    const replay = await replayOnFake(scenario);
    for (const [index, step] of replay.steps.entries()) assert.deepEqual(step.got, step.want, `${scenario.name}, llamada ${index} (${step.command})`);
    assert.equal(replay.launched_turns, scenario.expect.launched_turns);
    assert.deepEqual(replay.stop_requested, scenario.expect.stop_requested);
  });
  test(`the scripted engine replays ${scenario.name} in order and rejects a call past the end`, async () => {
    const script = scriptedEngine(scenario);
    for (const step of scenario.steps.filter((entry) => "call" in entry)) {
      const args = { ...step.call.args, extra: "the call may carry more keys" };
      if ("error" in step) await assert.rejects(script.invoke(step.call.command, args));
      else assert.deepEqual(await script.invoke(step.call.command, args), step.result);
    }
    assert.equal(script.done(), true);
    await assert.rejects(script.invoke("get_turn", { project: "prj_fixture", session: "ses_fixture" }), /después del último paso/u);
  });
}

test("the scripted engine refuses a call whose command or args differ from the next step", async () => {
  const scenario = MOCK.scenarios.find((entry) => entry.name === "idle");
  await assert.rejects(scriptedEngine(scenario).invoke("queue_ready", { project: "prj_fixture", session: "ses_fixture" }), /se esperaba get_turn/u);
  await assert.rejects(scriptedEngine(scenario).invoke("get_turn", { project: "prj_fixture", session: "other" }), /clave session/u);
});

// Cómo se llega, en el falso, al estado de cada ejemplo del contrato.
const A = "7f3c2a1e-0b4d-4c8e-9a51-2d6f0e8b1a01";
const SETUP = {
  get_turn: { idle: () => {}, starting: (e) => e.start("ses_fixture", { id: A, state: "starting" }), running: (e) => e.start("ses_fixture", { id: A }),
    closing: (e) => e.start("ses_fixture", { id: A, state: "closing" }), relieved: (e) => e.start("ses_fixture", { id: A, state: "relieved" }) },
  stop_turn_if: { stop_requested: (e) => e.start("ses_fixture", { id: A }), turn_changed: (e) => e.start("ses_fixture", { id: "other-turn" }), not_running: () => {},
    closing: (e) => e.start("ses_fixture", { id: A, state: "closing" }), not_controllable: (e) => e.start("ses_fixture", { id: A, state: "starting" }) },
  queue_ready: { idle: () => {}, busy: (e) => e.start("ses_fixture", { id: A }) },
  send_message: { without_client_message_id: () => {}, with_client_message_id: () => {},
    duplicate: async (e) => { await e.handlers.send_message(EXAMPLES.send_message.with_client_message_id.args); e.close("ses_fixture", { event: false }); },
    creates_task: (e) => e.nextTurnId("t"), creates_task_duplicate: async (e) => { await e.handlers.send_message(EXAMPLES.send_message.creates_task.args); } },
  errors: { invalid_turn_id: () => {}, invalid_client_message_id: () => {} },
};
for (const [group, cases] of Object.entries(SETUP)) for (const [name, setup] of Object.entries(cases)) {
  test(`the fake engine reproduces the contract example ${group}.${name}`, async () => {
    const example = EXAMPLES[group]?.[name];
    assert.ok(example, `la copia del contrato ya no trae ${group}.${name}`);
    const engine = createFakeEngine({ features: [FEATURE] });
    await setup(engine);
    if (name === "creates_task") {
      // El id de la tarea nueva lo pone el motor: el ejemplo solo fija que se crea una.
      const session = await engine.handlers.send_message(example.args);
      assert.equal(typeof session, "string"); assert.equal(engine.launched, 1);
      return;
    }
    if (name === "creates_task_duplicate") {
      const created = engine.calls("send_message")[0].outcome;
      assert.equal(await engine.handlers.send_message(example.args), created, "el reenvío devuelve la tarea que creó el primero");
      assert.equal(engine.launched, 1);
      return;
    }
    if ("error" in example) await assert.rejects(engine.handlers[example.command](example.args), (error) => { assert.deepEqual(error, example.error); return true; });
    else assert.deepEqual(await engine.handlers[example.command](example.args), example.result);
  });
}

test("without chat_queue_v1 the fake engine is today's engine: no get_turn, no dedup and a probe that takes the reservation", async () => {
  const engine = createFakeEngine();
  await assert.rejects(engine.handlers.get_turn({ project: "p1", session: "s" }));
  await assert.rejects(engine.handlers.stop_turn_if({ project: "p1", session: "s", turnId: A }));
  const message = { provider: "codex", project: "p1", session: "s", prompt: "uno", clientMessageId: "m1" };
  await engine.handlers.send_message(message); engine.close("s", { event: false });
  await engine.handlers.send_message(message);
  assert.equal(engine.launched, 2, "sin el rasgo, clientMessageId no deduplica");
  engine.close("s", { event: false });
  const probe = engine.gate("queue_ready"), polling = engine.handlers.queue_ready({ project: "p1", session: "s" });
  await probe.arrived;
  await assert.rejects(engine.handlers.send_message({ ...message, prompt: "dos" }), (error) => error === BUSY);
  assert.equal(engine.calls("send_message").at(-1).outcome.holder, "probe");
  probe.open(); assert.equal(await polling, true);
});

test("the legacy stop_turn stops whatever turn the task has now; stop_turn_if compares the turn_id", async () => {
  const legacy = createFakeEngine();
  legacy.start("s", { id: "A" }); legacy.close("s", { event: false }); legacy.start("s", { id: "B" });
  await legacy.handlers.stop_turn({ project: "p1", session: "s" });
  assert.deepEqual(legacy.stopped, ["B"]);
  const v1 = createFakeEngine({ features: [FEATURE] });
  v1.start("s", { id: "A" }); v1.close("s", { event: false }); v1.start("s", { id: "B" });
  assert.deepEqual(await v1.handlers.stop_turn_if({ project: "p1", session: "s", turnId: "A" }), { outcome: "turn_changed" });
  assert.deepEqual(v1.stopped, []);
});

test("closes are emitted as done with ok true, false or absent, or not at all", () => {
  const events = [];
  const engine = createFakeEngine({ emit: (event) => events.push(event) });
  for (const [session, ok] of [["a", true], ["b", false], ["c", undefined]]) { engine.start(session); engine.close(session, { ok }); }
  engine.start("d"); engine.close("d", { event: false });
  assert.deepEqual(events.map(({ payload }) => [payload.session, payload.kind, "ok" in payload ? payload.ok : "absent"]), [["a", "done", true], ["b", "done", false], ["c", "done", "absent"]]);
});

test("load_queue returns what save_queue stored, per project and task", async () => {
  const engine = createFakeEngine();
  await engine.handlers.save_queue({ project: "p1", session: "s", queued: [{ id: "q1" }] });
  assert.deepEqual(await engine.handlers.load_queue({ project: "p1", session: "s" }), [{ id: "q1" }]);
  assert.deepEqual(await engine.handlers.load_queue({ project: "p1", session: "other" }), []);
});
