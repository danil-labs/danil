/**
 * Motor falso con guion para la cola de la ventana (T0 del plan «Cola de chat:
 * un solo panel, un solo comportamiento de espera», E1a-3).
 *
 * Imita la frontera que la ventana ve del motor, en memoria y sin red:
 * `list_active_turns`, `list_live_turns`, `queue_ready`, `send_message` (con y
 * sin `clientMessageId`), `stop_turn`, `stop_turn_if`, `get_turn`,
 * `load_queue` y `save_queue`, y los cierres (`done` con `ok` true, false o
 * ausente, o sin evento). `chat_queue_v1` sale del contrato del motor
 * (`contracts/chat-queue-v1/`); sin ese rasgo, el falso es el motor de hoy.
 *
 * La aserción va en el destino: `history` (lo aceptado por tarea), `log` (cada
 * llamada con su desenlace) y `stopped` (los turnos a los que llegó una
 * detención). Ni el texto de la cola ni lo que pinta la ventana.
 *
 * `probe` fija la semántica de `queue_ready`: `"take-and-release"` toma y suelta
 * la reserva de la tarea, como `runtime/chat/queue.rs:346` en el motor de hoy;
 * `"read-only"` solo lee, como pide `chat_queue_v1`: da `false` con turno y
 * `true` sin él, porque una reserva de archivo sin turno no se ve. Con el rasgo
 * es siempre `"read-only"`. `gate(command)` deja la próxima llamada pendiente
 * hasta `open()`; en `queue_ready` con toma y suelta, la puerta cae **dentro** de
 * la sección crítica, con la reserva tomada.
 */

import { readFileSync } from "node:fs";

/** La copia del contrato; su origen y su hash viven solo en `contracts/chat-queue-v1/PIN`. */
export const CONTRACT = new URL("../../../../contracts/chat-queue-v1/", import.meta.url);
export const contractFile = (name) => JSON.parse(readFileSync(new URL(name, CONTRACT), "utf8"));
const EXAMPLES = contractFile("chat_queue_v1.examples.json");
export const MOCK = contractFile("chat_queue_v1.mock.json");
// Los errores cerrados salen de los ejemplos copiados, no de aquí: cambian con el contrato.
const INVALID_TURN_ID = EXAMPLES.errors.invalid_turn_id.error;
const INVALID_CLIENT_MESSAGE_ID = EXAMPLES.errors.invalid_client_message_id.error;
export const FEATURE = "chat_queue_v1";
/** Sin el rasgo: el error de ocupado del motor de hoy. */
export const LEGACY_BUSY = "history.error.busy";
/**
 * Con el rasgo: el error de ocupado sale del contrato copiado. Los ejemplos no
 * traen un `send_message` ocupado; el manifiesto nombra el código como la
 * autoridad del despacho. Si la copia deja de nombrarlo, el falso con el rasgo
 * no arranca.
 */
export const CONTRACT_BUSY = contractFile("chat_queue_v1.json").description.match(/send_message, que es la autoridad \(([a-z_.]+)\)/u)?.[1];
/** Los pasos de motor y las claves de `expect` que admite el formato del mock copiado. */
export const ENGINE_STEPS = new Set(MOCK.format.engine_step.match(/\b(?:turn_(?!id\b)[a-z]+|engine_restart)\b/gu));
export const EXPECT_KEYS = MOCK.format.scenario.match(/expect: \{([^}]*)\}/u)?.[1].split(/,\s*/u) ?? [];
const TURN_ID = /^.{1,128}$/su;
const CLIENT_MESSAGE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

