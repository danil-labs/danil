/**
 * Configuración → Fuentes → GitHub contra un motor simulado: con sesión de Danil
 * la tarjeta refleja dónde está instalada la App (organizaciones, pendiente, en
 * uso en, reconectar); sin sesión o con un motor que no sabe `github_account_*`,
 * la local de siempre; con una conexión local y la cuenta vacía, el aviso para
 * pasarla. Monta `dist/`.
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
const github = (connected = null, source = undefined) => ({
  id: "github",
  name: "GitHub",
  source,
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
    { key: "danil-labs", installation_id: 7, account: { login: "danil-labs", type: "Organization" }, repository_selection: "all", html_url: "https://github.com/organizations/danil-labs/settings/installations/7" },
    { key: "nosoypoot", installation_id: 8, account: { login: "nosoypoot", type: "User" }, repository_selection: "selected", repository_count: 3, html_url: "https://github.com/settings/installations/8" },
    { key: "raelay", installation_id: 9, account: { login: "raelay", type: "Organization" }, repository_selection: "selected" },
  ],
  install_url: "https://github.com/apps/danil/installations/new?state=s",
  install_pending: true,
};
const host = (id, name) => ({ ...github(), id, name, browser_login: false, select_area: false });
const unknown = () => Object.assign(new Error("command"), { what: { clave: "shell.service.command" }, detail: "command" });

function engine({ signedIn = true, local = null, source = undefined, status = { connected: true, credential: CREDENTIAL, install_url: INSTALLS.install_url }, statusFails = false, hosts = null } = {}) {
  const calls = [];
  const state = { status, installs: INSTALLS, installsFail: null };
  const record = (command, reply) => (args) => {
    calls.push({ command, args });
    return reply(args ?? {});
  };
  return {
    calls,
    state,
    table: {
      list_git_hosts: () => hosts ?? [github(local, source)],
      check_git_host: () => github(local, source),
      git_host_areas: () => [],
      danil_workspace_account: record("danil_workspace_account", () => ({ account: signedIn ? "u_a" : null, signed_in: signedIn })),
      account_relay_token: record("account_relay_token", () => ({ endpoint: "https://github-control.test", token: "client-jwt" })),
      github_account_status: record("github_account_status", () => {
        if (statusFails === true) throw unknown();
        if (statusFails) throw statusFails;
        return state.status;
      }),
      github_account_authorize: record("github_account_authorize", () => ({ url: "https://github.com/login/oauth/authorize?state=s" })),
      github_account_installations: record("github_account_installations", () => {
        if (state.installsFail) throw state.installsFail;
        return state.installs;
      }),
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
/** La sección de GitHub en Control de código: su «Conectar» está en la cabecera, fuera de la tarjeta. */
const section = (w) => card(w)?.closest("section");
const buttonIn = (root, label) => [...(root?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === label || b.getAttribute("aria-label") === label);
const text = (w) => w.document.body.textContent ?? "";
const tokenField = (w) => w.document.querySelector('input[aria-label="Token de acceso personal"]');

const workerFailure = (code) => ({ what: code, detail: `credentials.error.${code}` });
const opened = (e) => e.calls.filter((c) => c.command === "open_external").map((c) => c.args.target);
const row = (w, key) => w.document.querySelector(`[data-github-installation="${key}"]`);
const menuItem = (w, label) => [...w.document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent.trim() === label);
async function menu(w, label) {
  buttonIn(card(w), "Más acciones de GitHub").dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  await sleep(80);
  assert.ok(menuItem(w, label), label);
  menuItem(w, label).dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await sleep(300);
}

test("a person chooses repositories without changing the organization's GitHub installation", async () => {
  const credential = { ...CREDENTIAL, config: { ...CREDENTIAL.config, personal_scope: true, areas: [{ key: "danil-labs", installation_id: 7, repository_ids: null, personal_repository_ids: [11, 99] }] } };
  const e = engine({ status: { connected: true, credential, install_url: INSTALLS.install_url } });
  const app = await openSources("github-account-card", e);
  const { w } = app;
  assert.equal(card(w)?.dataset.githubAccount, "account", text(w).slice(0, 400));
  assert.ok(card(w).querySelector('[data-github-login="nosoypoot"]')?.textContent.includes("@nosoypoot"));
  assert.equal(tokenField(w), null, "the local form is not shown");
  assert.deepEqual(e.calls.find((c) => c.command === "github_account_status")?.args, { scope: "w" });

  assert.equal(text(w).includes("Organizaciones"), false, "no rótulo: las organizaciones son filas con sangría");
  assert.ok(row(w, "danil-labs")?.textContent.includes("2 repos"));
  assert.ok(row(w, "nosoypoot")?.textContent.includes("0 repos"));
  assert.ok(row(w, "raelay")?.textContent.includes("0 repos"));
  assert.ok(card(w).querySelector("[data-github-installation-pending]")?.textContent.includes("Espera a una admin"));

  const originalFetch = globalThis.fetch;
  const requests = [];
  let releaseSave;
  const saveGate = new Promise((resolve) => { releaseSave = resolve; });
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://github-control.test/")) return originalFetch(url, options);
    requests.push({ url: String(url), options });
    if (options.method === "GET" && !String(url).includes("/repositories?")) return Response.json({ connected: true, credential });
    if (options.method === "GET") return Response.json({ repositories: [
      { id: 11, name: "brand", full_name: "danil-labs/brand", clone_url: "https://github.com/danil-labs/brand.git" },
      { id: 12, name: "danil-workspace", full_name: "danil-labs/danil-workspace", clone_url: "https://github.com/danil-labs/danil-workspace.git" },
    ] });
    await saveGate;
    const { areas } = JSON.parse(options.body);
    return Response.json({ credential: { ...CREDENTIAL, version: 3, config: { ...CREDENTIAL.config, areas, personal_scope: true } } });
  };
  buttonIn(row(w, "danil-labs"), "Cambiar repositorios de danil-labs").click();
  await sleep(100);
  const picker = card(w).querySelector("[data-github-personal-repositories]");
  assert.ok(picker?.textContent.includes("danil-labs/brand"));
  const boxes = picker.querySelectorAll('input[type="checkbox"]');
  assert.equal(boxes.length, 2);
  boxes[1].click();
  buttonIn(picker, "Guardar selección").click();
  await sleep(50);
  assert.ok([...boxes].every((box) => box.disabled), "the selection stays fixed while the save is in flight");
  releaseSave();
  await sleep(100);
  const saved = JSON.parse(requests.find((r) => r.options.method === "PUT").options.body);
  assert.equal(saved.personal_scope, true);
  assert.equal(saved.expected_version, 2);
  assert.equal(saved.expected_credential_id, "cred_1");
  assert.deepEqual(saved.areas.find((a) => a.key === "danil-labs").personal_repository_ids, [11, 12]);
  assert.ok(!card(w).querySelector("[data-github-personal-repositories]"));
  globalThis.fetch = originalFetch;
  buttonIn(card(w), "Añadir organización").click();
  await sleep(100);
  assert.deepEqual(opened(e), [INSTALLS.install_url]);

  assert.equal(buttonIn(card(w), "Usar en este workspace"), undefined);
  assert.equal(buttonIn(card(w), "Elegir organizaciones"), undefined);
  assert.equal(card(w).querySelector('[role="switch"], input[type="checkbox"]'), null, "picker is closed after saving");

  // Las máquinas son chips en la fila de la cuenta, no filas; el `title` las nombra todas.
  const machines = card(w).querySelector('[data-github-login] [data-github-machines]');
  assert.ok(machines?.textContent.includes("vm-alberto"));
  assert.ok(machines.getAttribute("title")?.includes("vm-alberto"));
  assert.equal(text(w).includes("En uso en"), false, "no «En uso en» block");
  const chip = () => machines.querySelector('[data-github-machine="cmp_mac"]');
  chip().dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  await sleep(100);
  menuItem(w, "Volver a poner").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await sleep(300);
  assert.deepEqual(e.calls.find((c) => c.command === "account_credential_restore_machine")?.args, { scope: "w", credential: "cred_1", computer: "cmp_mac" });
  card(w).querySelector('[data-github-machine="cmp_mac"]').dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  await sleep(100);
  assert.ok(menuItem(w, "Quitar"), "it is back in use there");
  assert.deepEqual(app.failures, []);
});

