/**
 * Pegado protegido en el compositor: un token pegado no entra al campo, al
 * borrador guardado ni a ninguna orden salvo `env_secret_set`; no se manda
 * hasta guardarlo, y en el texto queda `$NOMBRE`. «Pegar como texto» lo deja
 * tal cual y un SHA se pega sin chip. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

// Armado aquí: un literal con forma de token real lo bloquea el escáner del repositorio.
const SECRET = `gh${"p"}_${"Q7f9Kp2LmX4vR8tZ1nB6cW3yH5jD0sAe".repeat(2).slice(0, 36)}`;
const SHA = "334f565cc6e9a1b2c3d4e5f60718293a4b5c6d7e";
const row = (id) => ({ id, title: `Tarea ${id}`, last_message: "", provider: "claude", model: "opus", refs: [], updated_at: 0, turns: 1, parent: null, esperando: false });

function responses(overrides) {
  return {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "lab", reset: false },
    list_providers: [{ id: "claude", label: "Claude", available: true, driver: true }],
    list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    list_projects: () => [{ id: "p1", name: "P1", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] }],
    list_portfolios: [],
    list_sources: [],
    list_live_sessions: ({ project }) => (project === "" || project === "p1" ? [row("t1")] : []),
    list_agents: { agents: [], rechazados: [] },
    list_agent_status: [],
    list_mentions: { fuentes: [], archivos: [] },
    list_models: { provider: "claude", models: [{ id: "opus", label: "Opus", gratis: null, note: null, efforts: [], default_effort: null }], fallback: false },
    list_surfaces: [{ id: "claude", provider: "claude", label: "Claude", catalogo: "todo", usable: true, marca: null, porque: null }],
    session_folder: "/tmp",
    list_task_trees: [],
    watch_task_tree: "watch",
    unwatch_task_tree: null,
    task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, recreatable: false, incomplete: false },
    list_live_turns: [],
    list_active_turns: [],
    load_queue: [],
    save_queue: null,
    session_usage: null,
    list_session_git: {},
    load_session: ({ id }) => ({ id, provider: "claude", sources: [], model: "opus", effort: null, permission_mode: null, turns: [{ role: "user", id: "u0", at: 0, text: "hola" }] }),
    ...overrides,
  };
}

/** Cada argumento de cada orden, para buscar el valor donde no debe estar. */
function recordArgs(sent) {
  return (w) => {
    const inner = w.__TAURI_INTERNALS__;
    const original = inner.invoke;
    inner.invoke = (cmd, args, options) => {
      sent.push([cmd, JSON.stringify(args ?? null)]);
      return original(cmd, args, options);
    };
  };
}

async function openTask(app) {
  await sleep(600);
  const el = app.w.document.querySelector('[data-sesion="t1"]');
  assert.ok(el, "no está la fila de t1");
  el.click();
  await sleep(400);
  const field = app.w.document.querySelector("textarea");
  assert.ok(field, "no está el campo");
  return field;
}

function paste(app, field, text) {
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
  const event = new app.w.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { items: [], getData: (type) => (type === "text/plain" ? text : "") } });
  field.dispatchEvent(event);
  return event;
}

function type(app, field, text) {
  field.value = text;
  field.dispatchEvent(new app.w.Event("input", { bubbles: true }));
}

const storageDump = (w) => Object.keys(w.localStorage).map((k) => `${k}=${w.localStorage.getItem(k)}`).join("\n");

