/**
 * En el escritorio Secretos habla con el motor (extensión `secrets_v1`): sin
 * cuenta de Danil lista la bóveda local y dice «Solo en esta máquina», guarda con
 * `env_secret_set` (el workspace va en el sobre), enseña el error del motor
 * dentro del diálogo y borra con `env_secret_remove`. Un motor que no conoce la
 * orden apaga solo esta sección. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { secretsRoute } from "../../src/features/settings/secrets-support.ts";
import { unknownCommand } from "../../src/lib/errorCode.ts";

const workspace = { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" };

const button = (root, text) => [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

async function waitFor(read, message) {
  for (let i = 0; i < 200; i++) {
    const value = read();
    if (value) return value;
    await sleep(20);
  }
  assert.fail(message);
}

function table(extra) {
  return {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    launcher_state: { phase: "ready", blank_0274: false },
    list_language_packs: [],
    list_bundled_language_packs: [],
    list_workspaces: workspace,
    workspaces_startup: workspace,
    list_projects: [{ id: "web", name: "Web", node: null, sources: [], created_at: 1, updated_at: 1 }],
    list_sources: [],
    machine_list: [{ id: "local", active: true, local: true, on: true, hosts: true, features: ["secrets_v1"] }],
    list_live_sessions: [],
    list_live_turns: [],
    list_models: { models: [], fallback: false },
    tasks_awaiting_quota: [],
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "fixture", reset: false },
    account_credentials_list: () => {
      throw { what: { clave: "credentials.error.not_linked" }, detail: "not_linked" };
    },
    ...extra,
  };
}

async function openSecrets(app) {
  await sleep(300);
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "secretos" }));
  return waitFor(() => app.w.document.querySelector("[data-settings-secrets]"), "Falta la sección Secretos");
}

test("sin cuenta, Secretos lista la bóveda local, guarda y borra por el motor", async () => {
  const { boot } = await import("../helpers/jsdom-app.mjs");
  const calls = [];
  let secrets = [{ slot: "env/*/STRIPE_KEY", folder: "*", name: "STRIPE_KEY", hint: "3f9a", in_account: false }];
  const app = await boot(
    "listo",
    "secretos-escritorio",
    table({
      env_secrets_list: (args) => {
        calls.push(["env_secrets_list", args]);
        return { secrets };
      },
      env_secret_set: (args) => {
        calls.push(["env_secret_set", args]);
        if (args.name === "DUPLICADO") throw { what: { clave: "credentials.error.env_secret_exists" }, detail: "env_secret_exists" };
        secrets = [...secrets, { slot: `env/${args.folder}/${args.name}`, folder: args.folder, name: args.name, hint: null, in_account: false }];
        return { slot: `env/${args.folder}/${args.name}`, folder: args.folder, name: args.name, hint: null, replaced: false };
      },
      env_secret_remove: (args) => {
        calls.push(["env_secret_remove", args]);
        secrets = secrets.filter((s) => !(s.folder === args.folder && s.name === args.name));
        return { slot: `env/${args.folder}/${args.name}`, removed: true };
      },
    }),
  );
  const doc = app.w.document;
  const panel = await openSecrets(app);
  await waitFor(() => panel.querySelector('[data-secret="env/*/STRIPE_KEY"]'), "Falta el secreto local");
  assert.deepEqual(calls.find(([c]) => c === "env_secrets_list")[1], {}, "el workspace va en el sobre, no en los argumentos");
  assert.ok(panel.querySelector('[data-secrets-mode="no_session"]'), "sin cuenta dice «Solo en esta máquina»");
  assert.match(panel.querySelector('[data-secret="env/*/STRIPE_KEY"]').textContent, /••••3f9a/);

  const form = () => doc.querySelector("[data-secret-add]");
  const type = (id, value) => {
    const input = form().querySelector(`#${id}`);
    input.value = value;
    input.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  };
  button(panel, "Añadir secreto").click();
  await waitFor(() => form(), "Falta el diálogo");
  type("secret-name", "duplicado");
  type("secret-value", "valor-que-no-se-muestra");
  await sleep(50);
  form().requestSubmit();
  await waitFor(() => form()?.textContent.includes("Ya hay un secreto con ese nombre en ese alcance."), "El error del motor no se ve dentro del diálogo");

  type("secret-name", "database_url");
  await waitFor(() => form().querySelector('#secret-scope option[value="web"]'), "Faltan las carpetas como alcance");
  const scope = form().querySelector("#secret-scope");
  scope.value = "web";
  scope.dispatchEvent(new app.w.Event("change", { bubbles: true }));
  await sleep(50);
  form().requestSubmit();
  await waitFor(() => !form() && panel.querySelector('[data-secret="env/web/DATABASE_URL"]'), "No se guardó o no se volvió a leer");
  assert.deepEqual(calls.filter(([c]) => c === "env_secret_set").at(-1)[1], { folder: "web", name: "DATABASE_URL", value: "valor-que-no-se-muestra", replace: false });
  assert.match(panel.querySelector('[data-secrets-group="web"]').textContent, /^Carpeta Web/);
  assert.ok(!doc.body.textContent.includes("valor-que-no-se-muestra"), "el valor no vuelve a la pantalla");

  const row = panel.querySelector('[data-secret="env/*/STRIPE_KEY"]');
  button(row, "Borrar").click();
  await waitFor(() => row.querySelector("[data-delete-warning]"), "Falta el aviso de borrado");
  assert.match(row.querySelector("[data-delete-warning]").textContent, /Se borra de esta máquina/);
  button(row, "Borrar secreto").click();
  await waitFor(() => !panel.querySelector('[data-secret="env/*/STRIPE_KEY"]'), "No se borró");
  assert.deepEqual(calls.find(([c]) => c === "env_secret_remove")[1], { folder: "*", name: "STRIPE_KEY" });
  assert.deepEqual(app.failures, []);
});

