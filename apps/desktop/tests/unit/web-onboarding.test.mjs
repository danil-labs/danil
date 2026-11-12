/**
 * The first run on a managed computer in the browser: no preparation and no
 * install step, a space, then one card per installed cloud provider whose
 * login runs from this page. Mounts `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { engine, fleet, relay } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const SUPABASE = "https://supabase.test";
const API = "https://machines.danil.ai/v1/computers";
const session = JSON.stringify({
  access_token: "stored",
  refresh_token: "r",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "u1", aud: "authenticated", role: "authenticated", email: "persona@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
});

/** One managed computer with no workspace yet and its cloud agents installed. */
function managed() {
  let space = null;
  const startup = () => (space ? { workspaces: [space], active: space.id } : { workspaces: [], active: null });
  const accounts = { codex: [], claude: [], "opencode": [] };
  let next = 0;
  return {
    accounts,
    table: {
      ...engine,
      workspaces_startup: startup,
      list_workspaces: startup,
      add_workspace: ({ name }) => (space = { id: "w1", name, context_root: null }),
      set_active_workspace: null,
      set_workspace_language: null,
      list_providers: [
        { id: "opencode", label: "OpenCode", available: true, driver: true, sin_cuenta: false, api_key: "https://opencode.ai/auth", external_install_url: null },
        { id: "codex", label: "Codex", available: true, driver: true, sin_cuenta: false, api_key: null, external_install_url: null },
        { id: "claude", label: "Claude Code", available: true, driver: true, sin_cuenta: false, api_key: null, external_install_url: null },
        { id: "grok", label: "Grok", available: false, driver: true, sin_cuenta: false, api_key: null, external_install_url: null },
        { id: "opencode-local", label: "Locales", available: true, driver: true, sin_cuenta: true, api_key: null, external_install_url: null },
        { id: "zcode", label: "ZCode", available: true, driver: true, sin_cuenta: false, api_key: null, external_install_url: "https://zcode.example" },
      ],
      list_accounts: ({ provider }) => ({ provider, env_var: "", shared_credential: null, secret_note: null, active: null, accounts: accounts[provider] ?? [] }),
      add_account: ({ provider }) => {
        const account = { id: `a${++next}`, label: `Cuenta ${next}`, created_at: 0, identity: null, authenticated_at: null };
        accounts[provider].push(account);
        return account;
      },
      login_account: null,
      submit_login_code: null,
      cancel_login: null,
      discard_account: true,
      account_status: ({ provider, id }) => {
        const account = accounts[provider].find((a) => a.id === id);
        Object.assign(account, { identity: "alberto@example.com", authenticated_at: 1 });
        return { authenticated: true, identity: account.identity };
      },
    },
  };
}

