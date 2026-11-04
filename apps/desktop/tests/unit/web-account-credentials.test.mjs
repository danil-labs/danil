/**
 * Terminus in the browser shows where each key of the account is in use (Settings
 * → Conexiones → MCP), removes it from one machine after warning that the provider
 * still accepts it, puts it back, and changes its value sealing it in the browser
 * for every machine with a public key. Talks to the control plane with the
 * person's session; mounts `dist-web/`.
 */
import assert from "node:assert/strict";
import { createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
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

const MAGIC = Buffer.from("TERMINUS-SECRET/1\n");
const SPKI = Buffer.from("302a300506032b656e032100", "hex");
function open(sealed, privateKey, workspace, slot) {
  const raw = Buffer.from(sealed, "base64");
  const eph = raw.subarray(MAGIC.length, MAGIC.length + 32);
  const nonce = raw.subarray(MAGIC.length + 32, MAGIC.length + 44);
  const body = raw.subarray(MAGIC.length + 44);
  const own = createPublicKey(privateKey).export({ format: "der", type: "spki" }).subarray(12);
  const shared = diffieHellman({ privateKey, publicKey: createPublicKey({ key: Buffer.concat([SPKI, eph]), format: "der", type: "spki" }) });
  const key = Buffer.from(hkdfSync("sha256", shared, Buffer.concat([eph, own]), Buffer.from("terminus credential v1"), 32));
  const d = createDecipheriv("aes-256-gcm", key, nonce);
  d.setAAD(Buffer.concat([MAGIC, eph, Buffer.from(workspace), Buffer.from([0]), Buffer.from(slot)]));
  d.setAuthTag(body.subarray(body.length - 16));
  return Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]).toString("utf8");
}

test("the web shows where an MCP key is in use, removes it from a machine with a warning, and reseals a new value", async () => {
  const mac = generateKeyPairSync("x25519");
  const macPublic = mac.publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64");
  const SLOT = "mcp/linear/env/LINEAR_API_KEY";
  const credential = {
    id: "cred_lin",
    workspace_id: "w",
    kind: "mcp_secret",
    provider: "mcp",
    slot: SLOT,
    label: "Linear · LINEAR_API_KEY",
    hint: "9xyz",
    delivery: "sealed",
    status: "active",
    config: { server: "linear", field: "env", name: "LINEAR_API_KEY" },
    version: 1,
    created_at: null,
    updated_at: null,
    machines: [
      { computer_id: "cmp_mac", name: "Mac", state: "active", version: 1, created_at: null, last_seen_at: null },
      { computer_id: "cmp_vm", name: "vm-alberto", state: "pending", version: 0, created_at: null, last_seen_at: null },
    ],
  };
  const calls = [];
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    if (url === `${API}/v1/me`) return Response.json({ name: "Ana", email: "ana@danil.ai", avatar_url: null });
    if (url === `${API}/v1/computers`) return Response.json([{ computer_id: "cmp_vm", name: "vm-alberto", state: "online", provider: "aws-ec2" }]);
    const path = url.slice(API.length);
    if (!path.startsWith("/v1/workspaces/w/credentials")) return new Response("{}", { status: 404 });
    calls.push({ method, path, token: new Headers(init.headers).get("authorization"), body: init.body ? JSON.parse(init.body) : null });
    if (method === "GET")
      return Response.json({
        credentials: [credential],
        recipients: [
          { computer_id: "cmp_mac", name: "Mac", public_key: macPublic, online: false },
          { computer_id: "cmp_vm", name: "vm-alberto", public_key: null, online: true },
        ],
      });
    const machine = /\/machines\/([^/]+)(\/restore)?$/.exec(path);
    if (machine) {
      const m = credential.machines.find((x) => x.computer_id === machine[1]);
      m.state = machine[2] ? "pending" : "removed";
      return Response.json({ credential });
    }
    if (method === "PUT") {
      credential.version += 1;
      credential.hint = init.body ? JSON.parse(init.body).hint : null;
      return Response.json({ credential });
    }
    return new Response("{}", { status: 404 });
  };
  try {
    const table = { ...engine, list_known_mcp: [], list_mcp_servers: [], list_mcp_providers: [], list_skill_sources: [] };
    const f = fleet({ cmp_vm: { table, state: "online" } });
    const app = await boot("listo", "web-account-credentials", {}, undefined, {}, {
      web: true,
      beforeImport: (w) => {
        globalThis.WebSocket = f.Socket;
        w.terminusWeb = { endpoint: API, computers: [{ computer_id: "cmp_vm", name: "vm-alberto", state: "online", provider: "aws-ec2" }], getToken: async () => "tok" };
      },
    });
    const { w } = app;
    const doc = w.document;
    await sleep(2500);
    w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "mcp" }));
    const item = () => doc.querySelector(`[data-account-credential="${SLOT}"]`);
    assert.ok(await until(() => item()), "the account's MCP key is listed");
    assert.equal(calls[0].token, "Bearer tok", "with the person's session");
    assert.match(item().textContent, /Linear · LINEAR_API_KEY/);
    assert.match(item().textContent, /••••9xyz/);
    assert.equal(item().querySelector("[data-credential-usage]").textContent, "En uso en: Mac · pendiente en vm-alberto");

    const row = (id) => item().querySelector(`[data-credential-machine="${id}"]`);
    const button = (root, text) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
    button(row("cmp_mac"), "Quitar").click();
    assert.ok(await until(() => item().querySelector("[data-remove-warning]")));
    assert.match(item().querySelector("[data-remove-warning]").textContent, /no la revoca en linear/);
    assert.equal(calls.filter((c) => c.method !== "GET").length, 0, "nothing removed before confirming");
    button(item().querySelector("[data-remove-warning]"), "Quitar de Mac").click();
    assert.ok(await until(() => row("cmp_mac")?.dataset.state === "removed"));
    assert.ok(calls.some((c) => c.method === "DELETE" && c.path === "/v1/workspaces/w/credentials/cred_lin/machines/cmp_mac"));
    assert.equal(item().querySelector("[data-credential-usage]").textContent, "Aún no está en ninguna máquina · pendiente en vm-alberto");

    button(row("cmp_mac"), "Volver a poner").click();
    assert.ok(await until(() => row("cmp_mac")?.dataset.state === "pending"));
    assert.ok(calls.some((c) => c.method === "POST" && c.path === "/v1/workspaces/w/credentials/cred_lin/machines/cmp_mac/restore"));

    button(item(), "Cambiar la clave").click();
    assert.ok(await until(() => item().querySelector("[data-credential-rotate] input")));
    const input = item().querySelector("[data-credential-rotate] input");
    input.value = "lin_api_nueva_1234";
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
    input.form.requestSubmit();
    assert.ok(await until(() => calls.some((c) => c.method === "PUT")), "the new value goes up sealed");
    const put = calls.find((c) => c.method === "PUT").body;
    assert.equal(put.slot, SLOT);
    assert.equal(put.hint, "1234");
    assert.deepEqual(put.config, credential.config);
    assert.deepEqual(put.copies.map((c) => c.computer_id), ["cmp_mac"], "only the machine with a public key gets a copy; the VM stays pending");
    assert.ok(!JSON.stringify(put).includes("lin_api_nueva"), "the value never travels in clear");
    assert.equal(open(put.copies[0].sealed, mac.privateKey, "w", SLOT), "lin_api_nueva_1234", "the Mac opens its copy");
    assert.ok(await until(() => !item()?.querySelector("[data-credential-rotate]")), "the field closes and forgets the value");
    assert.deepEqual(app.failures, []);
  } finally {
    globalThis.fetch = own;
  }
});
