/**
 * Terminus in the browser, Settings → Secrets: lists only the account's
 * `env_secret` credentials grouped by scope, shows a machine whose engine lacks
 * `secrets_v1` as "no compatible" (never active, no actions), rejects a reserved
 * name, and seals a new secret here, for the chosen folder, only for machines
 * that announce `secrets_v1`.
 * Talks to the control plane with the person's session; mounts `dist-web/`.
 */
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { engine, fleet } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const API = "https://relay.test";

const until = async (check, ms = 4000) => {
  for (let waited = 0; waited < ms; waited += 50) {
    if (check()) return true;
    await sleep(50);
  }
  return false;
};

const publicOf = (pair) => pair.publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64");
const machine = (computer_id, name, state) => ({ computer_id, name, state, version: 1, created_at: null, last_seen_at: null });
const secret = (id, slot, hint, machines) => ({
  id,
  workspace_id: "w",
  kind: "env_secret",
  provider: "env",
  slot,
  label: slot.split("/").at(-1),
  hint,
  delivery: "sealed",
  status: "active",
  config: {},
  version: 1,
  created_at: "2026-10-29T10:00:00Z",
  updated_at: "2026-10-29T10:00:00Z",
  machines,
});

test("the web lists secrets by scope, marks an old engine as not compatible, and seals a new one only for secrets_v1 machines", async () => {
  const mac = generateKeyPairSync("x25519");
  const old = generateKeyPairSync("x25519");
  const credentials = [
    secret("cred_s", "env/*/STRIPE_KEY", "3f9a", [machine("cmp_mac", "Mac", "active"), machine("cmp_old", "vm-vieja", "unsupported")]),
    secret("cred_f", "env/web/STRIPE_KEY", null, [machine("cmp_mac", "Mac", "active")]),
    { ...secret("cred_mcp", "mcp/linear/env/LINEAR_API_KEY", "9xyz", []), kind: "mcp_secret" },
    { ...secret("cred_future", "futuro/x", null, []), kind: "future_kind" },
  ];
  const calls = [];
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    if (url === `${API}/v1/me`) return Response.json({ name: "Ana", email: "ana@danil.ai", avatar_url: null });
    if (url === `${API}/v1/computers`) return Response.json([{ computer_id: "cmp_vm", name: "vm-alberto", state: "online", provider: "aws-ec2" }]);
    const path = url.slice(API.length);
    if (!path.startsWith("/v1/workspaces/w/credentials")) return new Response("{}", { status: 404 });
    calls.push({ method, path, body: init.body ? JSON.parse(init.body) : null });
    if (method === "GET")
      return Response.json({
        credentials,
        recipients: [
          { computer_id: "cmp_mac", name: "Mac", public_key: publicOf(mac), online: true, service_features: ["secrets_v1"] },
          { computer_id: "cmp_old", name: "vm-vieja", public_key: publicOf(old), online: true, service_features: [] },
        ],
      });
    if (method === "PUT") {
      const body = JSON.parse(init.body);
      const made = secret("cred_new", body.slot, body.hint, [machine("cmp_mac", "Mac", "active")]);
      credentials.push(made);
      return Response.json({ credential: made });
    }
    return new Response("{}", { status: 404 });
  };
  try {
    const table = { ...engine, list_known_mcp: [], list_mcp_servers: [], list_mcp_providers: [], list_skill_sources: [] };
    const f = fleet({ cmp_vm: { table, state: "online" } });
    const app = await boot("listo", "web-secrets", {}, undefined, {}, {
      web: true,
      beforeImport: (w) => {
        globalThis.WebSocket = f.Socket;
        w.terminusWeb = { endpoint: API, computers: [{ computer_id: "cmp_vm", name: "vm-alberto", state: "online", provider: "aws-ec2" }], getToken: async () => "tok" };
      },
    });
    const { w } = app;
    const doc = w.document;
    await sleep(2500);
    w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "secretos" }));
    const panel = () => doc.querySelector("[data-settings-secrets]");
    assert.ok(await until(() => panel()?.querySelector("[data-secret]")), "the secrets are listed");

    assert.deepEqual(
      [...panel().querySelectorAll("[data-secret]")].map((r) => r.dataset.secret),
      ["env/*/STRIPE_KEY", "env/web/STRIPE_KEY"],
      "only env_secret, workspace first; an MCP key and an unknown kind stay out",
    );
    assert.deepEqual([...panel().querySelectorAll("[data-secrets-group]")].map((g) => g.dataset.secretsGroup), ["*", "web"]);
    const ws = panel().querySelector('[data-secret="env/*/STRIPE_KEY"]');
    assert.match(ws.textContent, /••••3f9a/);
    assert.ok(!/mostrar|show/i.test(panel().textContent), "there is no way to show a value");
    assert.match(panel().querySelector('[data-secret="env/web/STRIPE_KEY"]').textContent, /reemplaza al del workspace/);

    const oldRow = ws.querySelector('[data-credential-machine="cmp_old"]');
    assert.equal(oldRow.dataset.state, "unsupported");
    assert.match(oldRow.textContent, /no compatible/);
    assert.equal(oldRow.querySelectorAll("button").length, 0, "no remove or restore on a machine that would not apply it");
    assert.equal(ws.querySelector("[data-credential-usage]").textContent, "En uso en: Mac · no compatible en vm-vieja");
    assert.match(ws.querySelector('[data-secret-unsupported-help="cmp_old"]').textContent, /vm-vieja tiene una versión de Danil sin secretos/);

    const button = (root, text) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
    button(panel(), "Añadir secreto").click();
    const form = () => doc.querySelector("[data-secret-add]");
    assert.ok(await until(() => form()), "the add dialog opens");
    const type = (id, value) => {
      const input = form().querySelector(`#${id}`);
      input.value = value;
      input.dispatchEvent(new w.Event("input", { bubbles: true }));
    };
    type("secret-name", "github-token");
    assert.equal(form().querySelector("#secret-name").value, "GITHUB_TOKEN", "typed as an env name");
    assert.ok(await until(() => form().querySelector('[data-secret-name-problem="reserved"]')), "a reserved name is refused");
    type("secret-value", "short-value");
    assert.ok(button(form(), "Guardar").disabled);

    type("secret-name", "stripe key");
    assert.ok(await until(() => form().querySelector("[data-secret-exists]")), "an existing secret is replaced only on purpose");
    assert.ok(button(form(), "Reemplazar"));
    type("secret-name", "DATABASE_URL");
    assert.ok(await until(() => form().querySelector('#secret-scope option[value="p1"]')), "the workspace folders are offered as scope");
    const scope = form().querySelector("#secret-scope");
    scope.value = "p1";
    scope.dispatchEvent(new w.Event("change", { bubbles: true }));
    assert.ok(await until(() => button(form(), "Guardar") && !button(form(), "Guardar").disabled));
    form().requestSubmit();
    assert.ok(await until(() => calls.some((c) => c.method === "PUT")), "the secret goes up sealed");
    const put = calls.find((c) => c.method === "PUT").body;
    assert.equal(put.kind, "env_secret");
    assert.equal(put.slot, "env/p1/DATABASE_URL");
    assert.deepEqual(put.config, { name: "DATABASE_URL", folder: "p1" });
    assert.equal(put.hint, null, "a value under 16 characters gives no hint");
    assert.deepEqual(put.copies.map((c) => c.computer_id), ["cmp_mac"], "the machine without secrets_v1 gets no copy");
    assert.ok(!JSON.stringify(put).includes("short-value"), "the value never travels in clear");
    assert.ok(await until(() => !form() && panel().querySelector('[data-secret="env/p1/DATABASE_URL"]')), "the dialog closes and the new row appears");
    assert.match(panel().querySelector('[data-secrets-group="p1"]').textContent, /^Carpeta P1/, "a folder group is named, not shown by id");
    assert.deepEqual(app.failures, []);
  } finally {
    globalThis.fetch = own;
  }
});

