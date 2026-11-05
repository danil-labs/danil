/**
 * Una tarea de otra máquina en un space de la cuenta trae el mismo id que aquí
 * (`@terminus/fleet` no le pone prefijo): se ve y se abre en ese escritorio.
 * Una en un space que solo tiene esa máquina sigue en el de esa máquina, y
 * abrirla no cambia de escritorio. La ventana no recuerda nada aparte.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import "../helpers/catalog.ts";
import * as spaces from "../../src/lib/spaces.ts";

const { enEscritorio, escritorioDeFila } = spaces;
const space = (id: string, account = false) => ({ id, name: null, folders: [], created_at: 0, updated_at: 0, account });

test("a task of another machine in an account space shows and opens in that same space", () => {
  const row = { id: "cmp_vm~t1", space: "esc1", machine: "cmp_vm" };
  assert.equal(enEscritorio(row, "esc1"), true);
  assert.equal(enEscritorio(row, "esc2"), false, "not in every space");
  assert.equal(escritorioDeFila(row, [space("esc1", true), space("esc2", true)]), "esc1");
});

test("a task of another machine in a space only that machine has stays there, and opening it does not switch", () => {
  const row = { id: "cmp_vm~old", space: "cmp_vm~jpycve7w", machine: "cmp_vm" };
  assert.equal(enEscritorio(row, "esc1"), false);
  assert.equal(enEscritorio(row, "cmp_vm~jpycve7w"), true);
  assert.equal(escritorioDeFila(row, [space("esc1", true), space("cmp_vm~jpycve7w")]), null);
  assert.equal(escritorioDeFila({ space: "esc1" }, [space("esc1")]), "esc1", "a task of this computer opens in its space");
});

test("the window keeps no memory of where a remote task was created", () => {
  assert.equal("rememberTaskSpace" in spaces, false);
  assert.equal("forgetTaskSpace" in spaces, false);
});

test("a removed folder does not come back to the rail for a subtask the rail hides", () => {
  const desk = { ...space("esc1", true), folders: ["pa"] };
  const projects = [{ id: "pa" }, { id: "pb" }, { id: "pc" }];
  const rail = spaces.carpetasDelEscritorio(projects, desk, {
    pb: [{ id: "t1", space: "esc1", launched_by: "t0" }],
    pc: [{ id: "t2", space: "esc1" }],
  });
  assert.deepEqual(rail.map((p) => p.id), ["pa", "pc"], "only tasks the rail shows keep a folder");
  const pinned = spaces.carpetasDelEscritorio(projects, desk, { pb: [{ id: "t1", space: "esc1", parent: "t0", pinned: true }] });
  assert.deepEqual(pinned.map((p) => p.id), ["pa", "pb"], "a pinned subtask shows, so its folder stays");
});
