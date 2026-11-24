import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { fleet, engine } from "../helpers/fake-relay.mjs";
import { until } from "../helpers/desktop-account.mjs";
import { installSessionsEdge } from "../helpers/web-sessions-edge.mjs";

installSessionsEdge();

const machine = (id) => ({ machine_id: id, name: id, state: "running", connection: "connected" });

test("web boots cleanly with 0 machines, every Settings entry renders without errors, and live machine arrival recovers", async (t) => {
  const f = fleet({
    m1: {
      state: "online",
      table: {
        ...engine,
        list_workspaces: { workspaces: [{ id: "11", name: "W", context_root: null }], active: "11" },
        workspaces_startup: { workspaces: [{ id: "11", name: "W", context_root: null }], active: "11" },
      },
    },
  });
  let currentMachines = [];
  const githubCalls = [];
  const fetcher = async (input) => {
    const url = new URL(String(input));
    if (url.origin === "http://localhost" && url.pathname.includes("/assets/")) return new Response("");
    if (url.pathname === "/v1/capabilities") {
      return Response.json({
        contract: "mvp-v1",
        items: ["machines", "machines.start", "machines.session", "workspaces"].map((name) => ({ name, version: 1, status: "available" })),
      });
    }
    if (url.pathname === "/v1/identity/me") return Response.json({ id: "user_A", name: "Operator", workspace: "11", organizations: [] });
    if (url.pathname === "/v1/workspaces") return Response.json({ items: [{ id: "11", org: "org_A", name: "W", role: "owner" }], next_cursor: null });
    if (url.pathname === "/v1/identity/csrf") return Response.json({ csrf_token: "bound" });
    if (url.pathname === "/v1/machines") return Response.json({ items: currentMachines, next_cursor: null });
    if (url.pathname === "/v1/workspaces/11/github") {
      githubCalls.push(url.pathname);
      return Response.json({ connected: false, credential: null, install_url: "https://github.com/apps/danil" });
    }
    const ticket = /^\/v1\/machines\/([^/]+)\/tickets$/.exec(url.pathname);
    if (ticket) {
      return Response.json({
        ticket: "one-use",
        url: `wss://connect.danil.ai/v1/machines/${ticket[1]}/session`,
        expires_at: "2099-01-01T00:00:00Z",
      });
    }
    return new Response(null, { status: 404 });
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;

  const app = await boot("listo", "web-no-machines-settings", {}, undefined, {}, {
    web: true,
    beforeImport(w) {
      w.WebSocket = globalThis.WebSocket = class {
        constructor(url, protocols) {
          return new f.Socket(url.replace("/v1/machines/", "/v1/computers/"), protocols);
        }
      };
    },
  });
  t.after(() => app.w.dispatchEvent(new app.w.Event("pagehide")));
  const doc = app.w.document;

  assert.ok(await until(() => doc.querySelector("[data-composer-no-machines]")), "composer shows calm no-machines state");
  await sleep(150);

  assert.equal(doc.querySelector("[data-machines-unavailable]"), null, "0 machines is not a service outage");
  assert.equal(doc.querySelector("[data-toast-error]"), null, "no error toast on 0 machines");
  assert.equal(doc.querySelector("[data-material-status]"), null, "no material error banner on 0 machines");
  assert.equal(doc.body.textContent.includes("Conectar una cuenta"), false, "composer does not suggest connecting an AI account without a machine");
  assert.ok(doc.querySelector("[data-composer-no-machines]").textContent.includes("Descargar Danil Desk"), "Free plan offers downloading Danil Desk");

  const settingsButton = doc.querySelector('button[aria-label="Configuración"]');
  assert.ok(settingsButton, "settings trigger exists");
  settingsButton.click();
  assert.ok(await until(() => doc.getElementById("cfg-tab-general")), "settings dialog opens");

  const entries = [
    "cfg-tab-general",
    "cfg-tab-appearance",
    "cfg-tab-account",
    "cfg-tab-security",
    "cfg-tab-ai-accounts",
    "cfg-tab-source-control",
    "cfg-tab-agents-skills",
    "cfg-tab-connections",
    "cfg-tab-personal-ai-agent",
    "cfg-tab-maintenance",
  ];

  for (const id of entries) {
    const tab = doc.getElementById(id);
    assert.ok(tab, `expected settings tab ${id} to exist`);
    tab.click();
    if (id === "cfg-tab-source-control") {
      assert.ok(await until(() => githubCalls.length >= 1), "Source Control queried /v1/workspaces/11/github over control plane with 0 machines");
    }
    await sleep(120);
    const panel = doc.querySelector('[role="tabpanel"]');
    assert.ok(panel, `tabpanel renders for ${id}`);
    const alerts = [...panel.querySelectorAll('[role="alert"]')].map((el) => el.textContent.trim());
    assert.deepEqual(alerts, [], `expected 0 alert banners in ${id}, got: ${alerts.join(" | ")}`);
    assert.equal(panel.textContent.includes("Ninguna máquina con acceso"), false, `${id} should not show raw no_machine failure prose`);

    const subtabs = [...panel.querySelectorAll('[id^="cfg-sub-"]')];
    for (const sub of subtabs) {
      sub.click();
      await sleep(100);
      const subAlerts = [...panel.querySelectorAll('[role="alert"]')].map((el) => el.textContent.trim());
      assert.deepEqual(subAlerts, [], `expected 0 alert banners in ${id}/${sub.id}, got: ${subAlerts.join(" | ")}`);
    }
  }

  // Appearance theme change persists to localStorage with 0 machines.
  doc.getElementById("cfg-tab-appearance").click();
  await sleep(100);
  const darkRadio = [...doc.querySelectorAll('[role="radio"]')].find((el) => el.getAttribute("aria-label") === "Oscuro");
  assert.ok(darkRadio, "dark theme radio exists");
  darkRadio.click();
  await sleep(50);
  assert.equal(app.w.localStorage.getItem("harness:apariencia"), "oscuro", "theme choice persists in browser storage");
  assert.equal(doc.documentElement.dataset.theme, "dark", "dark theme applies immediately");

  // Close Settings and test live recovery when a machine arrives.
  doc.querySelector('button[aria-label="Cerrar configuración (Esc)"]')?.click();
  await sleep(50);

  currentMachines = [machine("m1")];
  app.w.dispatchEvent(new app.w.Event("focus"));
  assert.ok(await until(() => !doc.querySelector("[data-composer-no-machines]")), "composer recovers automatically when a machine comes online");
  assert.deepEqual(app.failures.filter((msg) => !msg.includes("Not implemented: HTMLCanvasElement")), []);
});
