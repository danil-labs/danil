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
