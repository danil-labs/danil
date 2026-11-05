/**
 * Configuración → Fuentes → GitLab y Bitbucket contra un motor y un Worker
 * simulados: con sesión de Danil el panel es el de GitHub (cuenta con ···,
 * grupos o espacios con «Abrir», en uso en, reconectar) y lee
 * `/v1/git-hosts/:provider` con el token de cliente de la cuenta; sin sesión,
 * GitLab conecta por el navegador del motor y Bitbucket pide iniciar sesión y
 * conserva su token de espacio. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const W = { id: "w", name: "Danil", context_root: null };
const ENDPOINT = "https://computers.danil.ai";
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
const host = (id, name, extra = {}) => ({
  id,
  name,
  summary: frase(`providers.${id}.summary`),
  vocabulary: { change: frase(`providers.${id}.change`), change_short: frase(`providers.${id}.change_short`), change_prefix: id === "gitlab" ? "!" : "#", checks: frase(`providers.${id}.checks`) },
  connected: null,
  select_area: false,
  setup_url: null,
  fields: [],
  token_label: frase(`providers.${id}.token_label`),
  token_help: frase(`providers.${id}.token_help`),
  token_url: `https://${id}.example/tokens`,
  area_label: frase(`providers.${id}.area_label`),
  areas_label: frase(`providers.${id}.areas_label`),
  area_help: frase(`providers.${id}.area_help`),
  browser_login: false,
  login_help: frase(`providers.${id}.login_help`),
  unverified: null,
  ...extra,
});
const local = (user, data = {}) => ({ selected_area: null, selected_areas: [], data, workspace: "w", identity: { user, name: user }, connected_at: 1 });

const GITLAB = {
  id: "cred_gl",
  kind: "gitlab",
  status: "active",
  label: "aceballos",
  version: 1,
  config: { gitlab_user_id: 77, login: "aceballos", avatar: null },
  machines: [
    { computer_id: "cmp_vm", name: "vm-alberto", state: "active" },
    { computer_id: "cmp_mac", name: "Mac de Alberto", state: "removed" },
  ],
};
const BITBUCKET = { ...GITLAB, id: "cred_bb", kind: "bitbucket", label: "alberto", config: { bitbucket_uuid: "{u-1}", login: "alberto", avatar: null }, machines: [] };
const AREAS = {
  gitlab: {
    areas: [
      { key: "aceballos", name: "aceballos", kind: "user", url: "https://gitlab.com/aceballos" },
      { key: "raelay", name: "Raelay Labs", kind: "group", url: "https://gitlab.com/groups/raelay" },
    ],
    manage_url: "https://gitlab.com/-/user_settings/applications",
  },
  bitbucket: { areas: [{ key: "danil", name: "Danil", kind: "workspace", url: "https://bitbucket.org/danil/" }], manage_url: null },
};

/**
 * El Worker: `/v1/git-hosts/:provider*` con el token de cliente; lo demás sigue su camino.
 * Uno solo para todo el archivo: una ventana de una prueba anterior sigue viva y aún pregunta.
 */
let current = { state: {}, seen: [] };
const previousFetch = globalThis.fetch;
function installWorker() {
  if (globalThis.fetch.__gitHostWorker) return;
  const inner = globalThis.fetch;
  const fake = async (input, init = {}) => {
    const url = String(input?.url ?? input);
    const m = url.startsWith(`${ENDPOINT}/v1/git-hosts/`) ? /\/v1\/git-hosts\/([^/?]+)(?:\/([a-z]+))?/.exec(url) : null;
    if (!m) return inner(input, init);
    const [, provider, action = ""] = m;
    const method = init.method ?? "GET";
    current.seen.push({ provider, action, method, auth: init.headers?.authorization });
    const p = current.state[provider];
    if (!p) return Response.json({ error: { code: "not_found" } }, { status: 404 });
    if (p.fail) return Response.json({ error: { code: p.fail } }, { status: p.status ?? 503 });
    if (action === "" && method === "GET") return Response.json({ connected: !!p.credential, credential: p.credential, manage_url: null });
    if (action === "" && method === "DELETE") {
      p.credential = null;
      return Response.json({ ok: true });
    }
    if (action === "authorize") return Response.json({ url: `https://${provider}.example/oauth/authorize?state=s`, expires_at: null });
    if (action === "areas") {
      if (p.areasFail) return Response.json({ error: { code: p.areasFail } }, { status: 409 });
      return Response.json(AREAS[provider]);
    }
    return Response.json({ error: { code: "not_found" } }, { status: 404 });
  };
  fake.__gitHostWorker = true;
  fake.__jsdomApp = inner.__jsdomApp;
  globalThis.fetch = fake;
}
function worker(state) {
  current = { state, seen: [] };
  return { seen: current.seen, restore: () => {} };
}
test.after(() => void (globalThis.fetch = previousFetch));

