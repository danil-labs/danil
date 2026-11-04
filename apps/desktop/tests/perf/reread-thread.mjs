#!/usr/bin/env node
/**
 * Cuántos nodos del hilo se desmontan cuando la ventana vuelve a leer una tarea abierta.
 *
 *   node tests/perf/reread-thread.mjs              guarda: compara con reread-thread-baseline.json
 *   node tests/perf/reread-thread.mjs --update    baja el techo a lo que cuesta hoy
 *
 * Tres casos: releer sin cambios, releer con un turno nuevo, y la tarea quieta
 * durante varios relojes de 30 s en un hilo que no llena la vista. Un techo solo baja.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const BASELINE = join(import.meta.dirname, "reread-thread-baseline.json");
const ADJUST = process.argv.includes("--update");

// El reloj que suelta lo leído arriba dura 30 s; en la quietud dura lo bastante para contar varios.
const SOLTAR_LO_LEIDO_MS = 30_000;
const RELOJ_CORTO = 150;
let relojCorto = false;
const setTimeoutNativo = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...rest) =>
  setTimeoutNativo(fn, relojCorto && ms === SOLTAR_LO_LEIDO_MS ? RELOJ_CORTO : ms, ...rest);

// Sin geometría: `vistaCorta` hace que el borde de arriba se vea siempre, como un hilo que no llena la ventana.
let vistaCorta = false;
globalThis.IntersectionObserver = class {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    if (vistaCorta) setTimeoutNativo(() => this.callback([{ target, isIntersecting: true }], this), 0);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};

function turns(exchanges, from = 0) {
  const out = [];
  for (let n = from; n < from + exchanges; n++) {
    out.push({ role: "user", id: `u${n}`, turno: `t${n}`, at: n * 60_000, text: `Pregunta ${n} sobre el hilo` });
    out.push({
      role: "agent", id: `a${n}`, turno: `t${n}`, at: n * 60_000 + 30_000, duration_ms: 30_000,
      text: `Reviso el archivo.\n\nRespuesta ${n} con **negrita** y \`codigo.rs\`.\n\n- uno\n- dos`,
      tools: [{ name: "Read", target: `src/archivo-${n}.ts`, ok: true }],
      pieces: [{ text: "Reviso el archivo." }, { tool: 0 }, { text: `\n\nRespuesta ${n} con **negrita** y \`codigo.rs\`.\n\n- uno\n- dos` }],
    });
    if (n % 2 === 0) out.push({ role: "system", id: `s${n}`, meta: "aviso", text: `Aviso ${n}` });
  }
  return out;
}

const row = (id, count) => ({
  id, title: id, last_message: "", provider: "codex", model: "gpt-5.6", refs: [],
  updated_at: 0, turns: count, parent: null, esperando: false,
});

const disco = { larga: turns(40), corta: turns(14) };

function responses() {
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
    list_live_sessions: () => Object.entries(disco).map(([id, t]) => row(id, t.length)),
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
    list_live_turns: [],
    list_active_turns: [],
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "bench", reset: false },
    task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, incomplete: false },
    // Cada lectura trae objetos nuevos, como por IPC.
    load_session: ({ id }) => ({
      id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null,
      turns: structuredClone(disco[id]),
    }),
    load_queue: [],
    save_queue: null,
    session_usage: null,
    list_session_git: {},
  };
}

async function quieta(app, ms = 300) {
  let last = Date.now();
  const o = new app.w.MutationObserver(() => (last = Date.now()));
  o.observe(app.w.document.body, { subtree: true, childList: true, characterData: true });
  const limit = Date.now() + 60_000;
  while (Date.now() - last < ms && Date.now() < limit) await sleep(25);
  o.disconnect();
}

/** Lo que el hilo tiene montado: el ancestro común de sus mensajes. */
function nodosDelHilo(doc) {
  const articles = [...doc.querySelectorAll("#root article")];
  if (articles.length === 0) return [];
  let hilo = articles[0].parentElement;
  while (hilo && !articles.every((a) => hilo.contains(a))) hilo = hilo.parentElement;
  return [hilo, ...hilo.querySelectorAll("*")];
}

