/** Integración manual: dist/ con IPC local y relay simulados; no acredita ventana nativa. */
import assert from "node:assert/strict";
import { HOME, VM, open, openTask, remote, row, until } from "./desktop-account.mjs";
import { sleep } from "./jsdom-app.mjs";

const stamp = Date.UTC(2026, 10, 1);
const task = (id, title, extra = {}) => ({ ...row(id, title), turns: 1, created_at: stamp, updated_at: stamp, ...extra });
const results = [];

async function run(owner, listed, pass) {
  const prefix = owner === "cmp_home" ? "" : `${owner}~`;
  const parent = task("parent", `Padre QA ${owner}`, { has_delegates: true });
  const child = task("child", `Hija QA ${owner}`, { launched_by: "parent", folder: "p1" });
  const loaded = [];
  const table = {
    project_base_branches: [],
    list_live_sessions: ({ project }) => project === "p1" || project === "" ? [parent, ...(listed ? [child] : [])] : [],
    list_delegated_sessions: ({ id }) => id === "parent" ? [child] : [],
    task_coordinator: ({ id }) => id === "child" ? { folder: "p1", task: "parent", title: parent.title, provider: "codex" } : null,
    load_session: ({ id }) => {
      loaded.push(id);
      return { id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null,
        turns: id === "parent" ? [{ role: "system", id: "launch", text: "", meta: "task_launched",
          from_task: { folder: "p1", task: "child", title: child.title, provider: "codex" } }]
          : [{ role: "assistant", text: `CONTENIDO HIJA ${owner}` }] };
    },
  };
  const fixture = await open(`delegated-fleet-${owner}-${listed}-${pass}`, {
    computers: [HOME, { ...VM, state: "online" }],
    extra: owner === "cmp_home" ? table : {
      project_base_branches: [],
      list_live_sessions: () => [task("child", "Colisión local: destino incorrecto")],
    },
    relays: { cmp_vm: { table: remote("Panel remoto", "Otra tarea", owner === "cmp_vm" ? table : {}), state: "online" } },
  });
  const { app, doc, native, relayCalls } = fixture;
  try {
    const parentId = `${prefix}parent`, childId = `${prefix}child`;
    assert.ok(await until(() => doc.querySelector(`[data-sesion="${parentId}"]`)), "padre disponible");
    await openTask(app, parentId);
    const selector = `[data-delegated-launch="${childId}"] [data-sesion="${childId}"]`;
    assert.ok(await until(() => doc.querySelector(selector)), "referencia y fila usan la misma identidad");
    const card = doc.querySelector(selector);
    assert.ok(card.textContent.includes(child.title), "título real de la hija");
    assert.ok(/nov/i.test(card.querySelector("[data-session-time]")?.textContent ?? ""), "fecha real de noviembre");
    const launch = card.closest("[data-delegated-launch]");
    assert.ok(!/no (existe|está disponible)|inexistente/i.test(launch.textContent), launch.textContent);
    if (owner !== "cmp_home") assert.ok(card.querySelector(`[data-machine="${owner}"]`), "máquina remota en la tarjeta aun sin fila viva");
    const loadCount = () => loaded.filter(id => id === "child").length;
    const beforeCard = loadCount();
    card.click();
    assert.ok(await until(() => loadCount() > beforeCard), "tarjeta carga hija en motor correcto");
    const cardContent = await until(() => doc.body.textContent.includes(`CONTENIDO HIJA ${owner}`));
    await openTask(app, parentId);
    assert.ok(await until(() => doc.querySelector('[data-delegated-trigger="toolbar"]')), "dock de delegadas disponible");
    doc.querySelector('[data-delegated-trigger="toolbar"]').click();
    await sleep(100);
    [...doc.querySelectorAll("button")].find(button => button.textContent === "Todas")?.click();
    const dock = () => doc.querySelector(`[data-delegated-list] [data-sesion="${childId}"]`);
    assert.ok(await until(dock), "dock contiene la misma hija");
    dock().click();
    const dockContent = await until(() => doc.body.textContent.includes(`CONTENIDO HIJA ${owner}`));
    assert.ok(cardContent && dockContent, `contenido visible: tarjeta=${cardContent}, dock=${dockContent}`);
    if (owner !== "cmp_home") {
      assert.equal(native("load_session").filter(call => call.args.id === "child").length, 0, "la colisión local nunca se abre");
      assert.ok(relayCalls(owner, "load_session").some(call => call.args.id === "child"), "relay recibe el id corto");
    }
    assert.deepEqual(app.failures, []);
    results.push({ owner, listed, pass, result: "pass", loaded });
  } catch (error) {
    results.push({ owner, listed, pass, result: "fail", error: error.stack, loaded, text: doc.body.textContent, failures: app.failures });
    process.exitCode = 1;
  } finally {
    app.w.close();
  }
}