/** @param {{ features?: string[], probe?: "take-and-release" | "read-only", workspace?: string, emit?: (event: unknown) => void }} [options] */
export function createFakeEngine({ features = [], probe = "take-and-release", workspace = "w", emit = () => {} } = {}) {
  const v1 = features.includes(FEATURE);
  if (v1 && !CONTRACT_BUSY) throw new Error("la copia de chat_queue_v1 ya no nombra el error de ocupado de send_message");
  const busy = v1 ? CONTRACT_BUSY : LEGACY_BUSY;
  const readOnly = v1 || probe === "read-only";
  const turns = new Map(); // sesión → { id, state, project, startedAt, stop }
  const reservations = new Map(); // sesión → dueño: "external" | "probe"
  const history = new Map(); // sesión → [{ prompt, clientMessageId, turnId }]
  const keys = new Map(); // clave de idempotencia → resultado; sobrevive a `restart`
  const queues = new Map(); // `${project}/${session}` → Encolado[]
  const gates = new Map(); // comando → [{ arrived, open }]
  const failures = new Map(); // comando → errores pendientes, uno por llamada
  const polling = new Map(), peakPolls = new Map(); // sesión → consultas `queue_ready` en vuelo, y su máximo
  const log = [], stopped = [], stopRequested = [];
  let launched = 0, serial = 0, nextTurn = null, clock = 0;

  const turnOf = (session) => turns.get(session ?? "");
  const occupied = (session) => turnOf(session) !== undefined || reservations.has(session ?? "");
  const record = (command, args, outcome) => { log.push({ command, args, outcome }); return outcome; };
  const freshId = () => nextTurn ?? `turn-${++serial}`;

  function start(session, { id = freshId(), state = "running", project = "p1" } = {}) {
    nextTurn = null;
    turns.set(session, { id, state, project, startedAt: ++clock, stop: false });
    return id;
  }
  function close(session, { ok, event = true } = {}) {
    const turn = turnOf(session);
    turns.delete(session);
    if (event) emitDone(session, ok);
    return turn?.id ?? null;
  }
  function emitDone(session, ok) {
    emit({ name: "chat", payload: { kind: "done", session, workspace, ...(ok === undefined ? {} : { ok }) } });
  }
  /** La próxima llamada a `command` queda pendiente hasta `open()`. */
  function gate(command) {
    let arrive, open;
    const arrived = new Promise((yes) => { arrive = yes; });
    const opened = new Promise((yes) => { open = yes; });
    const entry = { arrive, opened };
    gates.set(command, [...(gates.get(command) ?? []), entry]);
    return { arrived, open: () => open() };
  }
  async function pass(command) {
    const entry = gates.get(command)?.shift();
    if (!entry) return;
    entry.arrive();
    await entry.opened;
  }
  function failing(command) {
    const queue = failures.get(command);
    return queue?.length ? queue.shift() : undefined;
  }

  const handlers = {
    list_active_turns: () => record("list_active_turns", {}, [...turns.keys()]),
    list_live_turns: () => record("list_live_turns", {}, [...turns].map(([session, turn]) => ({ workspace, session, project: turn.project, started_at: turn.startedAt }))),
    async queue_ready(args) {
      const session = args.session ?? "";
      polling.set(session, (polling.get(session) ?? 0) + 1);
      peakPolls.set(session, Math.max(peakPolls.get(session) ?? 0, polling.get(session)));
      try {
        const error = failing("queue_ready");
        if (error !== undefined) { record("queue_ready", args, { error }); throw error; }
        if (!readOnly && !occupied(session)) {
          reservations.set(session, "probe");
          try { await pass("queue_ready"); } finally { if (reservations.get(session) === "probe") reservations.delete(session); }
          return record("queue_ready", args, true);
        }
        await pass("queue_ready");
        return record("queue_ready", args, readOnly ? turnOf(session) === undefined : !occupied(session));
      } finally { polling.set(session, polling.get(session) - 1); }
    },
    async send_message(args) {
      await pass("send_message");
      const error = failing("send_message");
      if (error !== undefined) { record("send_message", args, { error }); throw error; }
      const clientMessageId = v1 ? args.clientMessageId ?? null : null;
      if (clientMessageId !== null && !CLIENT_MESSAGE_ID.test(clientMessageId)) {
        record("send_message", args, { error: INVALID_CLIENT_MESSAGE_ID });
        throw INVALID_CLIENT_MESSAGE_ID;
      }
      const key = clientMessageId && JSON.stringify([workspace, args.project, args.session ?? null, clientMessageId]);
      if (key && keys.has(key)) return record("send_message", args, keys.get(key));
      if (args.session && occupied(args.session)) {
        record("send_message", args, { error: busy, holder: reservations.get(args.session) ?? "turn" });
        throw busy;
      }
      const session = args.session ?? `ses-${++serial}`;
      const turnId = start(session, { project: args.project });
      launched++;
      history.set(session, [...(history.get(session) ?? []), { prompt: args.prompt, clientMessageId, turnId }]);
      if (key) keys.set(key, session);
      return record("send_message", args, session);
    },
    async stop_turn(args) {
      await pass("stop_turn");
      const turn = turnOf(args.session);
      // Sin identidad: detiene lo que haya en la tarea, y su `Ok` no prueba nada.
      if (turn && !turn.stop) { turn.stop = true; stopped.push(turn.id); }
      return record("stop_turn", args, null);
    },
    async stop_turn_if(args) {
      if (!v1) { record("stop_turn_if", args, { error: "service.error.command" }); throw "service.error.command"; }
      await pass("stop_turn_if");
      if (typeof args.turnId !== "string" || !TURN_ID.test(args.turnId)) {
        record("stop_turn_if", args, { error: INVALID_TURN_ID });
        throw INVALID_TURN_ID;
      }
      const turn = turnOf(args.session);
      const outcome = !turn ? "not_running" : turn.state === "relieved" ? "not_controllable" : turn.id !== args.turnId ? "turn_changed"
        : turn.state === "closing" ? "closing" : turn.state === "starting" ? "not_controllable" : "stop_requested";
      if (outcome === "stop_requested" && !turn.stop) { turn.stop = true; stopped.push(turn.id); stopRequested.push(turn.id); }
      return record("stop_turn_if", args, { outcome });
    },
    async get_turn(args) {
      if (!v1) { record("get_turn", args, { error: "service.error.command" }); throw "service.error.command"; }
      const turn = turnOf(args.session);
      const result = !turn ? { state: "idle" } : turn.state === "relieved" ? { state: "relieved" } : { state: turn.state, turn_id: turn.id };
      return record("get_turn", args, result);
    },
    load_queue: (args) => record("load_queue", args, queues.get(`${args.project}/${args.session}`) ?? []),
    save_queue(args) {
      queues.set(`${args.project}/${args.session}`, args.queued);
      return record("save_queue", { project: args.project, session: args.session }, null);
    },
  };

  return {
    handlers,
    /** Las respuestas para `boot()`: cada comando del motor contesta desde este estado. */
    responses: () => ({ ...handlers }),
    /** Guion del motor (lo que pasa sin llamada de la ventana). */
    start,
    /** Pone un turno en otro estado, sin tocar su `turn_id`. */
    shift: (session, state) => { const turn = turnOf(session); if (turn) turn.state = state; },
    close,
    emitDone,
    reserve: (session, owner = "external") => reservations.set(session, owner),
    release: (session) => reservations.delete(session),
    /** Reinicio del motor: los turnos y las reservas no sobreviven; las claves de `clientMessageId` sí. */
    restart: () => { turns.clear(); reservations.clear(); },
    /** El `turn_id` que tendrá el próximo turno que lance `send_message`. */
    nextTurnId: (id) => { nextTurn = id; },
    gate,
    /** Las próximas `times` llamadas a `command` fallan con `error`. */
    fail: (command, error, times = 1) => failures.set(command, [...(failures.get(command) ?? []), ...Array(times).fill(error)]),
    queue: (project, session, items) => queues.set(`${project}/${session}`, items),
    saved: (project, session) => queues.get(`${project}/${session}`) ?? [],
    turn: (session) => { const turn = turnOf(session); return turn ? { ...turn } : null; },
    history: (session) => (history.get(session) ?? []).map((entry) => ({ ...entry })),
    log, stopped, stopRequested,
    get launched() { return launched; },
    /** El máximo de consultas `queue_ready` en vuelo a la vez para `session` (I8). */
    peakPolls: (session) => peakPolls.get(session) ?? 0,
    /** Las llamadas a `command` (para la sesión `session`, si se da) con su desenlace. */
    calls: (command, session) => log.filter((entry) => entry.command === command && (session === undefined || entry.args.session === session)),
  };
}

