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

test("customer connections and campaign audiences mount without retired requests or controls", async t => {
  const { build } = await import("vite");
  const { default: solid } = await import("vite-plugin-solid");
  const { JSDOM } = await import("jsdom");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath, pathToFileURL } = await import("node:url");
  const desktop = fileURLToPath(new URL("../../", import.meta.url));
  const output = await mkdtemp(join(tmpdir(), "danil-retirement-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  const entry = join(desktop, "retirement-entry.tsx");
  await build({
    configFile: false, root: desktop, logLevel: "silent", plugins: [solid(), {
      name: "retirement-fixture",
      resolveId: id => id === entry ? entry : null,
      load: id => id !== entry ? null : `
        import { render } from '${desktop}node_modules/solid-js/web/dist/web.js';
        import { CustomerConnections } from '${desktop}src/web/attention/CustomerService.tsx';
        import { AddContacts } from '${desktop}src/web/attention/broadcasts/AddContacts.tsx';
        import { createService } from '${desktop}../../packages/attention/src/service.ts';
        import { createBroadcastPanel } from '${desktop}../../packages/attention/src/broadcast-panel.ts';
        export function mount(host, request) {
          const session = { getToken: async () => 'token', unauthorized: async () => false };
          const source = { ...createService(session, request, ''), resolves: async () => true };
          const api = createBroadcastPanel({ session, request, prefix: '', writes: false, delivery: false, account: async () => 7 });
          const context = { api, account: () => 7, accountName: () => 'Test', canWrite: () => false, canManage: () => true, canDeliver: () => false, canOperate: () => true };
          return render(() => <><CustomerConnections demo={true} load={async () => source} workspace={() => 'w'}/><AddContacts context={context} campaignId={1} canAdd={false} onAdded={() => {}} onFinished={() => {}} onClose={() => {}}/></>, host);
        }`,
    }], build: { outDir: output, emptyOutDir: true, lib: { entry, formats: ["es"], fileName: () => "retirement.mjs" } },
  });
  const dom = new JSDOM('<div id="fixture"></div>', { url: "https://alfa-app.danil.ai" });
  const saved = new Map();
  for (const key of ["window", "document", "navigator", "localStorage", "HTMLElement", "HTMLButtonElement", "CustomEvent", "MutationObserver"]) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  }
  t.after(() => {
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const calls = [];
  const request = async input => {
    const path = String(input);
    calls.push(path);
    if (path.startsWith('/api/contacts?')) return Response.json({ items: [{ id: 1, name: 'Ana', phone: '+525512345678', tags: ['VIP'] }] });
    if (path === '/api/http_tools' || path === '/api/account_variables') return Response.json({ items: [] });
    if (path === '/api/funnels') return Response.json({ funnels: [{ id: 1, name: 'Ventas', stages: [] }] });
    if (path === '/api/calendar/connections') return Response.json({ connections: [] });
    return Response.json({}, { status: 404 });
  };
  const { mount } = await import(pathToFileURL(join(output, "retirement.mjs")).href);
  const dispose = mount(dom.window.document.querySelector('#fixture'), request);
  t.after(dispose);
  const deadline = Date.now() + 1000;
  while (!dom.window.document.body.textContent.includes("Ana") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(calls.some(path => path.startsWith('/api/contacts?')), "the audience actually loaded");
  assert.ok(calls.some(path => path === '/api/http_tools'), "connections actually loaded");
  assert.deepEqual(calls.filter(path => /\/(calendar|funnels|metrics)(\/|\?|$)/.test(path)), []);
  assert.doesNotMatch(dom.window.document.body.textContent, /Calendarios|Embudos|Todos los embudos|web\.service\.calendars|broadcasts\.(filter_funnel|all_funnels)/);
  assert.match(dom.window.document.body.textContent, /Ana/);
});
