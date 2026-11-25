/**
 * La memoria del workspace vive en el mismo formato que la del proyecto: en
 * la vista de un proyecto, el alcance «Workspace» se escribe y se edita igual
 * y ya no ofrece «Retirar», que el motor rechaza siempre. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const W = { id: "w", name: "Danil", context_root: null };
const P = {
  id: "p1",
  name: "terminus",
  node: null,
  sources: [],
  working_directory: "/tmp/terminus",
  created_at: 1,
  updated_at: 1,
  sessions: 0,
  kind: "folder",
};
const ORIGIN = { workspace: "w", project: "p1", task: null, provider: null, handler: null, branch: null, commit: null };
const ENTRY = { file: "regla.md", type: "decision", modified: "2026-10-21T00:00:00Z", origin: ORIGIN, text: "Una regla del workspace", in_index: true };
const INDEX = { lines: 3, bytes: 120, line_limit: 200, byte_limit: 8192 };

function engine() {
  const calls = [];
  const record = (command, reply) => (args) => {
    calls.push({ command, args });
    return reply(args ?? {});
  };
  return {
    calls,
    table: {
      window_ready: null,
      window_vitals: null,
      setup_required: false,
      list_providers: [],
      list_projects: [P],
      list_sources: [],
      list_live_sessions: [],
      list_live_turns: [],
      list_surfaces: [],
      set_active_workspace: null,
      service_poll: { cursor: 0, gap: false, replay: false, runtime: "test-service", reset: false },
      list_workspaces: { workspaces: [W], active: "w" },
      workspaces_startup: { workspaces: [W], active: "w" },
      list_memory_entries: record("list_memory_entries", () => ({ entries: [ENTRY], total: 1, index: INDEX })),
      write_memory_entry: record("write_memory_entry", () => null),
      delete_memory_entry: record("delete_memory_entry", () => null),
      retire_memory_entry: record("retire_memory_entry", () => {
        throw new Error("La memoria no tiene estados: borra el archivo en vez de retirarlo.");
      }),
    },
  };
}

const buttons = (root, label) => [...root.querySelectorAll("button")].filter((b) => b.textContent.trim() === label);
const memory = (w) =>
  [...w.document.querySelectorAll("section")].find((s) => s.querySelector('[aria-label="Alcance de la memoria"]'));

function type(w, el, value) {
  el.value = value;
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
}

test("the workspace scope is written and edited like the project scope, without «Retirar»", async () => {
  const e = engine();
  const app = await boot("listo", "memory-workspace-scope", e.table);
  const { w } = app;
  await sleep(900);
  // Desde la barra lateral, abrir la carpeta y su pestaña «Configuración» muestra su memoria.
  const folderOpen = w.document.querySelector('[data-folder-group="p1"] [data-folder-open]');
  assert.ok(folderOpen, w.document.body.textContent.slice(0, 400));
  folderOpen.click();
  await sleep(400);
  const settingsTab = [...w.document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === "Configuración");
  assert.ok(settingsTab, "the project view offers its settings tab");
  settingsTab.click();
  await sleep(900);

  const section = memory(w);
  assert.ok(section, "the project view shows its memory");
  buttons(section, "Workspace")[0].click();
  await sleep(400);
  assert.deepEqual(e.calls.filter((c) => c.command === "list_memory_entries").at(-1)?.args.scope, { kind: "workspace" });
  assert.ok(section.textContent.includes("Una regla del workspace"), section.textContent);

  assert.equal(buttons(section, "Escribir a mano").length, 1, "the workspace can be written by hand");
  assert.equal(buttons(section, "Editar").length, 1, "each workspace entry can be edited");
  assert.equal(buttons(section, "Retirar").length, 0, "there is no «Retirar»: the engine always refuses it");
  assert.ok(section.textContent.includes("Índice: 3/200 líneas"), "the workspace index is shown too");

  buttons(section, "Escribir a mano")[0].click();
  await sleep(300);
  const dialog = w.document.querySelector("[role=dialog]");
  assert.ok(dialog, "the form opens");
  type(w, dialog.querySelector('input[placeholder="nombre-de-archivo.md"]'), "nueva.md");
  type(w, dialog.querySelector("textarea"), "Otra regla");
  await sleep(50);
  buttons(dialog, "Guardar")[0].click();
  await sleep(300);

  assert.deepEqual(e.calls.find((c) => c.command === "write_memory_entry")?.args, {
    project: "p1",
    scope: { kind: "workspace" },
    file: "nueva.md",
    type: null,
    text: "Otra regla",
  });
  assert.ok(!e.calls.some((c) => c.command === "retire_memory_entry"));
});
