/**
 * Las entradas a la cuenta de Danil fuera de Configuración, contra un motor
 * simulado: el pie de la barra lateral, y que «Personaliza» ya no la ofrece. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const SPACE = { id: "w", name: "W", context_root: null };
const BASE = {
  danil_sessions: Object.assign(new Error("command"), { detail: "command" }),
  window_ready: null,
  window_vitals: null,
  setup_required: false,
  list_providers: [],
  list_projects: [],
  list_sources: [],
  list_live_sessions: [],
  list_live_turns: [],
  list_surfaces: [],
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "test-service", reset: false },
};
const FIRST_RUN = {
  ...BASE,
  list_workspaces: { workspaces: [], active: null },
  workspaces_startup: { workspaces: [], active: null },
};
const WITH_SPACE = {
  ...BASE,
  list_workspaces: { workspaces: [SPACE], active: "w" },
  workspaces_startup: { workspaces: [SPACE], active: "w" },
};
const PENDING = {
  state: "pending",
  verification_uri: "https://app.danil.ai/terminus/connect",
  verification_uri_complete: "https://app.danil.ai/terminus/connect?code=WDJB-MJHT",
  user_code: "WDJB-MJHT",
  expires_at: 1792412100000,
  online: false,
};
const unknown = () => Object.assign(new Error("command"), { what: { clave: "shell.service.command" }, detail: "command" });

function danil(initial) {
  let status = initial;
  const calls = [];
  const record = (command, reply) => (args) => {
    calls.push({ command, args });
    return reply(args);
  };
  return {
    calls,
    /** Lo que el motor dice desde ahora, por `danil_connect_status` y por el evento. */
    become: (app, next) => app.emit("danil-connect", (status = next)),
    table: {
      danil_connect_status: record("danil_connect_status", () => status),
      danil_connect_options: record("danil_connect_options", () => [{ workspace: "w", name: "W", email: "alberto@danil.ai" }]),
      danil_connect_start: record("danil_connect_start", () => (status = PENDING)),
      danil_disconnect: record("danil_disconnect", () => (status = { state: "disconnected", name: "alberto-mbp" })),
      open_external: record("open_external", () => null),
    },
  };
}

const heading = (w) => w.document.querySelector("h1")?.textContent ?? "";
const buttons = (w, root = w.document) => [...root.querySelectorAll("button")];
const button = (w, label, root) => buttons(w, root).find((b) => b.textContent.trim() === label);
const PROFILE = "Tu cuenta y preferencias";

/** Primer arranque con Codex ya conectado: «Conecta tu IA» deja seguir a «Personaliza». */
const TO_PERSONALIZE = {
  ...FIRST_RUN,
  list_providers: [
    { id: "codex", label: "Codex", available: true, sin_cuenta: false, source: null, system_broken: false, api_key: null, inferencia: "con_cuenta" },
  ],
  list_accounts: {
    provider: "codex", env_var: "", shared_credential: null, secret_note: null, active: "a1",
    accounts: [{ id: "a1", label: "", created_at: 1, identity: "yo@norte.mx", authenticated_at: 2 }],
  },
  add_workspace: ({ name }) => ({ id: "n", name }),
  set_active_workspace: null,
  set_workspace_language: null,
  list_git_hosts: [],
  list_known_mcp: [],
  list_mcp_providers: [],
  list_integrations: { workspace: "n", plugins: [] },
};

async function personalize(name, table) {
  const app = await boot("listo", name, { ...TO_PERSONALIZE, ...table });
  await sleep(800);
  button(app.w, "Continuar").click();
  await sleep(500);
  return app;
}

test("«Personaliza» no ofrece Danil: queda en Configuración, y «Empezar» entra directo a la app", async () => {
  const engine = danil({ state: "disconnected", name: "alberto-mbp" });
  const { w, failures } = await personalize("danil-onboarding", engine.table);
  assert.equal(heading(w), "Personaliza Danil.", w.document.body.textContent.slice(0, 600));
  assert.equal(w.document.querySelector("[data-danil-onboarding]"), null);
  assert.ok(!button(w, "Iniciar sesión con Danil"));

  button(w, "Empezar").click();
  await sleep(300);
  assert.ok(!w.document.body.textContent.includes("Personaliza Danil."), "starting enters the app");
  assert.ok(!engine.calls.some((c) => c.command === "danil_connect_start"));
  assert.deepEqual(failures, []);
});

