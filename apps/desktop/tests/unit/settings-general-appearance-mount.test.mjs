import assert from "node:assert/strict";
import test from "node:test";
import { boot as mountApp, sleep } from "../helpers/jsdom-app.mjs";
import { fleet, engine } from "../helpers/fake-relay.mjs";
import { until } from "../helpers/desktop-account.mjs";
import { installSessionsEdge } from "../helpers/web-sessions-edge.mjs";
import { boot, RESPONSES } from "../helpers/mount-guard.mjs";

installSessionsEdge();

function assertNoFocusOrSelectionRings(root, label) {
  const subpanel = root.querySelector("#cfg-subpanel") ?? root;
  const controls = [...subpanel.querySelectorAll('[role="radio"], button[aria-pressed], input[type="range"]')];
  assert.ok(controls.length > 0, `${label}: expected appearance controls in #cfg-subpanel`);
  for (const el of controls) {
    const cls = el.className ?? "";
    assert.ok(
      !cls.includes("focus-visible:outline-solid") &&
        !cls.includes("focus-visible:outline-2") &&
        !cls.includes("outline-primary") &&
        !cls.includes("border-primary"),
      `${label}: control <${el.tagName.toLowerCase()}> should not use focus/selection rings (${cls})`,
    );
  }
}

test("General and Apariencia mount first in Settings, Notificaciones lives in General, and permissions default to auto", async () => {
  const saves = [];
  const workspaces = {
    workspaces: [{ id: "w", name: "W", context_root: null, default_permission_mode: null }],
    active: "w",
  };
  const app = await boot("listo", "settings-general-appearance", {
    ...RESPONSES,
    list_workspaces: () => workspaces,
    workspaces_startup: () => workspaces,
    list_language_packs: [],
    list_bundled_language_packs: [],
    chat_background: () => ({ preset: "neutro", data_url: null, veil: { chat: 0.7, tabs: 0.4, panels: 0.25 } }),
    list_machine_agents: () => ({ own: [], repository: [] }),
    set_workspace_permission_mode: ({ id, mode }) => {
      saves.push([id, mode]);
      return { ...workspaces.workspaces[0], default_permission_mode: mode };
    },
  });
  const { w } = app;

  w.document.querySelector('button[aria-label="Configuración"]')?.click();
  await sleep(120);

  const navTabs = [...w.document.querySelectorAll('[id^="cfg-tab-"]')].map((el) => el.id);
  assert.equal(navTabs[0], "cfg-tab-general", "General must be the first Settings entry");
  assert.equal(navTabs[1], "cfg-tab-appearance", "Apariencia must appear right below General");

  const generalTab = w.document.querySelector("#cfg-tab-general");
  const appearanceTab = w.document.querySelector("#cfg-tab-appearance");
  assert.equal(generalTab?.textContent?.trim(), "General");
  assert.equal(appearanceTab?.textContent?.trim(), "Apariencia");

  assert.equal(w.document.querySelector("#cfg-panel h2")?.textContent?.trim(), "General");
  assert.equal(w.document.querySelector('#cfg-panel [role="tablist"]'), null, "General has no inner tablist");

  const headings = [...w.document.querySelectorAll("#cfg-panel h3")].map((h) => h.textContent?.trim());
  assert.ok(headings.includes("Notificaciones"), "General contains Notificaciones as a SettingsSection");
  const notifyRow = w.document.querySelector('[data-setting="notify-behavior"]');
  assert.ok(notifyRow, "NotifyBehavior mounts inside General");
  const notifySelect = notifyRow.querySelector("select");
  assert.ok(notifySelect);
  assert.ok(!notifySelect.className.includes("focus-visible:outline-solid"), "NotifyBehavior select has no focus outline");

  const permSelect = w.document.querySelector('[data-setting="default-permissions"] select');
  assert.ok(permSelect, "DefaultPermissions select mounts inside General");
  assert.equal(permSelect.value, "auto", "unset workspace default_permission_mode displays auto");
  assert.ok(!permSelect.className.includes("focus-visible:outline-solid"), "DefaultPermissions select has no focus outline");

  permSelect.value = "ediciones";
  permSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  await sleep(80);
  assert.deepEqual(saves, [["w", "ediciones"]]);

  assert.equal(w.document.querySelector("#cfg-tab-preferences"), null);
  assert.equal(w.document.querySelector("#cfg-sub-general"), null);
  assert.equal(w.document.querySelector("#cfg-sub-appearance"), null);
  assert.equal(w.document.querySelector("#cfg-sub-notify"), null);

  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "notify" }));
  await sleep(60);
  assert.equal(w.document.querySelector("#cfg-panel h2")?.textContent?.trim(), "General");
  assert.ok(w.document.querySelector('[data-setting="notify-behavior"]'));

  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "appearance" }));
  await sleep(160);
  const panel = w.document.querySelector("#cfg-panel");
  assert.equal(panel?.querySelector("h2")?.textContent?.trim(), "Apariencia");
  assert.equal(panel?.querySelector('[role="tablist"]'), null, "Apariencia has no inner tablist");
  assert.ok(!panel?.textContent?.includes("Logo"), "Apariencia no longer renders workspace logo editing");
  assertNoFocusOrSelectionRings(panel, "Desk Apariencia");

  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "notifications" }));
  await sleep(60);
  assert.equal(w.document.querySelector("#cfg-panel h2")?.textContent?.trim(), "General");

  assert.deepEqual(app.failures, []);
});

