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
      danil_connect_status: () =>
        status ?? (state.sessions.length ? { state: "connected", computer_id: "cmp_a", account: "u_alberto", email: "alberto@danil.ai", online: true } : { state: "disconnected", name: "Mac de Alberto" }),
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

test("the workspace shows its sync line and only explicit actions; changing asks first", async () => {
  const control = controlPlane();
  try {
    const e = engine();
    const app = await openWorkspaces("danil-workspace-account", e);
    const { w } = app;
    assert.ok(section(w), w.document.body.textContent.slice(0, 300));
    assert.ok(section(w).textContent.includes("En la nube"));
    assert.equal(section(w).dataset.workspaceCloud, "synced");
    assert.ok(section(w).textContent.includes("Sincronizado con «Danil»"), section(w).textContent);
    assert.ok(section(w).textContent.includes("alberto@danil.ai"));
    assert.equal(w.document.querySelector("[data-workspace-account-select]"), null, "there is no free selector");
    assert.ok(buttonIn(section(w), "Cambiar"));
    assert.ok(buttonIn(section(w), "Desvincular"));

    buttonIn(section(w), "Cambiar").click();
    await sleep(400);
    assert.ok(chooser(w), "the directory opens");
    assert.ok(option(w, "a:477"));
    assert.equal(option(w, "a:478")?.dataset.taken, "", "a workspace on another machine is marked");
    assert.equal(control.links.length, 0, "nothing is linked until it is chosen");

    option(w, "a:477").click();
    await sleep(300);
    const confirm = w.document.querySelector("[data-workspace-change-confirm]");
    assert.ok(confirm, "changing asks first");
    assert.ok(confirm.textContent.includes("Se mueven las máquinas, la memoria y los agentes"));
    assert.equal(control.links.length, 0, "nothing moves before the confirmation");

    confirm.querySelector("[data-workspace-change-yes]").click();
    await sleep(500);
    assert.deepEqual(control.links.map((l) => [l.workspace, l.danil, l.account]), [["w", 477, undefined]], "the main account's window session links");
    assert.deepEqual(e.calls.filter((c) => c.command === "danil_workspace_set_account").map((c) => c.args), [{ workspace: "w", account: "u_alberto" }]);
    assert.ok(section(w).textContent.includes("Sincronizado con «Danil»"));
    assert.equal(w.document.querySelector("[role=alert]"), null);
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("a workspace without an account asks once, and cancelling leaves it without an account", async () => {
  const control = controlPlane();
  try {
    const e = engine({ map: { w2: "u_fdb" } });
    const app = await openWorkspaces("danil-workspace-account-none", e);
    const { w } = app;
    assert.equal(section(w).dataset.workspaceAccount, "none");
    assert.ok(section(w).textContent.includes("Este workspace no es de ninguna cuenta"));
    assert.equal(w.document.querySelector("[data-danil-foot]"), null, "the footer shows nobody");

    buttonIn(section(w), "Sincronizar con Danil").click();
    await sleep(400);
    assert.ok(chooser(w));
    buttonIn(chooser(w), "Cancelar").click();
    await sleep(200);
    assert.equal(chooser(w), null);
    assert.ok(!e.calls.some((c) => c.command === "danil_workspace_set_account"), "cancel keeps it without an account");

    buttonIn(section(w), "Sincronizar con Danil").click();
    await sleep(400);
    option(w, "a:477").click();
    await sleep(500);
    assert.deepEqual(control.links.map((l) => l.danil), [477]);
    assert.deepEqual(e.calls.filter((c) => c.command === "danil_workspace_set_account").map((c) => c.args), [{ workspace: "w", account: "u_alberto" }]);
    assert.ok(section(w).textContent.includes("Sincronizado con «Danil»"), section(w).textContent);
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("signing in from a workspace without one asks once and links the chosen workspace", async () => {
  const control = controlPlane();
  try {
    const e = engine({ sessions: [], map: {} });
    const app = await openDanilAccounts("danil-accounts-add-claims", e);
    const { w } = app;
    w.document.querySelector("[data-danil-manage]").click();
    await sleep(300);
    buttonIn(w.document.querySelector("[data-danil-account]"), "Iniciar sesión con Danil").click();
    await sleep(300);
    assert.ok(e.calls.some((c) => c.command === "danil_connect_start"));
    assert.ok(!e.calls.some((c) => c.command === "danil_workspace_set_account"), "nothing links before choosing");

    e.state.sessions = [ALBERTO];
    app.emit("danil-sessions", e.state.sessions);
    await sleep(600);
    assert.ok(chooser(w), "the choice opens once the session arrives");
    option(w, "a:477").click();
    await sleep(500);
    assert.deepEqual(control.links.map((l) => l.danil), [477]);
    assert.deepEqual(e.calls.filter((c) => c.command === "danil_workspace_set_account").map((c) => c.args), [{ workspace: "w", account: "u_alberto" }]);
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("a workspace taken by another machine is explained and another one is offered", async () => {
  const control = controlPlane();
  try {
    const e = engine({ map: {} });
    const app = await openWorkspaces("danil-workspace-account-taken", e);
    const { w } = app;
    buttonIn(section(w), "Sincronizar con Danil").click();
    await sleep(400);
    option(w, "a:478").click();
    await sleep(200);
    assert.equal(w.document.querySelector("[data-workspace-account] [role=alert]")?.textContent, "Ese workspace de Danil ya está en otra máquina. Elige otro.");
    assert.equal(control.links.length, 0, "a taken workspace is not linked");
    option(w, "a:477").click();
    await sleep(500);
    assert.deepEqual(control.links.map((l) => l.danil), [477]);
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("the control plane refusing a taken workspace keeps the list open", async () => {
  const control = controlPlane(DIRECTORY, "danil_workspace_taken");
  try {
    const e = engine({ map: {} });
    const app = await openWorkspaces("danil-workspace-account-refused", e);
    const { w } = app;
    buttonIn(section(w), "Sincronizar con Danil").click();
    await sleep(400);
    option(w, "a:477").click();
    await sleep(500);
    assert.equal(w.document.querySelector("[data-workspace-account] [role=alert]")?.textContent, "Ese workspace de Danil ya está en otra máquina. Elige otro.");
    assert.ok(chooser(w), "the list stays open to choose another");
    assert.ok(!e.calls.some((c) => c.command === "danil_workspace_set_account"));
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("without a window session, linking asks to sign in and the engine keeps no account", async () => {
  const control = controlPlane(DIRECTORY, "no_session");
  try {
    const e = engine({ map: {} });
    const app = await openWorkspaces("danil-workspace-account-no-session", e);
    const { w } = app;
    buttonIn(section(w), "Sincronizar con Danil").click();
    await sleep(400);
    option(w, "a:477").click();
    await sleep(500);
    assert.equal(w.document.querySelector("[data-workspace-account] [role=alert]")?.textContent, "Inicia sesión con Danil en esta ventana para sincronizar este workspace.");
    assert.ok(chooser(w), "the list stays open");
    assert.ok(!e.calls.some((c) => c.command === "danil_workspace_set_account"));
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("a second account links with its own window session", async () => {
  const control = controlPlane();
  try {
    const e = engine({ map: { w: "u_fdb", w2: "u_fdb" } });
    const app = await openWorkspaces("danil-workspace-account-second", e);
    const { w } = app;
    buttonIn(section(w), "Cambiar").click();
    await sleep(400);
    option(w, "a:477").click();
    await sleep(200);
    w.document.querySelector("[data-workspace-change-yes]").click();
    await sleep(500);
    assert.deepEqual(control.links.map((l) => [l.account, l.danil]), [["u_fdb", 477]]);
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("a workspace only on this computer is uploaded with its name, by anyone signed in", async () => {
  const control = controlPlane([ONLY_HERE, { ...DIRECTORY[1], role: "member" }]);
  try {
    const e = engine();
    const app = await openWorkspaces("danil-workspace-cloud-upload", e);
    const { w } = app;
    assert.equal(section(w).dataset.workspaceCloud, "local", section(w).textContent);
    assert.ok(section(w).textContent.includes("Solo en esta computadora"));
    assert.equal(buttonIn(section(w), "Desvincular"), undefined, "nothing to unlink yet");
    assert.equal(w.document.querySelector("[data-workspace-cloud-sync]"), null, "a member's workspace is not offered to sync");
    assert.equal(w.document.querySelector("[data-workspace-create]"), null, "no name is asked");
    buttonIn(section(w), "Subir «Danil»").click();
    await sleep(500);
    assert.deepEqual(control.creates, [{ account: undefined, workspace: "w" }], "the main account's window session uploads it");
    assert.deepEqual(control.links, []);
    assert.equal(w.document.querySelector("[data-workspace-account] [role=alert]"), null);
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("uploading when the person already has a workspace offers to sync with it", async () => {
  const control = controlPlane([ONLY_HERE, FREE_ORG, PERSONAL], null, null, "personal_workspace_exists");
  try {
    const e = engine();
    const app = await openWorkspaces("danil-workspace-cloud-exists", e);
    const { w } = app;
    buttonIn(section(w), "Subir «Danil»").click();
    await sleep(500);
    assert.equal(control.creates.length, 1);
    assert.equal(w.document.querySelector("[data-workspace-account] [role=alert]")?.textContent, "Ya tienes un workspace propio en la nube. Sincroniza este con ese.");
    assert.equal(w.document.querySelector("[data-workspace-cloud-pick]").value, "a:490", "its own workspace is picked");
    w.document.querySelector("[data-workspace-cloud-sync]").click();
    await sleep(500);
    assert.deepEqual(control.links.map((l) => [l.workspace, l.danil]), [["w", 490]]);
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("unlinking asks first and only takes this workspace out of its account", async () => {
  const control = controlPlane();
  try {
    const e = engine();
    const app = await openWorkspaces("danil-workspace-account-leave", e);
    const { w } = app;
    buttonIn(section(w), "Desvincular").click();
    const ask = () => w.document.querySelector("[data-workspace-leave]");
    assert.ok(ask(), "it asks before unlinking");
    assert.ok(ask().textContent.includes("Se quita de alberto@danil.ai"));
    assert.ok(!e.calls.some((c) => c.command === "danil_workspace_set_account"));
    buttonIn(ask(), "Cancelar").click();
    await sleep(200);
    assert.equal(ask(), null);
    assert.ok(!e.calls.some((c) => c.command === "danil_workspace_set_account"), "cancel keeps it linked");

    buttonIn(section(w), "Desvincular").click();
    ask().querySelector("[data-workspace-leave-yes]").click();
    await sleep(500);
    assert.deepEqual(control.unlinks, [{ account: undefined, workspace: "w" }], "the control plane unlinks with the main window session");
    const order = e.calls.map((c) => c.command).filter((c) => c === "agents_session_unlink" || c === "danil_workspace_set_account");
    assert.deepEqual(order, ["agents_session_unlink", "danil_workspace_set_account"], "Computers first, then the engine");
    assert.deepEqual(e.calls.find((c) => c.command === "danil_workspace_set_account")?.args, { workspace: "w", account: null });
    assert.ok(!e.calls.some((c) => c.command === "danil_disconnect"), "the session stays signed in");
    assert.ok(section(w).textContent.includes("no es de ninguna cuenta"), section(w).textContent);
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("if Computers refuses to unlink, the engine keeps the account and the reason shows", async () => {
  const control = controlPlane(DIRECTORY, null, "no_session");
  try {
    const e = engine();
    const app = await openWorkspaces("danil-workspace-account-leave-refused", e);
    const { w } = app;
    buttonIn(section(w), "Desvincular").click();
    w.document.querySelector("[data-workspace-leave-yes]").click();
    await sleep(500);
    assert.equal(control.unlinks.length, 1);
    assert.ok(!e.calls.some((c) => c.command === "danil_workspace_set_account"), "the engine is not touched");
    assert.ok(section(w).textContent.includes("Sincronizado con «Danil»"));
    assert.equal(w.document.querySelector("[data-workspace-account] [role=alert]")?.textContent, "Inicia sesión con Danil en esta ventana para sincronizar este workspace.");
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("a workspace whose account signed out says it is not synced", async () => {
  const control = controlPlane();
  try {
    const e = engine({ sessions: [ALBERTO], map: { w: "u_ytw", w2: "u_alberto" } });
    const app = await openWorkspaces("danil-workspace-account-signed-out", e);
    const { w } = app;
    assert.equal(section(w)?.dataset.workspaceAccount, "unsynced");
    assert.ok(section(w).textContent.includes("Sin sincronizar: alberto@yucatantechweek.mx no tiene sesión en esta computadora."), section(w).textContent);
    assert.ok(buttonIn(section(w), "Cambiar"), "it still offers an explicit change");
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
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

test("the sidebar footer shows the open workspace's account and follows a switch", async () => {
  const e = engine();
  const app = await boot("listo", "danil-footer-workspace-account", { ...BASE, ...e.table });
  const { w } = app;
  await sleep(900);
  const foot = () => w.document.querySelector("[data-danil-foot]");
  assert.equal(foot()?.dataset.danilFoot, "connected", w.document.body.innerHTML.slice(0, 300));
  assert.equal(foot().getAttribute("title"), "Alberto Ceballos · en línea con Danil");

  e.state.active = "w2";
  w.dispatchEvent(new w.CustomEvent("harness:workspace"));
  await sleep(400);
  assert.equal(foot().getAttribute("title"), "Alberto FDB · sin conexión con Danil por ahora");

  e.state.sessions = [ALBERTO];
  app.emit("danil-sessions", e.state.sessions);
  await sleep(400);
  assert.equal(foot(), null, "its account signed out: nobody, and not the other account");
  assert.deepEqual(app.failures, []);
});

test("settings follows the workspace account and reads only its registry's machines", async () => {
  const e = engine();
  const asked = [];
  const peers = relayFleet({ "not-linked": { table: relayEngine, state: "offline" } });
  let app;
  e.table.account_relay_token = ({ account } = {}) => {
    if (!account) throw unknown();
    asked.push(account);
    return { token: account, endpoint: "https://settings.test" };
  };
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const account = new Headers(init.headers).get("authorization")?.replace("Bearer ", "");
    const id = account === "u_fdb" ? "cmp_b" : "cmp_a";
    if (String(url).endsWith("/v1/workspaces")) return Response.json({ workspaces: [{ id: account === "u_fdb" ? "w2" : "w", computers: [id] }] });
    if (String(url).endsWith("/v1/computers")) return Response.json([
      { computer_id: id, name: `Machine ${account}`, state: "online" },
      { computer_id: "not-linked", name: "Other workspace machine", state: "online" },
    ]);
    if (String(url).endsWith("/v1/me/workspaces")) return Response.json({ workspaces: DIRECTORY, truncated: false });
    return new Response("{}", { status: 404 });
  };
  globalThis.fetch.__jsdomApp = true;
  try {
    app = await openDanilAccounts("danil-settings-machines-scope", e, () => { globalThis.WebSocket = peers.Socket; }, "machines");
    const { w } = app;
    const panel = () => w.document.querySelector("[data-danil-account]");
    const rows = () => [...panel().querySelectorAll("[data-account-computer]")].map((el) => el.dataset.accountComputer);
    assert.deepEqual(rows(), ["cmp_a"]);
    assert.ok(!panel().textContent.includes(FDB.email));
    assert.ok(asked.every((account) => account === "u_alberto"));
    e.state.active = "w2";
    w.dispatchEvent(new w.CustomEvent("harness:workspace"));
    await sleep(800);
    assert.deepEqual(rows(), ["cmp_b"]);
    assert.ok(!panel().textContent.includes(ALBERTO.email));
    assert.ok(asked.includes("u_fdb"));
    assert.deepEqual(app.failures, []);
  } finally {
    if (app) app.w.dispatchEvent(new app.w.Event("pagehide"));
    globalThis.fetch = previous;
  }
});

test("a failed account lookup does not show the default account or its computers", async () => {
  const e = engine();
  e.table.danil_workspace_account = () => { throw Object.assign(new Error("unauthorized"), { detail: "unauthorized" }); };
  const app = await openDanilAccounts("danil-settings-failed-authority", e);
  const panel = app.w.document.querySelector("[data-danil-account]");
  assert.ok(panel.textContent.includes("No se pudo verificar la cuenta de este workspace."));
  assert.equal(panel.querySelector("[data-danil-session]"), null);
  assert.equal(panel.querySelector("[data-account-computers]"), null);
  assert.ok(buttonIn(panel, "Reintentar"));
  assert.deepEqual(app.failures, []);
});

test("switching workspace inside the same account resets «Administrar» in Perfil", async () => {
  const control = controlPlane();
  try {
    const e = engine({ map: { w: "u_alberto", w2: "u_alberto" } });
    const app = await openDanilAccounts("danil-settings-manage-reset", e);
    const { w } = app;
    const panel = () => w.document.querySelector("[data-danil-account]");
    panel().querySelector("[data-danil-manage]").click();
    await sleep(200);
    assert.ok(panel().querySelector("[data-workspace-change]"), "«Administrar» opens the explicit actions");
    e.state.active = "w2";
    w.dispatchEvent(new w.CustomEvent("harness:workspace"));
    await sleep(700);
    assert.ok(panel().querySelector("[data-danil-manage]"), "W2 shows its own account row");
    assert.equal(panel().querySelector("[data-workspace-change]"), null, "manage state is new for W2");
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

test("workspace-list errors offer retry and recover instead of loading forever", async () => {
  const e = engine();
  let failed = true;
  const read = e.table.list_workspaces;
  e.table.list_workspaces = () => {
    if (failed) throw Object.assign(new Error("unauthorized"), { detail: "unauthorized" });
    return read();
  };
  const app = await openDanilAccounts("danil-settings-workspace-list-failure", e);
  const panel = () => app.w.document.querySelector("[data-danil-account]");
  assert.equal(panel().dataset.danilAccount, "failed");
  failed = false;
  buttonIn(panel(), "Reintentar").click();
  await sleep(500);
  assert.equal(panel().dataset.danilAccount, "workspace");
  assert.ok(app.w.document.querySelector("[data-danil-here]")?.textContent.includes(W.name));
  assert.deepEqual(app.failures, []);
});

test("a returned link error remains visible after the choice closes", async () => {
  const control = controlPlane();
  try {
    const e = engine();
    e.table.danil_workspace_set_account = ({ workspace, account }) => {
      e.state.map[workspace] = account;
      return { account, email: FDB.email, signed_in: true, linked: false, error: "workspace_id_taken" };
    };
    const read = e.table.danil_workspace_account;
    e.table.danil_workspace_account = (args) => ({ ...read(args), linked: false });
    const app = await openDanilAccounts("danil-settings-returned-link-error", e);
    const { w } = app;
    w.document.querySelector("[data-danil-manage]").click();
    await sleep(200);
    buttonIn(w.document.querySelector("[data-danil-account]"), "Cambiar").click();
    await sleep(400);
    option(w, "a:477").click();
    await sleep(200);
    w.document.querySelector("[data-workspace-change-yes]").click();
    await sleep(500);
    const panel = w.document.querySelector("[data-danil-account]");
    assert.ok(panel.querySelector("[role=alert]")?.textContent.includes("Este workspace sigue siendo de la otra cuenta."));
    assert.deepEqual(app.failures, []);
  } finally {
    control.restore();
  }
});

const LOCAL = { key: "w:w", workspace_id: "w", danil_workspace_id: null, name: "Danil", kind: "terminus_only", organization: null, role: null, owner: true, support: null, capabilities: { agents: false, terminus: true }, pin: null };
const FREE = FREE_ORG;
const step = (w) => w.document.querySelector("[data-danil-workspace-step]");

async function signedIn(name, e, entries, createStatus = null) {
  const control = controlPlane(entries, null, null, createStatus);
  const app = await boot("listo", name, { ...BASE, ...e.table });
  await sleep(600);
  assert.equal(step(app.w), null, "nothing asks before the window session opens");
  app.emit("agents-session", { state: "signed_in", account: "default" });
  await sleep(800);
  return { app, control };
}

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
