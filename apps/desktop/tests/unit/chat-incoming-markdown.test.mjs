import assert from "node:assert/strict";
import test from "node:test";
import { sleep } from "../helpers/jsdom-app.mjs";
import { boot, TASK_AFTER_QUEUE } from "../helpers/mount-guard.mjs";

test("los mensajes entrantes de agentes en globos de diálogo se muestran formateados como Markdown", async () => {
  let app;
  try {
    app = await boot("listo", "chat-incoming-markdown", {
      ...TASK_AFTER_QUEUE,
      load_session: {
        ...TASK_AFTER_QUEUE.load_session,
        turns: [
          {
            role: "user",
            id: "u-humano",
            text: "Mensaje normal de usuario humano",
          },
          {
            role: "user",
            id: "u-agente",
            text: "Hay un corte listo: **E4a, el cliente toma `terminal` del contrato.**\n\n## Detalles\n\n- viñeta 1\n- viñeta 2",
            agent: "orchestrator",
            from_task: { folder: "p1", task: "t2", title: "Mover flujos" },
          },
          {
            role: "agent",
            id: "a-respuesta",
            text: "Entendido, procedo.",
          },
        ],
      },
    });

    const doc = app.w.document;
    doc.querySelector('[data-sesion="s1"]').click();
    await sleep(300);

    // 1. Cabecera del agente emisor
    const senderHeader = doc.querySelector('[data-sender="agent"]');
    assert.ok(senderHeader, "debe mostrar la cabecera del agente emisor");
    assert.ok(senderHeader.textContent.includes("orchestrator"), "debe incluir el nombre del encargado");
    assert.ok(senderHeader.textContent.includes("Mover flujos"), "debe incluir el título de la tarea origen");

    // 2. El globo entrante de agente contiene los elementos Markdown parseados
    const strong = doc.querySelector("strong");
    assert.ok(strong, "debe renderizar la etiqueta <strong> para texto en negritas");
    assert.equal(strong.textContent.trim(), "E4a, el cliente toma terminal del contrato.");

    const code = strong.querySelector("code");
    assert.ok(code, "debe renderizar la etiqueta <code> dentro del texto en negritas");
    assert.equal(code.textContent.trim(), "terminal");

    const h2 = doc.querySelector("h2");
    assert.ok(h2, "debe renderizar la etiqueta <h2> para títulos markdown");
    assert.equal(h2.textContent.trim(), "Detalles");

    const ul = doc.querySelector("ul");
    assert.ok(ul, "debe renderizar la lista <ul>");
    const lis = doc.querySelectorAll("li");
    assert.ok(lis.length >= 2, "debe renderizar los elementos <li> de la lista");

    // 3. El mensaje humano regular NO debe renderizarse como markdown complejo, sino como texto con whitespace-pre-wrap
    const humanMsg = [...doc.querySelectorAll("p")].find((p) => p.textContent.includes("Mensaje normal de usuario humano"));
    assert.ok(humanMsg, "debe encontrar el párrafo del mensaje humano");
    assert.ok(humanMsg.classList.contains("whitespace-pre-wrap"), "el mensaje humano mantiene clase whitespace-pre-wrap");

    assert.deepEqual(app.failures, []);
  } catch (err) {
    console.error("TEST FAILED WITH ERROR:", err);
    throw err;
  } finally {
    if (app) app.w.close();
  }
});

const ENTRANTE = "/revisa el corte de @t2 y lee @docs/plan.md\n\n**Listo** con `/probar` y luego /probar\n\n<img src=x onerror=\"window.__xss=1\"><script>window.__xss=2</script> [mal](javascript:window.__xss=3)";

