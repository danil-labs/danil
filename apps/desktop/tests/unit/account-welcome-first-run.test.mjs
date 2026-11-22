/**
 * «Conecta tu cuenta de Danil» en el primer arranque, contra un motor simulado
 * (plan de cuentas F1.2): no hay camino sin cuenta, y con la sesión el alta
 * entra al workspace de la organización personal Free sellándolo aquí. La
 * ventana nunca crea un workspace local (`add_workspace`), ni consulta el
 * directorio retirado en L3. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const KEY = "danil.onboarding.account_choice";
const NORTE = { id: 9, name: "Norte" };
const entry = (key, danil, name, workspace_id = null, role = "owner") => ({
  key, workspace_id, danil_workspace_id: danil, name, kind: "organization", organization: NORTE, role, owner: role === "owner",
  support: null, capabilities: { agents: true, terminus: true }, pin: null,
});

const ALBERTO = {
  account: "u_1", email: "alberto@norte.mx", name: "Alberto", photo: null, computer_id: "cmp_1", computer_name: "Mac",
  default: true, workspaces: [], status: "connected", online: true,
};
const FAMILY = { family: "f1", email: "alberto@norte.mx", contexts: [{ context_id: "c1", org: "org_1", org_name: "Alberto", plan: "free" }] };
const PENDING = { state: "pending", user_code: "WDJB-MJHT", verification_uri_complete: "https://app.danil.ai/terminus/connect?code=WDJB-MJHT" };
const CONNECTED = { state: "connected", account: "u_1", computer_id: "cmp_1", email: "alberto@norte.mx", online: true, sessions: [FAMILY], default_context: "c1" };

const BASE = {
  window_ready: null,
  window_vitals: null,
  setup_required: false,
  list_projects: [],
  list_sources: [],
  list_live_sessions: [],
  list_live_turns: [],
  list_surfaces: [],
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "test-service", reset: false },
  workspaces_startup: { workspaces: [], active: null },
  list_providers: [
    { id: "codex", label: "Codex", available: true, sin_cuenta: false, source: null, system_broken: false, api_key: null, inferencia: "con_cuenta" },
  ],
  list_accounts: {
    provider: "codex", env_var: "", shared_credential: null, secret_note: null, active: "a1",
    accounts: [{ id: "a1", label: "", created_at: 1, identity: "yo@norte.mx", authenticated_at: 2 }],
  },
  set_workspace_language: null,
  list_git_hosts: [],
  list_known_mcp: [],
  list_mcp_providers: [],
  list_integrations: { workspace: "n", plugins: [] },
};

/** El motor y el plano de control: quién entró, qué se sella aquí y qué nacería local. */
function engine({ directory = [], status = { state: "disconnected", name: "Mac" } } = {}) {
  const state = { status, sessions: [], created: [], sealed: [], active: null, links: [], accounts: [], signIns: 0, requests: [] };
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input?.url ?? input);
    state.requests.push(url);
    if (url.endsWith("/v1/me/workspaces")) return Response.json({ workspaces: directory, truncated: false });
    return new Response("{}", { status: 404 });
  };
  globalThis.fetch.__jsdomApp = true;
  const workspaces = () => ({ workspaces: state.sealed.map((w) => ({ ...w, account: { org: "org_1", account_id: "42" } })), active: state.active });
  const table = {
    ...BASE,
    list_workspaces: workspaces,
    workspaces_startup: workspaces,
    danil_connect_status: () => state.status,
    danil_session_status: () => state.status,
    danil_sessions: () => state.sessions,
    danil_sign_in: () => {
      state.signIns++;
      state.status = PENDING;
      return PENDING;
    },
    danil_sign_out: () => (state.status = { state: "disconnected", name: "Mac" }),
    danil_workspace_account: () => ({ account: null, email: null, signed_in: false, linked: false }),
    account_relay_token: () => ({ token: "client", expires_at: Date.now() + 3_600_000, endpoint: "https://directory.test" }),
    agents_session_link: (args = {}) => {
      state.links.push([args.workspaceId, args.danilWorkspaceId]);
      return { danil_workspace_id: args.danilWorkspaceId };
    },
    danil_workspace_set_account: ({ workspace, account }) => {
      state.accounts.push([workspace, account]);
      return { account, email: "alberto@norte.mx", signed_in: true, linked: true };
    },
    machine_list: [{ id: "m_local", local: true, features: ["account_workspace_v1"] }],
    danil_edge_fetch: ({ method, path }) => {
      if (method === "GET" && path === "/v1/workspaces") return { status: 200, body: { items: [{ id: "42", org: "org_1", name: "Personal", engine_workspace_id: "ws_free" }], next_cursor: null } };
      if (method === "GET" && path === "/v1/identity/me") return { status: 200, body: { id: "p1" } };
      return { status: 404, body: null };
    },
    create_account_workspace: ({ id, name, account }) => {
      state.sealed.push({ id, name });
      return { id, account };
    },
    add_workspace: ({ name }) => {
      state.created.push(name);
      return { id: `n${state.created.length}`, name };
    },
    set_active_workspace: ({ id }) => void (state.active = id),
    open_external: null,
  };
  return {
    state,
    table,
    /** El navegador aprobó: el motor ya tiene la sesión. */
    approve(app) {
      state.status = CONNECTED;
      state.sessions = [ALBERTO];
      app.emit("danil-connect", CONNECTED);
    },
    restore: () => void (globalThis.fetch = previous),
  };
}

