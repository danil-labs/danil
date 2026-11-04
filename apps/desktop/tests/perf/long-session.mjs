#!/usr/bin/env node --expose-gc
/**
 * Qué deja detrás la ventana después de horas de uso: N ciclos iguales de una
 * sesión larga, y cuánto crece cada contador entre el calentamiento y el último.
 *
 *   node --expose-gc tests/perf/long-session.mjs              guarda: compara con long-session-baseline.json
 *   node --expose-gc tests/perf/long-session.mjs --update    baja el techo a lo que crece hoy
 *   node --expose-gc tests/perf/long-session.mjs --ciclos 30  más ciclos (por omisión 12)
 *   node --expose-gc tests/perf/long-session.mjs --heap f     el heap por constructor al calentar y al final
 *
 * Un ciclo: abrir cuatro tareas, mandar un turno largo en la abierta mientras corre
 * otro de fondo, encolar, cerrar la pestaña. Las transcripciones en disco no crecen: en régimen,
 * lo que sube de un ciclo a otro es retenido.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import v8 from "node:v8";
import { boot, dist, sleep } from "../helpers/jsdom-app.mjs";

const BASELINE = join(import.meta.dirname, "long-session-baseline.json");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? "";
};
const ADJUST = args.includes("--update");
const CYCLES = Number(flag("--ciclos") ?? 12);
const WARMUP = 3;
const HEAP_DUMP = flag("--heap");

if (typeof globalThis.gc !== "function") {
  console.error("Corre con `node --expose-gc`: sin recolectar a mano el heap no se puede comparar.");
  process.exit(1);
}

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const WORDS = (
  "la tarea abre el hilo con su historia entera y cada turno trae texto herramientas " +
  "pasos avisos rama commit guarda servicio ventana disco memoria contador reloj"
).split(" ");

/** Los fragmentos de una respuesta larga, con la forma de los que manda un CLI. */
function answer(seed) {
  const rnd = prng(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const words = (n) => Array.from({ length: n }, () => pick(WORDS)).join(" ");
  const text = [
    `## ${words(3)}`,
    `${words(30)} **${words(2)}** y \`${pick(WORDS)}.rs\`.`,
    Array.from({ length: 5 }, () => `- ${words(10)}`).join("\n"),
    ["```ts", ...Array.from({ length: 8 }, () => `const ${pick(WORDS)} = "${words(4)}";`), "```"].join("\n"),
    ["| a | b |", "|---|---|", ...Array.from({ length: 4 }, () => `| ${words(2)} | ${words(3)} |`)].join("\n"),
    `${words(40)}.`,
  ].join("\n\n");
  const pieces = [];
  for (let i = 0; i < text.length; i += 24) pieces.push(text.slice(i, i + 24));
  return pieces;
}

const TASKS = ["t0", "t1", "t2", "t3"];
// Muchas pestañas con historia larga, cada una leída hacia arriba: lo que pesa una pestaña escondida.
const TABS = Array.from({ length: 12 }, (_, n) => `p${n}`);
const history = (id) =>
  Array.from({ length: id.startsWith("p") ? 60 : 12 }, (_, n) => [
    { role: "user", id: `${id}u${n}`, at: n * 60_000, text: `Pregunta ${n} de ${id}` },
    { role: "agent", id: `${id}a${n}`, at: n * 60_000 + 30_000, text: `Respuesta ${n} de ${id}.\n\n- uno\n- dos` },
  ]).flat();
const row = (id) => ({
  id, title: `Tarea ${id}`, last_message: "", provider: "codex", model: "gpt-5.6", refs: [],
  updated_at: 0, turns: 24, parent: null, esperando: false,
});

const active = new Set();
const sent = [];
let vitals = null;
const responses = {
  window_ready: null,
  window_vitals: (a) => {
    vitals = a;
    return null;
  },
  setup_required: false,
  list_providers: [{ id: "codex", label: "Codex", available: true, driver: true }],
  list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  list_projects: [],
  list_portfolios: [],
  list_sources: [],
  list_live_sessions: () => [...TASKS, ...TABS].map(row),
  list_mentions: { fuentes: [], archivos: [] },
  list_models: {
    provider: "codex",
    models: [{ id: "gpt-5.6", label: "GPT-5.6", gratis: null, note: null, efforts: [], default_effort: null }],
    fallback: false,
  },
  list_surfaces: [{ id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null }],
  session_folder: "/tmp",
  list_task_trees: [],
  watch_task_tree: "watch",
  unwatch_task_tree: null,
  list_live_turns: () => [...active].map((session) => ({ session, workspace: "w", started_at: 0, background: false })),
  list_active_turns: () => [...active],
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "bench", reset: false },
  task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, incomplete: false },
  load_session: ({ id }) => ({
    id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null, turns: history(id),
  }),
  load_queue: [],
  save_queue: null,
  session_usage: null,
  list_session_git: {},
  send_message: (a) => {
    sent.push(a.session);
    return a.session;
  },
  inject_message: null,
};