test("a managed computer skips the install step and connects its cloud accounts from the browser", async () => {
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (!url.startsWith(API)) return own(input, init);
    return new Response(JSON.stringify([{ computer_id: "cmp_a", name: "vm-alberto", state: "online" }]), { status: 200 });
  };
  const { table } = managed();
  const fake = relay({ table });
  let w;
  const opened = [];
  const app = await boot("listo", "web-onboarding", {}, undefined, { "sb-supabase-auth-token": session }, {
    web: true,
    beforeImport: (win) => {
      w = win;
      globalThis.WebSocket = fake.Socket;
      win.open = (url) => void opened.push(url);
      win.terminusWeb = { supabaseUrl: SUPABASE, supabaseKey: "public-anon-key" };
    },
  });
  const text = () => w.document.body.textContent ?? "";
  const button = (label, root = w.document) => [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  const card = (id) => w.document.querySelector(`[data-provider-card="${id}"]`);
  let cursor = 0;
  const emit = (account, kind, value) =>
    fake.push({ type: "events", cursor: ++cursor, gap: false, replay: false, runtime: "rt1", events: [{ name: "account", payload: { account, kind, text: value } }] });
  try {
    await sleep(1500);
    assert.equal(w.document.querySelector("[data-web-onboarding]")?.dataset.webOnboarding, "space", "the first run opens on the space");
    assert.ok(text().includes("Crea tu espacio"), "the space step is shown");
    assert.ok(!text().includes("Instalar asistentes") && !text().includes("Preparar Danil"), "no install or prepare phase");
    assert.ok(!text().includes("Elige tus proveedores"), "never the provider picker");
    assert.equal(w.document.querySelector("[data-web-onboarding-machine]"), null, "one computer needs no name");
    assert.ok(!text().includes("De mi organización") && !text().includes("Radiant"), "the web offers no organization nor Radiant");

    button("Crear workspace").click();
    await sleep(800);
    assert.ok(fake.calls.some((c) => c.command === "add_workspace"), "the space is created");
    assert.equal(w.document.querySelector("[data-web-onboarding]")?.dataset.webOnboarding, "accounts");
    const cards = [...w.document.querySelectorAll("[data-provider-card]")].map((c) => c.dataset.providerCard);
    assert.deepEqual(cards, ["opencode", "codex", "claude"], "only installed cloud providers, no retired local models or ZCode");
    assert.ok(!text().includes("Descargar app oficial"), "no official app download");
    assert.ok(!fake.calls.some((c) => c.command === "install_provider"), "nothing is installed");

    button("Conectar", card("codex")).click();
    await sleep(500);
    const login = fake.calls.find((c) => c.command === "login_account");
    assert.deepEqual(login?.args, { provider: "codex", id: "a1", mode: "tuberia" }, "Conectar runs the account login");
    emit("a1", "url", "https://auth.openai.example/device");
    await sleep(800);
    assert.deepEqual(opened, ["https://auth.openai.example/device"], "the login page opens in a new tab");
    assert.equal(card("codex").querySelector("[data-login-url]")?.getAttribute("href"), "https://auth.openai.example/device", "and stays as a link");
    emit("a1", "confirm", "ABCD-1234");
    await sleep(600);
    assert.ok(card("codex").querySelector("[data-login-code]")?.textContent?.includes("Escribe este código: ABCD-1234"), "the code to type is shown");
    emit("a1", "done", "");
    await sleep(800);
    assert.ok(card("codex").querySelector("[data-connected-account]")?.textContent?.includes("alberto@example.com"), "the connected account shows its email");

    button("Conectar", card("claude")).click();
    await sleep(500);
    emit("a2", "code", "");
    await sleep(600);
    const input = card("claude").querySelector("[data-login-code-input]");
    assert.ok(input, "a provider that asks for a code gets a paste field");
    input.value = "pasted-code";
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
    button("Enviar el código", card("claude")).click();
    await sleep(500);
    assert.deepEqual(fake.calls.find((c) => c.command === "submit_login_code")?.args, { id: "a2", code: "pasted-code" });

    button("Conectar", card("opencode")).click();
    await sleep(500);
    assert.deepEqual(fake.calls.find((c) => c.command === "login_account" && c.args.provider === "opencode")?.args,
      { provider: "opencode", id: "a3", mode: "tuberia" }, "OpenCode starts browser auth even with legacy API key metadata");
    assert.equal(card("opencode").querySelector('input[type="password"]'), null, "the first connection never asks for a Go key");
    emit("a3", "url", "https://opencode.example/auth");
    await sleep(500);
    assert.equal(card("opencode").querySelector("[data-login-url]")?.getAttribute("href"), "https://opencode.example/auth");
    emit("a3", "done", "");
    await sleep(500);
    assert.ok(card("opencode").querySelector("[data-connected-account]"), "OpenCode completes the shared browser flow");

    button("Hacerlo después").click();
    await sleep(1500);
    assert.ok(fake.calls.some((c) => c.command === "cancel_login" && c.args.id === "a2"), "leaving stops the login still open");
    assert.equal(w.document.querySelector("[data-web-onboarding]"), null, "Hacerlo después enters the app");
    assert.ok(fake.calls.some((c) => c.command === "list_projects"), "the app mounts");
    assert.deepEqual(app.failures, []);
  } finally {
    globalThis.fetch = own;
  }
});

test("with more than one computer the onboarding names the one it sets up and logs in there", async () => {
  const vm = managed();
  const mac = managed();
  const f = fleet({ cmp_vm: { table: vm.table }, cmp_mac: { table: mac.table } });
  const opened = [];
  const app = await boot("listo", "web-onboarding-fleet", {}, undefined, {}, {
    web: true,
    beforeImport: (win) => {
      globalThis.WebSocket = f.Socket;
      win.open = (url) => void opened.push(url);
      win.terminusWeb = {
        endpoint: "https://relay.test",
        getToken: async () => "tok",
        computers: [
          { computer_id: "cmp_vm", name: "vm-alberto", state: "online", provider: "aws-ec2" },
          { computer_id: "cmp_mac", name: "Mac de Ana", state: "online", provider: "self", kind: "physical" },
        ],
      };
    },
  });
  const doc = app.w.document;
  const calls = (id, command) => f.relays[id].calls.filter((c) => c.command === command);
  const button = (label, root = doc) => [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  await sleep(2500);
  assert.equal(doc.querySelector("[data-web-onboarding]")?.dataset.webOnboarding, "space");
  assert.equal(doc.querySelector("[data-web-onboarding-machine]")?.textContent, "Configurando vm-alberto", "the machine being set up is named");

  button("Crear workspace").click();
  await sleep(1000);
  assert.equal(calls("cmp_vm", "add_workspace").length, 1, "the space is made on the machine it named");
  assert.equal(calls("cmp_mac", "add_workspace").length, 0);

  button("Conectar", doc.querySelector('[data-provider-card="codex"]')).click();
  await sleep(600);
  assert.equal(calls("cmp_vm", "login_account").length, 1, "the login runs on that machine");
  assert.equal(calls("cmp_mac", "login_account").length, 0);
  f.relays.cmp_vm.push({ type: "events", cursor: 1, gap: false, replay: false, runtime: "rt1", events: [{ name: "account", payload: { account: "a1", kind: "url", text: "https://auth.example/vm" } }] });
  await sleep(800);
  assert.deepEqual(opened, ["https://auth.example/vm"], "its login page opens in a new tab");

  button("Hacerlo después").click();
  await sleep(1500);
  assert.equal(doc.querySelector("[data-web-onboarding]"), null, "Hacerlo después enters the app");
  assert.deepEqual(app.failures, []);
});
