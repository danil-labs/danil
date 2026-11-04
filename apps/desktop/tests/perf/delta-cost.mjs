#!/usr/bin/env node
/**
 * Cuánto le cuesta a la ventana una respuesta larga que llega token a token.
 *
 *   node tests/perf/delta-cost.mjs              guarda: compara con delta-cost-baseline.json
 *   node tests/perf/delta-cost.mjs --update    baja el techo a lo que cuesta hoy
 *
 * 400 deltas en la tarea abierta, ocho por cuadro como llegan por IPC en una
 * respuesta rápida. Se cuentan, dentro del globo de la respuesta, las veces que
 * su DOM cambió (una por actualización del hilo que llega a pintarse) y las
 * mutaciones. La CPU se reporta y no entra en la guarda. Un techo solo baja.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const BASELINE = join(import.meta.dirname, "delta-cost-baseline.json");
const ADJUST = process.argv.includes("--update");
const DELTAS = 400;
const END = "Fin de la respuesta larga.";
const PER_FRAME = 8;

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

/** Una respuesta con prosa, listas, cita, código y tabla, partida en `DELTAS` fragmentos. */
function answer() {
  const rnd = prng(11);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const words = (n) => Array.from({ length: n }, () => pick(WORDS)).join(" ");
  const sections = [];
  for (let s = 0; sections.join("\n\n").length < DELTAS * 24; s++) {
    sections.push(
      `## ${words(3)} ${s}`,
      `${words(30)} **${words(2)}** y \`${pick(WORDS)}.rs\`.`,
      Array.from({ length: 4 }, (_, k) => `${k + 1}. ${words(8)}`).join("\n"),
      `> ${words(12)}`,
      ["```ts", ...Array.from({ length: 5 }, () => `const ${pick(WORDS)} = "${words(4)}";`), "```"].join("\n"),
      ["| a | b |", "|---|---|", ...Array.from({ length: 3 }, () => `| ${words(2)} | ${words(3)} |`)].join("\n"),
    );
  }
  const text = `${sections.join("\n\n")}\n\n${END}`;
  const size = Math.ceil(text.length / DELTAS);
  return Array.from({ length: DELTAS }, (_, i) => text.slice(i * size, (i + 1) * size));
}

const history = Array.from({ length: 20 }, (_, n) => [
  { role: "user", id: `u${n}`, at: n * 60_000, text: `Pregunta ${n}` },
  { role: "agent", id: `a${n}`, at: n * 60_000 + 30_000, text: `Respuesta ${n}.\n\n- uno\n- dos` },
]).flat();
const row = (id) => ({
  id, title: id, last_message: "", provider: "codex", model: "gpt-5.6", refs: [],
  updated_at: 0, turns: history.length, parent: null, esperando: false,
});
let live = false;

// Los cuadros los da la guarda mientras llega la respuesta: con el reloj de jsdom,
// una máquina cargada parte una tanda en dos y el contador deja de ser determinista.
// Va en globalThis antes del arranque, que así no lo pisa con el de jsdom.
let driven = null;
let lastFrame = 0;
let view = null;
globalThis.requestAnimationFrame = (cb) => {
  if (!driven) return view ? view.requestAnimationFrame(cb) : setTimeout(() => cb(performance.now()), 16);
  driven.set(--lastFrame, cb);
  return lastFrame;
};
globalThis.cancelAnimationFrame = (id) => {
  if (id < 0) driven?.delete(id);
  else if (view) view.cancelAnimationFrame(id);
  else clearTimeout(id);
};

