/**
 * The desktop signed in to the Danil account adds the tasks of the other
 * computers of the person to its own (`features/machines/router.ts`): its own
 * engine stays on the native IPC, paints first and keeps its ids; each other
 * computer is a relay session that only adds its slice. A call goes to another
 * machine only by its envelope (the `x-terminus-machine` header), never by an
 * id in its arguments. Signed out, nothing changes.
 * Mounts `dist/` with a simulated IPC (the local engine) and a fake relay.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { engine } from "../helpers/fake-relay.mjs";
import { HOME, localNewTask, MAC, open, remote, row, until, VM } from "../helpers/desktop-account.mjs";
import { sleep } from "../helpers/jsdom-app.mjs";

test("Cuenta de Danil lists the account's computers; a name edited in place reaches «Ejecutar en» without restarting", async () => {
  const seen = new Date(Date.now() - 60_000).toISOString();
  const computers = [HOME, { ...VM, state: "online" }, { ...MAC, state: "offline", last_seen: seen }];
  const { app, doc, f, renamed } = await open("desktop-account-computers", {
    computers,
    relays: {
      cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "online" },
      cmp_mac: { table: remote("Notas", "Tarea del Mac"), state: "online" },
    },
    onRename: (_, name) => (name.includes("!") ? { status: 400, code: "invalid_name" } : null),
    extra: { work_status: { ahead: 0, dirty: false, files: [], large: [], submodules: [] } },
  });
  const w = app.w;
  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "machines" }));
  assert.ok(await until(() => doc.querySelectorAll("[data-account-computer]").length === 3), "the three computers of the account");
  const rowOf = (id) => doc.querySelector(`[data-account-computer="${id}"]`);
  const home = rowOf("cmp_home");
  assert.ok(home.hasAttribute("data-self"));
  assert.ok(home.textContent.includes("Mi Mac(esta computadora)"), home.textContent);
  assert.match(home.querySelector("[data-computer-kind]").textContent, /^Esta (Mac|PC)$/);
  assert.equal(rowOf("cmp_vm").querySelector("[data-computer-kind]").textContent, "VM de Danil");
  assert.equal(rowOf("cmp_vm").querySelector("[data-computer-state]").textContent, "en línea");
  assert.equal(rowOf("cmp_mac").querySelector("[data-computer-kind]").textContent, "Máquina propia");
  assert.match(rowOf("cmp_mac").querySelector("[data-computer-state]").textContent, /^apagada · visto \d{1,2}:\d{2}/);

  const edit = async (id, value, key = null) => {
    rowOf(id).querySelector("[data-computer-name]")?.click();
    assert.ok(await until(() => rowOf(id).querySelector("[data-computer-name-input]")), "the name turns into a field");
    const input = rowOf(id).querySelector("[data-computer-name-input]");
    input.value = value;
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
    if (key) input.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true }));
    else input.form.requestSubmit();
    await sleep(300);
  };

  // Esc cancels without asking the control plane, and Configuración stays open.
  await edit("cmp_vm", "Otra cosa", "Escape");
  assert.equal(rowOf("cmp_vm").querySelector("[data-computer-name-input]"), null);
  assert.ok(rowOf("cmp_vm").textContent.includes("Danil VM"));
  assert.equal(renamed.length, 0);

  // A refused name says why and keeps the field.
  await edit("cmp_vm", "VM!");
  assert.equal(renamed.length, 1);
  assert.equal(rowOf("cmp_vm").querySelector("[data-rename-error]")?.textContent, "El nombre debe tener de 1 a 60 caracteres, sin saltos de línea.");
  assert.ok(rowOf("cmp_vm").querySelector("[data-computer-name-input]"), "the field stays to fix it");

  await edit("cmp_vm", "  VM de trabajo ");
  assert.deepEqual(renamed.at(-1), { id: "cmp_vm", name: "VM de trabajo", authorization: "Bearer client-tok", type: "application/json" });
  assert.ok(await until(() => rowOf("cmp_vm").querySelector("[data-computer-name]")?.textContent.startsWith("VM de trabajo")), "the row shows the new name");
  assert.equal(rowOf("cmp_vm").querySelector("[data-rename-error]"), null);

  // The window's own name, also in «Esta computadora: …» of Cuenta › Perfil.
  await edit("cmp_home", "Mac del estudio");
  assert.ok(await until(() => rowOf("cmp_home").querySelector("[data-computer-name]")?.textContent.startsWith("Mac del estudio")));
  doc.querySelector("#cfg-tab-account").click();
  assert.ok(await until(() => doc.body.textContent.includes("Esta computadora: Mac del estudio")));

  await sleep(1_200);
  doc.querySelector('[aria-label="Cerrar configuración (Esc)"]').click();
  assert.ok(await until(() => !doc.querySelector("[data-danil-account]")), "Configuración closes");
  localNewTask(doc).click();
  assert.ok(await until(() => doc.querySelector('[aria-label="Ejecutar en"]')), "the composer offers «Ejecutar en»");
  doc.querySelector('[aria-label="Ejecutar en"]').click();
  assert.ok(
    await until(() => doc.querySelector('[data-machine-option="cmp_vm"]')?.textContent.includes("VM de trabajo")),
    doc.querySelector('[data-machine-option="cmp_vm"]')?.textContent ?? "no option",
  );
  assert.equal(f.relays.cmp_vm.sockets.length, 1, "renaming does not reconnect the machine");
  assert.deepEqual(app.failures, []);
});

test("el composer ofrece los modelos autenticados de la máquina seleccionada", async () => {
  const { app, doc, relayCalls } = await open("desktop-composer-machine", {
    computers: [HOME, { ...MAC, state: "online" }],
    relays: { cmp_mac: { table: remote("Panel", "Tarea del Mac", {
      list_surfaces: [{ id: "claude", provider: "claude", label: "Claude Code", catalogo: "todo", usable: true, marca: null, porque: null }],
      list_models: ({ provider }) => ({ provider, models: [{ id: "remote-sonnet", label: "Sonnet del Mac", efforts: [], default_effort: null }], fallback: false }),
    }) } },
  });
  doc.querySelector('[aria-label="Ejecutar en"]').click();
  await sleep(150);
  doc.querySelector('[data-machine-option="cmp_mac"]').click();
  await sleep(600);
  assert.ok(relayCalls("cmp_mac", "list_surfaces").length, "el Mac no recibió la consulta de credenciales");
  assert.ok(doc.querySelector('[aria-label*="Sonnet del Mac"]'), "el composer conserva el modelo del motor local");
  doc.querySelector('[aria-label="Ejecutar en"]').click();
  await sleep(150);
  doc.querySelector('[data-machine-option="cmp_home"]').click();
  await sleep(600);
  assert.equal(doc.querySelector('[aria-label*="Sonnet del Mac"]'), null, "el modelo remoto sigue al volver a esta máquina");
  assert.deepEqual(app.failures, []);
});


test("one desktop uses the shared spaces order instead of an old local preference and refreshes on focus", async () => {
  const spaces = [
    { id: "a", name: "Alpha", folders: ["p1"], created_at: 1, updated_at: 1, account: true },
    { id: "b", name: "Beta", folders: ["p1"], created_at: 2, updated_at: 2, account: true },
  ];
  const registry = [{ id: "w", name: "W", projects: [], computers: ["cmp_home"], settings_version: 1,
    settings: { space_order: '["a","b"]' }, spaces: spaces.map((space, position) => ({ ...space, position, changed_at: 1 })) }];
  const { app, doc } = await open("desktop-account-space-order", {
    computers: [HOME], registry, extra: { list_spaces: spaces },
    storage: { "harness.layout.spaces.order.w": '["b","a"]' },
  });
  // The spaces are listed in the strip's space menu, which opens on click.
  const ids = () => {
    if (!doc.querySelector("[data-space-list]")) doc.querySelector("[data-title-bar] [data-space-menu]")?.click();
    return [...doc.querySelectorAll("[data-space-list] [data-space]")].map(node => node.getAttribute("data-space"));
  };
  assert.ok(await until(() => ids().join(",") === "a,b"), "the account wins over an old local order with only this machine");
  assert.equal(app.w.localStorage.getItem("harness.layout.spaces.order.w"), '["a","b"]');
  registry[0].settings.space_order = '["b","a"]';
  app.w.dispatchEvent(new app.w.Event("focus"));
  assert.ok(await until(() => ids().join(",") === "b,a"), "an order changed on another client reaches the open window");
  assert.deepEqual(app.failures, []);
});

for (const folder of ["", "p1"]) test(`remote row in folder ${JSON.stringify(folder)} stays open across a delayed load in another machine's space`, async () => {
  const a = { account: true, id: "sa", name: "QA A", folders: ["p1"], created_at: 1, updated_at: 1 };
  const b = { account: true, id: "sb", name: "QA B", folders: ["p1"], created_at: 2, updated_at: 2 };
  const { app, doc, relayCalls } = await open(`remote-row-spaces-${folder || "root"}`, {
    computers: [HOME, { ...VM, state: "online" }],
    registry: [{ id: "w", name: "W", projects: [], spaces: [a, b], computers: ["cmp_home", "cmp_vm"], settings_version: 1, settings: {} }],
    extra: { list_spaces: [a, b], list_live_sessions: ({ project: p }) => p === "p1" ? [{ ...row("local", "Local A"), space: "sa" }] : [] },
    relays: { cmp_vm: { state: "online", table: remote("Remote", "Remote B", {
      list_spaces: [b],
      list_live_sessions: ({ project: p }) => p === folder ? [{ ...row("t1", "Remote B"), turns: 1, space: "sb" }] : [],
      load_session: async ({ id }) => {
        await sleep(150);
        return { ...engine.load_session({ id }), turns: [{ role: "assistant", text: "Remote transcript B" }] };
      },
    }) } },
  });
  doc.querySelector("[data-title-bar] [data-space-menu]").click();
  assert.ok(await until(() => doc.querySelector('[data-space-list] [data-space="sb"]')), "the space menu lists the other machine's space");
  doc.querySelector('[data-space-list] [data-space="sb"]').click();
  await sleep(200);
  const target = doc.querySelector('[data-sesion="cmp_vm~t1"]');
  assert.ok(target);
  target.dispatchEvent(new app.w.PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse", clientX: 100, clientY: 100 }));
  target.dispatchEvent(new app.w.PointerEvent("pointerup", { bubbles: true, button: 0, pointerType: "mouse", clientX: 100, clientY: 100 }));
  target.click();
  await sleep(800);
  assert.equal(relayCalls("cmp_vm", "load_session").length, 1);
  assert.ok(doc.querySelector('[data-preview-header]'), "the temporary tab remains");
  assert.ok(doc.body.textContent.includes("Remote transcript B"), "the loaded conversation remains visible");
  assert.deepEqual(app.failures, []);
  app.w.close();
});

test("el composer pide proyectos y ramas a la máquina elegida", async () => {
  const branches = { branches: [{ reference: "refs/heads/vm-dev", name: "vm-dev", remote: false, commit: "abc", ahead: null, behind: null }], selected: "refs/heads/vm-dev", fetched_at: null };
  const { app, doc, relayCalls, native } = await open("desktop-composer-target", {
    computers: [HOME, { ...VM, state: "online" }],
    relays: { cmp_vm: { table: remote("Proyecto de la VM", "Tarea VM", { project_base_branches: branches }) } },
    extra: { project_base_branches: { branches: [], selected: null, fetched_at: null } },
  });
  doc.querySelector('button[aria-label="Ejecutar en"]').click();
  await sleep(100);
  doc.querySelector('[data-machine-option="cmp_vm"]').click();
  await sleep(300);
  doc.querySelector('button[aria-label="Proyecto"]').click();
  await sleep(100);
  const option = [...doc.querySelectorAll("button")].find(b => b.textContent.includes("Proyecto de la VM") && b.closest('[role="dialog"]'))
    ?? [...doc.querySelectorAll("button")].find(b => b.textContent.includes("Proyecto de la VM") && b.textContent.includes("tarea"));
  assert.ok(option, "el selector ofrece el proyecto de la VM");
  option.click();
  await sleep(400);
  assert.ok(relayCalls("cmp_vm", "project_base_branches").some(c => c.args.project === "p1"));
  assert.equal(native("project_base_branches").length, 0, "la rama local no se consulta");
  assert.ok(doc.body.textContent.includes("vm-dev"), "el selector muestra la rama de esa máquina");
  assert.deepEqual(app.failures, []);
});

// With a single window there is no edge to split on: a drop near an edge opens in the window too.
for (const [name, x, y, cells] of [["center", 500, 400, 1], ["right", 950, 400, 1], ["down", 500, 750, 1]]) {
  test(`rail task drops into ${name} without opening on pointerdown and keeps remote identity`, async () => {
    const { app, doc, relayCalls } = await open(`rail-drop-${name}`, {
      computers: [HOME, { ...VM, state: "online" }],
      relays: { cmp_vm: { state: "online", table: remote("Remote", "Remote drag") } },
    });
    try {
      const target = doc.querySelector('[data-sesion="cmp_vm~t1"]');
      assert.ok(target);
      const panel = doc.querySelector('[data-ventana]:not([data-tira])');
      assert.ok(panel);
      panel.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 });
      doc.elementFromPoint = () => panel;
      const pointer = (type, px, py, buttons = 1) => new app.w.PointerEvent(type, {
        bubbles: true, button: 0, buttons, pointerId: 1, isPrimary: true, clientX: px, clientY: py,
      });
      target.dispatchEvent(pointer("pointerdown", 100, 100));
      assert.equal(relayCalls("cmp_vm", "load_session").length, 0);
      app.w.dispatchEvent(pointer("pointermove", x, y));
      app.w.dispatchEvent(pointer("pointerup", x, y, 0));
      await sleep(700);
      assert.equal(relayCalls("cmp_vm", "load_session").length, 1);
      assert.equal(doc.querySelectorAll('[data-preview-header]').length, 0, "the dropped task is retained");
      const sites = new Set([...doc.querySelectorAll('[data-tira]')].map(el => el.dataset.ventana));
      assert.equal(sites.size, cells);
      assert.deepEqual(app.failures, []);
    } finally {
      app.w.close();
    }
  });
}

test("rail drag cancels with Escape and preserves a subsequent normal click", async () => {
  const { app, doc, relayCalls } = await open("rail-drag-cancel", {
    computers: [HOME, { ...VM, state: "online" }],
    relays: { cmp_vm: { state: "online", table: remote("Remote", "Remote cancel") } },
  });
  try {
    const target = doc.querySelector('[data-sesion="cmp_vm~t1"]');
    const panel = doc.querySelector('[data-ventana]:not([data-tira])');
    doc.elementFromPoint = () => panel;
    const pointer = (type, x, buttons = 1) => new app.w.PointerEvent(type, {
      bubbles: true, button: 0, buttons, pointerId: 7, isPrimary: true, clientX: x, clientY: 100,
    });
    target.dispatchEvent(pointer("pointerdown", 100));
    app.w.dispatchEvent(pointer("pointermove", 500));
    app.w.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    app.w.dispatchEvent(pointer("pointerup", 500, 0));
    await sleep(100);
    assert.equal(relayCalls("cmp_vm", "load_session").length, 0);
    assert.equal(doc.querySelectorAll('[role="tab"]').length, 0);
    target.dispatchEvent(pointer("pointerdown", 100));
    app.w.dispatchEvent(pointer("pointerup", 100, 0));
    target.click();
    await sleep(700);
    assert.equal(relayCalls("cmp_vm", "load_session").length, 1);
    assert.ok(doc.querySelector('[data-preview-header]'), "normal click still opens a preview");
    assert.deepEqual(app.failures, []);
  } finally {
    app.w.close();
  }
});

test("rail folder drops still move the task on its own machine without opening a tab", async () => {
  const { app, doc, relayCalls } = await open("rail-folder-drop", {
    computers: [HOME, { ...VM, state: "online" }],
    relays: { cmp_vm: { state: "online", table: remote("Remote", "Remote move", { move_session: null }) } },
  });
  try {
    const target = doc.querySelector('[data-sesion="cmp_vm~t1"]');
    const folder = doc.createElement("div");
    folder.dataset.destino = "p2";
    doc.body.append(folder);
    doc.elementFromPoint = () => folder;
    const pointer = (type, x, buttons = 1) => new app.w.PointerEvent(type, {
      bubbles: true, button: 0, buttons, pointerId: 2, isPrimary: true, clientX: x, clientY: 100,
    });
    target.dispatchEvent(pointer("pointerdown", 100));
    app.w.dispatchEvent(pointer("pointermove", 500));
    app.w.dispatchEvent(pointer("pointerup", 500, 0));
    await sleep(200);
    const moves = relayCalls("cmp_vm", "move_session");
    assert.equal(moves.length, 1);
    assert.equal(moves[0].args.id, "t1");
    assert.equal(moves[0].args.to, "p2");
    assert.equal(relayCalls("cmp_vm", "load_session").length, 0);
    assert.equal(doc.querySelectorAll('[role="tab"]').length, 0);
    assert.deepEqual(app.failures, []);
  } finally {
    app.w.close();
  }
});

test("dragging an existing task preview retains that same tab", async () => {
  const { app, doc, relayCalls } = await open("rail-preview-drop", {
    computers: [HOME, { ...VM, state: "online" }],
    relays: { cmp_vm: { state: "online", table: remote("Remote", "Remote preview") } },
  });
  try {
    doc.querySelector('[data-sesion="cmp_vm~t1"]').click();
    await sleep(700);
    assert.ok(doc.querySelector('[data-preview-header]'));
    const target = doc.querySelector('[data-sesion="cmp_vm~t1"]');
    const panel = doc.querySelector('[data-ventana]:not([data-tira])');
    doc.elementFromPoint = () => panel;
    const pointer = (type, x, buttons = 1) => new app.w.PointerEvent(type, {
      bubbles: true, button: 0, buttons, pointerId: 3, isPrimary: true, clientX: x, clientY: 100,
    });
    target.dispatchEvent(pointer("pointerdown", 100));
    app.w.dispatchEvent(pointer("pointermove", 500));
    app.w.dispatchEvent(pointer("pointerup", 500, 0));
    await sleep(100);
    assert.equal(doc.querySelectorAll('[data-preview-header]').length, 0);
    assert.equal(doc.querySelectorAll('[role="tab"]').length, 1);
    assert.ok(relayCalls("cmp_vm", "load_session").every(call => call.args.id === "t1"));
    assert.deepEqual(app.failures, []);
  } finally {
    app.w.close();
  }
});
