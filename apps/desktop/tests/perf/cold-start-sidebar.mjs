#!/usr/bin/env node
/**
 * Cuántas respuestas del motor espera el sidebar antes de pintar sus tareas, en frío y en caliente.
 *
 *   node tests/perf/cold-start-sidebar.mjs            guarda: compara con cold-start-sidebar-baseline.json
 *   node tests/perf/cold-start-sidebar.mjs --update   baja el techo a lo que cuesta hoy
 *
 * El motor arranca después de la ventana: hasta que el lanzador avisa `ready`, toda orden suya
 * rechaza con `engine_down`, como `proxy::handle` sin estado. En caliente la ventana ya guardó
 * su sidebar en una corrida anterior. El techo es el número de respuestas del motor que bloquean
 * el primer pintado útil en caliente; el frío y los milisegundos dependen del reloj de jsdom y
 * solo se informan.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const BASELINE = join(import.meta.dirname, "cold-start-sidebar-baseline.json");
const ADJUST = process.argv.includes("--update");
const LATENCY = 25;
const LOCAL = new Set(["window_ready", "window_vitals", "window_painted", "window_background", "launcher_state", "launcher_continue"]);
const ENGINE_DOWN = { what: { clave: "shell.service.engine_down" }, detail: "engine_down" };

const FOLDERS = ["p1", "p2"];
const TASKS = Array.from({ length: 6 }, (_, n) => `t${n}`);
const row = (id) => ({
  id, title: `Tarea ${id}`, last_message: "", provider: "codex", model: "gpt-5.6", refs: [],
  updated_at: 0, turns: 2, parent: null, esperando: false,
});
const folder = (id) => ({ id, name: id.toUpperCase(), working_directory: `/lab/${id}`, kind: "git", portfolio: null, sources: [] });
const fresh = (value) => structuredClone(value);
const startup = { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" };

async function run(name, storage) {
  const state = { connected: false, replies: 0, issued: 0 };
  const engine = (value) => (args) => {
    state.issued++;
    if (!state.connected) return Promise.reject(fresh(ENGINE_DOWN));
    return sleep(LATENCY).then(() => {
      state.replies++;
      return fresh(typeof value === "function" ? value(args) : value);
    });
  };
  const responses = {
    window_ready: null,
    window_vitals: null,
    window_painted: null,
    window_background: null,
    launcher_state: () => (state.connected ? { phase: "ready", blank_0274: false } : { phase: "connecting" }),
    setup_required: engine(false),
    check_environment: engine({ ready: true, blocked: false, reason: null, items: [] }),
    list_providers: engine([{ id: "codex", label: "Codex", available: true, driver: true }]),
    list_workspaces: engine(startup),
    workspaces_startup: engine(startup),
    list_projects: engine(() => FOLDERS.map(folder)),
    list_portfolios: engine([]),
    list_sources: engine([]),
    list_spaces: engine([]),
    list_live_sessions: engine(({ project }) => (project === "" ? TASKS.map(row) : FOLDERS.includes(project) ? [row(`${project}a`), row(`${project}b`)] : [])),
    list_agents: engine({ agents: [], rechazados: [] }),
    list_agent_status: engine([]),
    list_mentions: engine({ fuentes: [], archivos: [] }),
    list_models: engine({ provider: "codex", models: [], fallback: false }),
    list_surfaces: engine([]),
    list_live_turns: engine([]),
    list_active_turns: engine([]),
    list_task_trees: engine([]),
    service_poll: engine({ cursor: 0, gap: false, replay: false, runtime: "bench", reset: false }),
  };
  for (const key of Object.keys(responses)) if (!LOCAL.has(key) && typeof responses[key] !== "function") delete responses[key];

  const started = performance.now();
  const seen = { at: null, replies: null, issued: null, node: null, inert: null };
  const watch = setInterval(() => {
    const node = globalThis.document?.querySelector?.('[data-sesion="t0"]');
    if (!node || seen.at !== null) return;
    seen.at = Math.round(performance.now() - started);
    seen.replies = state.replies;
    seen.issued = state.issued;
    seen.node = node;
    seen.inert = node.closest("[inert]") !== null;
  }, 1);
  const app = await boot("listo", `cold-start-sidebar-${name}`, responses, undefined, storage);
  const connectAt = Math.round(performance.now() - started);
  state.connected = true;
  app.emit("launcher", { phase: "ready", blank_0274: false });
  await sleep(4000);
  clearInterval(watch);
  if (app.failures.length > 0) {
    console.error(app.failures.slice(0, 3).map((f) => String(f).split("\n").slice(0, 4).join("\n  ")).join("\n"));
    process.exit(1);
  }
  const doc = app.w.document;
  const final = doc.querySelector('[data-sesion="t0"]');
  if (!final || seen.at === null) {
    console.error(`${name}: el sidebar no pintó la tarea t0.`);
    process.exit(1);
  }
  if (doc.querySelector("[data-shell-cache]")) {
    console.error(`${name}: el sidebar sigue marcado como caché con el motor conectado.`);
    process.exit(1);
  }
  const kept = {};
  for (let i = 0; i < app.w.localStorage.length; i++) {
    const key = app.w.localStorage.key(i);
    kept[key] = app.w.localStorage.getItem(key);
  }
  return {
    measured: { engine_replies_before_paint: seen.replies, engine_calls_before_paint: seen.issued },
    paintMs: seen.at,
    connectMs: connectAt,
    beforeEngine: seen.at < connectAt,
    sameRow: seen.node === final,
    inertWhileCached: seen.at < connectAt ? seen.inert : null,
    storage: kept,
  };
}

const cold = await run("cold", {});
const warm = await run("warm", cold.storage);
for (const [name, result] of [["frío", cold], ["caliente", warm]]) {
  console.log(
    `${name}: ${JSON.stringify(result.measured)} pintado=${result.paintMs} ms motor=${result.connectMs} ms antes_del_motor=${result.beforeEngine} misma_fila=${result.sameRow} inerte=${result.inertWhileCached}`,
  );
}
if (warm.beforeEngine && (!warm.sameRow || warm.inertWhileCached !== true)) {
  console.error("En caliente la fila de caché debe ser inerte hasta el motor y conservarse al llegar los datos reales.");
  process.exit(1);
}

const measured = { "warm.engine_replies_before_paint": warm.measured.engine_replies_before_paint };
const ceiling = JSON.parse(readFileSync(BASELINE, "utf8"));
if (ADJUST) {
  const lowered = Object.fromEntries(Object.keys(measured).map((k) => [k, Math.min(ceiling[k] ?? Infinity, measured[k])]));
  writeFileSync(BASELINE, `${JSON.stringify(lowered, null, 2)}\n`);
  console.log(`techo: ${JSON.stringify(lowered)}`);
  process.exit(0);
}
const over = Object.keys(measured).filter((k) => measured[k] > (ceiling[k] ?? 0));
if (over.length > 0) {
  console.error("El sidebar espera más respuestas del motor que el techo de cold-start-sidebar-baseline.json:");
  for (const k of over) console.error(`  ${k}: ${measured[k]} > ${ceiling[k] ?? 0}`);
  process.exit(1);
}
process.exit(0);
