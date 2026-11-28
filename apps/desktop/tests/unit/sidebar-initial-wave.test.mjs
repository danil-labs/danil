/** Cold-start sidebar loading coalesces fast folder waves into one paint without flashing empty states. */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { waitFor } from "../helpers/wait-for.mjs";

const row = (id, updated_at) => ({
  id,
  title: `Tarea ${id}`,
  last_message: "",
  provider: "opencode",
  model: "deepseek",
  refs: [],
  updated_at,
  turns: 1,
  parent: null,
  esperando: false,
});

test("el arranque en frío junta las carpetas rápidas en una sola oleada y no parpadea estados vacíos antes de recibir sesiones", async () => {
  const pending = new Map();
  let sawEmptyBeforeTasks = false;
  const sessionWaves = [];

  const app = await boot("listo", "sidebar-single-wave-cold-start", {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "lab", reset: false },
    list_machines: [{ id: "local", name: "Local", local: true, online: true, features: ["light_state_v1"] }],
    list_providers: [{ id: "opencode", label: "OpenCode", available: true, driver: true }],
    list_workspaces: { workspaces: [{ id: "w-wave", name: "Wave", context_root: null }], active: "w-wave" },
    workspaces_startup: { workspaces: [{ id: "w-wave", name: "Wave", context_root: null }], active: "w-wave" },
    list_projects: () => [
      { id: "p1", name: "Proyecto 1", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] },
      { id: "p2", name: "Proyecto 2", working_directory: "/lab/p2", kind: "git", portfolio: null, sources: [] },
    ],
    list_portfolios: [],
    list_sources: [],
    list_spaces: [],
    list_live_sessions: ({ project }) => new Promise((resolve) => {
      pending.set(project, resolve);
    }),
    list_agents: { agents: [], rechazados: [] },
    list_agent_status: [],
    list_mentions: { fuentes: [], archivos: [] },
    list_models: { provider: "opencode", models: [], fallback: false },
    list_surfaces: [],
    session_folder: "/tmp",
    list_task_trees: [],
    watch_task_tree: "watch",
    unwatch_task_tree: null,
    list_live_turns: [],
    list_active_turns: [],
    load_queue: [],
    save_queue: null,
    queue_ready: true,
    session_usage: null,
    list_session_git: {},
  });

  try {
    await waitFor(
      () => pending.has("") && pending.has("p1") && pending.has("p2"),
      "se pidieron las tres carpetas del arranque en frío",
      2500,
    );
    await sleep(60);

    // Mientras ninguna carpeta ha respondido, no se muestran ni «Todavía no hay tareas» ni carpetas vacías prematuras.
    const doc = app.w.document;
    if (doc.querySelector("[data-sidebar-empty]") || doc.querySelector("[data-folder-empty]")) {
      sawEmptyBeforeTasks = true;
    }
    assert.equal(sawEmptyBeforeTasks, false, "no parpadea un estado vacío antes de la primera oleada");

    // Observa en cuántas oleadas de DOM aparecen las tareas al resolver las carpetas escalonadas dentro de la ventana de coalesce.
    const observer = new app.w.MutationObserver(() => {
      const ids = [...doc.querySelectorAll("[data-sidebar-tasks] [data-sesion]")].map((el) => el.getAttribute("data-sesion")).sort();
      if (ids.length > 0) {
        const key = ids.join(",");
        if (sessionWaves.at(-1) !== key) sessionWaves.push(key);
      }
    });
    const listRoot = doc.querySelector("[data-sidebar-tasks]");
    assert.ok(listRoot, "existe el contenedor de tareas del sidebar");
    observer.observe(listRoot, { childList: true, subtree: true });

    pending.get("")([row("t0", 300)]);
    await sleep(40);
    pending.get("p1")([row("t1", 200)]);
    await sleep(40);
    pending.get("p2")([row("t2", 100)]);

    await waitFor(
      () => doc.querySelectorAll("[data-sidebar-tasks] [data-sesion]").length === 3,
      "se pintaron las tres tareas del arranque",
      2000,
    );
    observer.disconnect();

    assert.deepEqual(
      sessionWaves,
      ["t0,t1,t2"],
      "las tres carpetas rápidas entraron en una sola oleada sin segunda oleada de pop-in",
    );
  } finally {
    for (const resolve of pending.values()) resolve([]);
    app.w.close();
  }
});

