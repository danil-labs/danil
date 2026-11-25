import assert from "node:assert/strict";
import test from "node:test";

import { listaBasta, reconciliar } from "../../../../packages/features/settings/src/model/early-startup.ts";
import { mountAfterLanguagePacks } from "../../src/locales/startup.ts";
import { untilConnected } from "../../../../packages/engine-client/src/client.ts";
import "../helpers/catalog.ts";
import { aplicarLenguaDeWorkspace, elegirLengua, lengua, refreshLanguage } from "../../src/lib/i18n.ts";

/**
 * La ventana no espera a `workspaces_startup`. El arranque migra dentro y
 * ha tardado minutos; la lista ligera abre la ventana y el arranque la
 * confirma. Lo que no se adelanta es el alta ni la negativa (`bloqueo`).
 */

const ws = (...ids: string[]) => ids.map((id) => ({ id }));

test("un catálogo que espera al motor no bloquea el lanzador que lo conecta", { timeout: 1000 }, async () => {
  let connect!: () => void;
  const ready = new Promise<void>((done) => { connect = done; });
  let calls = 0;
  let mounts = 0;
  const packs = untilConnected(async () => {
    if (++calls === 1) throw { code: "engine_down" };
    return [];
  }, () => false, () => ready);
  await mountAfterLanguagePacks(packs, () => { mounts++; connect(); }, 20);
  await packs;
  assert.equal(calls, 2);
  assert.equal(mounts, 1);
});

test("catálogo disponible o rechazado monta sin esperar el plazo", async () => {
  let mounts = 0;
  await mountAfterLanguagePacks(Promise.resolve([]), () => { mounts++; });
  await mountAfterLanguagePacks(Promise.reject(new Error("unreadable")), () => { mounts++; });
  assert.equal(mounts, 2);
});

test("el catálogo tardío conserva la lengua del workspace elegida tras montar", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } });
  try {
    elegirLengua("en");
    let finish!: () => void;
    const packs = new Promise<void>((done) => { finish = done; }).then(refreshLanguage);
    await mountAfterLanguagePacks(packs, () => aplicarLenguaDeWorkspace("es"), 20);
    finish();
    await packs;
    assert.equal(lengua(), "es");
    assert.equal(values.get("harness:lengua:ultima"), "es");
    assert.equal(values.get("harness:lengua"), "en");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("una lista con activo abre la ventana", () => {
  assert.equal(listaBasta({ workspaces: ws("a", "b"), active: "a" }), true);
});

test("sin activo no se adelanta: abriría el alta antes de saber si hay negativa", () => {
  assert.equal(listaBasta({ workspaces: [], active: null }), false);
  assert.equal(listaBasta({ workspaces: ws("a"), active: null }), false);
});

test("un activo que no está en la lista no se adelanta", () => {
  assert.equal(listaBasta({ workspaces: ws("b"), active: "a" }), false);
});

test("una lista que ya trae negativa no abre nada", () => {
  assert.equal(listaBasta({ workspaces: ws("a"), active: "a", bloqueo: { clave: "x" } }), false);
});

test("sin lista aplicada, el arranque se aplica", () => {
  assert.equal(reconciliar(null, { workspaces: ws("a"), active: "a" }), "aplicar");
});

test("el arranque que dice lo mismo no reaplica: no cierra la tarea abierta", () => {
  const lista = { workspaces: ws("a", "b"), active: "a", migrations: [1, 2] };
  const arranque = { workspaces: ws("b", "a"), active: "a", migrations: [1, 2] };
  assert.equal(reconciliar(lista, arranque), "nada");
});

test("otro activo, otros workspaces o una migración nueva reaplican", () => {
  const lista = { workspaces: ws("a"), active: "a", migrations: [1] };
  assert.equal(reconciliar(lista, { ...lista, active: "b", workspaces: ws("a", "b") }), "aplicar");
  assert.equal(reconciliar(lista, { ...lista, workspaces: ws("a", "c") }), "aplicar");
  assert.equal(reconciliar(lista, { ...lista, migrations: [1, 2] }), "aplicar");
});
