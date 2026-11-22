/**
 * El motor falso de la cola (`tests/helpers/fake-engine.mjs`) frente a la copia
 * del contrato `chat_queue_v1` (`contracts/chat-queue-v1/`): la copia no
 * diverge del hash anotado en su `PIN`, el falso con estado contesta cada
 * escenario del mock como dice el guion, el reproductor estricto rechaza la
 * llamada que no toca, y el falso contesta la tabla de coherencia que R0 corre
 * contra el motor lab (`tests/fixtures/chat-queue-coherence.json`).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CONTRACT, CONTRACT_BUSY, contractFile, createFakeEngine, ENGINE_STEPS, EXPECT_KEYS, FEATURE, LEGACY_BUSY, MOCK, replayOnFake, scriptedEngine } from "../helpers/fake-engine.mjs";
import { fill, outcomeOf, runCase, TABLE } from "../helpers/chat-queue-coherence-lab.mjs";

const A = "7f3c2a1e-0b4d-4c8e-9a51-2d6f0e8b1a01";

const pin = readFileSync(new URL("PIN", CONTRACT), "utf8").split("\n").filter((line) => line && !line.startsWith("#"));
const field = (name) => pin.find((line) => line.startsWith(`${name} `))?.slice(name.length + 1);
const EXAMPLES = contractFile("chat_queue_v1.examples.json");

test("the chat_queue_v1 copy matches the hash pinned with its origin", () => {
  assert.match(field("commit") ?? "", /^[0-9a-f]{40}$/u, "PIN sin commit");
  assert.equal(field("repo"), "danil-labs/danil-engine");
  assert.match(field("estado") ?? "", /\S/u, "PIN sin estado del contrato");
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
    assert.deepEqual(replay.expect, scenario.expect);
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

test("the mock format names the engine steps and expect keys the fake knows, and the replay refuses any other", async () => {
  assert.deepEqual([...ENGINE_STEPS].sort(), ["engine_restart", "turn_closed", "turn_closing", "turn_running", "turn_starting"]);
  assert.deepEqual(EXPECT_KEYS, ["launched_turns", "stop_requested"]);
  const idle = MOCK.scenarios.find((entry) => entry.name === "idle");
  await assert.rejects(replayOnFake({ ...idle, steps: [{ engine: "turn_paused", turn_id: A }, ...idle.steps] }), /paso de motor desconocido "turn_paused"/u);
  await assert.rejects(replayOnFake({ ...idle, expect: { ...idle.expect, stop_attempts: 0 } }), /expect trae claves que el falso no conoce: stop_attempts/u);
  await assert.rejects(replayOnFake({ ...idle, steps: [{ engine: "turn_running", turn_id: A }, { engine: "turn_closed", turn_id: "B" }] }), /turn_closed de B con el turno .* sin cerrar/u);
});

test("the scripted engine refuses a call whose command or args differ from the next step", async () => {
  const scenario = MOCK.scenarios.find((entry) => entry.name === "idle");
  await assert.rejects(scriptedEngine(scenario).invoke("queue_ready", { project: "prj_fixture", session: "ses_fixture" }), /se esperaba get_turn/u);
  await assert.rejects(scriptedEngine(scenario).invoke("get_turn", { project: "prj_fixture", session: "other" }), /clave session/u);
});

// Cómo se llega, en el falso, al estado de cada ejemplo del contrato.
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
test("every contract example has its setup in the fake, and the fake sets up no example the copy lacks", () => {
  const names = (groups) => Object.fromEntries(Object.entries(groups).filter(([group]) => !group.startsWith("_")).map(([group, cases]) => [group, Object.keys(cases).sort()]));
  assert.deepEqual(names(SETUP), names(EXAMPLES));
});
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
  await assert.rejects(engine.handlers.send_message({ ...message, prompt: "dos" }), (error) => error === LEGACY_BUSY);
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

test("busy is history.error.busy without the feature and the code the contract copy names with it", async () => {
  assert.equal(LEGACY_BUSY, "history.error.busy");
  assert.equal(CONTRACT_BUSY, "history.error.busy", "la copia del contrato nombra otro error de ocupado: revisa la ventana");
  for (const [features, expected] of [[[], LEGACY_BUSY], [[FEATURE], CONTRACT_BUSY]]) {
    const engine = createFakeEngine({ features }); engine.start("s");
    await assert.rejects(engine.handlers.send_message({ provider: "codex", project: "p1", session: "s", prompt: "x" }), (error) => error === expected);
  }
});

// La tabla de coherencia: lo que el falso responde en cada fila, en cada modo.
const IDS = { $project: "p1", $session: "s", $provider: "codex" };
async function onFake(row, mode) {
  const engine = createFakeEngine({ features: mode === "chat_queue_v1" ? [FEATURE] : [] });
  let probe = null;
  if (row.state === "turn") engine.start("s");
  if (row.state === "reservation") engine.reserve("s");
  if (row.state === "probe_in_flight") {
    const gate = engine.gate("queue_ready");
    probe = { gate, polling: engine.handlers.queue_ready(fill({ project: "$project", session: "$session" }, IDS)) };
    await gate.arrived;
  }
  const calls = [];
  for (const step of [row, ...(row.then ? [row.then] : [])]) {
    const call = fill(step.call, IDS);
    let got;
    try { got = { value: await engine.handlers[call.command](call.arguments) }; } catch (error) { got = { error }; }
    calls.push({ got: outcomeOf(got), want: fill(step.expect[mode], IDS) });
  }
  if (probe) { probe.gate.open(); await probe.polling; }
  return calls;
}
test("the coherence table has the strategy rows: busy and queue_ready with a turn, with a reservation and free", () => {
  const rows = new Set(TABLE.cases.map((row) => `${row.call.command}/${row.state}`));
  for (const row of ["send_message/turn", "send_message/reservation", "send_message/free", "queue_ready/turn", "queue_ready/reservation", "queue_ready/free"]) assert.ok(rows.has(row), `falta ${row}`);
  for (const row of TABLE.cases) assert.ok(row.state in TABLE.states, `${row.id}: estado sin montaje descrito`);
});
for (const row of TABLE.cases) for (const mode of ["legacy", "chat_queue_v1"]) {
  if (row.expect[mode] == null) continue;
  test(`coherence ${row.id} (${mode}): the fake answers what the table expects from the lab engine`, async () => {
    for (const [index, call] of (await onFake(row, mode)).entries()) assert.deepEqual(call.got, call.want, `${row.id}, llamada ${index}`);
  });
}

test("the lab runner sends one RPC1 service invoke per call and compares the reply (against a local server backed by the fake)", async () => {
  const engine = createFakeEngine(), frames = [];
  engine.start("s");
  const server = createServer((socket) => socket.once("data", async (chunk) => {
    const frame = JSON.parse(String(chunk)); frames.push(frame);
    let result;
    try { result = { value: await engine.handlers[frame.args.command](frame.args.arguments) }; } catch (error) { result = { error }; }
    socket.end(`${JSON.stringify({ version: 1, result })}\n`);
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const token = join(tmpdir(), `coherence-${process.pid}.token`); writeFileSync(token, "window-token\n");
    const endpoint = { address: `127.0.0.1:${server.address().port}`, token_file: token };
    const busy = await runCase({ endpoint, workspace: "w", ids: IDS, mode: "legacy", id: "send-busy-turn" });
    assert.deepEqual({ status: busy.status, lab: busy.report.calls[0].lab }, { status: 0, lab: { error: LEGACY_BUSY } });
    assert.deepEqual({ ...frames[0], request_id: typeof frames[0].request_id }, { version: 1, token: "window-token", workspace: "w", folder: null, command: "service invoke",
      args: { command: "send_message", arguments: { provider: "codex", project: "p1", session: "s", prompt: "coherencia T0" } }, request_id: "string" });
    const mismatch = await runCase({ endpoint, workspace: "w", ids: IDS, mode: "chat_queue_v1", id: "ready-free" });
    assert.equal(mismatch.status, 1, "con turno, ready-free no coincide: el ejecutor tiene que decirlo");
    assert.equal((await runCase({ endpoint, workspace: "w", ids: IDS, mode: "legacy", id: "send-during-probe" })).status, 2);
  } finally { server.close(); }
});
