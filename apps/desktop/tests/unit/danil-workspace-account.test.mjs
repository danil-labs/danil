/**
 * Cada workspace es de un workspace de Danil, contra un motor simulado con una
 * sesión por cuenta: la sección «En la nube» en Workspaces, la
 * elección al conectar, el workspace tomado y la desconexión. Enlazar va por la
 * sesión de persona de la ventana (`agents_session_link`), igual que subir
 * (`agents_session_create_danil_workspace`) y desenlazar (`agents_session_unlink`),
 * nunca con el token de cliente. También la hoja que sale al abrirse la sesión de la
 * ventana. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { engine as relayEngine, fleet as relayFleet } from "../helpers/fake-relay.mjs";

const W = { id: "w", name: "Danil", context_root: null };
const W2 = { id: "w2", name: "Fundación Donde Banco", context_root: null };
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
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "test-service", reset: false },
};

const ALBERTO = {
  account: "u_alberto",
  email: "alberto@danil.ai",
  name: "Alberto Ceballos",
  photo: null,
  computer_id: "cmp_a",
  computer_name: "Mac de Alberto",
  default: true,
  workspaces: ["w"],
  status: "connected",
  online: true,
};
const FDB = { ...ALBERTO, account: "u_fdb", email: "alberto@dondebanco.org", name: "Alberto FDB", computer_id: "cmp_b", default: false, workspaces: ["w2"], online: false };
const unknown = () => Object.assign(new Error("command"), { what: { clave: "shell.service.command" }, detail: "command" });

/** El motor: sesiones, el mapa workspace → cuenta y el workspace abierto. */
function engine({ sessions = [ALBERTO, FDB], map = { w: "u_alberto", w2: "u_fdb" }, active = "w", setAccount, status } = {}) {
  const state = { sessions, map, active };
  const calls = [];
  const record = (command, reply) => (args) => {
    calls.push({ command, args });
    return reply(args ?? {});
  };
  const of = (workspace) => {
    const account = state.map[workspace ?? state.active] ?? null;
    const s = state.sessions.find((x) => x.account === account && x.status === "connected");
    const emails = { u_alberto: "alberto@danil.ai", u_fdb: "alberto@dondebanco.org", u_ytw: "alberto@yucatantechweek.mx" };
    return { account, email: emails[account] ?? null, signed_in: Boolean(s), linked: Boolean(s) };
  };
  const workspaces = { workspaces: [W, W2], active: state.active };
  const account = () =>
    status ?? (state.sessions.length ? { state: "connected", computer_id: "cmp_a", account: "u_alberto", email: "alberto@danil.ai", online: true } : { state: "disconnected", name: "Mac de Alberto" });
  return {
    state,
    calls,
    table: {
      list_workspaces: () => ({ ...workspaces, active: state.active }),
      workspaces_startup: () => ({ ...workspaces, active: state.active }),
      set_active_workspace: record("set_active_workspace", ({ id }) => {
        state.active = id;
        return null;
      }),
      danil_connect_status: () => account(),
      // La cuenta de Desk (login por identity) es la que lee la ventana.
      danil_session_status: () => account(),
      danil_sessions: record("danil_sessions", () => state.sessions),
      danil_workspace_account: record("danil_workspace_account", ({ workspace } = {}) => of(workspace)),
      danil_workspace_set_account: record(
        "danil_workspace_set_account",
        setAccount ??
          (({ workspace, account }) => {
            state.map[workspace] = account;
            return of(workspace);
          }),
      ),
      agents_session_link: record("agents_session_link", (args) => plane.link(args)),
      agents_session_unlink: record("agents_session_unlink", (args) => plane.unlink(args)),
      agents_session_create_danil_workspace: record("agents_session_create_danil_workspace", (args) => plane.create(args)),
      account_relay_token: record("account_relay_token", ({ account } = {}) => ({ token: account ?? "main", expires_at: Date.now() + 3_600_000, endpoint: "https://directory.test" })),
      danil_connect_start: record("danil_connect_start", () => ({ state: "pending", user_code: "WDJB-MJHT", verification_uri_complete: "https://app.danil.ai/terminus/connect?code=WDJB-MJHT" })),
      open_external: record("open_external", () => null),
    },
  };
}

