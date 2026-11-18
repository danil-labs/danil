import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { chat, openTask, pushedPoll, responses, session, turns } from "../helpers/push-fixture.mjs";
import { waitFor } from "../helpers/wait-for.mjs";

test("stop acknowledgement and terminal release a forced message while presence reconciliation is pending", async () => {
  const stream = pushedPoll();
  let active = true, acknowledge, holdPresence = false;
  const sent = [], presence = [];
  const queued = { id: "q1", text: "successor after stop", provider: "codex", model: "gpt-5.6", effort: null, permission_mode: null, attachments: [] };
  const app = await boot("listo", "queue-force-pending-presence", responses({
    service_poll: stream.poll, service_filter: null,
    list_active_turns: () => holdPresence ? new Promise(resolve => presence.push(resolve)) : active ? ["t1"] : [],
    load_history: ({ id }) => session(id, turns(0, 4)),
    load_queue: ({ session }) => session === "t1" ? [queued] : [], save_queue: null,
    stop_turn: () => new Promise(resolve => { acknowledge = resolve; }),
    send_message: args => { sent.push(args); active = true; return "t1"; },
  }));
  try {
    await openTask(app, "t1");
    const button = await waitFor(() => [...app.w.document.querySelectorAll("button")].find(element => /^(Mandar ahora|Interrumpir y enviar|Detener el turno y enviar) el mensaje 1 de la cola$/.test(element.getAttribute("aria-label") ?? "")), "queue force action missing");
    button.click();
    await waitFor(() => acknowledge, "stop request missing");
    assert.equal([...app.w.document.querySelectorAll("p, span")].filter(node => node.children.length === 0 && node.textContent === queued.text).length, 1, "the handoff input is rendered once, not repeated in the queue");
    holdPresence = true; acknowledge(null);
    await waitFor(() => presence.length, "stop did not request reconciliation");
    assert.equal(sent.length, 0, "stop acknowledgement must not invent a terminal");
    active = false; stream.push({ events: [chat("done", { ok: false })] });
    await waitFor(() => sent.length === 1, "authoritative terminal and stop ACK were blocked by the unrelated presence read", 1500);
    assert.equal(sent[0].prompt, queued.text);
    assert.equal(app.commands.filter(command => command === "stop_turn").length, 1);
    stream.push({ events: [chat("started")] });
    await sleep(80);
    holdPresence = false;
    for (const resolve of presence) resolve([]);
    await sleep(80);
    assert.equal(sent.length, 1);
    assert.ok([...app.w.document.querySelectorAll("button")].some(button => button.getAttribute("aria-label") === "Detener turno"), "stale presence closed the successor");
  } finally { holdPresence = false; for (const resolve of presence) resolve([]); app.w.close(); }
});

test("a stop failure is visible without awaiting a pending presence read and preserves the queued message", async () => {
  const stream = pushedPoll();
  let rejectStop, holdPresence = false;
  const sent = [], presence = [];
  const queued = { id: "q1", text: "retained after stop failure", provider: "codex", model: "gpt-5.6", effort: null, permission_mode: null, attachments: [] };
  const app = await boot("listo", "queue-force-rejected-presence", responses({
    service_poll: stream.poll, service_filter: null,
    list_active_turns: () => holdPresence ? new Promise(resolve => presence.push(resolve)) : ["t1"],
    load_history: ({ id }) => session(id, turns(0, 4)),
    load_queue: ({ session }) => session === "t1" ? [queued] : [], save_queue: null,
    stop_turn: () => new Promise((_resolve, reject) => { rejectStop = reject; }),
    send_message: args => { sent.push(args); return "t1"; },
  }));
  try {
    await openTask(app, "t1");
    const button = await waitFor(() => [...app.w.document.querySelectorAll("button")].find(element => /^(Mandar ahora|Interrumpir y enviar|Detener el turno y enviar) el mensaje 1 de la cola$/.test(element.getAttribute("aria-label") ?? "")), "queue force action missing");
    button.click(); await waitFor(() => rejectStop, "stop request missing");
    holdPresence = true; rejectStop(new Error("simulated stop rejection"));
    await waitFor(() => app.w.document.body.textContent.includes("No se pudo detener el turno"), "stop failure was hidden behind a pending presence read", 1500);
    assert.ok(presence.length > 0);
    assert.ok(app.w.document.body.textContent.includes(queued.text));
    assert.equal(sent.length, 0);
    assert.equal(app.commands.filter(command => command === "stop_turn").length, 1);
  } finally { holdPresence = false; for (const resolve of presence) resolve(["t1"]); app.w.close(); }
});
