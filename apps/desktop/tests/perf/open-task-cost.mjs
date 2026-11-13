#!/usr/bin/env node
/**
 * Cuánto trabajo le cuesta a la ventana abrir una tarea con historia larga.
 *
 *   node tests/perf/open-task-cost.mjs              guarda: compara con open-task-cost-baseline.json
 *   node tests/perf/open-task-cost.mjs --update    baja el techo a lo que cuesta hoy
 *   node tests/perf/open-task-cost.mjs --reloj 10   además, la mediana del reloj en 10 aperturas, una por proceso
 *   node tests/perf/open-task-cost.mjs --session f  con un session.json real en vez del sintético
 *
 * Los contadores —nodos, mutaciones, llamadas y bytes por IPC— son deterministas
 * y el reloj no entra en la guarda. Un techo solo baja.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import baseline from "./open-task-cost-baseline.json" with { type: "json" };
import { boot, cause, sleep } from "../helpers/jsdom-app.mjs";

const BASELINE = join(import.meta.dirname, "open-task-cost-baseline.json");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? "";
};
const ADJUST = args.includes("--update");
const CLOCK_RUNS = Number(flag("--reloj") ?? 0);
const REAL_SESSION = flag("--session");
const ONE_CLOCK = args.includes("--once");

// Sembrado: la misma tarea en cada corrida, o los contadores dejan de ser comparables.
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
  "pasos avisos rama commit guarda servicio ventana disco memoria contador reloj " +
  "prueba cambio archivo módulo sesión carpeta agente modelo cuenta cola permiso"
).split(" ");

/** Una tarea con la forma de una real de 480 turnos: medida sobre las más largas de un workspace. */
export function longSession(exchanges = 180, seed = 7) {
  const rnd = prng(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const words = (n) => Array.from({ length: n }, () => pick(WORDS)).join(" ");
  const sentence = () => {
    const s = words(8 + Math.floor(rnd() * 14));
    return `${s[0].toUpperCase()}${s.slice(1)} **${words(2)}** y \`${pick(WORDS)}.rs\`.`;
  };
  const paragraph = () => Array.from({ length: 1 + Math.floor(rnd() * 3) }, sentence).join(" ");
  const agentText = (n) => {
    const blocks = [paragraph()];
    if (rnd() < 0.3) blocks.push(`## ${words(3)}`);
    if (rnd() < 0.6)
      blocks.push(Array.from({ length: 3 + Math.floor(rnd() * 4) }, () => `- ${sentence()}`).join("\n"));
    blocks.push(paragraph());
    if (rnd() < 0.1)
      blocks.push(["| a | b | c |", "|---|---|---|", ...Array.from({ length: 4 }, () => `| ${words(2)} | ${words(3)} | ${words(1)} |`)].join("\n"));
    if (rnd() < 0.07) blocks.push(["```ts", ...Array.from({ length: 6 }, () => `const ${pick(WORDS)} = "${words(3)}";`), "```"].join("\n"));
    if (rnd() < 0.3) blocks.push(paragraph());
    blocks.push(`Fin ${n}.`);
    return blocks.join("\n\n");
  };
  const turns = [];
  for (let n = 0; n < exchanges; n++) {
    turns.push({ role: "user", id: `u${n}`, at: n * 60_000, text: `${words(20 + Math.floor(rnd() * 30))}?` });
    const tools = Array.from({ length: Math.floor(rnd() * 7) }, (_, k) => ({
      name: pick(["Bash", "Read", "Edit", "Grep"]),
      target: `scripts/${pick(WORDS)}-${k}.mjs`,
      ok: rnd() > 0.1,
    }));
    const text = agentText(n);
    const cut = text.indexOf("\n\n");
    const pieces = [{ text: text.slice(0, cut) }, ...tools.map((_, tool) => ({ tool })), { text: text.slice(cut) }];
    turns.push({ role: "agent", id: `a${n}`, at: n * 60_000 + 30_000, duration_ms: 30_000, text, tools, pieces });
    if (rnd() < 0.6)
      turns.push({ role: "system", id: `s${n}`, meta: pick(["aviso", "recibido"]), text: sentence() });
  }
  return turns;
}

const row = (id, title, turns) => ({
  id, title, last_message: "", provider: "codex", model: "gpt-5.6", refs: [],
  updated_at: 0, turns, parent: null, esperando: false,
});

// El remoto de git lo dispara un reloj de 3 s, no la apertura.
const remoteGit = { calls: 0 };

function responses(longTurns) {
  const sessions = {
    short: [{ role: "user", text: "Hola" }, { role: "agent", text: "Listo." }],
    long: longTurns,
  };
  return {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    list_providers: [{ id: "codex", label: "Codex", available: true, driver: true }],
    list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    list_projects: [],
    list_portfolios: [],
    list_sources: [],
    list_live_sessions: [row("short", "Tarea corta", 2), row("long", "Tarea larga", longTurns.length)],
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
    list_live_turns: [],
    list_active_turns: [],
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "bench", reset: false },
    task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, incomplete: false },
    load_session: ({ id }) => ({
      id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null,
      turns: structuredClone(sessions[id]),
    }),
    load_queue: [],
    session_usage: null,
    list_session_git: ({ remote }) => {
      if (remote && cause.getStore() === "open-task") remoteGit.calls++;
      return {};
    },
  };
}