test("the web refuses to create a secret when no machine announces secrets_v1", async () => {
  const old = generateKeyPairSync("x25519");
  const calls = [];
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    if (url === `${API}/v1/me`) return Response.json({ name: "Ana", email: "ana@danil.ai", avatar_url: null });
    if (url === `${API}/v1/computers`) return Response.json([{ computer_id: "cmp_vm", name: "vm-alberto", state: "online", provider: "aws-ec2" }]);
    const path = url.slice(API.length);
    if (!path.startsWith("/v1/workspaces/w/credentials")) return new Response("{}", { status: 404 });
    calls.push(method);
    if (method === "GET") return Response.json({ credentials: [], recipients: [{ computer_id: "cmp_old", name: "vm-vieja", public_key: publicOf(old), online: true }] });
    return new Response("{}", { status: 400 });
  };
  try {
    const table = { ...engine, list_known_mcp: [], list_mcp_servers: [], list_mcp_providers: [], list_skill_sources: [] };
    const f = fleet({ cmp_vm: { table, state: "online" } });
    const app = await boot("listo", "web-secrets-sin-destino", {}, undefined, {}, {
      web: true,
      beforeImport: (w) => {
        globalThis.WebSocket = f.Socket;
        w.terminusWeb = { endpoint: API, computers: [{ computer_id: "cmp_vm", name: "vm-alberto", state: "online", provider: "aws-ec2" }], getToken: async () => "tok" };
      },
    });
    const { w } = app;
    const doc = w.document;
    await sleep(2500);
    w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "secretos" }));
    const panel = () => doc.querySelector("[data-settings-secrets]");
    assert.ok(await until(() => panel()?.querySelector("[data-secrets-empty]")), "the empty state");
    [...panel().querySelectorAll("button")].find((b) => b.textContent.trim() === "Añadir secreto").click();
    const form = () => doc.querySelector("[data-secret-add]");
    assert.ok(await until(() => form()));
    for (const [id, value] of [["secret-name", "STRIPE_KEY"], ["secret-value", "sk_live_valor_largo_1234"]]) {
      const input = form().querySelector(`#${id}`);
      input.value = value;
      input.dispatchEvent(new w.Event("input", { bubbles: true }));
    }
    assert.ok(await until(() => form().querySelector("[data-secret-no-recipients]")), "it says why before sending");
    assert.ok([...form().querySelectorAll("button")].find((b) => b.textContent.trim() === "Guardar").disabled);
    form().requestSubmit();
    await sleep(300);
    assert.deepEqual(calls.filter((m) => m !== "GET"), [], "no secret without copies is created");
    assert.deepEqual(app.failures, []);
  } finally {
    globalThis.fetch = own;
  }
});
