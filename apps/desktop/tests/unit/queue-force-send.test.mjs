import assert from "node:assert/strict";
import nodeTest from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { chat, openTask, pushedPoll, responses, session, turns } from "../helpers/push-fixture.mjs";
import { waitFor } from "../helpers/wait-for.mjs";
import { FEATURE } from "../helpers/fake-engine.mjs";
import { inWindowCase, mountWindow, red, windowCase } from "../helpers/fake-engine-window.mjs";

if (!inWindowCase) for (const [terminalFirst, payload, keyboard] of [[false, false, false], [true, false, false], [false, true, false], [false, false, true]]) nodeTest(`forcing the queue interrupts before sending (${terminalFirst ? "terminal first" : "ack first"}, ${payload ? "mention and attachment" : "plain"}, ${keyboard ? "keyboard" : "arrow"})`, async () => {
  const stream = pushedPoll();
  let active = true, acknowledge;
  const sent = [], saved = [];
  const queued = { id: "q1", text: payload ? "@t2 next instruction" : "next instruction", provider: "codex", model: "gpt-5.6", effort: null, permission_mode: "auto", attachments: payload ? ["/lab/attachment.png"] : [], task_mentions: payload ? [{ target: { kind: "task", projectId: "p1", sessionId: "t2" }, text: "@t2", start: 0, end: 3 }] : [] };
  const remainder = { ...queued, id: "q2", text: "!echo remaining", task_mentions: [], attachments: [] };
  const app = await boot("listo", `queue-force-${terminalFirst}-${payload}-${keyboard}`, responses({
    service_poll: stream.poll, service_filter: null,
    prepare_attachments: ({ paths }) => paths,
    list_active_turns: () => active ? ["t1"] : [],
    load_history: ({ id }) => session(id, turns(0, 4)),
    load_queue: ({ session }) => session === "t1" ? [queued, remainder] : [],
    save_queue: ({ queued }) => { saved.push(queued); return null; },
    stop_turn: () => new Promise(resolve => { acknowledge = resolve; }),
    inject_message: () => ({ id: "wrong-steer" }),
    send_message: args => { sent.push(args); active = true; return "t1"; },
  }));
  await openTask(app, "t1");
  const button = await waitFor(() => [...app.w.document.querySelectorAll("button")].find(element => /^(Mandar ahora|Interrumpir y enviar|Detener el turno y enviar) el mensaje 1 de la cola$/.test(element.getAttribute("aria-label") ?? "")), "queue force action missing");
  assert.match(button.getAttribute("aria-label"), /^(Mandar ahora|Interrumpir y enviar|Detener el turno y enviar) /);
  if (keyboard) {
    const input = app.w.document.querySelector("textarea");
    assert.ok(input, "composer missing");
    input.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  } else button.click();
  await sleep(80);
  assert.equal(app.commands.filter(command => command === "stop_turn").length, 1);
  assert.equal(app.commands.filter(command => command === "inject_message").length, 0);
  assert.equal(sent.length, 0);
  assert.ok(app.w.document.body.textContent.includes(queued.text), "pending message disappeared before closure");
  assert.ok(saved.at(-1)?.some(item => item.id === queued.id), "pending message was removed from durable queue");
  const terminal = async () => { active = false; stream.push({ events: [chat("done", { ok: false })] }); await sleep(120); };
  if (terminalFirst) await terminal(); else { acknowledge(null); await sleep(120); }
  assert.equal(sent.length, 0, "both cancellation ack and terminal are required");
  if (terminalFirst) acknowledge(null); else await terminal();
  await waitFor(() => sent.length === 1, "replacement was not sent after closure");
  await sleep(100);
  assert.equal(sent.length, 1);
  assert.ok(saved.at(-1)?.some(item => item.id === remainder.id), "remaining queued item disappeared");
  assert.equal(sent[0].prompt, queued.text);
  if (payload) assert.deepEqual(sent[0].attachments, queued.attachments);
  assert.deepEqual(sent[0].taskMentions, queued.task_mentions);
  assert.equal(app.commands.filter(command => command === "stop_turn").length, 1);
  assert.equal(app.commands.filter(command => command === "inject_message").length, 0);
});

