#!/usr/bin/env node
/** Prosa y diagramas del chat, tareas hijas en segundo plano, primer turno negado y actualizaciones. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dist, sleep } from "../../tests/helpers/jsdom-app.mjs";
import { TASK_AFTER_QUEUE, RESPONSES, boot, bootByFolder, task } from "../../tests/helpers/mount-guard.mjs";

// El CSS compilado debe devolver la forma que el preflight elimina.
const PROSE = [
  "**Once arreglos: el turno sobrevive al reinicio, y lo que borra pregunta antes**",
  "https://github.com/danil-labs/harness-app/pull/787",
  "",
  "- una viñeta",
  "- otra viñeta",
  "",
  "3. primero",
  "4. segundo",
  "",
  "- [ ] pendiente",
  "- [x] hecha",
  "",
  "#### cuarto nivel",
  "",
  "##### quinto nivel",
  "",
  "###### sexto nivel",
  "",
  "> una cita",
  "",
  "| columna | otra |",
  "| --- | --- |",
  "| 1 | 2 |",
  "",
  "Con `código` dentro, algo en *cursiva* y una regla debajo.",
  "",
  "---",
  "",
  "```ts",
  "const a = 1;",
  "```",
].join("\n");

const proseApp = await boot("listo", "markdown-como-se-escribio", {
  ...TASK_AFTER_QUEUE,
  load_session: {
    ...TASK_AFTER_QUEUE.load_session,
    turns: [{ role: "assistant", text: PROSE, artifacts: [] }],
  },
});
const docM = proseApp.w.document;
docM.querySelector('[data-sesion="s1"]')?.click();
await sleep(250);
const reply = [...docM.querySelectorAll("article")].find((a) =>
  a.textContent.includes("Once arreglos"),
);
assert.ok(reply, "la respuesta del agente no llegó a pintarse");

// jsdom no resuelve las capas de Tailwind; se comprueban las utilities compiladas.
const stylesheet = readFileSync(
  join(dist, "assets", readdirSync(join(dist, "assets")).find((f) => f.startsWith("index-") && f.endsWith(".css"))),
  "utf8",
);
const declares = (el, property) => {
  for (const cssClass of el?.classList ?? []) {
    const css = stylesheet.replaceAll("\\", "");
    const selector = `.${cssClass}`;
    const body = css.split("}").find((rule) =>
      rule.slice(0, rule.indexOf("{")).split(",").includes(selector),
    )?.split("{").at(-1);
    const ruleEl = body?.match(new RegExp(`(?:^|;)${property}:([^;]+)`));
    if (ruleEl) return ruleEl[1];
  }
  return null;
};

// El defecto que se reportó: el título y la URL de la línea siguiente,
// pegados. En HTML ese salto vale un espacio, y el espacio tiene que estar.
const paragraph = [...reply.querySelectorAll("p")].find((el) =>
  el.textContent.includes("Once arreglos"),
);
assert.match(
  paragraph?.textContent ?? "",
  /pregunta antes\s+https:\/\/github\.com/,
  "el salto de línea dentro de un párrafo se perdió entero, sin dejar el espacio",
);

const bullets = reply.querySelector("ul");
const numbered = reply.querySelector("ol");
assert.equal(declares(bullets, "list-style-type"), "disc");
assert.equal(declares(numbered, "list-style-type"), "decimal");
assert.equal(numbered.getAttribute("start"), "3");
assert.equal(reply.querySelector("pre code").textContent, "const a = 1;\n");
// Una lista de tareas ya trae su casilla; la viñeta de al lado sobra.
const taskItem = [...reply.querySelectorAll("li")].find((el) =>
  el.querySelector('input[type="checkbox"]'),
);
assert.equal(declares(taskItem, "list-style-type"), "none");
assert.equal(taskItem?.querySelector("input")?.disabled, true);

// El preflight iguala los seis encabezados al texto del cuerpo.
for (const level of ["h4", "h5", "h6"]) {
  const titleText = reply.querySelector(level);
  assert.ok(titleText, `el markdown trae un ${level} y no se pintó`);
  assert.ok(declares(titleText, "font-weight"), `un ${level} se lee con el peso de un párrafo`);
  assert.ok(declares(titleText, "font-size"), `un ${level} mide igual que un párrafo`);
}

// Y lo demás que el preflight deja sin forma propia.
assert.ok(declares(reply.querySelector("blockquote"), "border-left-width"));
assert.ok(declares(reply.querySelector("hr"), "border-top-width"));
assert.ok(declares(reply.querySelector("table"), "border-collapse"));
assert.ok(declares(reply.querySelector("strong"), "font-weight"));
assert.ok(declares(reply.querySelector("em"), "font-style"));
assert.ok(declares(reply.querySelector("pre"), "overflow"));
assert.deepEqual(proseApp.failures, []);
proseApp.w.close();

// El visor de un diagrama se extiende a toda la ventana y vuelve: con su
// botón y con Escape, y el foco regresa al botón que lo abrió.
const diagramApp = await boot("listo", "diagrama-en-toda-la-ventana", {
  ...TASK_AFTER_QUEUE,
  load_session: {
    ...TASK_AFTER_QUEUE.load_session,
    turns: [{ role: "assistant", text: "```mermaid\ngraph TD\n  A --> B\n```", artifacts: [] }],
  },
});
const docD = diagramApp.w.document;
docD.querySelector('[data-sesion="s1"]')?.click();
await sleep(250);
const expandButton = docD.querySelector('button[aria-label="Ver diagrama en toda la ventana"]');
assert.ok(expandButton, "el diagrama no ofrece extenderse a toda la ventana");
const layer = () => docD.querySelector('[role="dialog"][aria-modal="true"]');
for (const closeButton of ["boton", "escape"]) {
  expandButton.focus();
  expandButton.click();
  await sleep(50);
  assert.ok(layer(), "extender no abrió la capa");
  assert.ok(layer().classList.contains("fixed") && layer().classList.contains("inset-0"), "la capa no cubre la ventana");
  assert.ok(layer().contains(docD.activeElement), "el foco se quedó detrás de la capa");
  if (closeButton === "boton") {
    layer().querySelector('button[aria-label="Salir de la vista en toda la ventana"]').click();
  } else {
    docD.activeElement.dispatchEvent(new diagramApp.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
  await sleep(50);
  assert.equal(layer(), null, `cerrar con ${closeButton} dejó la capa puesta`);
  assert.equal(docD.activeElement, expandButton, `cerrar con ${closeButton} no devolvió el foco`);
}
assert.deepEqual(diagramApp.failures, []);
diagramApp.w.close();

let activeIds = ["s1"];
let childWaiting = true;
const backgroundApp = await boot("listo", "hija-en-segundo-plano", {
  ...TASK_AFTER_QUEUE,
  list_projects: [{ id: "p", name: "Proyecto", kind: "folder", working_directory: "/lab", sources: [] }],
  list_live_sessions: () => [task("s1", null, null)],
  load_session: ({ id }) => ({ ...TASK_AFTER_QUEUE.load_session, id, turns: [] }),
  list_live_turns: () => activeIds.map((session) => ({
    session, workspace: "w", project: "p",
    started_at: Date.now() - 3_640_000, background: childWaiting,
  })),
  list_active_turns: () => activeIds,
});
const docFondo = backgroundApp.w.document;
const turnState = () => docFondo.querySelector('[role="status"]');
const labelText = () => turnState()?.getAttribute("aria-label") ?? null;
const late = () => (turnState()?.querySelector('span[aria-hidden="true"]')?.className ?? "").includes("danil-pulse");
const reconcile = async () => { backgroundApp.w.dispatchEvent(new backgroundApp.w.Event("focus")); await sleep(400); };
docFondo.querySelector('[data-sesion="s1"]').click();
await sleep(350);
assert.equal(
  labelText(), "Libre · un subagente sigue en segundo plano",
  "una ventana que no vio el evento `background` da por pensando a un agente parado",
);
assert.equal(late(), false, "la espera de una hija no lleva el punto que late");
assert.doesNotMatch(
  turnState().textContent, /60m/,
  "el reloj del turno del padre no mide la espera de su hija",
);
// El agente vuelve a escribir: la señal se apaga por donde se encendió.
childWaiting = false;
await reconcile();
assert.equal(labelText(), "El agente está trabajando", "con el agente escribiendo vuelve el rótulo de pensar");
assert.ok(late(), "y con él su punto");
assert.match(turnState().textContent, /60m/, "y su reloj, que sí es del turno que se mira");
// Y la señal no sobrevive al turno: el que cierra sin que su `done` llegue a
// esta ventana —un servicio que se releva— dejaba el rótulo de la hija puesto,
// y el turno siguiente, sin hija ninguna, decía que el agente estaba libre.
childWaiting = true;
await reconcile();
assert.equal(labelText(), "Libre · un subagente sigue en segundo plano");
activeIds = [];
await reconcile();
assert.equal(labelText(), null, "el turno cerrado no pinta estado");
activeIds = ["s1"];
childWaiting = false;
backgroundApp.emit("chat", { kind: "started", session: "s1", workspace: "w" });
await sleep(250);
assert.equal(labelText(), "El agente está trabajando", "el turno nuevo no hereda la espera del anterior");
assert.deepEqual(backgroundApp.failures, []);
backgroundApp.w.close();

// Un primer turno que Rust niega deja su aviso en el blanco, y solo ahí: la
// tarea nueva siguiente, de este proyecto o de otro, sale limpia.
const unstarted = await bootByFolder("listo", "first-turn-rejected", {
  ...RESPONSES,
  // Una tarea por carpeta: sin tareas una carpeta no tiene cabecera en el riel.
  list_live_sessions: ({ project }) => project ? [{ ...TASK_AFTER_QUEUE.list_live_sessions[0], id: `t-${project}` }] : [],
  list_projects: [
    { id: "vm", name: "VM", kind: "folder", working_directory: "/vm", sources: [] },
    { id: "calc", name: "calc", kind: "folder", working_directory: "/calc", sources: [] },
  ],
  load_queue: [],
  send_message: () => Promise.reject("chat.context.cleanup_failed"),
});
const unstartedDoc = unstarted.w.document;
const ghost = () => unstartedDoc.body.textContent.includes("No se pudo retirar una copia obsoleta");
const rejectedPrompt = "Crea un archivo hola2.txt que diga hola";
unstartedDoc.querySelector('button[aria-label="Nueva tarea en VM"]').click();
await sleep(100);
const firstPrompt = unstartedDoc.querySelector("textarea");
firstPrompt.value = rejectedPrompt;
firstPrompt.dispatchEvent(new unstarted.w.Event("input", { bubbles: true }));
firstPrompt.closest("form").dispatchEvent(new unstarted.w.Event("submit", { bubbles: true, cancelable: true }));
await sleep(150);
assert.ok(ghost(), "the rejection is said where it happened");
assert.equal(unstartedDoc.querySelector("textarea").value, rejectedPrompt, "the text comes back to retry");
assert.equal(unstartedDoc.querySelector("[data-sesion]:not([data-sesion^=\"t-\"])"), null, "no row is left for a task that was not created");
unstarted.w.dispatchEvent(new unstarted.w.KeyboardEvent("keydown", { key: "t", ctrlKey: true, metaKey: true, bubbles: true }));
await sleep(150);
assert.equal(ghost(), false, "a new task after a rejected first turn starts clean");
unstartedDoc.querySelector('button[aria-label="Nueva tarea en calc"]').click();
await sleep(150);
assert.equal(ghost(), false, "and so does one in another project");
assert.equal(unstartedDoc.body.textContent.includes(rejectedPrompt), false);
assert.deepEqual(unstarted.failures, []);

unstarted.w.close();

for (const settings of [true, false]) {
  for (const available of [true, false]) {
    let latest = { rid: 276, currentVersion: "0.2.76", version: "0.2.77", rawJson: {} };
    const installed = [];
    let checks = 0;
    let finishDownload;
    const updater = await boot("listo", `update-latest-${settings}-${available}`, {
      ...RESPONSES,
      "plugin:updater|check": () => { checks++; return latest; },
      // Rust vuelve a preguntar y baja la última; en Windows el plugin cerraría la app.
      update_install: () => {
        installed.push(latest.rid);
        return new Promise(resolve => { finishDownload = resolve; });
      },
      service_prepare_update: null,
      service_cancel_update: null,
      list_language_packs: [],
      list_bundled_language_packs: [],
      "plugin:app|version": "0.2.76",
    });
    const doc = updater.w.document;
    if (settings) {
      [...doc.querySelectorAll("button")].find(b => b.textContent.trim() === "Ahora no").click();
      doc.querySelector('button[aria-label="Configuraci\u00f3n"]').click();
      await sleep(100);
      doc.querySelector("#cfg-tab-machines").click();
      await sleep(50);
      doc.querySelector("#cfg-sub-entorno").click();
      await sleep(100);
    }
    latest = available ? { ...latest, rid: 278, version: "0.2.78" } : null;
    const install = [...doc.querySelectorAll("button")].find(b => b.textContent.trim() === "Actualizar");
    assert.ok(install, `update action is visible (settings=${settings})`);
    install.click();
    await sleep(100);
    if (available) {
      latest = { ...latest, rid: 279, version: "0.2.79" };
      const before = checks;
      const clock = Date.now;
      Date.now = () => clock() + 31 * 60 * 1000;
      try {
        updater.w.dispatchEvent(new updater.w.Event("focus"));
        await sleep(20);
        if (!settings) assert.equal(checks, before, "downloading skips background checks");
        assert.ok(doc.body.textContent.includes("0.2.78"), "downloading keeps the selected release");
      } finally { Date.now = clock; }
      finishDownload();
      await sleep(20);
    }
    assert.deepEqual(installed, available ? [278] : [], `installs the latest release (settings=${settings})`);
    assert.ok(doc.body.textContent.includes(available ? "0.2.78" : "Tienes la versi\u00f3n m\u00e1s reciente."), "shows the latest check result");
    if (available) {
      const before = checks;
      const clock = Date.now;
      Date.now = () => clock() + 31 * 60 * 1000;
      try {
        updater.w.dispatchEvent(new updater.w.Event("focus"));
        doc.dispatchEvent(new updater.w.Event("visibilitychange"));
        await sleep(20);
        if (!settings) assert.equal(checks, before, "ready to restart skips background checks");
        assert.ok(doc.body.textContent.includes("0.2.78"), "ready to restart keeps the installed version");
        assert.deepEqual(installed, [278], "does not chain downloads");
      } finally { Date.now = clock; }
    }
    assert.deepEqual(updater.failures, []);
    updater.w.close();
  }
}

let release = { rid: 277, currentVersion: "0.2.76", version: "0.2.77", rawJson: {} };
let checks = 0;
let resolveCheck;
const notice = await boot("listo", "update-focus", {
  ...RESPONSES,
  "plugin:updater|check": () => { checks++; return release; },
});
const clock = Date.now;
let elapsed = 0;
Date.now = () => clock() + elapsed;
try {
  const doc = notice.w.document;
  const focus = () => notice.w.dispatchEvent(new notice.w.Event("focus"));
  focus();
  await sleep(20);
  assert.equal(checks, 1, "focus within ten minutes does not check again");
  [...doc.querySelectorAll("button")].find(b => b.textContent.trim() === "Ahora no").click();
  elapsed = 11 * 60 * 1000;
  focus();
  await sleep(20);
  assert.ok(!doc.body.textContent.includes("Hay una versi\u00f3n nueva:"), "dismissed version stays hidden");
  elapsed += 11 * 60 * 1000;
  release = new Promise(resolve => { resolveCheck = resolve; });
  focus();
  doc.dispatchEvent(new notice.w.Event("visibilitychange"));
  await sleep(20);
  assert.equal(checks, 3, "focus and visibility share the pending check");
  resolveCheck({ rid: 278, currentVersion: "0.2.76", version: "0.2.78", rawJson: {} });
  await sleep(20);
  assert.ok(doc.body.textContent.includes("Hay una versi\u00f3n nueva: 0.2.78"), "a newer version is announced");
} finally {
  Date.now = clock;
  notice.w.close();
}

// Los árboles montados conservan sus relojes: el proceso no termina solo.
process.exit(0);