test("Desk Apariencia applies theme/styles, persists chat background, and reloads cleanly when switching workspace", async () => {
  let active = "w1";
  const workspaces = () => ({
    workspaces: [
      { id: "w1", name: "Acme", context_root: null, sessions: 0 },
      { id: "w2", name: "Beta", context_root: null, sessions: 0 },
    ],
    active,
  });
  const backgrounds = {
    w1: { preset: "neutro", data_url: null, veil: { chat: 0.7, tabs: 0.4, panels: 0.25 } },
    w2: { preset: null, data_url: "data:image/png;base64,AAAA", veil: { chat: 0.2, tabs: 0.55, panels: 0.8 } },
  };
  const savedBackgrounds = [];
  const app = await boot("listo", "appearance-desk-workspace-switch", {
    ...RESPONSES,
    list_workspaces: () => workspaces(),
    workspaces_startup: () => workspaces(),
    set_active_workspace: ({ id }) => {
      active = id;
    },
    chat_background: () => structuredClone(backgrounds[active]),
    set_chat_background: (args) => {
      savedBackgrounds.push({ workspace: active, ...args });
      return backgrounds[active];
    },
    list_machine_agents: () => ({
      own: [
        {
          agent: {
            name: active === "w1" ? "alpha-agent" : "beta-agent",
            description: "Agente",
            own: true,
            own_scope: { kind: "workspace" },
          },
          profile: { display_name: null, body: null, avatar: null },
          folders: ["/repo"],
        },
      ],
      repository: [],
    }),
  });
  const { w } = app;

  w.document.querySelector('button[aria-label="Configuración"]')?.click();
  await sleep(120);
  w.document.querySelector("#cfg-tab-appearance")?.click();
  for (let i = 0; i < 60 && !w.document.querySelector("#cfg-panel")?.textContent?.includes("alpha-agent"); i++) await sleep(25);

  const panel = () => w.document.querySelector("#cfg-panel");
  assert.ok(!panel().textContent.includes("Logo"), "workspace logo editor is absent");
  assert.ok(panel().textContent.includes("alpha-agent"));
  assertNoFocusOrSelectionRings(panel(), "Desk Apariencia switch");

  // Cambiar tema, estilo oscuro y estilo claro se refleja inmediatamente en <html>.
  panel().querySelector('[role="radio"][aria-label="Oscuro"]')?.click();
  await sleep(30);
  assert.equal(w.document.documentElement.dataset.theme, "dark");

  panel().querySelector('[role="radio"][aria-label="Azul"]')?.click();
  await sleep(30);
  assert.equal(w.document.documentElement.dataset.darkStyle, undefined, "navy removes data-dark-style");

  panel().querySelector('[role="radio"][aria-label="Grafito"][data-light-style="graphite"]')?.click();
  await sleep(30);
  assert.equal(w.document.documentElement.dataset.lightStyle, "graphite");

  // El deslizador de visibilidad refleja el velo del workspace activo (w1: 0.7 -> 30%).
  const visInput = () => w.document.querySelector("#settings-appearance-background-visibility");
  const tabsInput = () => w.document.querySelector("#settings-appearance-tabs-veil");
  const panelsInput = () => w.document.querySelector("#settings-appearance-panels-veil");
  assert.equal(visInput()?.value, "30");
  assert.equal(tabsInput()?.value, "40");
  assert.equal(panelsInput()?.value, "25");

  // Cambiar de workspace desde el selector recarga fondo, velos y avatares del nuevo workspace.
  w.document.querySelector("aside [data-settings-workspace-trigger]")?.click();
  await sleep(80);
  w.document.querySelector('[data-settings-workspace-option="w2"]')?.click();
  for (let i = 0; i < 80 && (!panel()?.textContent?.includes("beta-agent") || visInput()?.value !== "80"); i++) await sleep(25);

  assert.ok(panel().textContent.includes("beta-agent"), "agents reload for w2");
  assert.equal(visInput()?.value, "80", "visibility slider updates to w2 veil (1 - 0.2 = 80%)");
  assert.equal(tabsInput()?.value, "55", "tabs veil slider updates to w2");
  assert.equal(panelsInput()?.value, "80", "panels veil slider updates to w2");
  assert.equal(
    panel().querySelector('button[aria-label="Fondo propio"]')?.getAttribute("aria-pressed"),
    "true",
    "custom background card reflects w2 image",
  );
  assert.ok(savedBackgrounds.every((entry) => entry.workspace === "w1"), "no stale save leaked into w2");
  assert.deepEqual(app.failures, []);
});

