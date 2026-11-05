import assert from "node:assert/strict";
import { test } from "node:test";
import { createEffect, createResource, createRoot, createSignal } from "solid-js";
import { forgetRosters, lastRoster, rememberRoster, watchRoster } from "../../src/lib/handlerRoster.ts";
import type { HandlerDefinition } from "../../src/lib/model.ts";

const luego = () => new Promise((listo) => setTimeout(listo, 0));

const encargado = (name: string): HandlerDefinition => ({
  name,
  description: "",
  instructions: "",
  tools: [],
  model: null,
  origin: "repo",
  folder: null,
  providers: [],
  own: false,
  own_scope: null,
});

test("refrescar el recurso conserva lo que ya trajo: no pasa por vacío", async () => {
  await createRoot(async (dispose) => {
    forgetRosters();
    const [creados, setCreados] = createSignal(0);
    const vistos: (HandlerDefinition[] | undefined)[] = [];
    const [encargados] = createResource(
      () => `app:${creados()}`,
      async () => [encargado("ada")],
    );
    createEffect(() => vistos.push(encargados()));
    await luego();
    setCreados(1);
    await luego();
    await luego();
    assert.ok(!vistos.slice(1).some((v) => v === undefined), "un refresco no debe vaciar la lista");
    dispose();
  });
});

test("una fila que vuelve a montar nace con lo último que se supo, no vacía", async () => {
  forgetRosters();
  rememberRoster("app", [encargado("ada")]);
  await createRoot(async (dispose) => {
    const [encargados] = createResource(() => "app:0", async () => [encargado("ada")]);
    const roster = () => encargados() ?? lastRoster("app");
    const plegada: boolean[] = [];
    createEffect(() => plegada.push((roster()?.length ?? 0) === 0));
    await luego();
    assert.ok(!plegada.includes(true), "la sección no debe plegarse en ningún instante");
    dispose();
  });
});

test("una lista que falla se vuelve a pedir: el dock aparece cuando el motor contesta", async () => {
  forgetRosters();
  await createRoot(async (dispose) => {
    let llamadas = 0;
    const roster = watchRoster(
      "app",
      async () => {
        llamadas += 1;
        if (llamadas < 3) throw new Error("engine_down");
        return [encargado("ada")];
      },
      () => 0,
      [0, 0],
    );
    for (let i = 0; i < 10 && roster().length === 0; i += 1) await luego();
    assert.equal(llamadas, 3);
    assert.deepEqual(roster().map((a) => a.name), ["ada"]);
    assert.deepEqual(lastRoster("app")?.map((a) => a.name), ["ada"]);
    dispose();
  });
});

test("los intentos tienen fin y un refresco los reinicia", async () => {
  forgetRosters();
  await createRoot(async (dispose) => {
    let llamadas = 0;
    const [altas, setAltas] = createSignal(0);
    const roster = watchRoster(
      "app",
      async () => {
        llamadas += 1;
        throw new Error("io");
      },
      altas,
      [0, 0],
    );
    for (let i = 0; i < 10; i += 1) await luego();
    assert.equal(llamadas, 3, "el primero y dos reintentos");
    assert.deepEqual(roster(), []);
    setAltas(1);
    for (let i = 0; i < 10; i += 1) await luego();
    assert.equal(llamadas, 6, "un refresco vuelve a tener sus reintentos");
    dispose();
  });
});