const app = await boot("listo", "delta-cost", {
  window_ready: null,
  window_vitals: null,
  setup_required: false,
  list_providers: [{ id: "codex", label: "Codex", available: true, driver: true }],
  list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  list_projects: [],
  list_portfolios: [],
  list_sources: [],
  list_live_sessions: [row("larga")],
  list_skills: [],
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
  list_live_turns: () => (live ? [{ session: "larga", workspace: "w", started_at: 0, background: false }] : []),
  list_active_turns: () => (live ? ["larga"] : []),
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "bench", reset: false },
  task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, incomplete: false },
  load_session: ({ id }) => ({
    id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null, turns: structuredClone(history),
  }),
  load_queue: [],
  save_queue: null,
  session_usage: null,
  list_session_git: {},
});
const w = app.w;
const doc = w.document;
view = w;

async function quiet(ms = 300) {
  let last = Date.now();
  const o = new w.MutationObserver(() => (last = Date.now()));
  o.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const limit = Date.now() + 60_000;
  while (Date.now() - last < ms && Date.now() < limit) await sleep(25);
  o.disconnect();
}
const frame = () => {
  const due = [...driven.values()];
  driven.clear();
  for (const cb of due) cb(performance.now());
  return task();
};
// Cada evento de Tauri llega en su propia tarea: emitidos seguidos, Solid y el observador los juntarían solos.
const task = () => new Promise((r) => setImmediate(r));
const chat = (kind, extra = {}) => app.emit("chat", { kind, session: "larga", workspace: "w", ...extra });

await quiet(800);
doc.querySelector('[data-sesion="larga"]').click();
await quiet(800);
live = true;
chat("started");
await quiet();

const pieces = answer();
// Por pasada del observador, los nodos tocados: al final cuentan solo los de la respuesta en vivo, no los relojes de la ventana.
const passes = [];
const observer = new w.MutationObserver((records) => passes.push(records.map((r) => r.target)));
observer.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
driven = new Map();
const cpu = process.cpuUsage();
for (let i = 0; i < pieces.length; i++) {
  chat("delta", { text: pieces[i] });
  await task();
  if (i % PER_FRAME === PER_FRAME - 1) await frame();
}
await frame();
await frame();
const { user, system } = process.cpuUsage(cpu);
driven = null;
const ms = (user + system) / 1000;
observer.disconnect();

const answerEl = [...doc.querySelectorAll("#root article")].findLast((a) => a.textContent.includes(END));
const inAnswer = (targets) => targets.filter((t) => answerEl?.contains(t));
const renders = passes.filter((targets) => inAnswer(targets).length > 0).length;
const mutations = passes.reduce((n, targets) => n + inAnswer(targets).length, 0);
const failure = !answerEl
  ? "La respuesta en vivo no pintó su final."
  : app.failures.length > 0
    ? app.failures.slice(0, 3).map((f) => String(f).split("\n").slice(0, 4).join("\n  ")).join("\n")
    : null;
live = false;
chat("done", { ok: true });
await quiet();
w.close();
if (failure) {
  console.error(failure);
  process.exit(1);
}

const counters = { renders, mutations };
console.log(`${DELTAS} deltas, ${PER_FRAME} por cuadro: ${JSON.stringify(counters)} · CPU ${ms.toFixed(0)} ms`);

const ceiling = JSON.parse(readFileSync(BASELINE, "utf8"));
if (ADJUST) {
  const lowered = Object.fromEntries(Object.entries(ceiling).map(([k, v]) => [k, Math.min(v, counters[k])]));
  writeFileSync(BASELINE, `${JSON.stringify(lowered, null, 2)}\n`);
  console.log(`techo: ${JSON.stringify(lowered)}`);
  process.exit(0);
}
const over = Object.entries(ceiling).filter(([k, v]) => counters[k] > v);
if (over.length > 0) {
  console.error("Una respuesta larga cuesta más que el techo de delta-cost-baseline.json:");
  for (const [k, v] of over) console.error(`  ${k}: ${counters[k]} > ${v}`);
  process.exit(1);
}
const room = Object.entries(ceiling).filter(([k, v]) => counters[k] < v);
if (room.length > 0) console.log(`Bajó: ${room.map(([k, v]) => `${k} ${v} → ${counters[k]}`).join(", ")}. Fíjalo con --update.`);
process.exit(0);
