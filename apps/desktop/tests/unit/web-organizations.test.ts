import assert from "node:assert/strict";
import test from "node:test";
import { createOrganizationSelection } from "@terminus/computers";
import { platformTransport } from "../../src/web/platform-session.ts";
import { webOrganizationSource } from "../../src/web/organizations.ts";

const DANIL = { id: "org_01M62PT11XGX8R8J883NZVYHR6", name: "Danil", plan: "enterprise", role: "owner" };
const OTRA = { id: "org_otra", name: "Otra", plan: "team", role: "member", nuevo: true };
const CAPS = { contract: "mvp-v1", items: [{ name: "identity.organizations", version: 1, status: "available" }] };
const json = (status: number, body: unknown, problem = status >= 400) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": problem ? "application/problem+json" : "application/json" } });
const problem = (status: number, code: string) => json(status, { type: `urn:danil:problem:${code}`, title: code, status, code });

function clock() {
  const timers: { at: number; run: () => void }[] = [];
  return {
    timers,
    schedule: (run: () => void, ms: number) => { timers.push({ at: ms, run }); return () => {}; },
    fire: async () => { timers.shift()?.run(); await new Promise((r) => setTimeout(r, 0)); },
  };
}

type Route = (init: RequestInit) => Response | Promise<Response>;
function server(routes: Record<string, Route>) {
  const seen: { path: string; init: RequestInit }[] = [];
  const request = (async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    seen.push({ path, init });
    const route = routes[path];
    return route ? route(init) : problem(404, "not_found");
  }) as typeof fetch;
  return { seen, transport: platformTransport({ origin: "https://edge.example", timeoutMs: 1000 }, request) };
}

test("web: 404/501 de organizations → oculto y reintento con backoff; cuando aparece, la lista", async () => {
  const c = clock();
  let status = 404;
  const s = server({
    "/v1/capabilities": () => json(200, CAPS),
    "/v1/identity/organizations": () => (status === 200 ? json(200, { items: [DANIL, OTRA], next_cursor: null, active_organization_id: DANIL.id }) : problem(status, "not_found")),
  });
  const sel = createOrganizationSelection(webOrganizationSource(s.transport), { schedule: c.schedule });
  await sel.load();
  assert.equal(sel.visible(), false);
  assert.equal(c.timers.length, 1);
  status = 501;
  await c.fire();
  assert.equal(sel.visible(), false);
  status = 200;
  await c.fire();
  const st = sel.state();
  assert.deepEqual(st.kind === "ready" && st.items.map((o) => o.id), [DANIL.id, OTRA.id]);
  assert.ok(s.seen.every((r) => r.init.credentials === "include"), "solo cookie");
});

test("web: sin /v1/capabilities o sin la capacidad, oculto sin pedir la ruta", async () => {
  const c = clock();
  const s = server({ "/v1/identity/organizations": () => json(200, { items: [DANIL], next_cursor: null }) });
  const sel = createOrganizationSelection(webOrganizationSource(s.transport), { schedule: c.schedule });
  await sel.load();
  assert.equal(sel.visible(), false);
  assert.equal(s.seen.filter((r) => r.path === "/v1/identity/organizations").length, 0);
  assert.equal(c.timers.length, 1);
});

test("web: select con CSRF y una Idempotency-Key por intento, repetida en el reintento; luego recarga", async () => {
  let fail = true;
  let reloaded = 0;
  const s = server({
    "/v1/capabilities": () => json(200, CAPS),
    "/v1/identity/csrf": () => json(200, { csrf_token: "tok" }),
    "/v1/identity/organizations": () => json(200, { items: [DANIL, OTRA], next_cursor: null, active_organization_id: DANIL.id }),
    "/v1/identity/organizations/select": () => {
      if (fail) { fail = false; return problem(503, "unavailable"); }
      return json(200, { organization: OTRA, workspace: null });
    },
  });
  let n = 0;
  const sel = createOrganizationSelection(webOrganizationSource(s.transport), { key: () => `k${++n}`, onSelected: () => { reloaded++; } });
  await sel.load();
  await sel.choose(OTRA.id);
  await sel.choose(OTRA.id);
  const posts = s.seen.filter((r) => r.path === "/v1/identity/organizations/select");
  assert.equal(posts.length, 2);
  const headers = posts.map((p) => p.init.headers as Record<string, string>);
  assert.deepEqual(headers.map((h) => h["Idempotency-Key"]), ["k1", "k1"]);
  assert.ok(headers.every((h) => h["X-CSRF-Token"] === "tok"));
  assert.deepEqual(JSON.parse(String(posts[0].init.body)), { organization_id: OTRA.id });
  assert.equal(reloaded, 1);
});

test("web: 403 organization_selection_required de otra ruta abre el selector", async () => {
  const s = server({
    "/v1/capabilities": () => json(200, CAPS),
    "/v1/identity/organizations": () => json(200, { items: [DANIL, OTRA], next_cursor: null, active_organization_id: DANIL.id }),
    "/v1/machines": () => problem(403, "organization_selection_required"),
  });
  const sel = createOrganizationSelection(webOrganizationSource(s.transport));
  await sel.load();
  assert.equal(sel.needed(), false);
  const error = await s.transport.call("machines").catch((e) => e);
  assert.equal(sel.report(error), true);
  assert.equal(sel.needed(), true);
});


test("web reuses bootstrap discovery for organizations instead of requesting it twice", async () => {
  const c = clock();
  const s = server({ "/v1/identity/organizations": () => json(200, { items: [DANIL, OTRA], next_cursor: null, active_organization_id: DANIL.id }) });
  const sel = createOrganizationSelection(webOrganizationSource(s.transport, () => CAPS), { schedule: c.schedule });
  await sel.load();
  assert.equal(sel.state().kind, "ready");
  assert.deepEqual(s.seen.map(r => r.path), ["/v1/identity/organizations"]);
});
