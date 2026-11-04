/** Paginar el historial conserva los mensajes que ya estaban montados. */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { openTask, pushedPoll, responses, session, text, turns } from "../helpers/push-fixture.mjs";

test("subir hasta arriba pide la página anterior y la antepone sin remontar lo que había", async () => {
  const stream = pushedPoll();
  const pages = [];
  const app = await boot("listo", "push-older", responses({
    service_poll: stream.poll,
    service_filter: null,
    load_history: ({ id, before }) => {
      pages.push(before);
      // La página solapa un turno con lo cargado: es lo que prueba que encajan.
      return before === 31
        ? session(id, turns(0, 31), { total: 60, start: 0, end: 31, limit: 150, has_more: false })
        : session(id, turns(30, 60), { total: 60, start: 30, end: 60, limit: 150, has_more: true });
    },
  }));
  // El borde de arriba del hilo: se le avisa a mano que entró en la vista.
  const edges = [];
  globalThis.IntersectionObserver = app.w.IntersectionObserver = class {
    constructor(callback, options) {
      if (options?.rootMargin === "1200px 0px 0px 0px") edges.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
  await sleep(600);
  await openTask(app, "t1");
  assert.deepEqual(pages, [null]);
  assert.ok(text(app).includes("Respuesta 59"));
  assert.ok(!text(app).includes("Pregunta 30"), "abrir montó más que los dos últimos tramos");
  const last = [...app.w.document.querySelectorAll("*")].find((el) => el.children.length === 0 && el.textContent === "Respuesta 59");
  assert.ok(last);
  for (let i = 0; i < 12 && !text(app).includes("Pregunta 0"); i++) {
    for (const edge of edges) edge([{ isIntersecting: true }]);
    await sleep(150);
  }
  assert.equal(pages.filter((before) => before === 31).length, 1, `páginas pedidas: ${JSON.stringify(pages)}`);
  assert.ok(pages.every((before) => before === null || before === 31));
  assert.ok(text(app).includes("Pregunta 0"), "la página anterior no llegó al hilo");
  assert.ok(last.isConnected, "anteponer remontó lo que ya estaba pintado");
  assert.deepEqual(app.failures, []);
});