/**
 * Pasa un escenario del mock de `chat_queue_v1` contra el motor falso con
 * estado: cada paso de motor cambia el estado y cada paso de llamada se contesta
 * desde él. Devuelve, por paso, lo que dio el falso frente a lo que dice el
 * guion, y lo que el escenario espera al final.
 */
export async function replayOnFake(scenario, features = [FEATURE]) {
  const unknown = Object.keys(scenario.expect).filter((key) => !EXPECT_KEYS.includes(key));
  if (unknown.length) throw new Error(`${scenario.name}: expect trae claves que el falso no conoce: ${unknown.join(", ")}`);
  const engine = createFakeEngine({ features });
  const steps = [];
  for (const step of scenario.steps) {
    if ("engine" in step) {
      const session = "ses_fixture", current = engine.turn(session)?.id;
      if (!ENGINE_STEPS.has(step.engine)) throw new Error(`${scenario.name}: paso de motor desconocido ${JSON.stringify(step.engine)}`);
      if (step.engine === "engine_restart") engine.restart();
      else if (current !== undefined && current !== step.turn_id) throw new Error(`${scenario.name}: ${step.engine} de ${step.turn_id} con el turno ${current} sin cerrar`);
      else if (step.engine === "turn_closed") { if (current === undefined) throw new Error(`${scenario.name}: turn_closed sin turno`); engine.close(session, { event: false }); }
      else if (current === step.turn_id) engine.shift(session, step.engine.slice("turn_".length));
      else engine.start(session, { id: step.turn_id, state: step.engine.slice("turn_".length), project: "prj_fixture" });
      continue;
    }
    if (step.starts_turn) engine.nextTurnId(step.starts_turn);
    let got;
    try { got = { result: await engine.handlers[step.call.command](step.call.args) }; } catch (error) { got = { error }; }
    steps.push({ command: step.call.command, got, want: "error" in step ? { error: step.error } : { result: step.result } });
  }
  const produced = { launched_turns: engine.launched, stop_requested: engine.stopRequested };
  const missing = EXPECT_KEYS.filter((key) => !(key in produced));
  if (missing.length) throw new Error(`el formato del mock espera claves que el falso no produce: ${missing.join(", ")}`);
  return { steps, expect: Object.fromEntries(Object.keys(scenario.expect).map((key) => [key, produced[key]])) };
}

/**
 * Reproductor estricto del guion: contesta lo que dice el mock, en su orden.
 * `invoke` falla si la llamada no coincide con el paso siguiente (comando igual
 * y `args` que contengan los del paso) o si llega después del último.
 */
export function scriptedEngine(scenario) {
  let index = 0;
  const failures = [];
  const skipEngine = () => { while (index < scenario.steps.length && "engine" in scenario.steps[index]) index++; };
  return {
    failures,
    async invoke(command, args = {}) {
      skipEngine();
      const step = scenario.steps[index];
      const mismatch = !step ? "después del último paso"
        : step.call.command !== command ? `se esperaba ${step.call.command}`
          : Object.entries(step.call.args).find(([key, value]) => JSON.stringify(args[key]) !== JSON.stringify(value))?.[0];
      if (mismatch) {
        const failure = `${scenario.name}: ${command} no coincide con el paso ${index} (${typeof mismatch === "string" && mismatch.includes(" ") ? mismatch : `clave ${mismatch}`})`;
        failures.push(failure);
        throw new Error(failure);
      }
      index++;
      if ("error" in step) throw step.error;
      return step.result;
    },
    done: () => { skipEngine(); return index === scenario.steps.length; },
  };
}
