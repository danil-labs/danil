import assert from "node:assert/strict";
import { test } from "node:test";
import { modelName, previewLabel, taskPreview, taskTitle } from "../../src/lib/tasks/index.ts";

const row = { id: "t1", title: "Revisar el checkout", esperando: false, folder: "p1", agent: "Ada", provider: "claude", model: "claude-opus-5-5", last_message: "  Listo, abrí el PR.  " };

test("la vista previa dice lo de la tarjeta flotante del escritorio, en su orden", () => {
  const p = taskPreview("es", { ...row, machine: "Mac", machine_on: false }, { live: [], approving: [] });
  assert.equal(p.title, "Revisar el checkout");
  assert.equal(p.excerpt, "Listo, abrí el PR.");
  assert.equal(p.folder, "p1");
  assert.equal(p.agent, "Ada");
  assert.equal(p.provider, "claude");
  assert.equal(p.mark, "claude");
  assert.equal(p.model, "Claude Opus 5.5");
  assert.deepEqual(p.machine, { id: "Mac", on: false });
  assert.deepEqual(p.actions, ["open", "pin", "archive"]);
  assert.deepEqual(taskPreview("es", { ...row, pinned: true, archived: true }, { live: [], approving: [] }).actions, ["open", "unpin"]);
  assert.equal(taskPreview("es", { ...row, model: null, last_message: " " }, { live: [], approving: [] }).model, null);
  assert.equal(taskPreview("es", { ...row, last_message: " " }, { live: [], approving: [] }).excerpt, null);
  const credits = taskPreview("es", { ...row, provider: "opencode", model: "danil-credits/danil/equilibrado" }, { live: [], approving: [] });
  assert.equal(credits.mark, "danil");
});

test("las palabras son las del escritorio", () => {
  assert.equal(previewLabel("es", "open"), "Abrir");
  assert.equal(previewLabel("es", "pin"), "Fijar");
  assert.equal(previewLabel("es", "unpin"), "Desfijar");
  assert.equal(previewLabel("es", "archive"), "Archivar");
  assert.equal(previewLabel("es", "folder"), "Carpeta");
  assert.equal(previewLabel("es", "provider"), "Proveedor");
  assert.equal(previewLabel("en", "default_model"), "Default model");
});

test("títulos y modelos como en el escritorio", () => {
  assert.equal(taskTitle("es", { title: "x", inbox: true }), "Bandeja anterior");
  assert.equal(taskTitle("es", { title: "x", chat_de_agente: true }), "Chat anterior del agente");
  assert.equal(taskTitle("es", { title: "x", chat_de_agente: true, agent_thread: true }), "x");
  assert.equal(taskTitle("es", { title: "env -i HOME=x", command_title: true }), "Comando en terminal");
  assert.equal(taskTitle("en", { title: "env -i HOME=x", command_title: true }), "Terminal command");
  assert.equal(modelName("claude-sonnet-4-5-20250929"), "Claude Sonnet 4.5");
  assert.equal(modelName("claude-opus-4-1[1m]"), "Claude Opus 4.1");
  assert.equal(modelName("gpt-5.6", { models: [{ id: "gpt-5.6", label: "GPT-5.6" }] }), "GPT-5.6");
  assert.equal(modelName("gpt-5.6"), "gpt-5.6");
});
