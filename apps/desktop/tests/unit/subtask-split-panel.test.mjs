import assert from "node:assert/strict";
import test from "node:test";
import { HOME, open, openTask, row, until } from "../helpers/desktop-account.mjs";

test("subtask split panel renders side-by-side live thread with two aligned composers and independent drafts", async () => {
  const parent = { ...row("parent", "Tarea principal"), turns: 1, has_delegates: true };
  const child = { ...row("sub-1", "Aclarar repositorio en danil-labs"), turns: 1, parent: "parent", launched_by: "parent" };
  const sent = [];
  const fixture = await open("subtask-split-panel", {
    computers: [HOME],
    extra: {
      project_base_branches: [],
      list_live_sessions: () => [parent, child],
      list_delegated_sessions: () => [child],
      load_session: ({ id }) => id === "sub-1"
        ? { id: "sub-1", provider: "codex", sources: [], model: "gpt-5.6", turns: [
          { role: "user", id: "u-sub", text: "como que no esta en mi cuenta?" },
          { role: "agent", id: "a-sub", text: "El repo vive en danil-labs." },
        ] }
        : { id: "parent", provider: "codex", sources: [], model: "gpt-5.6", turns: [
          { role: "user", id: "u-main", text: "si dale, descargala aqui" },
          { role: "agent", id: "a-main", text: "Ya quede ubicado." },
        ] },
      send_message: (args) => {
        sent.push(args);
        return { id: args.session, turn_id: "t-next" };
      },
    },
  });
  try {
    const { app, doc } = fixture;
    // 1. Sidebar button renamed to "Nuevo proyecto"
    assert.ok(await until(() => doc.querySelector('[data-add-project]')));
    assert.ok(doc.querySelector('[data-add-project]').textContent.includes("Nuevo proyecto"), "el botón de proyecto dice Nuevo proyecto");

    // 2. Open parent task and verify fixed Danil top bar (location + floating toolbar buttons)
    assert.ok(await until(() => doc.querySelector('[data-sesion="parent"]')));
    await openTask(app, "parent");
    assert.ok(await until(() => doc.querySelector('[data-task-bar]')));
    const taskBar = doc.querySelector('[data-task-bar]');
    assert.ok(taskBar.className.includes("h-[38px]"), "la barra superior conserva 38 px");
    assert.ok(taskBar.querySelector('[data-task-location]'), "TaskLocation vive dentro de data-task-bar");
    assert.ok(await until(() => doc.querySelector('[data-delegated-trigger="toolbar"]')));
    const delegatedBtn = doc.querySelector('[data-delegated-trigger="toolbar"]');
    assert.ok(delegatedBtn, "los botones superiores siguen fijos en su barra original");

    // 3. Open Subtasks popover -> compact floating popover (never full height), NOT splitting yet
    delegatedBtn.click();
    assert.ok(await until(() => doc.querySelector('[data-task-popover="subtasks"]')));
    const subtasksPopover = doc.querySelector('[data-task-popover="subtasks"]');
    assert.equal(subtasksPopover.getAttribute("data-task-layout"), "popover", "el botón de rama abre un popover compacto");
    assert.ok(subtasksPopover.className.includes("rounded-lg"), "el popover conserva la tarjeta nativa de Danil");
    assert.ok(subtasksPopover.parentElement?.className.includes("self-start"), "el popover no ocupa toda la altura");

    // 4. Switch to "Todas" and click the subtask -> closes popover and docks subtask thread beside main chat
    assert.ok(await until(() => [...subtasksPopover.querySelectorAll("button")].find((b) => b.textContent === "Todas")));
    [...subtasksPopover.querySelectorAll("button")].find((b) => b.textContent === "Todas").click();
    assert.ok(await until(() => subtasksPopover.querySelector('[data-delegated-list] [data-sesion="sub-1"]')));
    subtasksPopover.querySelector('[data-delegated-list] [data-sesion="sub-1"]').click();

    assert.ok(await until(() => doc.querySelector('[data-subtask-thread="sub-1"]')));
    assert.equal(doc.querySelector('[data-task-popover="subtasks"]'), null, "al abrir una subtarea se cierra el popover de la lista");
    const splitThread = doc.querySelector('[data-subtask-thread="sub-1"]');
    const dockPanel = doc.querySelector('[data-task-files]');
    assert.equal(dockPanel?.getAttribute("data-task-layout"), "subtask-split", "al picar una subtarea se divide en dos columnas");
    assert.ok(dockPanel?.className.includes("border-l"), "línea vertical separa ambas conversaciones");
    assert.ok(doc.querySelector('[role="separator"][aria-label="Ancho del panel de archivos"]'), "hay separador deslizable entre chat principal y subhilo");
    assert.equal(splitThread.querySelector('[data-subtask-title]')?.textContent, "Aclarar repositorio en danil-labs", "el subhilo muestra el título de la subtarea");
    assert.equal(splitThread.querySelector('[data-subtask-overview]'), null, "no tiene botón de regresar a subtareas");
    assert.equal(splitThread.querySelector('[data-subtask-expand]'), null, "el subhilo no tiene botón de pantalla completa");
    assert.ok(await until(() => splitThread.textContent.includes("El repo vive en danil-labs.")), "el hilo de la subtarea carga su conversación");
    assert.ok(doc.body.textContent.includes("Ya quede ubicado."), "el hilo principal sigue visible al lado");

    // 5. Two independent live composers mounted at the same time
    const composers = [...doc.querySelectorAll("textarea")].filter((el) => !el.closest(".hidden"));
    assert.equal(composers.length, 2, "hay exactamente dos composers vivos lado a lado");
    const subTextarea = splitThread.querySelector("textarea");
    const mainTextarea = composers.find((el) => el !== subTextarea);
    assert.ok(mainTextarea && subTextarea, "chat principal y subtarea tienen composers propios");

    // Typing in each composer does not affect the other
    mainTextarea.value = "mensaje principal";
    mainTextarea.dispatchEvent(new app.w.Event("input", { bubbles: true }));
    subTextarea.value = "mensaje para subtarea";
    subTextarea.dispatchEvent(new app.w.Event("input", { bubbles: true }));
    assert.equal(mainTextarea.value, "mensaje principal");
    assert.equal(subTextarea.value, "mensaje para subtarea");

    // Sending from subtask composer targets session "sub-1", leaving main composer untouched
    subTextarea.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
    assert.ok(await until(() => sent.some((call) => call.session === "sub-1" && (call.prompt === "mensaje para subtarea" || call.text === "mensaje para subtarea"))),
      `enviar desde el composer derecho manda directamente a la subtarea (enviados=${JSON.stringify(sent)})`);
    assert.equal(mainTextarea.value, "mensaje principal", "el borrador principal no se toca al enviar en la subtarea");

    // 6. Opening Files replaces the subtask thread (mutually exclusive) side-by-side with floating card style & resize handle
    const filesBtn = doc.querySelector('button[aria-label="Archivos de la tarea"]');
    filesBtn.click();
    assert.ok(await until(() => doc.querySelector('[data-task-files]')?.getAttribute("data-task-layout") === "files-split"),
      "archivos aparece junto al chat principal separado por el tirador");
    assert.ok(doc.querySelector('[data-task-files]')?.className.includes("rounded-lg"), "archivos conserva estilo de tarjeta flotante");
    assert.ok(doc.querySelector('[role="separator"][aria-label="Ancho del panel de archivos"]'), "archivos tiene separador deslizable junto al chat");
    assert.equal(doc.querySelector('[data-subtask-thread="sub-1"]'), null, "archivos y subhilo nunca aparecen al mismo tiempo");

    // 7. Search opens as a compact floating popover without closing Files
    const searchBtn = doc.querySelector('button[aria-label="Buscar en esta tarea"]');
    searchBtn.click();
    assert.ok(await until(() => doc.querySelector('[data-task-popover="search"]')), "el buscador abre como popover flotante compacto");
    assert.ok(doc.querySelector('[data-task-popover="search"]')?.parentElement?.className.includes("self-start"), "el buscador no ocupa toda la altura");
    assert.equal(doc.querySelector('[data-task-files]')?.getAttribute("data-task-layout"), "files-split", "el buscador no cierra el panel de archivos");

    // 8. Clicking the branch button again opens the compact subtasks popover; picking sub-1 reopens it and close button dismisses it
    delegatedBtn.click();
    assert.ok(await until(() => doc.querySelector('[data-task-popover="subtasks"]')));
    const pop2 = doc.querySelector('[data-task-popover="subtasks"]');
    assert.ok(await until(() => [...pop2.querySelectorAll("button")].find((b) => b.textContent === "Todas")));
    [...pop2.querySelectorAll("button")].find((b) => b.textContent === "Todas").click();
    assert.ok(await until(() => pop2.querySelector('[data-delegated-list] [data-sesion="sub-1"]')));
    pop2.querySelector('[data-delegated-list] [data-sesion="sub-1"]').click();
    assert.ok(await until(() => doc.querySelector('[data-subtask-thread="sub-1"]')));
    doc.querySelector('[data-subtask-close]').click();
    assert.ok(await until(() => !doc.querySelector('[data-subtask-thread="sub-1"]')), "cerrar el subhilo lo cierra directamente");

    assert.deepEqual(app.failures, []);
  } finally {
    fixture.app.w.close();
  }
});