test("en vista plana sin agrupación no muestra «Todavía no hay tareas» mientras otra carpeta tarda más que coalesce", async () => {
  const pending = new Map();
  let sawEmptyBeforeSlowFolder = false;
  const ws = "w-partial-empty";
  const app = await boot("listo", "sidebar-partial-empty-slow-folder", {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "lab", reset: false },
    list_machines: [{ id: "local", name: "Local", local: true, online: true, features: ["light_state_v1"] }],
    list_providers: [{ id: "opencode", label: "OpenCode", available: true, driver: true }],
    list_workspaces: { workspaces: [{ id: ws, name: "Partial", context_root: null }], active: ws },
    workspaces_startup: { workspaces: [{ id: ws, name: "Partial", context_root: null }], active: ws },
    list_projects: () => [
      { id: "p1", name: "Proyecto 1", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] },
      { id: "p2", name: "Proyecto 2", working_directory: "/lab/p2", kind: "git", portfolio: null, sources: [] },
    ],
    list_portfolios: [],
    list_sources: [],
    list_spaces: [],
    list_live_sessions: ({ project }) => new Promise((resolve) => {
      pending.set(project, resolve);
    }),
    list_agents: { agents: [], rechazados: [] },
    list_agent_status: [],
    list_mentions: { fuentes: [], archivos: [] },
    list_models: { provider: "opencode", models: [], fallback: false },
    list_surfaces: [],
    session_folder: "/tmp",
    list_task_trees: [],
    watch_task_tree: "watch",
    unwatch_task_tree: null,
    list_live_turns: [],
    list_active_turns: [],
    load_queue: [],
    save_queue: null,
    queue_ready: true,
    session_usage: null,
    list_session_git: {},
  }, undefined, {
    [`sidebar.view.${ws}`]: JSON.stringify({ folders: [], agent: null, group: "none" }),
  });

  try {
    await waitFor(
      () => pending.has("") && pending.has("p1") && pending.has("p2"),
      "se pidieron las tres carpetas en vista plana",
      2500,
    );
    const doc = app.w.document;
    const observer = new app.w.MutationObserver(() => {
      if (doc.querySelector("[data-sidebar-empty]")) sawEmptyBeforeSlowFolder = true;
    });
    observer.observe(doc.querySelector("[data-sidebar-tasks]"), { childList: true, subtree: true });

    // Las dos primeras carpetas vuelven vacías y la tercera tarda más que la ventana de coalesce (250 ms).
    pending.get("")([]);
    pending.get("p1")([]);
    await sleep(340);
    assert.equal(doc.querySelector("[data-sidebar-empty]"), null, "con p2 aún pendiente no se muestra «Todavía no hay tareas»");
    assert.equal(sawEmptyBeforeSlowFolder, false, "nunca parpadeó «Todavía no hay tareas» durante la carga parcial");

    pending.get("p2")([row("t-lenta", 500)]);
    await waitFor(
      () => doc.querySelector('[data-sidebar-tasks] [data-sesion="t-lenta"]'),
      "llega la tarea de la carpeta lenta",
      2000,
    );
    observer.disconnect();
    assert.equal(sawEmptyBeforeSlowFolder, false);
  } finally {
    for (const resolve of pending.values()) resolve([]);
    app.w.close();
  }
});