function engine({ signedIn = true, hosts } = {}) {
  const calls = [];
  const record = (command, reply) => (args) => {
    calls.push({ command, args });
    return reply(args ?? {});
  };
  const pending = { finish: null };
  return {
    calls,
    pending,
    table: {
      list_git_hosts: () => hosts,
      check_git_host: ({ id }) => hosts.find((h) => h.id === id),
      git_host_areas: () => [],
      danil_workspace_account: record("danil_workspace_account", () => ({ account: signedIn ? "u_a" : null, signed_in: signedIn })),
      account_relay_token: record("account_relay_token", () => ({ token: "client-tok", expires_at: Date.now() + 3_600_000, endpoint: ENDPOINT })),
      github_account_status: record("github_account_status", () => ({ connected: false, credential: null, install_url: null })),
      github_account_installations: () => ({ installations: [], install_url: null }),
      account_credential_restore_machine: record("account_credential_restore_machine", ({ computer }) => ({
        credential: { ...GITLAB, machines: GITLAB.machines.map((m) => (m.computer_id === computer ? { ...m, state: "active" } : m)) },
      })),
      account_credential_remove_machine: record("account_credential_remove_machine", () => ({ credential: GITLAB })),
      start_browser_login: record("start_browser_login", () => ({ code: "ABCD-1234", url: "https://gitlab.com/oauth/device?user_code=ABCD-1234", expires_at: Date.now() + 600_000 })),
      finish_browser_login: record("finish_browser_login", () => new Promise((resolve) => void (pending.finish = resolve))),
      cancel_browser_login: record("cancel_browser_login", () => null),
      open_external: record("open_external", () => null),
    },
  };
}

async function openSources(name, e) {
  const app = await boot("listo", name, { ...BASE, ...e.table, "plugin:dialog|message": () => "Ok" });
  installWorker();
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "fuentes" }));
  await sleep(1500);
  return app;
}

