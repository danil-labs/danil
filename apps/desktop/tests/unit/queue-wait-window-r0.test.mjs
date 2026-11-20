/**
 * T0 de la cola de chat (plan 2026-11-19 «Cola de chat: un solo panel, un solo
 * comportamiento de espera»; estrategia de pruebas del mismo día): la ventana
 * montada (`dist/`) contra el motor falso con guion y el reloj simulado.
 *
 * Todas las celdas corren con cero clics. La retención por sesión nace como la
 * de la persona: la tarea tiene una reserva sin turno, Enter manda y el motor
 * contesta `history.error.busy`. «Una vez» se mide en el motor: envíos
 * intentados **después** de la retención y mensajes aceptados en su historial.
 *
 * Las celdas que documentan un fallo conocido van con `red(...)`: `todo` en la
 * cadena, normales con `R0_STRICT=1`. Lo no decidido (qué hace Detener con el
 * resto de la cola, el reinicio y la recuperación) queda fuera.
 */
import assert from "node:assert/strict";
import { mountWindow, red, waitFor, windowCase } from "../helpers/fake-engine-window.mjs";

const test = (name, ...rest) => windowCase(import.meta.url, name, ...(rest.length === 1 ? [{}, rest[0]] : rest));

const TEXT = "mensaje encolado";
const waiting = (w) => w.text().includes("esperando a que termine");

/** t1 con una reserva sin turno; Enter choca con `busy` y la cola queda retenida por sesión. */
async function retained(name, options = {}) {
  const w = await mountWindow(name, { ...options, before: (engine) => { engine.reserve("t1"); options.before?.(engine); } });
  await w.open("t1");
  await w.type(TEXT);
  assert.deepEqual(w.sends("t1").map((entry) => entry.outcome.error), ["history.error.busy"], "el primer envío tenía que chocar con la reserva");
  assert.ok(waiting(w), "la cola no quedó esperando por la sesión");
  return { w, since: w.mark() };
}
const delivered = (w) => w.engine.history("t1").filter((entry) => entry.prompt === TEXT).length;

test("B1 (control): visible task, queue_ready false→true, the retained message goes out once without clicks", async () => {
  const { w, since } = await retained("b1");
  try {
    await w.tick(3000);
    assert.equal(w.sends("t1", since).length, 0, "no envía mientras queue_ready da false");
    w.engine.release("t1");
    await w.tick(3000);
    assert.deepEqual({ sends: w.sends("t1", since).length, delivered: delivered(w) }, { sends: 1, delivered: 1 });
  } finally { w.unmount(); }
});

test("B1b: hidden task, the session retention goes out once when the task is released, without clicks", red("H1/H8/H10: la cola oculta reintenta un envío real por segundo, a ciegas"), async () => {
  const { w, since } = await retained("b1b");
  try {
    await w.open("t2");
    await w.tick(3000);
    w.engine.release("t1");
    await w.tick(3000);
    // Un envío y una entrega. Los intentos que choquen antes son envíos a ciegas (I9).
    assert.deepEqual({ sends: w.sends("t1", since).map((entry) => entry.outcome.error ?? "accepted"), delivered: delivered(w) }, { sends: ["accepted"], delivered: 1 });
  } finally { w.unmount(); }
});

/** Desde la retención, un turno A de otro cliente ocupa t1 y la reconciliación lo ve. */
async function runningAfterRetention(name, options) {
  const state = await retained(name, options);
  state.w.engine.release("t1");
  state.w.engine.start("t1", { id: "A" });
  await state.w.tick(5000);
  assert.ok(state.w.stopButton(), "la reconciliación no vio el turno A de t1");
  return state;
}

test("B2: a close without done (ok absent) with the engine free sends once and does not leave the retention as borrador", red("H7: settleTurn con ok ausente pasa la retención session a borrador y la cola espera a «mandar»"), async () => {
  const { w, since } = await runningAfterRetention("b2");
  try {
    w.engine.close("t1", { event: false });
    await w.tick(8000);
    assert.deepEqual({ delivered: delivered(w), sends: w.sends("t1", since).length, mandar: Boolean(w.sendButton()) }, { delivered: 1, sends: 1, mandar: false });
  } finally { w.unmount(); }
});

test("H7 (window): the transition session → borrador does not happen after a close without done", red("H7: la reconciliación cierra con ok ausente y turnClosed sobrescribe session con borrador"), async () => {
  const { w } = await runningAfterRetention("h7");
  try {
    w.engine.gate("send_message"); // congela el despacho: aquí solo se mira la transición
    w.engine.close("t1", { event: false });
    await w.tick(5000);
    assert.deepEqual({ borrador: Boolean(w.sendButton()) && !waiting(w) }, { borrador: false });
  } finally { w.unmount(); }
});

test("B8: the close of another task does not release nor requeue the retained one", red("H3: el contador global cierres suelta la retención de t1 con el cierre de t2"), async () => {
  const { w, since } = await retained("b8", { before: (engine) => engine.start("t2", { id: "B" }) });
  try {
    w.engine.close("t2", { ok: true });
    await waitFor(() => w.closes() > 0, "the window did not process the close of t2");
    await w.settle(500); // settleTurn relee t2 antes de contar el cierre
    await w.tick(2000);
    assert.deepEqual({ sends: w.sends("t1", since).length, waiting: waiting(w) }, { sends: 0, waiting: true });
  } finally { w.unmount(); }
});

test("B10: a failing queue_ready shows its error and, once it answers, the message goes out once", red("H4: el sondeo traga los errores de queue_ready"), async () => {
  const { w, since } = await retained("b10");
  try {
    w.engine.fail("queue_ready", "shell.service.machine_off", 3);
    await w.tick(3000);
    const visible = w.text().includes("La máquina de este host está apagada");
    w.engine.release("t1");
    await w.tick(3000);
    assert.deepEqual({ visible, sends: w.sends("t1", since).length, delivered: delivered(w) }, { visible: true, sends: 1, delivered: 1 });
  } finally { w.unmount(); }
});

for (const probe of ["take-and-release", "read-only"]) {
  const expected = probe === "take-and-release" ? red("H6: el sondeo toma la reserva y el despacho choca con un busy falso") : {};
  test(`R-S (${probe}): a queue_ready in flight while dispatching gives no false busy nor a double send`, expected, async () => {
    const { w, since } = await runningAfterRetention(`rs-${probe}`, { probe });
    try {
      const poll = w.engine.gate("queue_ready");
      w.engine.close("t1", { event: false });
      await w.tick(1000);
      await poll.arrived; // el sondeo está dentro: con toma y suelta, tiene la reserva
      w.engine.emitDone("t1", true);
      await waitFor(() => w.sends("t1", since).length > 0, "the close of t1 did not dispatch while the poll was in flight");
      poll.open();
      await w.tick(3000);
      const falseBusy = w.sends("t1", since).filter((entry) => entry.outcome.holder === "probe").length;
      assert.deepEqual({ falseBusy, delivered: delivered(w) }, { falseBusy: 0, delivered: 1 });
    } finally { w.unmount(); }
  });
}