// Un memo creado sin dueño —un ternario en una prop leída desde un manejador— no se suelta
// nunca y retiene lo que lee. Se cuenta en la fábrica de cómputos de Solid dentro del bundle.
const OWNERLESS = /function [\w$]+\(([\w$]+),([\w$]+),[\w$]+,([\w$]+)=[\w$]+,[\w$]+\)\{(?=const [\w$]+=\{fn:\1,state:\3,updatedAt:null,owned:null,sources:null,sourceSlots:null,cleanups:null,value:\2,owner:([\w$]+))/;
let ownerless = 0;
let instrumented = false;
globalThis.__ownerless = () => ownerless++;
registerHooks({
  load(url, context, next) {
    const loaded = next(url, context);
    if (!url.startsWith(pathToFileURL(dist).href) || !url.includes("/assets/index-")) return loaded;
    const source = String(loaded.source);
    const found = OWNERLESS.exec(source);
    if (!found) return loaded;
    instrumented = true;
    const at = found.index + found[0].length;
    return { ...loaded, source: `${source.slice(0, at)}if(${found[4]}===null)globalThis.__ownerless();${source.slice(at)}` };
  },
});

// Va antes del primer arranque: jsdom-app no pisa lo que ya está en globalThis.
const liveIntervals = new Set();
const setInterval0 = globalThis.setInterval;
const clearInterval0 = globalThis.clearInterval;
// El latido de `window_vitals` (cinco minutos): llamarlo a mano da cuántos hilos retiene la ventana sin pestaña.
const beats = new Map();
globalThis.setInterval = (...a) => {
  const t = setInterval0(...a);
  liveIntervals.add(t);
  if (a[1] === 300_000) beats.set(t, a[0]);
  return t;
};
globalThis.clearInterval = (t) => {
  liveIntervals.delete(t);
  beats.delete(t);
  clearInterval0(t);
};
const observing = new Set();
const observerClass = (entry) =>
  class {
    static entry = entry;
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
    }
    observe(target) {
      this.targets.add(target);
      observing.add(this);
    }
    unobserve(target) {
      this.targets.delete(target);
      if (this.targets.size === 0) observing.delete(this);
    }
    disconnect() {
      this.targets.clear();
      observing.delete(this);
    }
    takeRecords() {
      return [];
    }
  };
let tick = 0;
globalThis.ResizeObserver = observerClass((target) => ({ target, contentRect: { width: 800, height: 100 + tick } }));
let reading = false;
const Intersection = observerClass((target) => ({ target, isIntersecting: reading }));
globalThis.IntersectionObserver = Intersection;
// jsdom no tiene layout y sus observadores no hablan nunca: sin avisos, lo que un callback lee sin dueño no se ejercita.
const observe = () => {
  tick++;
  for (const o of [...observing]) if (o.targets.size > 0) o.callback([...o.targets].map(o.constructor.entry), o);
};

const app = await boot("listo", "long-session", responses);
if (!instrumented) {
  console.error("No encuentro la fábrica de cómputos de Solid en el bundle: sin ella no se cuentan los memos sin dueño.");
  process.exit(1);
}
const w = app.w;
const doc = w.document;

// Un oyente en un nodo suelto se va con el nodo: cuenta el de un nodo conectado o el de la ventana.
const listenerCount = new WeakMap();
const listenerTargets = new Set();
const add0 = w.EventTarget.prototype.addEventListener;
const remove0 = w.EventTarget.prototype.removeEventListener;
w.EventTarget.prototype.addEventListener = function (...a) {
  if (!listenerCount.has(this)) listenerTargets.add(new WeakRef(this));
  listenerCount.set(this, (listenerCount.get(this) ?? 0) + 1);
  return add0.apply(this, a);
};
w.EventTarget.prototype.removeEventListener = function (...a) {
  if (listenerCount.has(this)) listenerCount.set(this, Math.max(0, listenerCount.get(this) - 1));
  return remove0.apply(this, a);
};
const liveListeners = () => {
  let n = 0;
  for (const ref of listenerTargets) {
    const target = ref.deref();
    if (!target) {
      listenerTargets.delete(ref);
      continue;
    }
    if (target === w || target === doc || target.isConnected) n += listenerCount.get(target) ?? 0;
  }
  return n;
};
const mutationObservers = { live: 0 };
const MutationObserver0 = w.MutationObserver;
w.MutationObserver = globalThis.MutationObserver = class extends MutationObserver0 {
  observe(...a) {
    if (!this.counted) mutationObservers.live++;
    this.counted = true;
    return super.observe(...a);
  }
  disconnect() {
    if (this.counted) mutationObservers.live--;
    this.counted = false;
    return super.disconnect();
  }
};

async function settle(quiet = 250) {
  let last = Date.now();
  const observer = new MutationObserver0(() => {
    last = Date.now();
  });
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const limit = Date.now() + 30_000;
  while (Date.now() - last < quiet && Date.now() < limit) await sleep(20);
  observer.disconnect();
}

const open = async (id) => {
  const rowEl = doc.querySelector(`[data-sesion="${id}"]`);
  if (!rowEl) throw new Error(`No está la fila de ${id}.`);
  rowEl.click();
  await settle();
  // Este escenario mide pestañas conservadas, incluidas las que reciben turnos de fondo.
  doc.querySelector('[data-preview-header] [role="button"]')
    ?.dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true }));
  await settle();
};
const chat = (session, kind, extra = {}) => app.emit("chat", { kind, session, workspace: "w", ...extra });