const screen = (w) => w.document.querySelector("[data-account-welcome]");
/** Sin sesión la ventana no monta la app: el login es el del gate de arranque (`SessionGate`). */
const gate = (w) => w.document.querySelector("[data-session-gate]")?.dataset.sessionGate ?? null;
const heading = (w) => w.document.querySelector("h1")?.textContent ?? "";

function assertNoLocalWorkspace(app, state) {
  assert.deepEqual(state.created, [], "the window never creates a local workspace");
  assert.equal(app.commands.includes("add_workspace"), false);
  assert.deepEqual(state.requests.filter(url => new URL(url).pathname.startsWith("/v1/me")), [], "no request goes to the retired directory");
  assert.deepEqual(state.links, [], "nothing is linked to the prototype");
  assert.deepEqual(state.accounts, [], "no cloud account is assigned to a local workspace");
  assert.equal(app.commands.some(command => command.startsWith("agents_session_")), false, "the retired directory transport stays unused");
}

function assertEnteredFree(state) {
  assert.deepEqual(state.sealed, [{ id: "ws_free", name: "Personal" }], "the personal Free workspace is sealed here");
  assert.equal(state.active, "ws_free", "and becomes the active one");
}

test("the first run asks only for the Danil account: there is no way to continue without one", async () => {
  const e = engine();
  try {
    const app = await boot("listo", "account-welcome-required", e.table);
    const { w } = app;
    await sleep(800);
    assert.equal(gate(w), "sign_in", w.document.body.textContent.slice(0, 400));
    assert.equal(heading(w), "Conecta tu cuenta de Danil");
    assert.equal(screen(w), null, "nothing of the app is mounted behind the login");
    assert.equal(w.document.querySelector("[data-account-welcome-local]"), null, "«Continuar sin cuenta» is gone");
    assert.ok(!w.document.body.textContent.includes("Continuar sin cuenta"));
    assertNoLocalWorkspace(app, e.state);
    assert.deepEqual(e.state.sealed, []);
    assert.deepEqual(app.failures, []);
  } finally {
    e.restore();
  }
});

test("signing in enters the personal Free workspace without creating a local one", async () => {
  const e = engine({ directory: [entry("a:476", 476, "Norte MX")] });
  try {
    const app = await boot("listo", "account-welcome-one", e.table);
    const { w } = app;
    await sleep(800);
    w.document.querySelector("[data-first-login-sign-in]").click();
    await sleep(300);
    assert.ok(w.document.querySelector('[data-session-gate] [role="status"]'), "signing in");
    assert.equal(e.state.signIns, 1, "the same single sign-in as Settings");
    assert.ok(w.document.body.textContent.includes("WDJB-MJHT"), "the code to confirm");

    e.approve(app);
    await sleep(1500);
    assertEnteredFree(e.state);
    assertNoLocalWorkspace(app, e.state);
    assert.equal(w.localStorage.getItem(KEY), "connected");
    assert.equal(screen(w), null);
    assert.equal(heading(w), "Conecta tu IA.");
    assert.deepEqual(app.failures, []);
  } finally {
    e.restore();
  }
});