test("un mensaje entrante en Markdown conserva menciones, chips y la política de enlaces", async () => {
  let app;
  try {
    app = await boot("listo", "chat-incoming-marcas", {
      ...TASK_AFTER_QUEUE,
      list_slash_menu: { commands: [{ name: "revisa", description: "" }], skills: [{ name: "probar", description: "" }] },
      load_session: {
        ...TASK_AFTER_QUEUE.load_session,
        turns: [
          { role: "user", id: "u-humano", text: "Texto **sin formato** de la persona" },
          {
            role: "user",
            id: "u-agente",
            text: ENTRANTE,
            agent: "orchestrator",
            from_task: { folder: "p1", task: "t2", title: "Mover flujos" },
            task_mentions: [{ target: { kind: "task", projectId: "p1", sessionId: "t2" }, text: "@t2", start: ENTRANTE.indexOf("@t2"), end: ENTRANTE.indexOf("@t2") + 3 }],
          },
          { role: "agent", id: "a-respuesta", text: "Entendido." },
        ],
      },
    });
    const doc = app.w.document;
    doc.querySelector('[data-sesion="s1"]').click();
    await sleep(300);

    const globo = doc.querySelector('[data-sender="agent"]').closest("article");
    assert.equal(globo.querySelector("strong")?.textContent, "Listo", "el Markdown sigue pintándose");
    assert.equal(globo.querySelector("[data-kind='command']")?.textContent, "/revisa", "el comando inicial conserva su chip");
    const chips = [...globo.querySelectorAll("[data-kind='command']")].map((chip) => chip.textContent);
    assert.deepEqual(chips, ["/revisa", "/probar"], "la skill en medio del texto es chip; dentro de código no");
    assert.equal(globo.querySelector("code")?.textContent, "/probar");
    const tarea = [...globo.querySelectorAll("button")].find((b) => b.textContent === "@t2");
    assert.ok(tarea, "la mención a una tarea se puede abrir");
    assert.ok([...globo.querySelectorAll("span.font-mono")].some((s) => s.textContent === "@docs/plan.md"), "la mención a un archivo conserva su chip");

    assert.equal(globo.querySelector("img, script"), null, "el HTML crudo no se emite");
    assert.equal([...globo.querySelectorAll("a")].filter((a) => /^javascript:/i.test(a.getAttribute("href") ?? "")).length, 0);
    assert.equal(app.w.__xss, undefined);

    const buscable = globo.querySelector("[data-thread-search-text]");
    assert.ok(buscable?.textContent.includes("Listo"), "la búsqueda en el hilo lee el globo entrante");

    const persona = [...doc.querySelectorAll("p.whitespace-pre-wrap")].find((p) => p.textContent.includes("de la persona"));
    assert.ok(persona?.textContent.includes("**sin formato**"), "lo que escribe la persona no pasa por Markdown");
    assert.deepEqual(app.failures, []);
  } finally {
    if (app) app.w.close();
  }
});

const REPORTE_LARGO_AGY = [
  "Se completó la investigación, corrección y verificación en `danil-engine` para tareas sin carpeta/proyecto (`project == \"\"`).",
  "",
  "---",
  "",
  "### 1. Diagnóstico y cambios",
  "",
  "- Revisar @docs/plan.md y [`work_dir_de`](file:///Users/dev/worktrees/acrux/crates/existing-runtime/src/workspace/sessions.rs#L945-L958):",
  "  - [crates/existing-runtime/src/workspace/memory/store.rs](file:///Users/dev/worktrees/acrux/crates/existing-runtime/src/workspace/memory/store.rs#L876-L900): `migrate_project_if_needed_con_proyecto_vacio_no_lee_projects_memoria`",
  "  - [crates/existing-runtime/src/workspace/sessions.rs](file:///Users/dev/worktrees/acrux/crates/existing-runtime/src/workspace/sessions.rs#L6218-L6660):",
  "    - `detach_session_source_en_tarea_sin_proyecto_no_falla`",
  "    - `ciclo_completo_de_tarea_sin_proyecto_en_workspace_vacio_y_borrado_garantizado`",
  "",
  "**Resultados de verificación**:",
  "- **TDD rojo → verde**: las 5 pruebas de regresión fallaron en `origin/dev` antes de los fixes y pasaron tras aplicarlos.",
  "- **Git / higiene**: commit `6a8a4e8a` en `feat/folderless-task-general-dir` (sin `target/` dentro del worktree; sin merge ni push).",
].join("\n");

function boundedSession(turns, detailByTurn) {
  return (args) => {
    const req = args?.history_request;
    if (req?.kind === "detail") {
      const text = detailByTurn.get(req.turn);
      if (text === undefined) throw new Error("detail unavailable");
      const encoded = JSON.stringify(text);
      return {
        version: 1,
        turn: req.turn,
        pointer: req.pointer,
        offset: 0,
        next: encoded.length,
        total: encoded.length,
        done: true,
        revision: "r1",
        text: encoded,
      };
    }
    return {
      ...TASK_AFTER_QUEUE.load_session,
      turns,
      history: { version: 1, revision: "r1", total: turns.length, start: 0, end: turns.length, limit: 100, has_more: false },
    };
  };
}

