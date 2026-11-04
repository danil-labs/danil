/**
 * Configuración → Fuentes → GitHub contra un motor simulado: con sesión de Danil
 * la tarjeta es la de la cuenta (organizaciones, en uso en, reautorizar); sin
 * sesión o con un motor que no sabe `github_account_*`, la local de siempre; con
 * una conexión local y la cuenta vacía, el aviso para pasarla. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const W = { id: "w", name: "Danil", context_root: null };
const BASE = {
  window_ready: null,
  window_vitals: null,
  setup_required: false,
  list_providers: [],
  list_projects: [],
  list_sources: [],
  list_live_sessions: [],
  list_live_turns: [],
  list_surfaces: [],
  set_active_workspace: null,
  list_workspaces: { workspaces: [W], active: "w" },
  workspaces_startup: { workspaces: [W], active: "w" },
  check_environment: { githubCli: null },
  list_known_mcp: [],
  list_mcp_providers: [],
  list_integrations: { workspace: "w", plugins: [] },
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "test-service", reset: false },
};
const frase = (clave) => ({ clave });
const LOCAL = { selected_area: null, selected_areas: [{ key: "nosoypoot", installation_id: 1 }], data: {}, workspace: "w", identity: { user: "nosoypoot", name: "Alberto" }, connected_at: 1 };
const github = (connected = null) => ({
  id: "github",
  name: "GitHub",
  summary: frase("providers.github.summary"),
  vocabulary: { change: frase("providers.github.change"), change_short: frase("providers.github.change_short"), change_prefix: "#", checks: frase("providers.github.checks") },
  connected,
  select_area: true,
  setup_url: null,
  fields: [],
  token_label: frase("providers.github.token_label"),
  token_help: frase("providers.github.token_help"),
  token_url: "https://github.com/settings/tokens",
  area_label: frase("providers.github.area_label"),
  areas_label: frase("providers.github.areas_label"),
  area_help: frase("providers.github.area_help"),
  browser_login: true,
  login_help: frase("providers.github.login_help.browser"),
  unverified: null,
});
const CREDENTIAL = {
  id: "cred_1",
  kind: "github",
  status: "active",
  label: "nosoypoot",
  version: 2,
  config: { github_user_id: 42, login: "nosoypoot", avatar: null, areas: [{ key: "danil-labs", installation_id: 7, repository_ids: null }] },
  machines: [
    { computer_id: "cmp_vm", name: "vm-alberto", state: "active" },
    { computer_id: "cmp_mac", name: "Mac de Alberto", state: "removed" },
  ],
};
const INSTALLS = {
  installations: [
    { key: "danil-labs", installation_id: 7, account: { login: "danil-labs", type: "Organization" }, repository_selection: "all" },
    { key: "nosoypoot", installation_id: 8, account: { login: "nosoypoot", type: "User" }, repository_selection: "selected" },
  ],
  install_url: "https://github.com/apps/terminus-app/installations/new",
};
const unknown = () => Object.assign(new Error("command"), { what: { clave: "shell.service.command" }, detail: "command" });

function engine({ signedIn = true, local = null, status = { connected: true, credential: CREDENTIAL, install_url: INSTALLS.install_url }, statusFails = false } = {}) {
  const calls = [];
  const state = { status };
  const record = (command, reply) => (args) => {
    calls.push({ command, args });
    return reply(args ?? {});
  };
  return {
    calls,
    state,
    table: {
      list_git_hosts: () => [github(local)],
      check_git_host: () => github(local),
      git_host_areas: () => [],
      danil_workspace_account: record("danil_workspace_account", () => ({ account: signedIn ? "u_a" : null, signed_in: signedIn })),
      github_account_status: record("github_account_status", () => {
        if (statusFails) throw unknown();
        return state.status;
      }),
      github_account_authorize: record("github_account_authorize", () => ({ url: "https://github.com/login/oauth/authorize?state=s" })),
      github_account_installations: record("github_account_installations", () => INSTALLS),
      github_account_set_areas: record("github_account_set_areas", ({ areas }) => ({ credential: { ...CREDENTIAL, version: 3, config: { ...CREDENTIAL.config, areas } } })),
      account_credential_remove_machine: record("account_credential_remove_machine", () => ({ credential: CREDENTIAL })),
      account_credential_restore_machine: record("account_credential_restore_machine", ({ computer }) => ({
        credential: { ...CREDENTIAL, machines: CREDENTIAL.machines.map((m) => (m.computer_id === computer ? { ...m, state: "active" } : m)) },
      })),
      open_external: record("open_external", () => null),
    },
  };
}

async function openSources(name, e) {
  const app = await boot("listo", name, { ...BASE, ...e.table });
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "fuentes" }));
  await sleep(1500);
  return app;
}

const card = (w) => w.document.querySelector("[data-github-account]");
const buttonIn = (root, label) => [...(root?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === label || b.getAttribute("aria-label") === label);
const text = (w) => w.document.body.textContent ?? "";
const tokenField = (w) => w.document.querySelector('input[aria-label="Token de acceso personal"]');

test("with a Danil session the GitHub card is the account's: login, organizations and the machines it is in use on", async () => {
  const e = engine();
  const app = await openSources("github-account-card", e);
  const { w } = app;
  assert.equal(card(w)?.dataset.githubAccount, "account", text(w).slice(0, 400));
  assert.ok(text(w).includes("@nosoypoot"));
  assert.ok(text(w).includes("danil-labs"), "the chosen organization is listed");
  assert.equal(tokenField(w), null, "the local form is not shown");
  assert.deepEqual(e.calls.find((c) => c.command === "github_account_status")?.args, { scope: "w" });

  const machines = w.document.querySelector("[data-github-machines]");
  assert.ok(machines?.textContent.includes("vm-alberto"));
  buttonIn(machines.querySelector('[data-github-machine="cmp_mac"]'), "Volver a poner").click();
  await sleep(300);
  assert.deepEqual(e.calls.find((c) => c.command === "account_credential_restore_machine")?.args, { scope: "w", credential: "cred_1", computer: "cmp_mac" });
  assert.ok(buttonIn(w.document.querySelector('[data-github-machine="cmp_mac"]'), "Quitar"), "it is back in use there");

  buttonIn(card(w), "Elegir organizaciones").click();
  await sleep(400);
  const list = w.document.querySelector("[data-github-installations]");
  assert.ok(list?.textContent.includes("nosoypoot"), "the installations are listed");
  buttonIn(list, "Usar nosoypoot en este workspace").click();
  await sleep(300);
  assert.deepEqual(e.calls.find((c) => c.command === "github_account_set_areas")?.args, {
    scope: "w",
    areas: [
      { key: "danil-labs", installation_id: 7, repository_ids: null },
      { key: "nosoypoot", installation_id: 8, repository_ids: null },
    ],
  });
  assert.deepEqual(app.failures, []);
});

test("without a Danil session the local GitHub card stays as it was", async () => {
  const e = engine({ signedIn: false });
  const app = await openSources("github-account-none", e);
  const { w } = app;
  assert.equal(card(w)?.dataset.githubAccount, "local");
  assert.ok(tokenField(w), "the local form is there");
  assert.ok(!e.calls.some((c) => c.command === "github_account_status"), "nobody asks the account");
  assert.deepEqual(app.failures, []);
});

test("an engine that does not know github_account_* keeps the local card without an error", async () => {
  const e = engine({ statusFails: true });
  const app = await openSources("github-account-old-engine", e);
  const { w } = app;
  assert.equal(card(w)?.dataset.githubAccount, "local");
  assert.ok(tokenField(w));
  assert.equal(w.document.querySelector("[role=alert]"), null);
  assert.deepEqual(app.failures, []);
});

test("a local connection with an empty account offers to move it, and connecting waits for GitHub", async () => {
  const e = engine({ local: LOCAL, status: { connected: false, credential: null, install_url: null } });
  const app = await openSources("github-account-migrate", e);
  const { w } = app;
  assert.equal(card(w)?.dataset.githubAccount, "local", "the local one still runs the tasks");
  assert.ok(text(w).includes("Pasa esta conexión a tu cuenta de Danil"), text(w).slice(0, 600));
  buttonIn(card(w), "Pasar a mi cuenta").click();
  await sleep(300);
  assert.ok(e.calls.some((c) => c.command === "github_account_authorize"));
  assert.equal(e.calls.find((c) => c.command === "open_external")?.args?.target, "https://github.com/login/oauth/authorize?state=s");
  assert.ok(text(w).includes("Esperando a que apruebes en GitHub"));

  e.state.status = { connected: true, credential: CREDENTIAL, install_url: null };
  await sleep(3500);
  assert.equal(card(w)?.dataset.githubAccount, "account", "once connected the account card takes over");
  assert.ok(!text(w).includes("Esperando a que apruebes en GitHub"));
  assert.deepEqual(app.failures, []);
});

test("when the engine already opened the browser the card does not open it again, and keeps the link", async () => {
  const e = engine({ status: { connected: false, credential: null, install_url: null } });
  e.table.github_account_authorize = () => ({ url: "https://github.com/login/oauth/authorize?state=s", expires_at: null, opened: true });
  const app = await openSources("github-account-opened", e);
  const { w } = app;
  buttonIn(card(w), "Conectar con GitHub").click();
  await sleep(300);
  assert.ok(!e.calls.some((c) => c.command === "open_external"), "only one tab");
  const link = [...card(w).querySelectorAll("a")].find((a) => a.textContent === "Abrir GitHub");
  assert.equal(link?.getAttribute("href"), "https://github.com/login/oauth/authorize?state=s");
  assert.deepEqual(app.failures, []);
});

test("a connection GitHub stopped accepting asks to reconnect", async () => {
  const e = engine({ status: { connected: true, credential: { ...CREDENTIAL, status: "reauthorize" }, install_url: null } });
  const app = await openSources("github-account-reauthorize", e);
  const { w } = app;
  assert.ok(text(w).includes("GitHub dejó de aceptar esta conexión"));
  buttonIn(card(w), "Vuelve a conectar").click();
  await sleep(300);
  assert.ok(e.calls.some((c) => c.command === "github_account_authorize"));
  assert.deepEqual(app.failures, []);
});
