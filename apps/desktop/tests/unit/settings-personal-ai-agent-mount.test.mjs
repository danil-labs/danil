import assert from "node:assert/strict";
import test from "node:test";
import { engine, relay } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { RESPONSES } from "../helpers/mount-guard.mjs";

const until = async (read, max = 120) => {
  for (let i = 0; i < max; i++) {
    if (read()) return true;
    await sleep(40);
  }
  return false;
};

const SUBTITLE = "Muse, Grok, Dot, Duet, Hermes…";
const DESCRIPTION_ES = "Conecta tu asistente personal para que trabaje con tu espacio de trabajo de manera segura.";
const MCP_URL = "https://mcp.danil.ai/mcp";

test("Desk promotes Agente IA Personal out of Conectores with subtitle, MCP N1 URL, and N1 controls", async () => {
  const edgeCalls = [];
  let connection = {
    id: "conn_hermes",
    client_id: "hermes-agent",
    organization_id: "org_danil",
    state: "active",
    version: 1,
    exclusions: [],
  };

  const app = await boot("listo", "settings-personal-ai-agent-desk", {
    ...RESPONSES,
    danil_edge_fetch: (args) => {
      edgeCalls.push([args.method, args.path, args.body ?? null]);
      if (args.method === "GET" && args.path === "/v1/connections") {
        return { status: 200, body: { items: [connection] } };
      }
      if (args.method === "GET" && args.path === "/v1/identity/me") {
        return {
          status: 200,
          body: {
            id: "user_1",
            name: "Ada",
            email: "ada@danil.ai",
            workspace: null,
            active_organization_id: "org_danil",
            organizations: [{ id: "org_danil", name: "Danil" }],
          },
        };
      }
      if (args.method === "GET" && args.path === "/v1/workspaces") {
        return {
          status: 200,
          body: { items: [{ id: "w1", engine_workspace_id: "ws_1", name: "Principal" }] },
        };
      }
      if (args.method === "PATCH" && args.path === "/v1/connections/conn_hermes") {
        if (args.body?.action === "pause") {
          connection = { ...connection, state: "paused", version: connection.version + 1 };
        }
        return { status: 200, body: connection };
      }
      return { status: 404, body: {} };
    },
  });

  const doc = app.w.document;
  doc.querySelector('button[aria-label="Configuración"]')?.click();
  assert.ok(await until(() => doc.querySelector("#cfg-tab-personal-ai-agent")));

  const navTabs = [...doc.querySelectorAll('[id^="cfg-tab-"]')].map((el) => el.id);
  const connIndex = navTabs.indexOf("cfg-tab-connections");
  const agentIndex = navTabs.indexOf("cfg-tab-personal-ai-agent");
  const maintIndex = navTabs.indexOf("cfg-tab-maintenance");
  assert.ok(connIndex >= 0, "Conectores entry must render");
  assert.equal(agentIndex, connIndex + 1, "Agente IA Personal goes right after Conectores");
  assert.equal(maintIndex, agentIndex + 1, "Agente IA Personal goes right before Mantenimiento");

  const agentTab = doc.querySelector("#cfg-tab-personal-ai-agent");
  assert.ok(agentTab.textContent.includes("Agente IA Personal"));
  assert.equal(
    agentTab.querySelector("[data-settings-entry-subtitle]")?.textContent?.trim(),
    SUBTITLE,
    "rail entry must display the requested subtitle",
  );

  // Conectores must no longer contain the retired memory or external sub-tabs
  doc.querySelector("#cfg-tab-connections")?.click();
  await sleep(60);
  assert.ok(doc.querySelector("#cfg-sub-operation"));
  assert.ok(doc.querySelector("#cfg-sub-plugins"));
  assert.equal(doc.querySelector("#cfg-sub-memory"), null, "Conectores must not contain retired memory sub-tab");
  assert.equal(doc.querySelector("#cfg-sub-external"), null, "Conectores must not contain external sub-tab");
  assert.ok(!doc.querySelector("#cfg-panel").textContent.includes("Acceso externo"));

  // Legacy "conexiones" redirect opens Agente IA Personal directly
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "conexiones" }));
  assert.ok(await until(() => doc.querySelector("[data-settings-personal-ai-agent]")));

  assert.equal(doc.querySelector("#cfg-panel h2")?.textContent?.trim(), "Agente IA Personal");
  assert.equal(doc.querySelector('#cfg-panel [role="tablist"]'), null, "single-tab entry has no sub-tablist");
  assert.equal(doc.querySelector("[data-settings-scope-badge]"), null, "account-scoped entry has no workspace badge");

  const panel = doc.querySelector("[data-settings-personal-ai-agent]");
  assert.ok(panel.textContent.includes(DESCRIPTION_ES), "panel must show requested Spanish description");
  assert.equal(panel.querySelector("[data-mcp-url]")?.textContent?.trim(), MCP_URL);
  assert.ok(await until(() => panel.textContent.includes("hermes-agent")), "MCP N1 connection must render");
  assert.ok(panel.textContent.includes("Organización: Danil · Todos los workspaces"));
  assert.ok(!panel.textContent.includes("Danil Machines"), "no legacy Danil Machines copy");
  assert.ok(!panel.textContent.includes("En la nube"), "no legacy En la nube copy");

  const pauseButton = [...panel.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Pausar");
  assert.ok(pauseButton, "Pause action must be available");
  pauseButton.click();
  assert.ok(await until(() => panel.textContent.includes("En pausa")), "Pause updates state via N1 PATCH");
  assert.ok(edgeCalls.some(([m, p, b]) => m === "PATCH" && p === "/v1/connections/conn_hermes" && b?.action === "pause"));
  assert.deepEqual(app.failures, []);
});

