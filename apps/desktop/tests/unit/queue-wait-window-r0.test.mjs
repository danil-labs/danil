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
 * cadena, normales con `R0_STRICT=1`. Los nombres llevan el id de la matriz de
 * la estrategia; donde el encargo de la ronda 1 usó otro, va entre paréntesis.
 *
 * Fuera de alcance:
 * - Lo no decidido: qué hace Detener con el resto de la cola, el reinicio y la
 *   recuperación.
 * - H9 (el `done` del turno que bloquea pasa la retención `session` a `fallo` o
 *   `borrador`): qué cierre cuenta como fallo es la decisión A4 del plan, sin
 *   decidir. Sin ella no hay resultado esperado que afirmar.
 * - B9 no mide el espaciado creciente entre intentos (*backoff*): solo el error
 *   visible y el envío único.
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

test("B1b (delivery): hidden task, the session retention is delivered once after the release, without clicks", async () => {
  // Verde hoy: H1 y H8 quedan descartadas, la cola oculta sí sale sola.
  const { w, since } = await retained("b1b-delivery");
  try {
    await w.open("t2");
    await w.tick(3000);
    w.engine.release("t1");
    await w.tick(3000);
    assert.deepEqual({ accepted: w.accepted("t1", since).length, delivered: delivered(w) }, { accepted: 1, delivered: 1 });
  } finally { w.unmount(); }
});

test("B1b (I9): hidden task, no send while the reservation is held", red("H10/I9: la cola oculta reintenta send_message a ciegas cada segundo mientras la reserva está tomada, y cada intento choca con busy"), async () => {
  const { w, since } = await retained("b1b-blind");
  try {
    await w.open("t2");
    await w.tick(3000);
    assert.deepEqual(w.sends("t1", since).map((entry) => entry.outcome.error ?? "accepted"), []);
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

test("B10 (brief: B2): a close without done (ok absent) with the engine free sends once and does not leave the retention as borrador", red("H7: settleTurn con ok ausente pasa la retención session a borrador y la cola espera a «mandar»"), async () => {
  const { w, since } = await runningAfterRetention("b10");
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
    const before = w.ipc.length;
    w.engine.close("t2", { ok: true });
    // settleTurn relee t2 y, al contar el cierre, relee los proyectos: ahí ya pasó lo que libera t1.
    const reread = () => w.ipc.findIndex((entry, index) => index >= before && entry.command === "load_history" && entry.args.id === "t2");
    const counted = () => reread() < 0 ? -1 : w.ipc.findIndex((entry, index) => index > reread() && entry.command === "list_projects");
    await waitFor(() => counted() >= 0, "settleTurn did not count the close of t2");
    // Y t1 vuelve a sondear con el reloj simulado: la ventana sigue esperando por la sesión.
    const after = counted();
    await w.tick(2000);
    await waitFor(() => w.sent("queue_ready", after).some((entry) => entry.args.session === "t1"), "t1 did not poll queue_ready after the close of t2");
    assert.deepEqual({ sends: w.sends("t1", since).length, waiting: waiting(w) }, { sends: 0, waiting: true });
  } finally { w.unmount(); }
});

test("B9 (brief: B10): a failing queue_ready shows its error and, once it answers, the message goes out once", red("H4: el sondeo traga los errores de queue_ready"), async () => {
  const { w, since } = await retained("b9");
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

test("R-S order 1 (window): after the probe's false busy the queue is kept, nothing is delivered meanwhile, and one retry delivers it", async () => {
  const { w, since } = await runningAfterRetention("rs-order1", { probe: "take-and-release" });
  try {
    const poll = w.engine.gate("queue_ready");
    w.engine.close("t1", { event: false });
    await w.tick(1000);
    await poll.arrived; // el sondeo tiene la reserva
    w.engine.emitDone("t1", true);
    await waitFor(() => w.sends("t1", since).length > 0, "the close of t1 did not dispatch while the poll was in flight");
    assert.deepEqual(w.sends("t1", since).map((entry) => entry.outcome.holder), ["probe"], "el despacho tenía que chocar con la reserva del sondeo");
    await waitFor(() => w.engine.saved("p1", "t1").some((item) => item.text === TEXT), "the queue was emptied after the false busy");
    const meanwhile = delivered(w);
    poll.open();
    await w.tick(3000);
    await waitFor(() => w.accepted("t1", since).length > 0, "the retry did not deliver the message");
    const retries = w.sends("t1", since).slice(1);
    assert.deepEqual({ meanwhile, retries: retries.length, delivered: delivered(w) }, { meanwhile: 0, retries: 1, delivered: 1 });
  } finally { w.unmount(); }
});

test("I8: one queue_ready in flight per task: with the poll held, five seconds of clock make one call", async () => {
  const { w } = await retained("i8");
  try {
    const from = w.ipc.length, poll = w.engine.gate("queue_ready");
    await w.tick(1000);
    await poll.arrived;
    await w.tick(5000);
    const held = w.sent("queue_ready", from).length;
    poll.open();
    await waitFor(() => w.engine.calls("queue_ready", "t1").length > 0, "the held call did not answer");
    // La respuesta llega por promesas: el sondeo vuelve en uno de los tics siguientes.
    for (let tick = 0; tick < 5 && w.sent("queue_ready", from).length === held; tick++) await w.tick(1000);
    assert.ok(w.sent("queue_ready", from).length > held, "the poll did not resume once the call answered");
    assert.deepEqual({ held, peak: w.engine.peakPolls("t1") }, { held: 1, peak: 1 });
  } finally { w.unmount(); }
});