const text = (w) => w.document.body.textContent ?? "";
const card = (w, id) => [...w.document.querySelectorAll("section")].find((s) => s.querySelector("h2, h3")?.textContent.trim() === id);
const account = (w, id) => card(w, id)?.querySelector("[data-git-host-account]");
const buttonIn = (root, label) => [...(root?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === label || b.getAttribute("aria-label") === label);
const opened = (e) => e.calls.filter((c) => c.command === "open_external").map((c) => c.args.target);
const menuItem = (w, label) => [...w.document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent.trim() === label);
async function menu(w, root, trigger, label) {
  buttonIn(root, trigger).dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  await sleep(80);
  assert.ok(menuItem(w, label), label);
  menuItem(w, label).dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await sleep(300);
}

test("with a Danil session GitLab and Bitbucket use the GitHub panel: account, groups or workspaces, and machines", async () => {
  const fake = worker({ gitlab: { credential: GITLAB }, bitbucket: { credential: BITBUCKET } });
  try {
    const e = engine({ hosts: [host("github", "GitHub", { browser_login: true }), host("gitlab", "GitLab"), host("bitbucket", "Bitbucket")] });
    const app = await openSources("git-host-account-card", e);
    const { w } = app;
    const gl = card(w, "GitLab");
    assert.equal(account(w, "GitLab")?.dataset.gitHostAccount, "account", text(w).slice(0, 600));
    assert.ok(gl.querySelector('[data-git-host-login="aceballos"]')?.textContent.includes("@aceballos"));
    assert.equal(gl.textContent.includes("Grupos"), false, "no label row: the groups are indented rows");
    assert.ok(gl.querySelector('[data-git-host-installation="raelay"]')?.textContent.includes("Grupo"));
    assert.ok(gl.querySelector('[data-git-host-installation="aceballos"]')?.textContent.includes("Personal"));
    assert.equal([...gl.querySelectorAll("button")].some((b) => b.textContent.includes("Añadir")), false, "no installation to add with user OAuth");
    assert.ok(gl.querySelector('[data-git-host-installation="raelay"]')?.classList.contains("pl-6"), "indented like GitHub");
    assert.equal(gl.querySelector('input[type="password"]'), null, "the pasted token form is not shown");
    buttonIn(gl, "Abrir Raelay Labs en GitLab").click();
    await sleep(100);
    assert.deepEqual(opened(e), ["https://gitlab.com/groups/raelay"]);

    const bb = card(w, "Bitbucket");
    assert.equal(account(w, "Bitbucket")?.dataset.gitHostAccount, "account");
    assert.ok(bb.querySelector('[data-git-host-installation="danil"]')?.textContent.includes("Espacio"));

    // El token de cliente es el de la cuenta del workspace, y va al Worker.
    assert.deepEqual(e.calls.find((c) => c.command === "account_relay_token")?.args, { account: "u_a" });
    assert.ok(fake.seen.some((s) => s.provider === "gitlab" && s.action === "areas" && s.auth === "Bearer client-tok"));
    assert.ok(fake.seen.some((s) => s.provider === "bitbucket" && s.action === "" && s.method === "GET"));

    const machines = gl.querySelector("[data-git-host-machines]");
    assert.ok(machines?.textContent.includes("vm-alberto"));
    buttonIn(machines.querySelector('[data-git-host-machine="cmp_mac"]'), "Volver a poner").click();
    await sleep(300);
    assert.deepEqual(e.calls.find((c) => c.command === "account_credential_restore_machine")?.args, { scope: "w", credential: "cred_gl", computer: "cmp_mac" });
    assert.ok(buttonIn(gl.querySelector('[data-git-host-machine="cmp_mac"]'), "Quitar"));
    assert.deepEqual(app.failures, []);
  } finally {
    fake.restore();
  }
});

test("the ··· menu checks the connection and disconnects", async () => {
  const fake = worker({ gitlab: { credential: GITLAB }, bitbucket: { credential: null } });
  try {
    const e = engine({ hosts: [host("gitlab", "GitLab"), host("bitbucket", "Bitbucket")] });
    const app = await openSources("git-host-account-menu", e);
    const { w } = app;
    const before = fake.seen.filter((s) => s.provider === "gitlab" && s.action === "areas").length;
    await menu(w, card(w, "GitLab"), "Más acciones de GitLab", "Comprobar conexión");
    assert.ok(fake.seen.filter((s) => s.provider === "gitlab" && s.action === "areas").length > before, "checking re-reads the groups");

    await menu(w, card(w, "GitLab"), "Más acciones de GitLab", "Desconectar");
    await sleep(200);
    assert.ok(fake.seen.some((s) => s.provider === "gitlab" && s.method === "DELETE"), "disconnect deletes the person's connection");
    assert.ok(buttonIn(card(w, "GitLab"), "Conectar"), text(w).slice(0, 600));
    assert.deepEqual(app.failures, []);
  } finally {
    fake.restore();
  }
});

test("Conectar on the Bitbucket header with a session opens the Worker's authorization and waits", async () => {
  const state = { gitlab: { credential: null }, bitbucket: { credential: null } };
  const fake = worker(state);
  try {
    const e = engine({ hosts: [host("gitlab", "GitLab"), host("bitbucket", "Bitbucket")] });
    const app = await openSources("git-host-account-connect", e);
    const { w } = app;
    assert.equal(card(w, "Bitbucket").querySelector("[data-git-host-sign-in]"), null, "with a session there is nothing to sign in to");
    buttonIn(card(w, "Bitbucket"), "Conectar").click();
    await sleep(300);
    assert.ok(fake.seen.some((s) => s.provider === "bitbucket" && s.action === "authorize" && s.method === "POST"));
    assert.deepEqual(opened(e), ["https://bitbucket.example/oauth/authorize?state=s"]);
    assert.ok(card(w, "Bitbucket").textContent.includes("Esperando a que apruebes en Bitbucket"));
    state.bitbucket.credential = BITBUCKET;
    await sleep(3500);
    assert.ok(card(w, "Bitbucket").querySelector('[data-git-host-login="alberto"]'), "once connected the account row appears");
    assert.equal(opened(e).length, 1, "with areas nothing else opens");
    assert.deepEqual(app.failures, []);
  } finally {
    fake.restore();
  }
});

test("a connection the provider stopped accepting asks to reconnect, and errors stay in the panel", async () => {
  const fake = worker({ gitlab: { credential: { ...GITLAB, status: "reauthorize" } }, bitbucket: { credential: BITBUCKET, areasFail: "bitbucket_refresh_invalid" } });
  try {
    const e = engine({ hosts: [host("gitlab", "GitLab"), host("bitbucket", "Bitbucket")] });
    const app = await openSources("git-host-account-reauthorize", e);
    const { w } = app;
    assert.ok(card(w, "GitLab").textContent.includes("GitLab canceló el permiso"), text(w).slice(0, 600));
    buttonIn(card(w, "GitLab"), "Conectar").click();
    await sleep(300);
    assert.ok(fake.seen.some((s) => s.provider === "gitlab" && s.action === "authorize"));
    assert.ok(card(w, "Bitbucket").textContent.includes("La conexión de Bitbucket de esta máquina ya no vale"), card(w, "Bitbucket").textContent);
    assert.deepEqual(app.failures, []);
  } finally {
    fake.restore();
  }
});

test("a pasted token with a session is still shown, with one row to connect with Danil", async () => {
  const fake = worker({ gitlab: { credential: null }, bitbucket: { credential: null } });
  try {
    const e = engine({
      hosts: [
        host("gitlab", "GitLab", { connected: local("aceballos"), source: "legacy" }),
        host("bitbucket", "Bitbucket", { connected: local("danil-bot"), source: "legacy" }),
      ],
    });
    const app = await openSources("git-host-account-legacy", e);
    const { w } = app;
    const bb = card(w, "Bitbucket");
    assert.equal(account(w, "Bitbucket")?.dataset.gitHostAccount, "local", "the pasted token still runs the tasks");
    assert.ok(bb.querySelector("[data-git-host-migrate]")?.textContent.includes("Token anterior"));
    assert.ok(bb.textContent.includes("danil-bot"), "the workspace token is still shown");
    buttonIn(bb.querySelector("[data-git-host-migrate]"), "Conectar").click();
    await sleep(300);
    assert.ok(fake.seen.some((s) => s.provider === "bitbucket" && s.action === "authorize"));
    assert.ok(card(w, "GitLab").querySelector("[data-git-host-migrate]"));
    assert.deepEqual(app.failures, []);
  } finally {
    fake.restore();
  }
});

test("a self-managed GitLab token stays visible next to the account", async () => {
  const fake = worker({ gitlab: { credential: GITLAB }, bitbucket: { credential: null } });
  try {
    const e = engine({ hosts: [host("gitlab", "GitLab", { connected: local("alberto", { url: "https://gitlab.raelay.mx" }), source: "legacy" }), host("bitbucket", "Bitbucket")] });
    const app = await openSources("git-host-account-self-managed", e);
    const { w } = app;
    const gl = card(w, "GitLab");
    assert.ok(gl.querySelector('[data-git-host-login="aceballos"]'), "the account");
    assert.ok(gl.textContent.includes("alberto"), "and the self-managed connection");
    assert.equal(gl.querySelector("[data-git-host-migrate]"), null, "a self-managed token is not moved");
    assert.deepEqual(app.failures, []);
  } finally {
    fake.restore();
  }
});

test("without a session GitLab connects through the engine's browser login and Bitbucket asks to sign in", async () => {
  const fake = worker({});
  try {
    const e = engine({
      signedIn: false,
      hosts: [host("gitlab", "GitLab", { browser_login: true }), host("bitbucket", "Bitbucket", { connected: local("danil-bot"), source: "legacy" })],
    });
    const app = await openSources("git-host-account-no-session", e);
    const { w } = app;
    assert.equal(fake.seen.length, 0, "nobody asks the account");
    assert.ok(!e.calls.some((c) => c.command === "account_relay_token"));
    assert.equal(account(w, "GitLab")?.dataset.gitHostAccount, "local");

    const bb = card(w, "Bitbucket");
    assert.ok(bb.querySelector("[data-git-host-sign-in]")?.textContent.includes("Inicia sesión en Danil para conectar Bitbucket"), bb.textContent);
    assert.ok(buttonIn(bb, "Iniciar sesión"));
    assert.ok(bb.textContent.includes("danil-bot"), "the workspace token stays");

    buttonIn(card(w, "GitLab"), "Conectar").click();
    await sleep(300);
    assert.deepEqual(e.calls.find((c) => c.command === "start_browser_login")?.args, { id: "gitlab", scope: "w" });
    assert.deepEqual(opened(e), ["https://gitlab.com/oauth/device?user_code=ABCD-1234"]);
    assert.ok(card(w, "GitLab").textContent.includes("ABCD-1234"));
    e.pending.finish?.(host("gitlab", "GitLab", { browser_login: true, connected: local("aceballos"), source: "device" }));
    await sleep(300);
    assert.ok(card(w, "GitLab").textContent.includes("Solo en esta máquina"), card(w, "GitLab").textContent);
    assert.deepEqual(app.failures, []);
  } finally {
    fake.restore();
  }
});

test("a Worker without the git-hosts routes keeps the local cards without an error", async () => {
  const fake = worker({});
  try {
    const e = engine({ hosts: [host("gitlab", "GitLab"), host("bitbucket", "Bitbucket")] });
    const app = await openSources("git-host-account-old-worker", e);
    const { w } = app;
    assert.equal(account(w, "GitLab")?.dataset.gitHostAccount, "local");
    assert.equal(account(w, "Bitbucket")?.dataset.gitHostAccount, "local");
    assert.ok(card(w, "Bitbucket").querySelector('input[type="password"]'), "the pasted token form is there");
    assert.equal(w.document.querySelector("[role=alert]"), null);
    assert.deepEqual(app.failures, []);
  } finally {
    fake.restore();
  }
});