async function explicitCoordinator(source, owner) {
  const loaded = [];
  const reference = { folder: "p1", task: "parent", title: `Coordinador ${owner}`, provider: "codex", machine: owner };
  const table = machine => ({
    list_live_sessions: () => [task("child", `Tarea ${machine}`, { launched_by: "parent", pinned: true }), task("parent", `Coordinador ${machine}`)],
    list_delegated_sessions: () => [],
    task_coordinator: ({ id }) => machine === source && id === "child" ? reference : null,
    load_session: ({ id }) => {
      loaded.push([machine, id]);
      return { id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null,
        turns: machine === source && id === "child"
          ? [{ role: "system", id: "explicit-launch", text: "", meta: "task_launched", from_task: reference }]
          : [{ role: "assistant", text: `COORDINADOR DESTINO ${machine}` }] };
    },
  });
  const { app, doc } = await open(`delegated-explicit-${source}-${owner}`, {
    computers: [HOME, { ...VM, state: "online" }], extra: table("cmp_home"),
    relays: { cmp_vm: { table: remote("Remoto", "Remota", table("cmp_vm")), state: "online" } },
  });
  try {
    const sourceId = source === "cmp_home" ? "child" : `${source}~child`;
    const targetId = owner === "cmp_home" ? "parent" : `${owner}~parent`;
    await openTask(app, sourceId);
    assert.ok(await until(() => doc.querySelector(`[data-delegated-launch="${targetId}"]`)), "tarjeta respeta máquina explícita");
    assert.ok(await until(() => doc.querySelector("[data-task-coordinator]")), "regreso al coordinador disponible");
    doc.querySelector("[data-task-coordinator]").click();
    assert.ok(await until(() => loaded.some(([machine, id]) => machine === owner && id === "parent")), "coordinador abre el motor dueño");
    assert.ok(await until(() => doc.body.textContent.includes(`COORDINADOR DESTINO ${owner}`)), "coordinador muestra el contenido correcto");
    assert.equal(loaded.filter(([machine, id]) => machine === source && id === "parent").length, 0, "no abre el homónimo de la máquina fuente");
    assert.deepEqual(app.failures, []);
    results.push({ source, owner, case: "explicit-coordinator", result: "pass", loaded });
  } catch (error) {
    results.push({ source, owner, case: "explicit-coordinator", result: "fail", error: error.stack, loaded, text: doc.body.textContent, failures: app.failures });
    process.exitCode = 1;
  } finally {
    app.w.close();
  }
}

try {
  for (const owner of ["cmp_home", "cmp_vm"]) {
    for (const listed of [true, false]) {
      if (process.env.QA_DELEGATED_ONLY === "missing" && listed) continue;
      // Dos montajes: el segundo vuelve a leer el lanzamiento guardado desde load_session.
      for (const pass of ["historial", "reapertura"]) await run(owner, listed, pass);
    }
  }
  if (process.env.QA_DELEGATED_ONLY !== "missing") {
    await explicitCoordinator("cmp_home", "cmp_vm");
    await explicitCoordinator("cmp_vm", "cmp_home");
  }
  console.log(JSON.stringify({ scope: "jsdom integration, simulated IPC and relay", results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ results, error: error.stack }, null, 2));
  process.exitCode = 1;
}
// El harness conserva relojes de los árboles desmontados.
process.exit(process.exitCode ?? 0);
