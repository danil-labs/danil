/**
 * Un proyecto oculto del selector (preferencia guardada en `localStorage`) deja
 * los 8 recientes y va al final de «Más proyectos…», el buscador lo encuentra,
 * «Mostrar» lo regresa al selector y ninguna tarea cambia. El contador de la
 * fila cuenta las tareas activas, no el `sessions` del motor (que incluye las
 * archivadas). El selector mantiene «Añadir un proyecto…» y ya no ofrece
 * «Administrar proyectos». Monta `dist/` con el IPC simulado.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const DAY = 86_400_000;
const NOW = Date.now();
// «Danil App» tiene 363 en el motor (archivadas incluidas) y una sola tarea viva.
const PROJECTS = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `old${i}`, name: `Viejo ${String(i).padStart(2, "0")}`, created_at: Math.floor((NOW - (100 - i) * DAY) / 1000), sessions: 4 })),
  { id: "danil-app", name: "Danil App", created_at: Math.floor((NOW - 500 * DAY) / 1000), sessions: 363 },
].map((p) => ({ ...p, updated_at: p.created_at, node: null, working_directory: `/lab/${p.id}`, kind: "git", portfolio: null, sources: [] }));
const task = { id: "t1", title: "Tarea", last_message: "", provider: "claude", model: "opus", refs: [], created_at: NOW - DAY, updated_at: NOW - 60_000, last_turn_at: NOW - 60_000, turns: 1, parent: null, esperando: false };

const responses = {
  window_ready: null,
  window_vitals: null,
  setup_required: false,
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "lab", reset: false },
  list_providers: [{ id: "claude", label: "Claude", available: true, driver: true }],
  list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  list_projects: () => PROJECTS,
  list_portfolios: [],
  list_sources: [],
  list_live_sessions: ({ project }) => (project === "danil-app" ? [task] : []),
  list_agents: { agents: [], rechazados: [] },
  list_agent_status: [],
  list_mentions: { fuentes: [], archivos: [] },
  list_models: { provider: "claude", models: [{ id: "opus", label: "Opus", gratis: null, note: null, efforts: [], default_effort: null }], fallback: false },
  list_surfaces: [{ id: "claude", provider: "claude", label: "Claude", catalogo: "todo", usable: true, marca: null, porque: null }],
  session_folder: "/tmp",
  list_task_trees: [],
  watch_task_tree: "watch",
  unwatch_task_tree: null,
  list_live_turns: [],
  list_active_turns: [],
  load_queue: [],
  save_queue: null,
  session_usage: null,
  list_session_git: {},
};

async function until(check, ms = 3000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(25)) if (check()) return true;
  return check();
}

// Lo que cambiaría una tarea o un proyecto en el motor.
const MUTATES = /archive|delete|remove|rename|move|update_session|set_session|update_project|set_project|save_session/;

test("hidden project leaves the 8 and goes last under «Más proyectos…»; «Mostrar» brings it back; counts are of active tasks; no task changes", async () => {
  const app = await boot("listo", "project-picker-hidden", responses, undefined, {
    "harness.layout.projects.hidden": JSON.stringify({ w: ["old9"] }),
  });
  const doc = app.w.document;
  const search = () => doc.querySelector('input[placeholder="Buscar proyecto"]');
  const trigger = () => doc.querySelector('[aria-label="Proyecto"]');
  const list = () => search()?.closest("[role=dialog]")?.querySelector(".overflow-y-auto");
  const row = (id) => list()?.querySelector(`[data-picker-project="${id}"]`);
  const order = () => [...(list()?.querySelectorAll("[data-picker-project]") ?? [])].map((r) => r.dataset.pickerProject);
  const more = () => list()?.querySelector("[data-more-projects]");
  const close = async () => {
    doc.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.ok(await until(() => !search()), "the popover closes");
  };
  try {
    assert.ok(await until(() => trigger()), "the project picker is on the new task");
    assert.ok(await until(() => doc.querySelector('[data-sesion="t1"]')), "the task of «Danil App» is loaded");

    const before = app.commands.length;

    trigger().click();
    assert.ok(await until(() => row("danil-app")), "«Danil App» is offered");
    assert.match(row("danil-app").textContent, /1 tarea$/, "1 active task, not the engine's 363");
    assert.equal(row("old9"), null, "hidden: not among the 8");
    assert.equal(order().length, 8, "the next one takes its place");
    assert.equal(more().textContent.trim(), "Más proyectos… (3)", "the hidden one counts under «Más proyectos…»");

    const dialog = search().closest("[role=dialog]");
    assert.ok(
      [...dialog.querySelectorAll("button")].some((b) => b.textContent.includes("Añadir un proyecto")),
      "the picker still offers adding a project",
    );
    assert.ok(
      ![...dialog.querySelectorAll("button")].some((b) => b.textContent.includes("Administrar proyectos")),
      "the picker no longer links to retired Settings → Projects",
    );

    more().click();
    assert.ok(await until(() => order().length === 11));
    assert.equal(order().at(-1), "old9", "the hidden one goes last");
    assert.ok(row("old9").hasAttribute("data-hidden"));
    await close();

    // El buscador lo encuentra.
    trigger().click();
    assert.ok(await until(() => search()));
    search().value = "viejo 09";
    search().dispatchEvent(new app.w.Event("input", { bubbles: true }));
    assert.ok(await until(() => order().length === 1 && order()[0] === "old9"), "search finds the hidden one");
    search().value = "";
    search().dispatchEvent(new app.w.Event("input", { bubbles: true }));
    assert.ok(await until(() => more()));
    more().click();
    assert.ok(await until(() => row("old9")?.querySelector("[data-show-project]")));
    row("old9").querySelector("[data-show-project]").click();
    assert.ok(await until(() => !row("old9")?.hasAttribute("data-hidden")), "«Mostrar» brings it back");
    assert.ok(search(), "showing does not pick it nor close the picker");
    await close();
    trigger().click();
    assert.ok(await until(() => row("old9")), "back among the 8 recent");
    assert.match(row("old9").textContent, /sin tareas$/, "all its tasks are archived: no active ones");
    assert.equal(more().textContent.trim(), "Más proyectos… (3)");
    await close();

    const during = app.commands.slice(before);
    assert.deepEqual(during.filter((c) => MUTATES.test(c)), [], `no task or project changes: ${[...new Set(during)].join(", ")}`);
    assert.deepEqual(app.failures, []);
  } finally {
    app.w.close();
  }
});