test("a pasted token waits in the chip, is saved as a secret and only its name reaches the text and the message", async () => {
  const sent = [];
  const saved = [];
  const app = await boot("listo", "chat-secret-paste-save", responses({
    env_secret_set: (args) => {
      saved.push(args);
      return null;
    },
    env_secrets_list: { secrets: [{ slot: "env/p1/OTHER", folder: "p1", name: "OTHER", hint: null, in_account: false }] },
    send_message: "t1",
  }), undefined, {}, { beforeImport: recordArgs(sent) });
  try {
    const field = await openTask(app);
    type(app, field, "usa ");
    await sleep(50);
    const event = paste(app, field, SECRET);
    await sleep(100);
    assert.ok(event.defaultPrevented, "the browser did not paste the value");
    assert.equal(field.value, "usa ", "the value did not enter the field");
    const chip = app.w.document.querySelector("[data-secret-paste]");
    assert.ok(chip, "the chip is shown");
    const name = chip.querySelector("input");
    assert.equal(name.value, "GITHUB_PAT");
    assert.equal(app.w.document.activeElement, name, "focus goes to the name");
    assert.ok(chip.textContent.includes(`••••${SECRET.slice(-4)}`), "only the last 4 are shown");

    field.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await sleep(100);
    assert.equal(sent.filter(([cmd]) => cmd === "send_message").length, 0, "nothing is sent while the secret waits");

    type(app, name, "repo-token");
    await sleep(30);
    assert.equal(name.value, "REPO_TOKEN");
    chip.querySelector("[data-secret-paste-save]").click();
    await sleep(300);
    assert.deepEqual(saved, [{ folder: "p1", name: "REPO_TOKEN", value: SECRET, replace: false }], "saved through the engine for this folder");
    assert.equal(app.w.document.querySelector("[data-secret-paste]"), null, "the chip closes");
    assert.equal(field.value, "usa $REPO_TOKEN");

    field.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await sleep(300);
    const message = sent.find(([cmd]) => cmd === "send_message");
    assert.ok(message, "then it sends");
    assert.ok(message[1].includes("$REPO_TOKEN"));
    const leaks = sent.filter(([cmd, args]) => cmd !== "env_secret_set" && args.includes(SECRET)).map(([cmd]) => cmd);
    assert.deepEqual(leaks, [], "no other command carried the value");
    assert.ok(!storageDump(app.w).includes(SECRET), "the saved drafts and prefs never hold the value");
  } finally {
    app.w.close();
  }
});

test("a failed save keeps the chip with a one-line error and the value out of the field", async () => {
  const app = await boot("listo", "chat-secret-paste-fail", responses({
    env_secret_set: () => Promise.reject({ what: "La bóveda no respondió", detail: "vault" }),
    env_secrets_list: { secrets: [] },
  }));
  try {
    const field = await openTask(app);
    paste(app, field, SECRET);
    await sleep(100);
    app.w.document.querySelector("[data-secret-paste-save]").click();
    await sleep(300);
    const chip = app.w.document.querySelector("[data-secret-paste]");
    assert.ok(chip, "the chip stays");
    assert.ok(chip.textContent.includes("No se guardó"), "with the short error inside");
    assert.ok(chip.querySelector('[role="alert"]')?.getAttribute("title")?.includes("La bóveda no respondió"), "and the detail in its title");
    assert.equal(field.value, "");
  } finally {
    app.w.close();
  }
});

test("«Pegar como texto» puts the paste back as is, and a hash pastes without a chip", async () => {
  const app = await boot("listo", "chat-secret-paste-text", responses({}));
  try {
    const field = await openTask(app);
    paste(app, field, SECRET);
    await sleep(100);
    app.w.document.querySelector("[data-secret-paste-text]").click();
    await sleep(100);
    assert.equal(app.w.document.querySelector("[data-secret-paste]"), null);
    assert.equal(field.value, SECRET, "a false positive is one click away");

    type(app, field, "");
    await sleep(30);
    const event = paste(app, field, SHA);
    await sleep(100);
    assert.equal(event.defaultPrevented, false, "a commit hash pastes normally");
    assert.equal(app.w.document.querySelector("[data-secret-paste]"), null);
  } finally {
    app.w.close();
  }
});

test("a name that already exists offers «Reemplazar» and saves with replace; Esc discards", async () => {
  const saved = [];
  const app = await boot("listo", "chat-secret-paste-replace", responses({
    env_secret_set: (args) => {
      saved.push(args);
      return null;
    },
    env_secrets_list: { secrets: [{ slot: "env/p1/GITHUB_PAT", folder: "p1", name: "GITHUB_PAT", hint: "abcd", in_account: false }] },
  }));
  try {
    const field = await openTask(app);
    paste(app, field, SECRET);
    await sleep(200);
    const button = app.w.document.querySelector("[data-secret-paste-save]");
    assert.equal(button.textContent.trim(), "Reemplazar");
    button.click();
    await sleep(300);
    assert.equal(saved[0]?.replace, true);

    paste(app, field, SECRET);
    await sleep(100);
    const chip = app.w.document.querySelector("[data-secret-paste]");
    chip.querySelector("input").dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await sleep(50);
    assert.equal(app.w.document.querySelector("[data-secret-paste]"), null, "Esc discards");
    assert.ok(!field.value.includes(SECRET));
  } finally {
    app.w.close();
  }
});