// Un nodo que sale del documento y vuelve a entrar también se cuenta: el navegador lo repinta igual.
async function medir(app, gesto, ms) {
  const antes = new Set(nodosDelHilo(app.w.document));
  const quitados = new Set();
  const observer = new app.w.MutationObserver((records) => {
    for (const r of records)
      for (const n of r.removedNodes)
        if (n.nodeType === 1) for (const e of [n, ...n.querySelectorAll("*")]) if (antes.has(e)) quitados.add(e);
  });
  observer.observe(app.w.document.body, { subtree: true, childList: true });
  await gesto();
  await quieta(app, ms);
  observer.disconnect();
  const despues = nodosDelHilo(app.w.document);
  return {
    desmontados: quitados.size,
    montados: despues.filter((n) => !antes.has(n)).length,
    total: despues.length,
  };
}

const releer = (app, id) => () => app.emit("session", { session: id, project: "", workspace: "w" });
const shown = (doc, text) => doc.querySelector("#root").textContent.includes(text);

const app = await boot("listo", "reread-thread", responses());
const doc = app.w.document;
await quieta(app, 800);
doc.querySelector('[data-sesion="larga"]').click();
await quieta(app, 800);
if (!shown(doc, "Respuesta 39")) {
  console.error("Abrir la tarea no pintó su último mensaje.");
  process.exit(1);
}

const igual = await medir(app, releer(app, "larga"));
disco.larga.push(...turns(1, 40));
const nuevo = await medir(app, releer(app, "larga"));
if (!shown(doc, "Respuesta 40")) {
  console.error("Releer con un turno nuevo no pintó ese turno.");
  process.exit(1);
}

doc.querySelector('[data-sesion="corta"]').click();
vistaCorta = true;
relojCorto = true;
await quieta(app, 800);
if (!shown(doc, "Pregunta 0 ")) {
  console.error("Un hilo que cabe en la vista no montó su primer mensaje.");
  process.exit(1);
}
const quietud = await medir(app, () => sleep(RELOJ_CORTO * 6), RELOJ_CORTO * 2);

if (app.failures.length > 0) {
  console.error(app.failures.slice(0, 3).join("\n"));
  process.exit(1);
}
app.w.close();

const counters = {
  rereadSameRemoved: igual.desmontados,
  rereadNewTurnRemoved: nuevo.desmontados,
  rereadNewTurnAdded: nuevo.montados,
  idleRemoved: quietud.desmontados,
};
console.log(`contadores: ${JSON.stringify(counters)} (hilo de ${igual.total} nodos)`);

const ceiling = JSON.parse(readFileSync(BASELINE, "utf8"));
if (ADJUST) {
  const lowered = Object.fromEntries(Object.entries(ceiling).map(([k, v]) => [k, Math.min(v, counters[k])]));
  writeFileSync(BASELINE, `${JSON.stringify(lowered, null, 2)}\n`);
  console.log(`techo: ${JSON.stringify(lowered)}`);
  process.exit(0);
}
const over = Object.entries(ceiling).filter(([k, v]) => counters[k] > v);
if (over.length > 0) {
  console.error("Releer una tarea abierta desmonta más nodos del hilo que el techo de reread-thread-baseline.json:");
  for (const [k, v] of over) console.error(`  ${k}: ${counters[k]} > ${v}`);
  process.exit(1);
}
const room = Object.entries(ceiling).filter(([k, v]) => counters[k] < v);
if (room.length > 0) console.log(`Bajó: ${room.map(([k, v]) => `${k} ${v} → ${counters[k]}`).join(", ")}. Fíjalo con --update.`);
process.exit(0);
