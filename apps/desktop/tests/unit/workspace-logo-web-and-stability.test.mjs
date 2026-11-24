import assert from "node:assert/strict";
import test from "node:test";
import { engine, relay } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const until = async (read, max = 140) => {
  for (let i = 0; i < max; i++) {
    if (read()) return true;
    await sleep(40);
  }
  return false;
};

const LOGO_A = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
const LOGO_A2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const LOGO_B = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("Web left rail renders workspace logos per context and SettingsWorkspaceSelector never flickers back to monogram on revalidation", async (t) => {
  const ORGS = { ctx_one: "org_one", ctx_two: "org_two" };
  const echo = (context, body, init = {}) =>
    Response.json(body, {
      ...init,
      headers: { "X-Danil-Session-Applied": context, "X-Danil-Session-Applied-Org": ORGS[context] },
    });

  const prevFetch = globalThis.fetch;
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.origin === "http://localhost" && url.pathname.includes("/assets/")) return new Response("");
    const context = new Headers(init.headers).get("X-Danil-Session") ?? "ctx_one";
    switch (url.pathname) {
      case "/v1/capabilities":
        return Response.json({
          contract: "mvp-v1",
          items: ["machines", "machines.session", "workspaces"].map((name) => ({ name, version: 1, status: "available" })),
        });
      case "/v1/identity/csrf":
        return Response.json({ csrf_token: "bound" });
      case "/v1/identity/sessions":
        return Response.json({
          version: 1,
          items: [
            {
              session_id: "ses_web",
              sub: "user_web",
              email: "web@example.test",
              contexts: [
                { context_id: "ctx_one", org: "org_one", org_name: "Danil Org", plan: "pro", role: "admin" },
                { context_id: "ctx_two", org: "org_two", org_name: "Beta Org", plan: "business", role: "member" },
              ],
            },
          ],
          primary: "ses_web",
          default_context: "ctx_one",
        });
      case "/v1/identity/sessions/catalog":
        return Response.json({
          version: 1,
          items: [
            {
              session_id: "ses_web",
              sub: "user_web",
              email: "web@example.test",
              contexts: [
                {
                  context_id: "ctx_one",
                  org: "org_one",
                  org_name: "Danil Org",
                  catalog_state: "listed",
                  // Real catalog rows do not carry logo paths; logo lives on the context's engine workspace.
                  workspaces: [{ account_id: "a1", engine_workspace_id: "w_one", name: "Danil Workspace" }],
                },
                {
                  context_id: "ctx_two",
                  org: "org_two",
                  org_name: "Beta Org",
                  catalog_state: "listed",
                  workspaces: [{ account_id: "a2", engine_workspace_id: "w_two", name: "Beta Workspace" }],
                },
              ],
            },
          ],
        });
      case "/v1/identity/me":
        return echo(context, { id: "user_web", name: "QA Web", email: "web@example.test", workspace: null, organizations: [] });
      case "/v1/workspaces/preferences":
        return echo(context, { version: 1, added: context === "ctx_one" ? ["w_one"] : ["w_two"] });
      case "/v1/workspaces":
        return echo(context, {
          items:
            context === "ctx_one"
              ? [{ id: "a1", org: "org_one", name: "Danil Workspace", role: "admin", engine_workspace_id: "w_one", placement: { kind: "organization_machine" } }]
              : [{ id: "a2", org: "org_two", name: "Beta Workspace", role: "member", engine_workspace_id: "w_two", placement: { kind: "organization_machine" } }],
          next_cursor: null,
        });
      case "/v1/credits/balance":
        return echo(context, { items: [] });
      case "/v1/machines":
        return echo(context, {
          items: [
            {
              machine_id: context === "ctx_one" ? "m_one" : "m_two",
              name: context === "ctx_one" ? "VM One" : "VM Two",
              kind: "organization",
              organization_id: ORGS[context],
              state: "running",
              connection: "connected",
            },
          ],
          next_cursor: null,
        });
    }
    if (/^\/v1\/machines\/m_[a-z]+\/tickets$/.test(url.pathname)) {
      return echo(context, {
        ticket: "one-use",
        url: `wss://connect.danil.ai${url.pathname.replace("/tickets", "/session")}`,
        expires_at: "2099-01-01T00:00:00Z",
      });
    }
    return echo(context, {}, { status: 404 });
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;
  t.after(() => {
    globalThis.fetch = prevFetch;
  });

  let measuredAt = 1000;
  let logoA = LOGO_A;
  let workspaceNameEvents = 0;

  const previewFile = (args) => {
    if (args.path === "/ws/w_one/logo.png") return { data_url: logoA };
    if (args.path === "/ws/w_two/logo.png") return { data_url: LOGO_B };
    return { data_url: null };
  };

  const table = {
    ...engine,
    list_workspaces: () => ({
      workspaces: [
        { id: "w_one", name: "Danil Workspace", logo: "/ws/w_one/logo.png", context_root: null },
        { id: "w_two", name: "Beta Workspace", logo: "/ws/w_two/logo.png", context_root: null },
      ],
      active: null,
      // Volatile telemetry changes on every call, as in real danil-engine responses.
      machine_resources: { measured_at: ++measuredAt, storage: [] },
    }),
    workspaces_startup: () => ({
      workspaces: [
        { id: "w_one", name: "Danil Workspace", logo: "/ws/w_one/logo.png", context_root: null },
        { id: "w_two", name: "Beta Workspace", logo: "/ws/w_two/logo.png", context_root: null },
      ],
      active: null,
      machine_resources: { measured_at: ++measuredAt, storage: [] },
    }),
    preview_file: previewFile,
    set_active_workspace: null,
  };
  const fake = relay({ table });

  const app = await boot("listo", "web-logo-rail-and-settings", {}, undefined, {}, {
    web: true,
    beforeImport(w) {
      w.WebSocket = fake.Socket;
      globalThis.WebSocket = fake.Socket;
    },
  });
  t.after(() => app.w.dispatchEvent(new app.w.Event("pagehide")));

  const doc = app.w.document;

  // Bug 1: Left rail tiles in Web must render their workspace logos (not DW / BW monograms).
  assert.ok(
    await until(() => doc.querySelector('[data-workspace-tile="w_one"] img')?.getAttribute("src") === LOGO_A),
    "Web left rail tile w_one must display its workspace logo",
  );
  assert.ok(
    await until(() => doc.querySelector('[data-workspace-tile="w_two"] img')?.getAttribute("src") === LOGO_B),
    "Web left rail tile w_two must display its workspace logo from its own context",
  );

  doc.querySelector('[data-workspace-tile="w_one"]').click();
  assert.ok(await until(() => doc.querySelector('[data-workspace-tile="w_one"]')?.getAttribute("aria-current") === "true"));

  // Open Settings and open the workspace selector dropdown.
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "general" }));
  assert.ok(
    await until(() => doc.querySelector('[data-settings-workspace-trigger] img')?.getAttribute("src") === LOGO_A),
    "SettingsWorkspaceSelector trigger must display the active workspace logo",
  );

  const trigger = doc.querySelector("[data-settings-workspace-trigger]");
  trigger.click();
  assert.ok(
    await until(() => doc.querySelector('[data-settings-workspace-option="w_one"] img')?.getAttribute("src") === LOGO_A),
    "SettingsWorkspaceSelector dropdown option w_one must display its logo",
  );
  assert.ok(
    await until(() => doc.querySelector('[data-settings-workspace-option="w_two"] img')?.getAttribute("src") === LOGO_B),
    "SettingsWorkspaceSelector dropdown option w_two must display its logo",
  );

  // Bug 2: Watch for any flicker back to monogram (img removed or DW text appearing) in trigger or dropdown.
  const triggerMark = trigger.querySelector("span[aria-hidden='true']");
  const optionOne = doc.querySelector('[data-settings-workspace-option="w_one"]');
  const initialOptionImg = optionOne.querySelector("img");
  let flickered = false;
  const check = () => {
    const tImg = triggerMark.querySelector("img");
    const oImg = doc.querySelector('[data-settings-workspace-option="w_one"] img');
    if (!tImg || !tImg.getAttribute("src")?.startsWith("data:image/") || triggerMark.textContent?.trim() === "DW") flickered = true;
    if (!oImg || !oImg.getAttribute("src")?.startsWith("data:image/")) flickered = true;
  };
  const observer = new app.w.MutationObserver(check);
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, characterData: true });
  t.after(() => observer.disconnect());

  // 2a: Changing machine_resources must not create a harness:workspace-name feedback loop.
  const onWorkspaceName = () => { workspaceNameEvents += 1; };
  app.w.addEventListener("harness:workspace-name", onWorkspaceName);
  t.after(() => app.w.removeEventListener("harness:workspace-name", onWorkspaceName));
  await sleep(600);
  assert.equal(workspaceNameEvents, 0, "volatile machine_resources must not re-fire harness:workspace-name");

  // 2b: Explicit revalidation + transient preview_file failure must keep the rendered logo without flashing DW.
  table.preview_file = undefined;
  app.w.dispatchEvent(new app.w.CustomEvent("harness:workspace-name"));
  await sleep(250);
  assert.equal(triggerMark.querySelector("img")?.getAttribute("src"), LOGO_A, "transient error must keep existing logo");

  // 2c: Updating the logo on the engine revalidates cleanly to the new data URL without flashing DW.
  table.preview_file = previewFile;
  logoA = LOGO_A2;
  app.w.dispatchEvent(new app.w.CustomEvent("harness:workspace-name"));
  assert.ok(
    await until(() => triggerMark.querySelector("img")?.getAttribute("src") === LOGO_A2),
    "explicit harness:workspace-name revalidation must pick up an updated logo",
  );

  check();
  assert.equal(flickered, false, "SettingsWorkspaceSelector logo must never flicker back to DW during revalidation or transient failure");
  assert.equal(
    doc.querySelector('[data-settings-workspace-option="w_one"] img'),
    initialOptionImg,
    "dropdown option MarcaDeWorkspace must stay mounted across workspaceSelection refreshes",
  );

  // 2d: Switching to another workspace updates the trigger immediately to the new workspace's cached logo.
  observer.disconnect();
  doc.querySelector('[data-settings-workspace-option="w_two"]').click();
  assert.ok(
    await until(() => doc.querySelector('[data-settings-workspace-trigger] img')?.getAttribute("src") === LOGO_B),
    "switching workspace in SettingsWorkspaceSelector must show the newly selected workspace logo",
  );
  assert.deepEqual(
    app.failures.filter((f) => !f.includes("Not implemented: HTMLCanvasElement")),
    [],
  );
});