test("si la persona cambia de espacio mientras list_sources sigue pendiente, el arranque no restaura la tira del espacio anterior", async () => {
  let resolveSources = null;
  const ws = "w-space-switch";
  const app = await boot("listo", "sidebar-space-switch-during-startup", {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "lab", reset: false },
    list_machines: [{ id: "local", name: "Local", local: true, online: true, features: ["light_state_v1"] }],
    list_providers: [{ id: "opencode", label: "OpenCode", available: true, driver: true }],
    list_workspaces: { workspaces: [{ id: ws, name: "Spaces", context_root: null }], active: ws },
    workspaces_startup: { workspaces: [{ id: ws, name: "Spaces", context_root: null }], active: ws },
    list_projects: () => [
      { id: "pa", name: "PA", working_directory: "/lab/pa", kind: "git", portfolio: null, sources: [] },
      { id: "pb", name: "PB", working_directory: "/lab/pb", kind: "git", portfolio: null, sources: [] },
    ],
    list_portfolios: [],
    list_sources: () => new Promise((resolve) => { resolveSources = resolve; }),
    list_spaces: () => [
      { id: "s1", name: "Espacio A", folders: ["pa"], created_at: 1, updated_at: 1 },
      { id: "s2", name: "Espacio B", folders: ["pb"], created_at: 2, updated_at: 2 },
    ],
    list_live_sessions: ({ project }) => {
      if (project === "pa") return [{ ...row("ta", 100), space: "s1" }];
      if (project === "pb") return [{ ...row("tb", 200), space: "s2" }];
      return [];
    },
    list_agents: { agents: [], rechazados: [] },
    list_agent_status: [],
    list_mentions: { fuentes: [], archivos: [] },
    list_models: { provider: "opencode", models: [], fallback: false },
    list_surfaces: [],
    session_folder: "/tmp",
    list_task_trees: [],
    watch_task_tree: "watch",
    unwatch_task_tree: null,
    list_live_turns: [],
    list_active_turns: [],
    load_queue: [],
    save_queue: null,
    queue_ready: true,
    session_usage: null,
    list_session_git: {},
    load_session: ({ id }) => ({
      id, provider: "opencode", sources: [], model: "deepseek", effort: null, permission_mode: null,
      turns: [{ role: "user", id: "u0", at: 0, text: `hola ${id}` }],
    }),
  }, undefined, {
    [`space.${ws}`]: JSON.stringify("s1"),
    [`pestanas.${ws}.s1`]: JSON.stringify({
      abiertas: [{ id: "ta", project: "pa", session: "ta", titulo: "Tarea ta" }],
      activa: "ta",
    }),
  });

  try {
    const doc = app.w.document;
    await waitFor(
      () => resolveSources !== null && doc.querySelector("[data-title-bar] [data-space-menu]"),
      "el selector de espacios montó mientras list_sources sigue pendiente",
      2500,
    );
    // La persona cambia al Espacio B antes de que termine list_sources.
    doc.querySelector("[data-title-bar] [data-space-menu]").click();
    const optionB = await waitFor(
      () => doc.querySelector('[data-space-list] [data-space="s2"]'),
      "aparece Espacio B en el menú de espacios",
      2000,
    );
    optionB.click();
    await waitFor(
      () => doc.querySelector("[data-title-bar] [data-space-menu]")?.textContent?.includes("Espacio B"),
      "el espacio activo cambió a Espacio B",
      2000,
    );

    // Ahora termina list_sources y continúa aplicar(): no debe cargar la pestaña ta del Espacio A.
    resolveSources([]);
    await sleep(350);
    const tabs = [...doc.querySelectorAll("[data-tira] [data-tab]")].map((el) => el.getAttribute("data-tab"));
    assert.ok(!tabs.includes("ta"), `el arranque cedió al cambio de espacio y no restauró ta: ${JSON.stringify(tabs)}`);
    assert.ok(doc.querySelector("[data-title-bar] [data-space-menu]")?.textContent?.includes("Espacio B"));
  } finally {
    if (resolveSources) resolveSources([]);
    app.w.close();
  }
});