async function turn(session, seed) {
  active.add(session);
  chat(session, "started");
  for (const [n, piece] of answer(seed).entries()) {
    chat(session, "delta", { text: piece });
    if (n % 5 === 0) observe();
    if (n % 20 === 5) {
      chat(session, "tool", { text: "Bash", target: `pnpm test ${n}`, id: `item_${n}` });
      chat(session, "tool_done", { text: "Bash", id: `item_${n}`, ok: true, detail: { kind: "output", text: "ok\n".repeat(20) } });
    }
    if (n % 10 === 0) await sleep(5);
  }
  chat(session, "notice", { text: "Aviso del turno" });
}
async function finish(session) {
  active.delete(session);
  chat(session, "done", { ok: true });
  await settle();
}

async function queue(text) {
  const field = doc.querySelector("textarea");
  field.value = text;
  field.dispatchEvent(new w.Event("input", { bubbles: true }));
  field.closest("form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(50);
}

async function cycle(i) {
  for (const id of TASKS) await open(id);
  const shown = TASKS[i % TASKS.length];
  const hidden = TASKS[(i + 1) % TASKS.length];
  await open(shown);
  await turn(hidden, 1000 + i);
  await queue(`Pregunta ${i}`);
  await turn(shown, i);
  await queue(`Pendiente ${i}`);
  await settle();
  await finish(hidden);
  await finish(shown);
  if (sent.at(-1) === shown) {
    await turn(shown, 2000 + i);
    await finish(shown);
  }
  w.dispatchEvent(new w.Event("focus"));
  app.emit("close-tab", null);
  await settle();
}

/** Subir a leer: el borde de arriba del hilo entra en la vista y se antepone un tramo por aviso. */
async function readUp(times) {
  reading = true;
  for (let k = 0; k < times; k++) {
    for (const o of [...observing]) if (o instanceof Intersection && o.targets.size > 0) o.callback([...o.targets].map(o.constructor.entry), o);
    await settle(100);
  }
  reading = false;
}

/** Nodos tras abrir cada pestaña y leerla hacia arriba, y tras un turno largo en una escondida. */
async function manyTabs() {
  const nodes = [];
  for (const id of TABS) {
    await open(id);
    await readUp(4);
    nodes.push(doc.getElementsByTagName("*").length);
  }
  await turn(TABS[0], 4242);
  await finish(TABS[0]);
  globalThis.gc();
  const afterTurn = doc.getElementsByTagName("*").length;
  const heapKb = Math.round(process.memoryUsage().heapUsed / 1024);
  for (const _ of TABS) {
    app.emit("close-tab", null);
    await settle(50);
  }
  return { nodes, afterTurn, heapKb, threadsAfterClosing: threadsWithoutTab() };
}

function heapByConstructor(file) {
  const snapshot = JSON.parse(readFileSync(v8.writeHeapSnapshot(file), "utf8"));
  const { node_fields: fields, node_types: [types] } = snapshot.snapshot.meta;
  const width = fields.length;
  const at = { type: fields.indexOf("type"), name: fields.indexOf("name"), size: fields.indexOf("self_size") };
  const byName = {};
  for (let k = 0; k < snapshot.nodes.length; k += width) {
    const type = types[snapshot.nodes[k + at.type]];
    if (type !== "object" && type !== "closure" && type !== "string" && type !== "array") continue;
    const name = `${type}:${type === "string" ? "" : snapshot.strings[snapshot.nodes[k + at.name]]}`;
    const entry = (byName[name] ??= { count: 0, bytes: 0 });
    entry.count++;
    entry.bytes += snapshot.nodes[k + at.size];
  }
  return byName;
}

// Un nodo que salió del documento y sigue vivo tras recolectar lo retiene alguien: es la fuga que se ve.
let removed = [];
let cycleNow = -1;
new MutationObserver0((records) => {
  for (const r of records)
    for (const n of r.removedNodes)
      if (n.nodeType === 1) removed.push({ ref: new WeakRef(n), cycle: cycleNow, what: `${n.tagName}.${String(n.className?.baseVal ?? n.className).slice(0, 50)}` });
}).observe(doc.body, { subtree: true, childList: true });

function threadsWithoutTab() {
  vitals = null;
  for (const beat of beats.values()) beat();
  return Math.max(0, (vitals?.threads ?? 0) - (vitals?.tabs ?? 0));
}

async function measure() {
  for (let k = 0; k < 3; k++) {
    globalThis.gc();
    await sleep(20);
  }
  removed = removed.filter((r) => r.ref.deref() && !r.ref.deref().isConnected);
  const tauri = app.commands.filter((c) => c === "plugin:event|listen").length -
    app.commands.filter((c) => c === "plugin:event|unlisten").length;
  return {
    nodes: doc.getElementsByTagName("*").length,
    detached: removed.filter((r) => r.cycle < cycleNow).length,
    ownerless,
    listeners: liveListeners(),
    tauriListeners: tauri,
    intervals: liveIntervals.size,
    observers: observing.size + mutationObservers.live,
    threadsWithoutTab: threadsWithoutTab(),
    heapKb: Math.round(process.memoryUsage().heapUsed / 1024),
  };
}

/** Pendiente por mínimos cuadrados: el heap de un ciclo suelto es ruido, la recta no. */
function slope(values) {
  const n = values.length;
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of values.entries()) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return Math.round((num / den) * 10) / 10;
}