test("Web mounts Agente IA Personal rail entry with subtitle and loads/patches N1 MCP over Edge with CSRF", async (t) => {
  const csrfHeaders = [];
  let connection = {
    id: "conn_web",
    client_id: "muse-assistant",
    organization_id: "org_web",
    state: "active",
    version: 1,
    exclusions: [],
  };

  const echo = (body, init = {}) =>
    Response.json(body, {
      ...init,
      headers: { "X-Danil-Session-Applied": "ctx_web", "X-Danil-Session-Applied-Org": "org_web" },
    });

  const prevFetch = globalThis.fetch;
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    if (url.origin === "http://localhost" && url.pathname.includes("/assets/")) return new Response("");
    switch (url.pathname) {
      case "/v1/capabilities":
        return Response.json({
          contract: "mvp-v1",
          items: ["machines", "machines.session", "workspaces"].map((name) => ({ name, version: 1, status: "available" })),
        });
      case "/v1/identity/csrf":
        return Response.json({ csrf_token: "csrf-web-n1" });
      case "/v1/identity/sessions":
        return Response.json({
          version: 1,
          items: [
            {
              session_id: "ses_web",
              sub: "user_web",
              email: "web@danil.ai",
              contexts: [{ context_id: "ctx_web", org: "org_web", org_name: "Danil Web", plan: "pro", role: "admin" }],
            },
          ],
          primary: "ses_web",
          default_context: "ctx_web",
        });
      case "/v1/identity/sessions/catalog":
        return Response.json({
          version: 1,
          items: [
            {
              session_id: "ses_web",
              sub: "user_web",
              email: "web@danil.ai",
              contexts: [
                {
                  context_id: "ctx_web",
                  org: "org_web",
                  org_name: "Danil Web",
                  catalog_state: "listed",
                  workspaces: [{ account_id: "a1", engine_workspace_id: "w_web", name: "Web WS" }],
                },
              ],
            },
          ],
        });
      case "/v1/identity/me":
        return echo({
          id: "user_web",
          name: "QA Web",
          email: "web@danil.ai",
          workspace: null,
          active_organization_id: "org_web",
          organizations: [{ id: "org_web", name: "Danil Web" }],
        });
      case "/v1/workspaces/preferences":
        return echo({ version: 1, added: ["w_web"] });
      case "/v1/workspaces":
        return echo({
          items: [{ id: "a1", org: "org_web", name: "Web WS", role: "admin", engine_workspace_id: "w_web", placement: { kind: "organization_machine" } }],
          next_cursor: null,
        });
      case "/v1/credits/balance":
        return echo({ items: [] });
      case "/v1/machines":
        return echo({
          items: [
            {
              machine_id: "mw",
              name: "Nube Web",
              kind: "organization",
              organization_id: "org_web",
              state: "running",
              connection: "connected",
            },
          ],
          next_cursor: null,
        });
      case "/v1/connections":
        return echo({ items: [connection] });
      case "/v1/connections/conn_web":
        if (method === "PATCH") {
          csrfHeaders.push(headers.get("x-csrf-token"));
          const patch = JSON.parse(String(init.body ?? "{}"));
          if (patch.action === "pause") {
            connection = { ...connection, state: "paused", version: connection.version + 1 };
          }
          return echo(connection);
        }
        break;
    }
    if (/^\/v1\/machines\/mw\/tickets$/.test(url.pathname)) {
      return echo({
        ticket: "one-use",
        url: "wss://connect.danil.ai/v1/machines/mw/session",
        expires_at: "2099-01-01T00:00:00Z",
      });
    }
    return echo({}, { status: 404 });
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;
  t.after(() => {
    globalThis.fetch = prevFetch;
  });

  const table = {
    ...engine,
    list_workspaces: { workspaces: [{ id: "w_web", name: "Web WS", context_root: null }], active: null },
    workspaces_startup: { workspaces: [{ id: "w_web", name: "Web WS", context_root: null }], active: null },
    set_active_workspace: null,
  };
  const fake = relay({ table });

  const app = await boot("listo", "settings-personal-ai-agent-web", {}, undefined, {}, {
    web: true,
    beforeImport(w) {
      w.WebSocket = fake.Socket;
      globalThis.WebSocket = fake.Socket;
    },
  });
  t.after(() => app.w.dispatchEvent(new app.w.Event("pagehide")));

  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector('[data-workspace-tile="w_web"]')));
  doc.querySelector('[data-workspace-tile="w_web"]').click();
  assert.ok(await until(() => doc.querySelector('[data-workspace-tile="w_web"]')?.getAttribute("aria-current") === "true"));

  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "personal-ai-agent" }));
  assert.ok(await until(() => doc.querySelector("[data-settings-personal-ai-agent]")));

  const agentTab = doc.querySelector("#cfg-tab-personal-ai-agent");
  assert.ok(agentTab, "Web rail must render Agente IA Personal");
  assert.equal(agentTab.querySelector("[data-settings-entry-subtitle]")?.textContent?.trim(), SUBTITLE);

  const panel = doc.querySelector("[data-settings-personal-ai-agent]");
  assert.ok(panel.textContent.includes(DESCRIPTION_ES));
  assert.equal(panel.querySelector("[data-mcp-url]")?.textContent?.trim(), MCP_URL);
  assert.ok(await until(() => panel.textContent.includes("muse-assistant")), "Web must load N1 connections via Edge");

  const pauseButton = [...panel.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Pausar");
  assert.ok(pauseButton, "Web Pause button must render");
  pauseButton.click();
  assert.ok(await until(() => panel.textContent.includes("En pausa")), "Web Pause updates via Edge PATCH");
  assert.deepEqual(csrfHeaders, ["csrf-web-n1"]);

  assert.deepEqual(
    app.failures.filter((f) => !f.includes("Not implemented: HTMLCanvasElement")),
    [],
  );
});