// Lo que un reloj dispara solo: contarlo haría depender el número de cuánto tardó la apertura.
const PERIODIC = new Set(["service_poll", "list_active_turns", "list_live_turns", "list_storage", "window_vitals", "update_pending"]);

// Los bytes que el motor manda por IPC, como JSON: lo que cuesta serializar, cruzar y parsear.
const ipc = { bytes: 0 };
function counted(table) {
  return Object.fromEntries(Object.entries(table).map(([cmd, response]) => [
    cmd,
    PERIODIC.has(cmd) ? response : (a) => {
      const value = typeof response === "function" ? response(a) : response;
      if (cause.getStore() === "open-task" && !(cmd === "list_session_git" && a?.remote)) ipc.bytes += Buffer.byteLength(JSON.stringify(value) ?? "");
      return value;
    },
  ]));
}

// El silencio se cuenta desde el gesto que se acaba de hacer, no desde la última mutación.
async function settle(since, quiet = 300) {
  since.last = Math.max(since.last, Date.now());
  const limit = Date.now() + 120_000;
  while (Date.now() - since.last < quiet && Date.now() < limit) await sleep(25);
}

// jsdom no tiene geometría: subir hasta arriba del hilo se simula con lo que ve este observador.
// Va en globalThis antes del primer arranque, que así no lo pisa con el suyo inerte.
const observed = new Set();
globalThis.IntersectionObserver = class {
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
  }
  observe(target) {
    this.targets.add(target);
    observed.add(this);
  }
  unobserve(target) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    observed.delete(this);
  }
  takeRecords() {
    return [];
  }
};
const scrollToTop = () => {
  for (const io of [...observed])
    if (io.targets.size > 0) io.callback([...io.targets].map((target) => ({ target, isIntersecting: true })), io);
};