// Con el motor falso de la cola (`tests/helpers/fake-engine.mjs`): los controles
// que no cambian (C) y la rotación A→B (R-Rot). La aserción va en el motor. Van
// cada una en su proceso (`windowCase`): dos ventanas en un proceso se pisan.
const test = (name, ...rest) => windowCase(import.meta.url, name, ...(rest.length === 1 ? [{}, rest[0]] : rest));
const CONTROL_TEXT = "siguiente instrucción";

test("C: the first Enter during a live turn queues and sends nothing", async () => {
  const w = await mountWindow("c-first-enter", { before: engine => engine.start("t1", { id: "A" }) });
  try {
    await w.open("t1");
    assert.ok(w.stopButton(), "the live turn is not visible");
    await w.type(CONTROL_TEXT);
    assert.equal(w.sends("t1").length, 0);
    assert.deepEqual(w.engine.saved("p1", "t1").map(item => item.text), [CONTROL_TEXT]);
    assert.equal(w.engine.stopped.length, 0);
  } finally { w.unmount(); }
});

test("C: a double Enter with an empty box stops once and sends the queued message once", async () => {
  const w = await mountWindow("c-double-enter", { before: engine => engine.start("t1", { id: "A" }) });
  try {
    await w.open("t1");
    await w.type(CONTROL_TEXT);
    await w.enter(); await w.enter();
    assert.equal(w.engine.calls("stop_turn", "t1").length, 1);
    w.engine.close("t1", { ok: false });
    await waitFor(() => w.accepted("t1").length > 0, "the queued message was not sent after the close");
    await w.tick(2000);
    assert.deepEqual(w.accepted("t1").map(entry => entry.args.prompt), [CONTROL_TEXT]);
    assert.equal(w.engine.calls("stop_turn").length, 1);
  } finally { w.unmount(); }
});

test("C: stopping one task does not stop another concurrent turn", async () => {
  const w = await mountWindow("c-concurrent", { before: engine => { engine.start("t1", { id: "A" }); engine.start("t2", { id: "B" }); } });
  try {
    await w.open("t1");
    w.stopButton()?.click();
    await waitFor(() => w.engine.calls("stop_turn").length > 0, "Stop did not reach the engine");
    await w.settle(200);
    assert.deepEqual(w.engine.stopped, ["A"]);
    assert.deepEqual(w.engine.log.filter(entry => entry.command.startsWith("stop_turn")).map(entry => entry.args.session), ["t1"]);
  } finally { w.unmount(); }
});

for (const features of [[], [FEATURE]]) {
  const reason = features.length
    ? "C0/Q1b: la ventana no lee get_turn ni usa stop_turn_if; con el rasgo el motor contestaría turn_changed"
    : "Riesgo documentado: stop_turn legado no lleva identidad de turno y detiene B (política a1/a2 sin decidir)";
  test(`R-Rot (${features.length ? "chat_queue_v1" : "legacy stop_turn"}): after A closes and B starts, Stop read on A does not stop B`, red(reason), async () => {
    const w = await mountWindow(`rot-${features.length}`, { features, before: engine => engine.start("t1", { id: "A" }) });
    try {
      await w.open("t1");
      assert.ok(w.stopButton(), "Stop is not offered for A");
      w.engine.close("t1", { event: false });
      w.engine.start("t1", { id: "B" });
      w.stopButton()?.click();
      await waitFor(() => w.engine.log.some(entry => entry.command.startsWith("stop_turn")), "Stop did not reach the engine");
      await w.settle(200);
      assert.deepEqual({ stopped: w.engine.stopped, running: w.engine.turn("t1")?.id }, { stopped: [], running: "B" });
    } finally { w.unmount(); }
  });
}
