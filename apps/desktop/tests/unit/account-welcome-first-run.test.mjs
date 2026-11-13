/**
 * «Conecta tu cuenta de Danil» en el primer arranque, contra un motor simulado:
 * seguir sin cuenta, conectar con un workspace de Danil (directo) o con varios
 * (se elige), que no vuelva a salir, y que la ventana no tenga «Descarga la app».
 * Monta `dist/`.
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
const PENDING = { state: "pending", user_code: "WDJB-MJHT", verification_uri_complete: "https://app.danil.ai/terminus/connect?code=WDJB-MJHT" };
const CONNECTED = { state: "connected", account: "u_1", computer_id: "cmp_1", email: "alberto@norte.mx", online: true };

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
  list_workspaces: { workspaces: [], active: null },
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

/** El motor y el plano de control: quién entró, qué workspaces locales nacen y qué se enlaza. */
function engine({ directory = [], status = { state: "disconnected", name: "Mac" } } = {}) {
  const state = { status, sessions: [], created: [], links: [], accounts: [], signIns: 0 };
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input?.url ?? input);
    if (url.endsWith("/v1/me/workspaces")) return Response.json({ workspaces: directory, truncated: false });
    return new Response("{}", { status: 404 });
  };
  globalThis.fetch.__jsdomApp = true;
  const table = {
    ...BASE,
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
    add_workspace: ({ name }) => {
      state.created.push(name);
      return { id: `n${state.created.length}`, name };
    },
    set_active_workspace: null,
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
const heading = (w) => w.document.querySelector("h1")?.textContent ?? "";

test("the first run asks for the Danil account; continuing without one keeps today's local onboarding", async () => {
  const e = engine();
  try {
    const app = await boot("listo", "account-welcome-local", e.table);
    const { w } = app;
    await sleep(800);
    assert.equal(screen(w)?.dataset.accountWelcome, "choose", w.document.body.textContent.slice(0, 400));
    assert.equal(heading(w), "Conecta tu cuenta de Danil");
    assert.deepEqual(e.state.created, [], "no workspace is created before the answer");

    w.document.querySelector("[data-account-welcome-local]").click();
    await sleep(800);
    assert.equal(screen(w), null);
    assert.equal(w.localStorage.getItem(KEY), "local");
    assert.equal(heading(w), "Conecta tu IA.");
    assert.deepEqual(e.state.created, ["Personal"]);
    assert.equal(e.state.signIns, 0, "nothing signs in");
    assert.deepEqual(app.failures, []);
  } finally {
    e.restore();
  }
});

test("connecting with one Danil workspace takes it directly and links the new local workspace", async () => {
  const e = engine({ directory: [entry("a:476", 476, "Norte MX")] });
  try {
    const app = await boot("listo", "account-welcome-one", e.table);
    const { w } = app;
    await sleep(800);
    w.document.querySelector("[data-account-welcome-connect]").click();
    await sleep(300);
    assert.equal(screen(w)?.dataset.accountWelcome, "signing");
    assert.equal(e.state.signIns, 1, "the same single sign-in as Settings");
    assert.ok(w.document.body.textContent.includes("WDJB-MJHT"), "the code to confirm");

    e.approve(app);
    await sleep(1200);
    assert.deepEqual(e.state.created, ["Norte MX"], "the local workspace takes the Danil name");
    assert.deepEqual(e.state.links, [["n1", 476]]);
    assert.deepEqual(e.state.accounts, [["n1", "u_1"]]);
    assert.equal(w.localStorage.getItem(KEY), "connected");
    assert.equal(screen(w), null);
    assert.equal(heading(w), "Conecta tu IA.");
    assert.deepEqual(app.failures, []);
  } finally {
    e.restore();
  }
});

test("with several Danil workspaces the person chooses; one on another machine cannot be taken", async () => {
  const e = engine({
    status: CONNECTED,
    directory: [entry("a:1", 1, "Norte MX"), entry("a:2", 2, "Norte USA", null, "member"), entry("a:3", 3, "Tomado", "otra")],
  });
  e.state.sessions = [ALBERTO];
  try {
    const app = await boot("listo", "account-welcome-many", e.table);
    const { w } = app;
    await sleep(800);
    w.document.querySelector("[data-account-welcome-connect]").click();
    await sleep(800);
    assert.equal(e.state.signIns, 0, "an existing session is reused");
    assert.equal(screen(w)?.dataset.accountWelcome, "pick");
    const option = (key) => w.document.querySelector(`[data-account-welcome-option="${key}"]`);
    assert.ok(option("a:1") && option("a:2"));
    assert.equal(option("a:3").disabled, true);
    assert.ok(option("a:3").textContent.includes("Ya está en otra máquina"));
    assert.deepEqual(e.state.created, [], "nothing is created until one is chosen");

    option("a:2").click();
    await sleep(1000);
    assert.deepEqual(e.state.created, ["Norte USA"]);
    assert.deepEqual(e.state.links, [["n1", 2]]);
    assert.equal(heading(w), "Conecta tu IA.");
    assert.deepEqual(app.failures, []);
  } finally {
    e.restore();
  }
});

test("once answered it does not come back, and the window has no «Descarga la app»", async () => {
  const e = engine();
  try {
    const app = await boot("listo", "account-welcome-answered", e.table, undefined, { [KEY]: "connected" });
    const { w } = app;
    await sleep(800);
    assert.equal(screen(w), null);
    assert.equal(heading(w), "Conecta tu IA.");

    w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "download" }));
    await sleep(600);
    assert.equal(w.document.querySelector("[data-app-downloads]"), null);
    assert.ok(!w.document.body.textContent.includes("Descarga la app"));
  } finally {
    e.restore();
  }
});

test("on a computer that still prepares, the account comes first and the onboarding waits for it", async () => {
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
    assert.deepEqual(e.state.created, [], "the finished preparation does not create «Personal» behind the screen");

    w.document.querySelector("[data-account-welcome-local]").click();
    await sleep(1000);
    assert.equal(screen(w), null);
    assert.deepEqual(e.state.created, ["Personal"]);
    assert.equal(heading(w), "Conecta tu IA.");
    assert.deepEqual(app.failures, []);
  } finally {
    e.restore();
  }
});