test("a different account cannot change the displayed GitHub selection", async () => {
  const e = engine();
  const { w } = await openSources("github-account-other-identity", e);
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://github-control.test/")) return originalFetch(url, options);
    requests.push({ url: String(url), method: options.method });
    return Response.json({ connected: true, credential: { ...CREDENTIAL, id: "cred_other" } });
  };
  try {
    buttonIn(row(w, "danil-labs"), "Cambiar repositorios de danil-labs").click();
    await sleep(100);
    assert.ok(text(w).includes("no coincide con la cuenta de GitHub"));
    assert.equal(requests.length, 1);
    assert.ok(!card(w).querySelector("[data-github-personal-repositories]"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an account change while editing cannot save the selection to another account", async () => {
  const e = engine();
  const { w } = await openSources("github-account-identity-changed", e);
  const originalFetch = globalThis.fetch;
  let statusReads = 0;
  let writes = 0;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://github-control.test/")) return originalFetch(url, options);
    if (options.method === "PUT") { writes += 1; return Response.json({ credential: CREDENTIAL }); }
    if (String(url).includes("/repositories?")) return Response.json({ repositories: [{ id: 11, name: "brand", full_name: "danil-labs/brand", clone_url: "https://github.com/danil-labs/brand.git" }] });
    statusReads += 1;
    return Response.json({ connected: true, credential: statusReads === 1 ? CREDENTIAL : { ...CREDENTIAL, id: "cred_other" } });
  };
  try {
    buttonIn(row(w, "danil-labs"), "Cambiar repositorios de danil-labs").click();
    await sleep(100);
    buttonIn(card(w).querySelector("[data-github-personal-repositories]"), "Guardar selección").click();
    await sleep(100);
    assert.ok(text(w).includes("no coincide con la cuenta de GitHub"));
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a refreshed card cannot save a selection opened for the previous credential", async () => {
  const e = engine();
  const { w } = await openSources("github-account-card-changed", e);
  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://github-control.test/")) return originalFetch(url, options);
    if (options.method === "PUT") { writes += 1; return Response.json({ credential: CREDENTIAL }); }
    if (String(url).includes("/repositories?")) return Response.json({ repositories: [{ id: 11, name: "brand", full_name: "danil-labs/brand", clone_url: "https://github.com/danil-labs/brand.git" }] });
    return Response.json({ connected: true, credential: e.state.status.credential });
  };
  try {
    buttonIn(row(w, "danil-labs"), "Cambiar repositorios de danil-labs").click();
    await sleep(100);
    e.state.status = { connected: true, credential: { ...CREDENTIAL, id: "cred_other" }, install_url: INSTALLS.install_url };
    w.dispatchEvent(new w.Event("focus"));
    await sleep(150);
    buttonIn(card(w).querySelector("[data-github-personal-repositories]"), "Guardar selección").click();
    await sleep(100);
    assert.ok(text(w).includes("no coincide con la cuenta de GitHub"));
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("legacy areas cannot silently expand to other installations", async () => {
  const credential = { ...CREDENTIAL, config: { ...CREDENTIAL.config, areas: [{ key: "danil-labs", installation_id: null, repository_ids: null }] } };
  const e = engine({ status: { connected: true, credential, install_url: INSTALLS.install_url } });
  const { w } = await openSources("github-account-legacy-areas", e);
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://github-control.test/")) return originalFetch(url, options);
    requests.push({ url: String(url), options });
    if (options.method === "GET" && !String(url).includes("/repositories?")) return Response.json({ connected: true, credential });
    if (options.method === "GET") return Response.json({ repositories: [{ id: 11, name: "brand", full_name: "danil-labs/brand", clone_url: "https://github.com/danil-labs/brand.git" }] });
    return Response.json({ credential: { ...credential, version: 3, config: { ...credential.config, areas: JSON.parse(options.body).areas, personal_scope: true } } });
  };
  try {
    buttonIn(row(w, "danil-labs"), "Cambiar repositorios de danil-labs").click();
    await sleep(100);
    const picker = card(w).querySelector("[data-github-personal-repositories]");
    const box = picker.querySelector('input[type="checkbox"]');
    assert.equal(box.checked, false, "un área anterior sin instalación no concede repositorios por defecto");
    box.click();
    buttonIn(picker, "Guardar selección").click();
    await sleep(100);
    const saved = JSON.parse(requests.find((r) => r.options.method === "PUT").options.body);
    assert.deepEqual(saved.areas, [{ key: "danil-labs", installation_id: 7, personal_repository_ids: [11] }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an installation excluded by an existing area selection starts with no repositories", async () => {
  const e = engine();
  const { w } = await openSources("github-account-excluded-installation", e);
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://github-control.test/")) return originalFetch(url, options);
    requests.push({ url: String(url), options });
    if (options.method === "GET" && !String(url).includes("/repositories?")) return Response.json({ connected: true, credential: CREDENTIAL });
    if (options.method === "GET") return Response.json({ repositories: [{ id: 12, name: "notes", full_name: "nosoypoot/notes", clone_url: "https://github.com/nosoypoot/notes.git" }] });
    return Response.json({ credential: { ...CREDENTIAL, version: 3, config: { ...CREDENTIAL.config, areas: JSON.parse(options.body).areas, personal_scope: true } } });
  };
  try {
    assert.ok(row(w, "nosoypoot").textContent.includes("0 repos"));
    buttonIn(row(w, "nosoypoot"), "Cambiar repositorios de nosoypoot").click();
    await sleep(100);
    const picker = card(w).querySelector("[data-github-personal-repositories]");
    assert.equal(picker.querySelector('input[type="checkbox"]').checked, false);
    buttonIn(picker, "Guardar selección").click();
    await sleep(100);
    const saved = JSON.parse(requests.find((r) => r.options.method === "PUT").options.body);
    assert.deepEqual(saved.areas.find((a) => a.key === "nosoypoot").personal_repository_ids, []);
    assert.ok(saved.areas.some((a) => a.key === "danil-labs"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a reinstalled GitHub App replaces the old installation without granting its old access", async () => {
  const credential = { ...CREDENTIAL, config: { ...CREDENTIAL.config, areas: [{ key: "danil-labs", installation_id: 70, repository_ids: null }] } };
  const e = engine({ status: { connected: true, credential, install_url: INSTALLS.install_url } });
  const { w } = await openSources("github-account-reinstalled", e);
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://github-control.test/")) return originalFetch(url, options);
    requests.push({ url: String(url), options });
    if (options.method === "GET" && !String(url).includes("/repositories?")) return Response.json({ connected: true, credential });
    if (options.method === "GET") return Response.json({ repositories: [{ id: 11, name: "brand", full_name: "danil-labs/brand", clone_url: "https://github.com/danil-labs/brand.git" }] });
    return Response.json({ credential: { ...credential, version: 3, config: { ...credential.config, areas: JSON.parse(options.body).areas, personal_scope: true } } });
  };
  try {
    buttonIn(row(w, "danil-labs"), "Cambiar repositorios de danil-labs").click();
    await sleep(100);
    const picker = card(w).querySelector("[data-github-personal-repositories]");
    const box = picker.querySelector('input[type="checkbox"]');
    assert.equal(box.checked, false);
    box.click();
    buttonIn(picker, "Guardar selección").click();
    await sleep(100);
    const saved = JSON.parse(requests.find((r) => r.options.method === "PUT").options.body);
    assert.deepEqual(saved.areas, [{ key: "danil-labs", installation_id: 7, personal_repository_ids: [11] }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a renamed installation keeps its selection when another installation reuses its old name", async () => {
  const credential = { ...CREDENTIAL, config: { ...CREDENTIAL.config, personal_scope: true, areas: [{ key: "danil-labs", installation_id: 70, repository_ids: null, personal_repository_ids: [20] }] } };
  const e = engine({ status: { connected: true, credential, install_url: INSTALLS.install_url } });
  e.state.installs = { ...INSTALLS, installations: [...INSTALLS.installations, { key: "danil-renamed", installation_id: 70, account: { login: "danil-renamed", type: "Organization" }, repository_selection: "selected" }] };
  const { w } = await openSources("github-account-renamed-installation", e);
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://github-control.test/")) return originalFetch(url, options);
    requests.push({ url: String(url), options });
    if (options.method === "GET" && !String(url).includes("/repositories?")) return Response.json({ connected: true, credential });
    if (options.method === "GET") return Response.json({ repositories: [{ id: 11, name: "brand", full_name: "danil-labs/brand", clone_url: "https://github.com/danil-labs/brand.git" }] });
    return Response.json({ credential: { ...credential, version: 3, config: { ...credential.config, areas: JSON.parse(options.body).areas } } });
  };
  try {
    buttonIn(row(w, "danil-labs"), "Cambiar repositorios de danil-labs").click();
    await sleep(100);
    const picker = card(w).querySelector("[data-github-personal-repositories]");
    picker.querySelector('input[type="checkbox"]').click();
    buttonIn(picker, "Guardar selección").click();
    await sleep(100);
    const saved = JSON.parse(requests.find((r) => r.options.method === "PUT").options.body);
    assert.deepEqual(saved.areas, [
      { key: "danil-renamed", installation_id: 70, personal_repository_ids: [20] },
      { key: "danil-labs", installation_id: 7, personal_repository_ids: [11] },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("coming back to the window lists the organization that was just installed", async () => {
  const e = engine();
  e.state.installs = { installations: [], install_url: INSTALLS.install_url };
  const app = await openSources("github-account-focus", e);
  const { w } = app;
  assert.equal(row(w, "danil-labs"), null);
  assert.equal(card(w).querySelector("[data-github-installation-pending]"), null, "an older Worker sends no install_pending");
  e.state.installs = INSTALLS;
  w.dispatchEvent(new w.Event("focus"));
  await sleep(400);
  assert.ok(row(w, "danil-labs"), "re-read on focus");
  assert.deepEqual(app.failures, []);
});

test("the ··· menu checks the connection", async () => {
  const e = engine();
  const app = await openSources("github-account-menu", e);
  const { w } = app;
  const before = e.calls.filter((c) => c.command === "github_account_installations").length;
  await menu(w, "Comprobar conexión");
  assert.ok(e.calls.filter((c) => c.command === "github_account_installations").length > before, "checking re-reads the installations");
  assert.equal(e.calls.filter((c) => c.command === "github_account_status").length, 2);
  assert.deepEqual(app.failures, []);
});

test("connecting with no installation opens the install page once, by itself", async () => {
  const e = engine({ status: { connected: false, credential: null, install_url: INSTALLS.install_url } });
  e.state.installs = { installations: [], install_url: INSTALLS.install_url };
  const app = await openSources("github-account-first-install", e);
  const { w } = app;
  assert.ok(text(w).includes("Cuenta"));
  buttonIn(section(w), "Conectar").click();
  await sleep(300);
  e.state.status = { connected: true, credential: CREDENTIAL, install_url: INSTALLS.install_url };
  await sleep(3500);
  assert.deepEqual(opened(e), ["https://github.com/login/oauth/authorize?state=s", INSTALLS.install_url]);
  await sleep(3200);
  assert.equal(opened(e).length, 2, "only once");
  assert.deepEqual(app.failures, []);
});

test("without a Danil session the local GitHub card stays as it was", async () => {
  const e = engine({ signedIn: false });
  const app = await openSources("github-account-none", e);
  const { w } = app;
  assert.equal(card(w)?.dataset.githubAccount, "local");
  // GitHub se conecta solo con la App Danil: un botón, sin token pegado.
  assert.equal(tokenField(w), null, "no pasted token for GitHub");
  assert.ok(buttonIn(section(w), "Conectar"), "the local form is there");
  assert.ok(!e.calls.some((c) => c.command === "github_account_status"), "nobody asks the account");
  assert.deepEqual(app.failures, []);
});

test("the Danil App on this machine without a session says so and offers to sign in", async () => {
  const e = engine({ signedIn: false, local: LOCAL, source: "device" });
  const app = await openSources("github-account-device", e);
  const { w } = app;
  assert.ok(text(w).includes("Solo en esta máquina"), text(w).slice(0, 600));
  assert.ok(buttonIn(w.document.body, "Iniciar sesión"));
  assert.deepEqual(app.failures, []);
});

test("a connection of the previous app asks to reconnect with Danil", async () => {
  const e = engine({ signedIn: false, local: LOCAL, source: "legacy" });
  const app = await openSources("github-account-legacy", e);
  const { w } = app;
  assert.ok(text(w).includes("App anterior"));
  assert.ok(text(w).includes("Vuelve a conectar con Danil"));
  assert.ok(buttonIn(section(w), "Conectar"));
  assert.equal(text(w).includes("Solo en esta máquina"), false);
  assert.deepEqual(app.failures, []);
});

test("an engine that does not know github_account_* keeps the local card without an error", async () => {
  const e = engine({ statusFails: true });
  const app = await openSources("github-account-old-engine", e);
  const { w } = app;
  assert.equal(card(w)?.dataset.githubAccount, "local");
  assert.ok(buttonIn(section(w), "Conectar"));
  assert.equal(w.document.querySelector("[role=alert]"), null);
  assert.deepEqual(app.failures, []);
});

test("without a license the card says tasks do not use GitHub and links the plans", async () => {
  const e = engine({ statusFails: workerFailure("license_required") });
  const app = await openSources("github-account-license", e);
  const { w } = app;
  assert.ok(text(w).includes("Sin licencia"), text(w).slice(0, 600));
  assert.ok(text(w).includes("Las tareas no usan GitHub"));
  buttonIn(card(w), "Ver planes").click();
  await sleep(100);
  assert.deepEqual(opened(e), ["https://danil.ai/planes"]);
  assert.deepEqual(app.failures, []);
});

test("when GitHub does not answer the account row says so and retries", async () => {
  const e = engine();
  e.state.installsFail = workerFailure("github_unavailable");
  const app = await openSources("github-account-unavailable", e);
  const { w } = app;
  assert.ok(text(w).includes("GitHub no responde ahora"), text(w).slice(0, 600));
  assert.equal(row(w, "danil-labs"), null);
  e.state.installsFail = null;
  buttonIn(card(w), "Reintentar").click();
  await sleep(400);
  assert.ok(row(w, "danil-labs"));
  assert.equal(text(w).includes("GitHub no responde ahora"), false);
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
  buttonIn(section(w), "Conectar").click();
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
  assert.ok(text(w).includes("GitHub canceló el permiso"));
  buttonIn(card(w), "Conectar").click();
  await sleep(300);
  assert.ok(e.calls.some((c) => c.command === "github_account_authorize"));
  assert.deepEqual(app.failures, []);
});

test("the providers list puts GitHub first, then GitLab, then Bitbucket", async () => {
  const e = engine({ signedIn: false, hosts: [host("bitbucket", "Bitbucket"), host("gitlab", "GitLab"), github()] });
  const app = await openSources("github-account-order", e);
  const { w } = app;
  const titles = [...w.document.querySelectorAll("section h3, section h2")].map((h) => h.textContent.trim()).filter((s) => ["GitHub", "GitLab", "Bitbucket"].includes(s));
  assert.deepEqual(titles, ["GitHub", "GitLab", "Bitbucket"], text(w).slice(0, 400));
  assert.deepEqual(app.failures, []);
});