test("an existing session is reused and enters the personal Free workspace", async () => {
  const e = engine({
    status: CONNECTED,
    directory: [entry("a:1", 1, "Norte MX"), entry("a:2", 2, "Norte USA", null, "member"), entry("a:3", 3, "Tomado", "otra")],
  });
  e.state.sessions = [ALBERTO];
  try {
    const app = await boot("listo", "account-welcome-many", e.table);
    const { w } = app;
    // La sesión ya confirmada en el gate no se vuelve a pedir en el alta.
    await sleep(2300);
    assert.equal(e.state.signIns, 0, "an existing session is reused");
    assert.equal(screen(w), null);
    assert.equal(w.document.querySelector("[data-account-welcome-pick]"), null);
    assert.equal(w.localStorage.getItem(KEY), "connected");
    assertEnteredFree(e.state);
    assertNoLocalWorkspace(app, e.state);
    assert.equal(heading(w), "Conecta tu IA.");
    assert.deepEqual(app.failures, []);
  } finally {
    e.restore();
  }
});

test("a computer that chose «local» before is asked for the session again", async () => {
  const e = engine();
  try {
    const app = await boot("listo", "account-welcome-was-local", e.table, undefined, { [KEY]: "local" });
    const { w } = app;
    await sleep(800);
    assert.equal(gate(w), "sign_in");
    assertNoLocalWorkspace(app, e.state);
  } finally {
    e.restore();
  }
});

test("a paid session can finish setup and keep the rail open without an active workspace", async () => {
  const family = { ...FAMILY, contexts: [{ ...FAMILY.contexts[0], plan: "enterprise" }] };
  const e = engine({ status: { ...CONNECTED, sessions: [family] } });
  try {
    const app = await boot("listo", "account-welcome-paid", e.table, undefined, { [KEY]: "connected" });
    await sleep(2300);
    assert.ok(app.w.document.querySelector("[data-workspace-column]"), "the rail is available after setup");
    app.w.dispatchEvent(new app.w.CustomEvent("harness:workspace"));
    await sleep(300);
    assert.ok(app.w.document.querySelector("[data-workspace-column]"), "refreshing the workspace keeps the rail open");
    assert.equal(e.state.active, null);
    assert.deepEqual(e.state.sealed, []);
    assertNoLocalWorkspace(app, e.state);
  } finally {
    e.restore();
  }
});

test("answered «connected» but without a session: no local workspace, and only the sign in is shown", async () => {
  const e = engine();
  try {
    const app = await boot("listo", "account-welcome-answered", e.table, undefined, { [KEY]: "connected" });
    const { w } = app;
    await sleep(1000);
    assert.equal(screen(w), null);
    assert.equal(gate(w), "sign_in", w.document.body.textContent.slice(0, 600));
    assert.ok(!w.document.body.textContent.includes("Conecta tu IA."), "the onboarding does not mount without a session");
    assertNoLocalWorkspace(app, e.state);

    w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "download" }));
    await sleep(600);
    assert.equal(w.document.querySelector("[data-app-downloads]"), null);
    assert.ok(!w.document.body.textContent.includes("Descarga la app"));
  } finally {
    e.restore();
  }
});

test("on a computer that still prepares, the account comes first and then the personal Free workspace", async () => {
  const e = engine();
  try {
    const app = await boot("listo", "account-welcome-setup", {
      ...e.table,
      setup_required: true,
      prepare_runtime: { running: false, stages: [{ name: "platform", essential: true, state: "succeeded" }] },
    });
    const { w } = app;
    await sleep(1000);
    assert.ok(app.commands.includes("prepare_runtime"), "preparing does not wait for the answer");
    assert.equal(screen(w)?.dataset.accountWelcome, "choose", w.document.body.textContent.slice(0, 400));
    assert.equal(w.document.querySelector("[data-account-welcome-local]"), null);
    assert.deepEqual(e.state.sealed, [], "the finished preparation does not enter a workspace behind the screen");

    w.document.querySelector("[data-account-welcome-connect]").click();
    await sleep(300);
    e.approve(app);
    await sleep(1500);
    assert.equal(screen(w), null);
    assertEnteredFree(e.state);
    assertNoLocalWorkspace(app, e.state);
    assert.equal(heading(w), "Conecta tu IA.");
    assert.deepEqual(app.failures, []);
  } finally {
    e.restore();
  }
});
