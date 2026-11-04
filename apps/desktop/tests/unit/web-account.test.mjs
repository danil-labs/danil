/**
 * Terminus in the browser shows the person of the Danil account (name, email,
 * photo) at the foot of the sidebar and in Settings → Cuenta de Danil, and
 * changes or removes the photo in the account through the control plane with
 * the person's session. Mounts `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { engine, fleet } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const API = "https://relay.test";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]);
const MAC = { computer_id: "cmp_mac", name: "Mac de Ana", state: "online", provider: "self", kind: "physical" };

test("the web shows the account's name and photo, and changes and removes the photo in the account", async () => {
  const account = { photo: PNG, version: "p1", source: "provider" };
  const requests = [];
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    requests.push({ url, method, token: new Headers(init.headers).get("authorization"), body: init.body });
    const me = () =>
      Response.json({
        name: "Ana Pérez",
        email: "ana@danil.ai",
        avatar_url: account.photo ? `${API}/v1/me/avatar?v=${account.version}` : null,
        avatar_source: account.photo ? account.source : null,
      });
    if (url === `${API}/v1/me`) return me();
    if (url.startsWith(`${API}/v1/me/avatar?`)) return new Response(account.photo, { headers: { "content-type": "image/png" } });
    if (url === `${API}/v1/me/avatar` && method === "PUT") {
      Object.assign(account, { photo: new Uint8Array(await init.body.arrayBuffer()), version: "u1", source: "danil" });
      return me();
    }
    if (url === `${API}/v1/me/avatar` && method === "DELETE") {
      Object.assign(account, { photo: null, version: null, source: null });
      return me();
    }
    return new Response("{}", { status: 404 });
  };
  try {
    const f = fleet({ cmp_mac: { table: engine } });
    const app = await boot("listo", "web-account", {}, undefined, {}, {
      web: true,
      beforeImport: (w) => {
        globalThis.WebSocket = f.Socket;
        w.terminusWeb = { endpoint: API, computers: [MAC], getToken: async () => "tok" };
      },
    });
    const { w } = app;
    await sleep(2500);
    const foot = () => w.document.querySelector("[data-danil-foot]");
    const b64 = (bytes) => `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

    assert.equal(foot()?.getAttribute("aria-label"), "Ana Pérez", foot()?.outerHTML ?? "no footer entry");
    assert.equal(foot().querySelector("img")?.getAttribute("src"), b64(PNG), "the photo as a data: URI, no remote image");
    assert.equal(foot().querySelector(".signal-dot"), null, "no machine dot on the web");
    assert.ok(requests.every((r) => r.token === "Bearer tok"), "every call carries the person's session");

    foot().click();
    await sleep(300);
    [...w.document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Cuenta de Danil").click();
    await sleep(800);
    const panel = () => w.document.querySelector("[data-danil-account]");
    const text = () => panel()?.textContent ?? "";
    assert.equal(panel()?.dataset.danilAccount, "web");
    assert.equal(panel().querySelector("[data-account-name]")?.textContent, "Ana Pérez");
    assert.ok(text().includes("ana@danil.ai"));
    assert.ok(!text().includes("Iniciar sesión con Danil"), "the web is already signed in: no machine sign-in");

    const input = panel().querySelector("[data-account-photo-input]");
    const mine = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
    Object.defineProperty(input, "files", { value: [new w.File([mine], "yo.png", { type: "image/png" })], configurable: true });
    input.dispatchEvent(new w.Event("change", { bubbles: true }));
    await sleep(500);
    const put = requests.find((r) => r.method === "PUT");
    assert.equal(put?.url, `${API}/v1/me/avatar`);
    assert.deepEqual([...account.photo], [...mine], "the account got the chosen photo");
    assert.equal(panel().querySelector("[data-account-identity] img")?.getAttribute("src"), b64(mine));
    assert.equal(foot().querySelector("img")?.getAttribute("src"), b64(mine), "the footer follows without a reload");

    const remove = [...panel().querySelectorAll("button")].find((b) => b.textContent.trim() === "Quitar foto");
    remove.click();
    await sleep(500);
    assert.ok(requests.some((r) => r.method === "DELETE"));
    assert.equal(panel().querySelector("[data-account-avatar]")?.textContent, "AP", "back to the initials");
    assert.deepEqual(app.failures, []);
  } finally {
    globalThis.fetch = own;
  }
});