test("el pie de la barra lateral solo aparece con sesión de Danil y abre su sección", async () => {
  const engine = danil({ state: "disconnected", name: "alberto-mbp" });
  const app = await boot("listo", "danil-footer", { ...WITH_SPACE, ...engine.table });
  const { w } = app;
  await sleep(800);
  const foot = () => w.document.querySelector("[data-danil-foot]");
  assert.equal(foot(), null, "without a session there is nothing: signing in is in Settings");
  assert.ok(!w.document.body.textContent.includes("Iniciar sesión"), "no sign-in button in the sidebar");
  assert.ok(w.document.querySelector('[aria-label="Configuración"]'), "the footer's other items stay");
  assert.ok(w.document.querySelector(`[data-profile-menu] button[aria-label="${PROFILE}"]`), "the generic avatar still opens the profile menu");

  engine.become(app, { state: "connected", computer_id: "cmp_1", name: "Mac", email: "alberto@danil.ai", online: true });
  await sleep(300);
  assert.equal(foot()?.dataset.danilFoot, "connected");
  assert.equal(w.document.querySelector(`[data-profile-menu] button[aria-label="${PROFILE}"]`), null, "the person takes the generic avatar's place");
  assert.equal(foot().getAttribute("title"), "alberto@danil.ai · en línea con Danil");
  assert.equal(foot().getAttribute("aria-label"), "alberto@danil.ai · en línea con Danil", "the collapsed entry is named by its label");
  assert.ok(foot().querySelector(".signal-dot[data-tone=\"success\"]"), "the online dot");

  engine.become(app, { state: "connected", computer_id: "cmp_1", name: "Mac", email: "alberto@danil.ai", online: false });
  await sleep(300);
  assert.ok(!foot().querySelector(".signal-dot[data-tone=\"success\"]"), "offline drops the dot's color");

  foot().click();
  await sleep(300);
  const item = button(w, "Cuenta de Danil");
  assert.ok(item, "the click opens the profile menu with the account");
  item.click();
  await sleep(800);
  assert.equal(w.document.querySelector("[data-danil-account]")?.dataset.danilAccount, "connected", "the account item opens Settings at the section");

  engine.become(app, { state: "disconnected", name: "alberto-mbp" });
  await sleep(300);
  assert.equal(foot(), null, "signing out takes it away");
  assert.ok(w.document.querySelector(`[data-profile-menu] button[aria-label="${PROFILE}"]`), "and gives the generic avatar back");
});

test("sin el flujo en el motor el pie no muestra la entrada", async () => {
  const { w } = await boot("listo", "danil-footer-old-engine", { ...WITH_SPACE, danil_connect_status: unknown() });
  await sleep(800);
  assert.equal(w.document.querySelector("[data-danil-foot]"), null);
  assert.ok(w.document.querySelector('[aria-label="Configuración"]'), "the footer's other items stay");
});

test("el pie muestra el nombre y la foto de la cuenta de Danil", async () => {
  const engine = danil({ state: "disconnected", name: "alberto-mbp" });
  const app = await boot("listo", "danil-footer-person", {
    ...WITH_SPACE,
    ...engine.table,
    preview_file: ({ path }) => ({ data_url: path.endsWith("avatar-v1.png") ? "data:image/png;base64,UFJPVg==" : null }),
  });
  const { w } = app;
  await sleep(800);
  const foot = () => w.document.querySelector("[data-danil-foot]");
  const person = { state: "connected", computer_id: "cmp_1", name: "Mac", email: "alberto@danil.ai", account_name: "Alberto Ceballos", online: true };

  engine.become(app, { ...person, avatar: "/data/danil-computers/avatar-v1.png", avatar_source: "provider" });
  await sleep(300);
  assert.equal(foot().getAttribute("title"), "Alberto Ceballos · en línea con Danil");
  assert.equal(foot().querySelector("img")?.getAttribute("src"), "data:image/png;base64,UFJPVg==");
  assert.ok(foot().querySelector(".signal-dot[data-tone=\"success\"]"), "the online dot stays over the photo");
  assert.ok(!engine.calls.some((c) => c.command === "danil_account_refresh"), "the footer does not ask the control plane on every start");

  engine.become(app, person);
  await sleep(300);
  assert.equal(foot().querySelector("img"), null);
  assert.equal(foot().querySelector("[data-account-avatar]")?.textContent, "AC", "without a photo, the initials");
  assert.deepEqual(app.failures, []);
});