const DANIL = { id: 1, name: "Danil" };
const DIRECTORY = [
  { key: "a:476", workspace_id: "w", danil_workspace_id: 476, name: "Danil", kind: "organization", organization: DANIL, role: "owner", owner: true, support: null, capabilities: { agents: true, terminus: true }, pin: null },
  { key: "a:477", workspace_id: null, danil_workspace_id: 477, name: "Fundación Donde Banco", kind: "organization", organization: DANIL, role: "member", owner: false, support: null, capabilities: { agents: true, terminus: false }, pin: null },
  { key: "a:478", workspace_id: "otra", danil_workspace_id: 478, name: "Tomado", kind: "organization", organization: DANIL, role: "owner", owner: false, support: null, capabilities: { agents: true, terminus: true }, pin: null },
];

const FREE_ORG = { ...DIRECTORY[1], key: "a:480", danil_workspace_id: 480, name: "Equipo libre", role: "owner" };
const PERSONAL = { key: "a:490", workspace_id: null, danil_workspace_id: 490, name: "Alberto", kind: "personal", organization: null, role: "owner", owner: false, support: null, capabilities: { agents: true, terminus: false }, pin: null };
const ONLY_HERE = { key: "w:w", workspace_id: "w", danil_workspace_id: null, name: "Danil", kind: "terminus_only", organization: null, role: null, owner: true, support: null, capabilities: { agents: false, terminus: true }, pin: null };

/** El plano de control que contesta ahora; los comandos `agents_session_*` de la sesión de persona lo leen. */
const none = () => { throw new Error("no control plane"); };
let plane = { link: none, unlink: none, create: none };

/**
 * Lo que contesta el plano de control: el directorio (token de cliente) y el enlace
 * 1 a 1 por la sesión de persona. Un enlace con el token de cliente es un defecto.
 */
function controlPlane(entries = DIRECTORY, linkStatus = null, unlinkStatus = null, createStatus = null) {
  const links = [];
  const unlinks = [];
  const creates = [];
  const clientLinks = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url ?? input);
    if (url.endsWith("/v1/me/workspaces")) return Response.json({ workspaces: entries, truncated: false });
    if (url.endsWith("/v1/me/workspaces/pins")) return Response.json({ keys: [] });
    if (url.includes("/danil-workspace")) {
      clientLinks.push({ url, method: init.method });
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return new Response("{}", { status: 404 });
  };
  globalThis.fetch.__jsdomApp = true;
  plane = {
    link(args = {}) {
      links.push({ account: args.account, workspace: args.workspaceId, danil: args.danilWorkspaceId });
      if (linkStatus) throw { what: { clave: `attention.desktop.error.${linkStatus}` }, detail: linkStatus };
      return { danil_workspace_id: args.danilWorkspaceId };
    },
    unlink(args = {}) {
      unlinks.push({ account: args.account, workspace: args.workspaceId });
      if (unlinkStatus) throw { what: { clave: `attention.desktop.error.${unlinkStatus}` }, detail: unlinkStatus };
      return null;
    },
    create(args = {}) {
      creates.push({ account: args.account, workspace: args.workspaceId });
      if (createStatus) throw { what: { clave: `attention.desktop.error.${createStatus}` }, detail: createStatus };
      return { danil_workspace_id: 490, created: true };
    },
  };
  return {
    links,
    unlinks,
    creates,
    restore() {
      globalThis.fetch = previous;
      assert.deepEqual(clientLinks, [], "nothing links with the client token");
    },
  };
}

async function openWorkspaces(name, e) {
  const app = await boot("listo", name, { ...BASE, ...e.table });
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "workspaces" }));
  await sleep(1000);
  return app;
}

async function openDanilAccounts(name, e, antes, panel = "cuenta-danil") {
  const app = await boot("listo", name, { ...BASE, ...e.table }, undefined, {}, { beforeImport: antes });
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: panel }));
  await sleep(1000);
  return app;
}