const shown = (doc, text) => doc.querySelector("#root").textContent.includes(text);
const plain = (markdown) => markdown.replace(/[*`#|-]/g, "").trim().slice(0, 12);

/** Lo que abrir tiene que seguir haciendo, con o sin atajos: se comprueba en la primera apertura. */
async function behaves(app, turns, clock) {
  const doc = app.w.document;
  const firstUser = turns.find((t) => t.role === "user").text.slice(0, 30);
  for (let i = 0; i < 200 && !shown(doc, firstUser); i++) {
    scrollToTop();
    await settle(clock, 50);
  }
  if (!shown(doc, firstUser)) return "Subiendo hasta arriba no aparece el primer mensaje de la tarea.";
  app.emit("chat", { kind: "started", session: "long", workspace: "w" });
  app.emit("chat", { kind: "delta", session: "long", workspace: "w", text: "Respuesta en vivo al final" });
  const live = "Respuesta en vivo al final";
  for (let i = 0; i < 40 && !shown(doc, live); i++) await settle(clock, 50);
  const text = doc.querySelector("#root").textContent;
  const lastAgent = turns.findLast((t) => t.role === "agent").text.split("\n").at(-1);
  if (text.lastIndexOf(live) < text.lastIndexOf(plain(lastAgent))) return "La respuesta en vivo no cae al final del hilo.";
  if (!shown(doc, firstUser)) return "Una respuesta en vivo desmontó lo que ya se había leído arriba.";
  return null;
}

/** Abre la tarea corta, luego la larga, y cuenta lo que cuesta la segunda. */
async function openLong(turns, run, check) {
  const app = await boot("listo", `open-task-${run}`, counted(responses(turns)));
  const doc = app.w.document;
  const clock = { last: Date.now() };
  let mutations = 0;
  let addedNodes = 0;
  let lastMutation = 0;
  const observer = new app.w.MutationObserver((records) => {
    lastMutation = performance.now();
    clock.last = Date.now();
    mutations += records.length;
    for (const r of records) for (const n of r.addedNodes) addedNodes += 1 + (n.querySelectorAll?.("*").length ?? 0);
  });
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
  await settle(clock, 1000);
  doc.querySelector('[data-sesion="short"]').click();
  await settle(clock, 1000);
  const short = shown(doc, "Hola") && shown(doc, "Listo.");
  mutations = 0;
  addedNodes = 0;
  const remoteBefore = remoteGit.calls;
  const bytesBefore = ipc.bytes;
  const nodesBefore = doc.querySelectorAll("*").length;
  // Una consulta ya programada de otra tarea no pertenece a la apertura.
  let backgroundRead = false;
  setTimeout(() => {
    void app.w.__TAURI_INTERNALS__.invoke("session_folder", { project: "", id: "short" }).then(() => { backgroundRead = true; });
  }, 0);
  const start = performance.now();
  // Los relojes registrados al montar conservan su contexto: no son trabajo del gesto.
  cause.run("open-task", () => doc.querySelector('[data-sesion="long"]').click());
  await settle(clock);
  const ms = lastMutation - start;
  const counters = {
    nodes: doc.querySelectorAll("*").length - nodesBefore,
    addedNodes,
    mutations,
    invokes:
      app.commandsForCause("open-task").filter((c) => !PERIODIC.has(c) && !c.startsWith("plugin:")).length -
      (remoteGit.calls - remoteBefore),
    ipcBytes: ipc.bytes - bytesBefore,
  };
  const lastAgent = turns.findLast((t) => t.role === "agent")?.text.split("\n").at(-1) ?? "";
  let failure = !backgroundRead
    ? "La consulta de fondo no se ejecutó durante la medición."
    : !short
    ? "La tarea corta no pintó sus dos mensajes."
    : !shown(doc, plain(lastAgent))
      ? "Abrir la tarea larga no pintó su último mensaje."
      : null;
  if (!failure && check) failure = await behaves(app, turns, clock);
  observer.disconnect();
  if (!failure && app.failures.length > 0) failure = app.failures.slice(0, 3).map((f) => String(f).split("\n").slice(0, 4).join("\n  ")).join("\n");
  app.w.close();
  return { ms, counters, failure };
}

const turns = REAL_SESSION ? JSON.parse(readFileSync(REAL_SESSION, "utf8")).turns : longSession();
if (ONE_CLOCK) {
  process.stdout.write(`${(await openLong(turns, 0, false)).ms}\n`);
  process.exit(0);
}
const first = await openLong(turns, 0, true);
if (first.failure) {
  console.error(first.failure);
  process.exit(1);
}

// Una apertura por proceso: los relojes de una app ya cerrada siguen corriendo y cobran a la siguiente.
if (CLOCK_RUNS > 0) {
  const own = REAL_SESSION ? ["--session", REAL_SESSION] : [];
  const times = Array.from({ length: CLOCK_RUNS }, () =>
    Number(execFileSync(process.execPath, [import.meta.filename, "--once", ...own], { encoding: "utf8" }).trim()),
  );
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  console.log(`reloj: mediana ${median.toFixed(0)} ms en ${times.length} aperturas (${times.map((t) => t.toFixed(0)).join(", ")})`);
}

const counters = first.counters;
console.log(`contadores: ${JSON.stringify(counters)}`);
if (REAL_SESSION) process.exit(0);

const ceiling = baseline;
if (ADJUST) {
  const lowered = Object.fromEntries(Object.entries(ceiling).map(([k, v]) => [k, Math.min(v, counters[k])]));
  writeFileSync(BASELINE, `${JSON.stringify(lowered, null, 2)}\n`);
  console.log(`techo: ${JSON.stringify(lowered)}`);
  process.exit(0);
}
const over = Object.entries(ceiling).filter(([k, v]) => counters[k] > v);
if (over.length > 0) {
  console.error("Abrir una tarea larga cuesta más que el techo de open-task-cost-baseline.json:");
  for (const [k, v] of over) console.error(`  ${k}: ${counters[k]} > ${v}`);
  process.exit(1);
}
const room = Object.entries(ceiling).filter(([k, v]) => counters[k] < v);
if (room.length > 0) console.log(`Bajó: ${room.map(([k, v]) => `${k} ${v} → ${counters[k]}`).join(", ")}. Fíjalo con --update.`);

process.exit(0);
