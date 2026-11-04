/**
 * Terminus in the browser lists the account's computers in Settings → Cuenta de
 * Danil and renames one in place through the control plane with the person's
 * session; the rest of the page takes the new name without reloading. Mounts `dist-web/`.
 */
import assert from "node:assert/strict";
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

test("the web lists the account's computers and renames one in place", async () => {
  const computers = [
    { computer_id: "cmp_vm", name: "Danil VM", state: "online", provider: "aws-ec2" },
    { computer_id: "cmp_mac", name: "Mac de Ana", state: "offline", provider: "self", kind: "physical", last_seen: new Date(Date.now() - 60_000).toISOString() },
  ];
  const patched = [];
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    if (url === `${API}/v1/me`) return Response.json({ name: "Ana Pérez", email: "ana@danil.ai", avatar_url: null });
    if (url === `${API}/v1/workspaces`) return Response.json({ workspaces: [{ id: "w", name: "W", computers: ["cmp_vm", "cmp_mac"] }] });
    if (url === `${API}/v1/computers` && method === "GET") return Response.json(computers);
    const one = /\/v1\/computers\/([^/]+)$/.exec(url);
    if (one && method === "PATCH") {
      const { name } = JSON.parse(init.body);
      patched.push({ id: one[1], name, token: new Headers(init.headers).get("authorization") });
      if (!name.trim()) return Response.json({ error: { code: "invalid_name" } }, { status: 400 });
      const c = computers.find((x) => x.computer_id === one[1]);
      if (!c) return Response.json({ error: { code: "not_found" } }, { status: 404 });
      c.name = name.trim();
      return Response.json({ computer_id: c.computer_id, name: c.name });
    }
    return new Response("{}", { status: 404 });
  };
  globalThis.fetch.__jsdomApp = true;
  try {
    const f = fleet({ cmp_vm: { table: engine, state: "online" }, cmp_mac: { table: engine, state: "online" } });
    const app = await boot("listo", "web-account-computers", {}, undefined, {}, {
      web: true,
      beforeImport: (w) => {
        globalThis.WebSocket = f.Socket;
        w.terminusWeb = { endpoint: API, computers: computers.map((c) => ({ ...c })), getToken: async () => "tok" };
      },
    });
    const { w } = app;
    const doc = w.document;
    await sleep(2500);
    w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "machines" }));
    assert.ok(await until(() => doc.querySelectorAll("[data-account-computer]").length === 2), "both computers linked to this workspace");
    const rowOf = (id) => doc.querySelector(`[data-account-computer="${id}"]`);
    assert.equal(doc.querySelector("[data-self]"), null, "the browser is none of the computers");
    assert.equal(rowOf("cmp_vm").querySelector("[data-computer-kind]").textContent, "VM de Danil");
    assert.equal(rowOf("cmp_vm").querySelector("[data-computer-state]").textContent, "en línea");
    assert.equal(rowOf("cmp_mac").querySelector("[data-computer-kind]").textContent, "Máquina propia");
    assert.match(rowOf("cmp_mac").querySelector("[data-computer-state]").textContent, /^apagada · visto /);

    const edit = async (id, value) => {
      rowOf(id).querySelector("[data-computer-name]")?.click();
      assert.ok(await until(() => rowOf(id).querySelector("[data-computer-name-input]")));
      const input = rowOf(id).querySelector("[data-computer-name-input]");
      input.value = value;
      input.dispatchEvent(new w.Event("input", { bubbles: true }));
      input.form.requestSubmit();
      await sleep(300);
    };

    await edit("cmp_mac", "   ");
    assert.equal(patched.length, 0, "an empty name is refused before asking");
    assert.equal(rowOf("cmp_mac").querySelector("[data-rename-error]")?.textContent, "El nombre debe tener de 1 a 60 caracteres, sin saltos de línea.");

    await edit("cmp_mac", "Mac del estudio");
    assert.deepEqual(patched, [{ id: "cmp_mac", name: "Mac del estudio", token: "Bearer tok" }], "with the person's session");
    assert.ok(await until(() => rowOf("cmp_mac").querySelector("[data-computer-name]")?.textContent.startsWith("Mac del estudio")));
    assert.equal(rowOf("cmp_mac").querySelector("[data-rename-error]"), null);
    assert.deepEqual(app.failures, []);
  } finally {
    globalThis.fetch = own;
  }
});
