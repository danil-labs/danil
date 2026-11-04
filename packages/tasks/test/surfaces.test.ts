import assert from "node:assert/strict";
import { test } from "node:test";
import { chipModel, menuSurfaces, type Surface, surfaceHas, surfaceOf } from "../src/index.ts";

const zen: Surface = { id: "opencode-zen", provider: "opencode-zen", label: "OpenCode", catalogo: "de_pago", usable: true, marca: null, porque: null };
const free: Surface = { id: "opencode-zen:free", provider: "opencode-zen", label: "Modelos Free", catalogo: "gratuitos", usable: false, marca: "sin activar", porque: null };
const claude: Surface = { id: "claude", provider: "claude", label: "Claude Code", catalogo: "todo", usable: true, marca: null, porque: null };
const catalog = [{ id: "zen/big", gratis: false }, { id: "zen/free", gratis: true }];

test("el chip sigue el orden de la ventana: elegido, observado y, en una subtarea, su último turno", () => {
  const turns = [{ role: "agent", model: "old" }, { role: "user", model: null }, { role: "agent", model: "last-turn" }];
  assert.equal(chipModel({ model: "chosen", observed_model: "seen", turns }), "chosen");
  assert.equal(chipModel({ model: null, observed_model: "seen", turns }), "seen");
  // Una tarea normal no toma el del último turno: lo observado manda, y sin él el CLI usa el suyo.
  assert.equal(chipModel({ model: null, observed_model: null, turns }), null);
  assert.equal(chipModel({ model: null, observed_model: "seen", parent: "p1", turns }), "last-turn");
  assert.equal(chipModel({ model: null, subagent: { id: "x" }, turns: [{ role: "user", model: "u" }] }), null);
});

test("cada superficie enseña su mitad del catálogo, y la que no parte enseña todo", () => {
  assert.equal(surfaceHas(zen, catalog[0]), true);
  assert.equal(surfaceHas(zen, catalog[1]), false);
  assert.equal(surfaceHas(free, catalog[1]), true);
  assert.equal(surfaceHas(free, catalog[0]), false);
  assert.equal(surfaceHas(claude, catalog[1]), true);
  assert.equal(surfaceHas(undefined, catalog[0]), true);
});

test("el menú deja fuera lo no utilizable salvo la superficie de la tarea abierta", () => {
  assert.deepEqual(menuSurfaces([zen, free, claude], undefined).map((s) => s.id), ["opencode-zen", "claude"]);
  assert.deepEqual(menuSurfaces([zen, free, claude], "opencode-zen:free").map((s) => s.id), ["opencode-zen", "opencode-zen:free", "claude"]);
});

test("la superficie se deriva del modelo: una tarea de un modelo gratuito abre en los gratuitos", () => {
  const on = { ...free, usable: true };
  assert.equal(surfaceOf([zen, on], "opencode-zen", "zen/free", catalog, undefined), "opencode-zen:free");
  assert.equal(surfaceOf([zen, on], "opencode-zen", "zen/big", catalog, "opencode-zen:free"), "opencode-zen");
  // Sin modelo, la que ya estaba se queda.
  assert.equal(surfaceOf([zen, on], "opencode-zen", "", catalog, "opencode-zen:free"), "opencode-zen:free");
  assert.equal(surfaceOf([zen, on], "codex", "", catalog, undefined), undefined);
});