const section = (w) => w.document.querySelector("[data-workspace-account]");
const buttonIn = (root, label) => [...(root?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === label);
const option = (w, key) => w.document.querySelector(`[data-workspace-link-option="${key}"]`);
const chooser = (w) => w.document.querySelector("[data-workspace-link-chooser]");

test("Desk has one account: even if the engine keeps several, the workspace offers no account to pick", async () => {
  const e = engine();
  const app = await openWorkspaces("danil-workspace-one-account", e);
  const { w } = app;
  assert.equal(section(w), null, "no per-account section: switching user does not exist");
  assert.equal(w.document.querySelector("[data-workspace-account-select]"), null);
  assert.ok(!e.calls.some((c) => c.command === "danil_sessions"), "the engine's account list is not read");
  assert.deepEqual(app.failures, []);
});

test("with an engine without sessions per account, the workspace has no account section", async () => {
  const e = engine();
  const app = await openWorkspaces("danil-workspace-account-old-engine", {
    table: { ...e.table, danil_sessions: unknown(), danil_workspace_account: unknown() },
  });
  assert.equal(section(app.w), null);
  assert.ok(app.w.document.body.textContent.includes("Fundación Donde Banco"), "the workspaces screen is there");
  assert.deepEqual(app.failures, []);
});

test("opening the window session offers to upload the open workspace or sync it with one the person administers", async () => {
  const e = engine();
  const { app, control } = await signedIn("danil-workspace-step-sync", e, [LOCAL, FREE, DIRECTORY[1]]);
  try {
    const { w } = app;
    assert.ok(step(w), w.document.body.textContent.slice(0, 300));
    assert.equal(step(w).dataset.danilWorkspaceStep, "upload", "uploading is the first choice");
    assert.ok(step(w).textContent.includes("Sincroniza «Danil» con la nube"));
    w.document.querySelector("[data-danil-step-sync]").click();
    await sleep(200);
    const options = [...w.document.querySelectorAll("[data-danil-step-pick] option")].map((o) => o.value);
    assert.deepEqual(options, ["a:480"], "only the free ones it administers");
    assert.equal(w.document.querySelector("[data-danil-step-submit]").textContent, "Sincronizar con «Equipo libre»");
    w.document.querySelector("[data-danil-step-submit]").click();
    await sleep(500);
    assert.deepEqual(control.links, [{ account: undefined, workspace: "w", danil: 480 }]);
    assert.deepEqual(control.creates, []);
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("«Subir» creates the person's own workspace; if it exists, the step offers to sync with it", async () => {
  for (const [name, status] of [["danil-workspace-step-upload", null], ["danil-workspace-step-exists", "personal_workspace_exists"]]) {
    const { app, control } = await signedIn(name, engine(), [LOCAL, FREE, PERSONAL], status);
    try {
      const { w } = app;
      assert.equal(w.document.querySelector("[data-danil-step-submit]").textContent, "Subir «Danil»");
      w.document.querySelector("[data-danil-step-submit]").click();
      await sleep(500);
      assert.deepEqual(control.creates, [{ account: undefined, workspace: "w" }], name);
      if (!status) {
        assert.equal(step(w), null, "uploaded, the step closes");
      } else {
        assert.equal(step(w)?.dataset.danilWorkspaceStep, "sync");
        assert.equal(step(w).querySelector("[role=alert]")?.textContent, "Ya tienes un workspace propio en la nube. Sincroniza este con ese.");
        assert.equal(w.document.querySelector("[data-danil-step-pick]").value, "a:490");
        w.document.querySelector("[data-danil-step-submit]").click();
        await sleep(500);
        assert.deepEqual(control.links, [{ account: undefined, workspace: "w", danil: 490 }]);
      }
      assert.deepEqual(app.failures, []);
    } finally {
      control.restore();
    }
  }
});

test("«Ahora no» does not ask again for that workspace", async () => {
  const e = engine();
  const { app, control } = await signedIn("danil-workspace-step-later", e, [LOCAL, FREE]);
  try {
    const { w } = app;
    assert.ok(step(w));
    w.document.querySelector("[data-danil-step-later]").click();
    await sleep(300);
    assert.equal(step(w), null);
    assert.ok(JSON.parse(w.localStorage.getItem("harness.layout.danilWorkspaceStep.dismissed")).includes("w"));
    app.emit("agents-session", { state: "signed_in", account: "default" });
    await sleep(800);
    assert.equal(step(w), null, "the next session does not ask again");
    assert.deepEqual(control.links, []);
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("a linked workspace gets no step, and one with nothing to sync with can only be uploaded", async () => {
  {
    const { app, control } = await signedIn("danil-workspace-step-linked", engine(), [{ ...LOCAL, danil_workspace_id: 476, key: "a:476" }, FREE]);
    try {
      assert.equal(step(app.w), null);
      assert.deepEqual(app.failures, []);
    } finally {
      control.restore();
    }
  }
  const { app, control } = await signedIn("danil-workspace-step-empty", engine(), [LOCAL, DIRECTORY[1]]);
  try {
    const { w } = app;
    assert.equal(step(w)?.dataset.danilWorkspaceStep, "upload");
    assert.equal(w.document.querySelector("[data-danil-step-sync]").disabled, true);
    assert.ok(step(w).textContent.includes("Todavía no tienes workspaces en la nube."));
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});