await settle(500);
const series = [];
let heapStart = null;
for (let i = 0; i < CYCLES; i++) {
  cycleNow = i;
  await cycle(i);
  series.push(await measure());
  if (HEAP_DUMP && i === WARMUP - 1) heapStart = heapByConstructor(`${HEAP_DUMP}-a.heapsnapshot`);
}
if (app.failures.length > 0) {
  console.error(app.failures.slice(0, 3).map((f) => String(f).split("\n").slice(0, 4).join("\n  ")).join("\n"));
  process.exit(1);
}

const tabs = await manyTabs();
if (app.failures.length > 0) {
  console.error(app.failures.slice(0, 3).map((f) => String(f).split("\n").slice(0, 4).join("\n  ")).join("\n"));
  process.exit(1);
}

const steady = series.slice(WARMUP);
const growth = Object.fromEntries(Object.keys(steady[0]).map((k) => [k, slope(steady.map((s) => s[k]))]));

console.log(`ciclos: ${CYCLES}, calentamiento: ${WARMUP}`);
for (const k of Object.keys(growth)) console.log(`  ${k}: ${series.map((s) => s[k]).join(" ")}`);
// Solo la pestaña que se ve está montada: desde la segunda, lo que cuenta es cuánto suma cada una.
growth.nodesPerTab = slope(tabs.nodes.slice(1));
// Cerrar una pestaña suelta su hilo: uno sin pestaña ni turno vivo lo retiene alguien.
growth.threadsAfterClosing = tabs.threadsAfterClosing;
console.log(`crecimiento por ciclo: ${JSON.stringify(growth)}`);
console.log(`pestañas: nodos ${tabs.nodes.join(" ")} · tras un turno de fondo ${tabs.afterTurn} · heap ${tabs.heapKb} KB · hilos sin pestaña tras cerrarlas ${tabs.threadsAfterClosing}`);
const kept = [...new Set(removed.filter((r) => r.cycle < cycleNow).map((r) => r.what))];
if (kept.length > 0) console.log(`sueltos y vivos: ${kept.slice(0, 5).join(" · ")}`);