test("un mensaje entrante largo cargado por history_refs se encierra dentro del globo y debajo de la cabecera", async () => {
  let app;
  try {
    const turns = [
      {
        role: "user",
        id: "u-agy-largo",
        at: 1795510667688,
        text: "",
        from_task: {
          folder: "zhzk2jyy",
          task: "q1jt79km",
          title: "Engine: tareas sin carpeta con subcarpeta general dedicada y limpieza al borrar",
          provider: "antigravity",
          model: "gemini-4-neon",
        },
        history_refs: [{ version: 1, turn: 0, pointer: "/text", bytes: REPORTE_LARGO_AGY.length + 2, revision: "r1" }],
      },
      {
        role: "agent",
        id: "a-siguiente",
        at: 1795510764036,
        duration_ms: 96344,
        text: "Recibido.",
      },
    ];
    app = await boot("listo", "chat-incoming-history-refs", {
      ...TASK_AFTER_QUEUE,
      load_session: boundedSession(turns, new Map([[0, REPORTE_LARGO_AGY]])),
    });

    const doc = app.w.document;
    doc.querySelector('[data-sesion="s1"]').click();
    await sleep(400);

    const senderHeader = doc.querySelector('[data-sender="task"]');
    assert.ok(senderHeader, "debe mostrar la cabecera de la tarea emisora");
    const article = senderHeader.closest("article");
    assert.ok(article, "debe existir el contenedor <article> del mensaje");
    const bubble = article.querySelector(".bg-chat-incoming");
    assert.ok(bubble, "debe existir el globo entrante .bg-chat-incoming");

    // La cabecera debe preceder al globo en el DOM
    assert.ok(
      (senderHeader.compareDocumentPosition(bubble) & 4) !== 0,
      "la cabecera del remitente debe aparecer antes del globo",
    );

    // Todo el contenido cargado desde history_refs debe vivir DENTRO del globo entrante, nunca afuera ni arriba
    assert.ok(
      bubble.textContent.includes("Resultados de verificación"),
      "el texto cargado desde history_refs debe quedar dentro de .bg-chat-incoming",
    );
    assert.ok(
      bubble.textContent.includes("dentro del worktree; sin merge ni push)."),
      "el cierre del reporte debe quedar dentro de .bg-chat-incoming",
    );
    assert.ok(
      bubble.querySelector("h3") && bubble.querySelector("ul ul") && bubble.querySelector("hr"),
      "el Markdown (encabezados, listas anidadas y separadores) debe renderizarse dentro del globo",
    );
    assert.ok(
      [...article.querySelectorAll("h3, ul, hr, code")].every((el) => bubble.contains(el)),
      "ningún bloque del reporte puede quedar fuera de .bg-chat-incoming",
    );

    // Debe pasar por MessageText: búsqueda en el hilo y chips de menciones conservados
    const searchable = bubble.querySelector("[data-thread-search-text]");
    assert.ok(searchable?.textContent.includes("Resultados de verificación"), "el texto cargado debe quedar indexado en data-thread-search-text dentro del globo");
    assert.ok(
      [...bubble.querySelectorAll("span.font-mono")].some((s) => s.textContent === "@docs/plan.md"),
      "las menciones en un mensaje entrante cargado por history_refs deben conservar su chip",
    );

    // Clases defensivas de contención horizontal en el árbol del globo
    assert.ok(article.className.includes("min-w-0") && article.className.includes("max-w-[80%]"), "el artículo limita el ancho al 80% con min-w-0");
    assert.ok(bubble.className.includes("min-w-0") && bubble.className.includes("max-w-full"), "el globo conserva min-w-0 y max-w-full");
    assert.ok(searchable.className.includes("min-w-0") && searchable.className.includes("max-w-full"), "el envoltorio MessageText conserva min-w-0 y max-w-full");

    // El botón de copiar debe aparecer una vez resuelto el texto de history_refs
    const actionRow = article.lastElementChild;
    const copyBtn = actionRow?.querySelector("button[aria-label]");
    assert.ok(copyBtn, "el botón de copiar debe estar disponible para mensajes cargados vía history_refs");

    assert.deepEqual(app.failures, []);
  } finally {
    if (app) app.w.close();
  }
});