test("Web Apariencia hides workspace logo editing and uploads agent avatars via <input type=file> without Tauri dialog open()", async (t) => {
  const pasted = [];
  const avatarCalls = [];
  const dialogCalls = [];
  const alerts = [];
  const machine = { machine_id: "m1", name: "m1", state: "running", connection: "connected" };
  const f = fleet({
    m1: {
      state: "online",
      table: {
        ...engine,
        list_workspaces: { workspaces: [{ id: "11", name: "W", context_root: null }], active: "11" },
        workspaces_startup: { workspaces: [{ id: "11", name: "W", context_root: null }], active: "11" },
        chat_background: { preset: "neutro", data_url: null, veil: { chat: 0.6, tabs: 0.45, panels: 0.3 } },
        set_chat_background: (args) => ({ preset: args?.preset ?? null, data_url: args?.dataUrl ?? null, veil: args?.veil ?? null }),
        list_machine_agents: {
          own: [
            {
              agent: {
                name: "web-agent",
                description: "Agente web",
                own: true,
                own_scope: { kind: "workspace" },
              },
              profile: { display_name: "Web Agent", body: null, avatar: null },
              folders: ["/ws/app"],
            },
          ],
          repository: [],
        },
        guardar_imagen_pegada: (args) => {
          pasted.push(args);
          return "/tmp/uploaded-avatar.png";
        },
        set_agent_avatar: (args) => {
          avatarCalls.push(args);
          return { display_name: "Web Agent", body: null, avatar: "data:image/png;base64,iVBORw0KGgo=" };
        },
        "plugin:dialog|open": () => {
          dialogCalls.push("open");
          return null;
        },
      },
    },
  });

  const prevFetch = globalThis.fetch;
  const fetcher = async (input) => {
    const url = new URL(String(input));
    if (url.origin === "http://localhost" && url.pathname.includes("/assets/")) return new Response("");
    if (url.pathname === "/v1/capabilities") {
      return Response.json({
        contract: "mvp-v1",
        items: ["machines", "machines.start", "machines.session", "workspaces"].map((name) => ({
          name,
          version: 1,
          status: "available",
        })),
      });
    }
    if (url.pathname === "/v1/identity/me") return Response.json({ id: "user_A", name: "Operator", workspace: "11", organizations: [] });
    if (url.pathname === "/v1/workspaces") return Response.json({ items: [{ id: "11", org: "org_A", name: "W", role: "owner" }], next_cursor: null });
    if (url.pathname === "/v1/identity/csrf") return Response.json({ csrf_token: "bound" });
    if (url.pathname === "/v1/machines") return Response.json({ items: [machine] });
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
  t.after(() => {
    globalThis.fetch = prevFetch;
  });

  const app = await mountApp("listo", "appearance-web-parity", {}, undefined, {}, {
    web: true,
    beforeImport(w) {
      w.alert = (msg) => alerts.push(String(msg));
      w.WebSocket = globalThis.WebSocket = class {
        constructor(url, protocols) {
          return new f.Socket(url.replace("/v1/machines/", "/v1/computers/"), protocols);
        }
      };
    },
  });
  t.after(() => app.w.dispatchEvent(new app.w.Event("pagehide")));

  const { w } = app;
  assert.ok(await until(() => w.document.querySelector('button[aria-label="Configuración"]')));
  w.document.querySelector('button[aria-label="Configuración"]')?.click();
  assert.ok(await until(() => w.document.querySelector("#cfg-tab-appearance")));
  w.document.querySelector("#cfg-tab-appearance")?.click();
  assert.ok(await until(() => w.document.querySelector("#cfg-panel")?.textContent?.includes("Web Agent")));

  const panel = w.document.querySelector("#cfg-panel");
  assert.ok(!panel.textContent.includes("Logo"), "Web Apariencia has no workspace logo editing");
  assertNoFocusOrSelectionRings(panel, "Web Apariencia");

  // Interceptar `<input type="file">` creado por `elegirArchivoDeImagen` y entregar un PNG real en memoria.
  const createdInputs = [];
  const origCreateElement = w.document.createElement.bind(w.document);
  w.document.createElement = (tag, options) => {
    const el = origCreateElement(tag, options);
    if (String(tag).toLowerCase() === "input") {
      el.click = () => {
        createdInputs.push(el);
        const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        const file = new w.File([pngBytes], "avatar.png", { type: "image/png" });
        Object.defineProperty(el, "files", { value: [file], configurable: true });
        el.onchange?.();
      };
    }
    return el;
  };

  const pickAvatarBtn = [...panel.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Elegir imagen");
  assert.ok(pickAvatarBtn, "agent row renders avatar pick button");
  pickAvatarBtn.click();

  assert.ok(await until(() => avatarCalls.length === 1), "Web avatar upload reaches set_agent_avatar");
  assert.equal(dialogCalls.length, 0, "Web never calls Tauri plugin:dialog|open");
  assert.equal(alerts.length, 0, "Web never triggers local_files alert");
  assert.equal(createdInputs.length, 1, "Web opened an <input type=file>");
  assert.ok(createdInputs[0].accept.includes("image/png"), "file input advertises image MIME types");
  assert.equal(pasted.length, 1, "Web uploaded bytes via guardar_imagen_pegada");
  assert.equal(pasted[0].mime, "image/png");
  assert.equal(pasted[0].datos, "iVBORw0KGgo=");
  assert.deepEqual(avatarCalls[0], { project: "/ws/app", name: "web-agent", source: "/tmp/uploaded-avatar.png" });

  // Tema y estilos en Web se aplican y persisten en localStorage.
  panel.querySelector('[role="radio"][aria-label="Oscuro"]')?.click();
  await sleep(30);
  assert.equal(w.document.documentElement.dataset.theme, "dark");
  assert.equal(w.localStorage.getItem("harness:apariencia"), "oscuro");

  assert.deepEqual(app.failures, []);
});