if (HEAP_DUMP) {
  const end = heapByConstructor(`${HEAP_DUMP}-b.heapsnapshot`);
  const rows = Object.entries(end)
    .map(([name, e]) => ({ name, count: e.count - (heapStart[name]?.count ?? 0), bytes: e.bytes - (heapStart[name]?.bytes ?? 0) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 40);
  writeFileSync(`${HEAP_DUMP}-diff.json`, JSON.stringify(rows, null, 1));
  for (const r of rows.slice(0, 25)) console.log(`  ${r.name.padEnd(48)} ${String(r.count).padStart(8)} ${String(r.bytes).padStart(10)}`);
}

// El heap depende de cuándo recolecta V8 y oscila cientos de KB sin fuga: se reporta y no se guarda.
const GUARDED = Object.keys(growth).filter((k) => k !== "heapKb");
const ceiling = JSON.parse(readFileSync(BASELINE, "utf8"));
if (ADJUST) {
  const lowered = Object.fromEntries(GUARDED.map((k) => [k, Math.min(ceiling[k] ?? Infinity, Math.max(0, growth[k]))]));
  writeFileSync(BASELINE, `${JSON.stringify(lowered, null, 2)}\n`);
  console.log(`techo: ${JSON.stringify(lowered)}`);
  process.exit(0);
}
const over = GUARDED.filter((k) => growth[k] > (ceiling[k] ?? 0));
if (over.length > 0) {
  console.error("La ventana retiene más por ciclo que el techo de long-session-baseline.json:");
  for (const k of over) console.error(`  ${k}: ${growth[k]} > ${ceiling[k] ?? 0}`);
  process.exit(1);
}
process.exit(0);
