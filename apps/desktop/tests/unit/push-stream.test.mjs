/** El stream y la paginación corren en procesos distintos: cada app conserva sus relojes. */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { chat, openTask, pushedPoll, responses, session, text, turns } from "../helpers/push-fixture.mjs";

test("con push los lotes llegan a los oyentes, el filtro sigue a la tarea y la tarea abre por load_history", async () => {
  const stream = pushedPoll();
  const filters = [];
  const app = await boot("listo", "push-stream", responses({
    service_poll: stream.poll,
    service_filter: ({ sessions }) => {
      filters.push(sessions);
      return null;
    },
    load_history: ({ id }) => session(id, turns(0, 4), { total: 4, start: 0, end: 4, limit: 150, has_more: false }),
  }));
  await sleep(600);
  await openTask(app, "t1");
  assert.ok(app.commands.includes("load_history"), "abrir no pidió load_history");
  assert.ok(!app.commands.includes("load_session"), "con push no debe leer la transcripción entera");
  assert.ok(text(app).includes("Respuesta 3"));
  assert.ok(filters.some((sessions) => sessions.includes("t1")), `el filtro no incluye la tarea abierta: ${JSON.stringify(filters)}`);

  stream.push({ events: [chat("started"), chat("delta", { text: "hola empujado" })] });
  await sleep(300);
  assert.ok(text(app).includes("hola empujado"), "el delta empujado no llegó al hilo");

  // El turno en curso se reemplaza con lo que trae el `catchup`.
  stream.push({ catchup: "t1", events: [chat("started"), chat("delta", { text: "lo que no se vio" })] });
  await sleep(300);
  assert.ok(text(app).includes("lo que no se vio"));
  assert.ok(!text(app).includes("hola empujado"), "el catchup se sumó en vez de reemplazar");

  // Sin nada que entregar, Rust espera: la ventana no sondea cada 250 ms.
  const before = stream.calls.length;
  await sleep(500);
  assert.ok(stream.calls.length - before <= 15, `${stream.calls.length - before} llamadas en 500 ms`);
  assert.deepEqual(app.failures, []);
});