test("un motor sin secrets_v1 apaga solo Secretos", async () => {
  const { boot } = await import("../helpers/jsdom-app.mjs");
  const app = await boot(
    "listo",
    "secretos-motor-viejo",
    table({
      machine_list: [{ id: "local", active: true, local: true, on: true, hosts: true, features: [] }],
      env_secrets_list: () => { assert.fail("Un motor sin soporte no recibe consultas de secretos"); },
    }),
  );
  const panel = await openSecrets(app);
  assert.equal(app.w.document.querySelector("#cfg-tab-secretos"), null, "Secretos no se ofrece en navegación");
  await waitFor(() => panel.querySelector("[data-secrets-unsupported]"), "Falta el aviso de motor sin secretos");
  assert.match(panel.textContent, /El motor de esta máquina no admite secretos/);
  assert.equal(button(panel, "Añadir secreto"), undefined, "no se ofrece guardar");
  assert.equal(panel.querySelector("[data-secret]"), null);
  assert.deepEqual(app.failures, []);
});


test("an announced extension that returns the legacy literal shows incompatibility", async () => {
  const { boot } = await import("../helpers/jsdom-app.mjs");
  const app = await boot("listo", "secretos-legacy-literal", table({
    env_secrets_list: () => { throw "service.error.command"; },
    env_secret_set: () => { assert.fail("No se escribe después de orden desconocida"); },
    env_secret_remove: () => { assert.fail("No se borra después de orden desconocida"); },
  }));
  const panel = await openSecrets(app);
  await waitFor(() => panel.querySelector("[data-secrets-unsupported]"), "Falta incompatibilidad específica");
  assert.equal(button(panel, "Añadir secreto"), undefined);
  assert.deepEqual(app.failures, []);
});

test("secrets capability follows the active engine, not the local or run-on machine", () => {
  const machines = [
    { id: "local", active: false, features: ["secrets_v1"] },
    { id: "remote", active: true, features: [] },
  ];
  assert.equal(secretsRoute("engine", machines), "unsupported");
  machines[0].features = [];
  machines[1].features = ["secrets_v1"];
  assert.equal(secretsRoute("engine", machines), "engine:remote");
  assert.equal(secretsRoute("engine", [{ id: "old", active: true }]), "unsupported");
  assert.equal(secretsRoute("engine", []), "unsupported");
  assert.equal(secretsRoute("worker", machines), "worker");
  assert.equal(secretsRoute("worker", []), "worker");
});

test("unknown command recognizes the pinned legacy transport literal only", () => {
  assert.equal(unknownCommand("service.error.command"), true);
  assert.equal(unknownCommand({ what: { clave: "shell.service.failed" }, detail: "service.error.command" }), true);
  assert.equal(unknownCommand({ detail: { code: "command", detail: "env_secrets_list" } }), true);
  for (const error of ["service.error.io", "command", "unsupported", "message mentions service.error.command", { detail: "io" }, { detail: "permission_denied" }]) {
    assert.equal(unknownCommand(error), false);
  }
});