test("un mensaje largo de encargado y uno de la persona cargados por history_refs quedan dentro de su globo con su formato propio", async () => {
  let app;
  try {
    const humanoLargo = "Texto humano **sin formato** con línea muy larga: " + "palabra_larga_".repeat(8);
    const encargadoLargo = "Resumen del **encargado** con `codigo_largo_sin_espacios_en_burbuja_entrante`";
    const turns = [
      {
        role: "user",
        id: "u-persona-larga",
        at: 1795510600000,
        text: "",
        history_refs: [{ version: 1, turn: 0, pointer: "/text", bytes: humanoLargo.length + 2, revision: "r1" }],
      },
      {
        role: "user",
        id: "u-encargado-largo",
        at: 1795510610000,
        text: "",
        agent: "orchestrator",
        history_refs: [{ version: 1, turn: 1, pointer: "/text", bytes: encargadoLargo.length + 2, revision: "r1" }],
      },
      {
        role: "agent",
        id: "a-fin",
        text: "Hecho.",
      },
    ];
    app = await boot("listo", "chat-user-and-agent-history-refs", {
      ...TASK_AFTER_QUEUE,
      load_session: boundedSession(turns, new Map([[0, humanoLargo], [1, encargadoLargo]])),
    });

    const doc = app.w.document;
    doc.querySelector('[data-sesion="s1"]').click();
    await sleep(400);

    // 1. Mensaje de la persona: dentro de .bg-chat-user y sin parsear como Markdown
    const userBubble = doc.querySelector(".bg-chat-user");
    assert.ok(userBubble, "debe existir el globo de la persona .bg-chat-user");
    const userP = userBubble.querySelector("p.whitespace-pre-wrap");
    assert.ok(userP?.textContent.includes("**sin formato**"), "el mensaje humano de history_refs va dentro de .bg-chat-user como texto plano");
    const userArticle = userBubble.closest("article");
    assert.equal(userArticle.querySelector("strong"), null, "el mensaje humano de history_refs no debe parsearse como Markdown");

    // 2. Mensaje de encargado: dentro de .bg-chat-incoming, debajo de [data-sender="agent"] y en Markdown
    const agentHeader = doc.querySelector('[data-sender="agent"]');
    assert.ok(agentHeader, "debe existir cabecera del encargado");
    const agentArticle = agentHeader.closest("article");
    const incomingBubble = agentArticle.querySelector(".bg-chat-incoming");
    assert.ok(incomingBubble, "debe existir globo del encargado .bg-chat-incoming");
    assert.ok(incomingBubble.querySelector("strong")?.textContent === "encargado", "el texto del encargado va en Markdown dentro de .bg-chat-incoming");
    assert.ok(incomingBubble.querySelector("code")?.textContent.includes("codigo_largo_sin_espacios"), "el código inline va dentro de .bg-chat-incoming");

    assert.deepEqual(app.failures, []);
  } finally {
    if (app) app.w.close();
  }
});

test("si falla la lectura de history_refs, el botón de respaldo también queda dentro del globo y debajo de la cabecera", async () => {
  let app;
  try {
    const turns = [
      {
        role: "user",
        id: "u-fallo-detail",
        at: 1795510667688,
        text: "",
        from_task: { folder: "p1", task: "t2", title: "Tarea con detalle fallido", provider: "antigravity" },
        history_refs: [{ version: 1, turn: 0, pointer: "/text", bytes: 12000, revision: "r1" }],
      },
    ];
    app = await boot("listo", "chat-incoming-history-refs-fallback", {
      ...TASK_AFTER_QUEUE,
      load_session: boundedSession(turns, new Map()),
    });

    const doc = app.w.document;
    doc.querySelector('[data-sesion="s1"]').click();
    // Esperar a que agoten los reintentos de readDetailText o a que aparezca el fallback
    const deadline = Date.now() + 5000;
    let fallbackBtn = null;
    while (Date.now() < deadline) {
      const article = doc.querySelector('[data-sender="task"]')?.closest("article");
      fallbackBtn = article ? [...article.querySelectorAll("button")].find((b) => /KiB/.test(b.textContent ?? "")) : null;
      if (fallbackBtn) break;
      await sleep(100);
    }
    const senderHeader = doc.querySelector('[data-sender="task"]');
    const article = senderHeader.closest("article");
    const bubble = article.querySelector(".bg-chat-incoming");
    assert.ok(fallbackBtn, "debe mostrar el botón de respaldo para abrir el contenido");
    assert.ok(bubble.contains(fallbackBtn), "el botón de respaldo de history_refs debe quedar dentro de .bg-chat-incoming");
    assert.ok((senderHeader.compareDocumentPosition(fallbackBtn) & 4) !== 0, "el botón de respaldo debe aparecer debajo de la cabecera del remitente");
  } finally {
    if (app) app.w.close();
  }
});

