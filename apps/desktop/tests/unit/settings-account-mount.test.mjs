import assert from "node:assert/strict";
import test from "node:test";
import { contextCatalog, contextWorkspaces } from "../helpers/context-workspaces.mjs";
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

test("Desk unified Cuenta has no tabs, shows Plan only for admin/owner, opens Desk billing URL, and hides Plan when switching to member workspace", async () => {
  const opened = [];
  const contexts = [
    { context_id: "ctx-admin", org: "org-admin", org_name: "Admin Org", plan: "business", workspaces: "all", role: "owner" },
    { context_id: "ctx-member", org: "org-member", org_name: "Member Org", plan: "pro", workspaces: "all", role: "member" },
  ];
  const baseWorkspaces = contextWorkspaces(contexts);
  let activeWs = "workspace-ctx-admin";
  const workspacesList = () => [
    { id: "w-local", name: "Local" },
    ...contexts.map((c) => ({
      id: `workspace-${c.context_id}`,
      name: c.org_name,
      account: { org: c.org, account_id: c.context_id },
    })),
  ];

  const app = await boot("listo", "settings-account-desk", {
    ...RESPONSES,
    ...baseWorkspaces,
    list_workspaces: () => ({
      active: activeWs,
      workspaces: workspacesList(),
    }),
    set_active_workspace: ({ id }) => {
      activeWs = id;
      return null;
    },
    danil_session_status: () => ({
      state: "connected",
      default_context: "ctx-admin",
      sessions: [{ family: "fam-1", email: "owner@example.com", contexts }],
    }),
    danil_edge_fetch: (args) => {
      if (args.path === "/v1/identity/me") return { status: 200, body: { id: "person" } };
      if (args.path === "/v1/workspaces") return contextCatalog(contexts);
      return { status: 404, body: {} };
    },
    open_external: ({ target }) => {
      opened.push(target);
    },
  });

  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector('[data-workspace-context="ctx-admin"]')));

  // Profile menu on Desk: no «Cuentas de Danil», and «Ir a Harness de Organización» shown for owner/admin.
  const openProfileMenu = async () => {
    doc.querySelector("[data-profile-menu] button")?.click();
    assert.ok(await until(() => doc.querySelector('[aria-label="Tu cuenta y preferencias"]')));
    return doc.querySelector('[aria-label="Tu cuenta y preferencias"]');
  };
  const closeProfileMenu = async () => {
    doc.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await until(() => !doc.querySelector('[aria-label="Tu cuenta y preferencias"]'));
  };

  const adminMenu = await openProfileMenu();
  assert.ok(await until(() => adminMenu.querySelector("[data-profile-harness]")), "Desk owner must see Ir a Harness de Organización");
  assert.ok(!adminMenu.textContent.includes("Cuentas de Danil"), "Desk profile menu must not show Cuentas de Danil");
  await closeProfileMenu();

  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "account" }));
  assert.ok(await until(() => doc.querySelector("[data-session-accounts]")));

  assert.equal(doc.querySelector("#cfg-tab-billing"), null, "dead billing entry must not exist");
  assert.equal(doc.querySelector('#cfg-panel [role="tablist"]'), null, "Cuenta must have no sub-tabs");
  assert.equal(doc.querySelector("[data-settings-security]"), null, "Cuenta must have no security controls");

  const panel = () => doc.querySelector("[data-session-accounts]");
  assert.ok(panel().textContent.includes("owner@example.com"));
  assert.ok(panel().querySelector("[data-account-sign-out]"));

  assert.ok(await until(() => panel()?.querySelector("[data-account-plan]")), "owner must see Plan section");
  const planSection = panel().querySelector("[data-account-plan]");
  assert.ok(planSection.textContent.includes("Business"));
  const manageBtn = planSection.querySelector("[data-manage-plan]");
  assert.equal(manageBtn?.textContent?.trim(), "Administrar plan");
  manageBtn.click();
  assert.ok(await until(() => opened.length === 1));
  assert.equal(opened[0], "https://beta.danil.ai/billing?org=org-admin&return=desk");

  // Switch active workspace via SettingsWorkspaceSelector to the member organization workspace
  const trigger = doc.querySelector("[data-settings-workspace-trigger]");
  assert.ok(trigger, "SettingsWorkspaceSelector trigger should exist");
  trigger.click();
  assert.ok(await until(() => doc.querySelector('[data-settings-workspace-option="workspace-ctx-member"]')));
  const wsMenu = doc.querySelector("[data-settings-workspace-menu]");
  assert.equal(wsMenu?.querySelector('[data-settings-workspace-option="w-local"]'), null, "Desk settings must not expose Local workspaces");
  assert.ok(!wsMenu?.textContent?.includes("Local"), "Desk settings menu must not show Local label");
  doc.querySelector('[data-settings-workspace-option="workspace-ctx-member"]').click();

  assert.ok(await until(() => doc.querySelector("[data-session-accounts] [data-account-plan]") === null), "member must NOT see Plan section");
  assert.equal(doc.querySelector("[data-manage-plan]"), null, "member must NOT see Administrar plan button");
  assert.ok(panel().textContent.includes("owner@example.com"), "session email stays visible");

  // Close settings and verify member does not see «Ir a Harness de Organización» or «Cuentas de Danil».
  doc.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await until(() => !doc.querySelector("#cfg-panel"));
  const memberMenu = await openProfileMenu();
  assert.ok(!memberMenu.textContent.includes("Cuentas de Danil"), "Desk member profile menu must not show Cuentas de Danil");
  assert.equal(memberMenu.querySelector("[data-profile-harness]"), null, "Desk member must NOT see Ir a Harness de Organización");
  await closeProfileMenu();
  assert.deepEqual(app.failures, []);
});

test("Web unified Cuenta renders identity, Cerrar sesión, /billing link for admin, and hides Plan when switching to member workspace", async (t) => {
  const ORGS = { ctx_admin: "org_admin", ctx_member: "org_member" };
  const WORKSPACES = [
    { id: "w_admin", name: "Admin Web" },
    { id: "w_member", name: "Member Web" },
  ];
  const echo = (context, body, init = {}) =>
    Response.json(body, {
      ...init,
      headers: { "X-Danil-Session-Applied": context, "X-Danil-Session-Applied-Org": ORGS[context] },
    });

  const prevFetch = globalThis.fetch;
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.origin === "http://localhost" && url.pathname.includes("/assets/")) return new Response("");
    const context = new Headers(init.headers).get("X-Danil-Session") ?? "ctx_admin";
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
                { context_id: "ctx_admin", org: "org_admin", org_name: "Admin Web Org", plan: "pro", role: "admin" },
                { context_id: "ctx_member", org: "org_member", org_name: "Member Web Org", plan: "business", role: "member" },
              ],
            },
          ],
          primary: "ses_web",
          default_context: "ctx_admin",
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
                  context_id: "ctx_admin",
                  org: "org_admin",
                  org_name: "Admin Web Org",
                  catalog_state: "listed",
                  workspaces: [{ account_id: "a1", engine_workspace_id: "w_admin", name: "Admin Web" }],
                },
                {
                  context_id: "ctx_member",
                  org: "org_member",
                  org_name: "Member Web Org",
                  catalog_state: "listed",
                  workspaces: [{ account_id: "m1", engine_workspace_id: "w_member", name: "Member Web" }],
                },
              ],
            },
          ],
        });
      case "/v1/identity/me":
        return echo(context, { id: "user_web", name: "QA Web", email: "web@example.test", workspace: null, organizations: [] });
      case "/v1/workspaces/preferences":
        return echo(context, { version: 1, added: context === "ctx_admin" ? ["w_admin"] : ["w_member"] });
      case "/v1/workspaces":
        return echo(context, {
          items:
            context === "ctx_admin"
              ? [{ id: "a1", org: "org_admin", name: "Admin Web", role: "admin", engine_workspace_id: "w_admin", placement: { kind: "organization_machine" } }]
              : [{ id: "m1", org: "org_member", name: "Member Web", role: "member", engine_workspace_id: "w_member", placement: { kind: "organization_machine" } }],
          next_cursor: null,
        });
      case "/v1/credits/balance":
        return echo(context, { items: [] });
      case "/v1/machines":
        return echo(context, {
          items: [
            {
              machine_id: context === "ctx_admin" ? "ma" : "mm",
              name: context === "ctx_admin" ? "Nube Admin" : "Nube Member",
              kind: "organization",
              organization_id: ORGS[context],
              state: "running",
              connection: "connected",
            },
          ],
          next_cursor: null,
        });
    }
    if (/^\/v1\/machines\/m[a-z]*\/tickets$/.test(url.pathname)) {
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

  const table = {
    ...engine,
    list_workspaces: { workspaces: WORKSPACES.map((w) => ({ ...w, context_root: null })), active: null },
    workspaces_startup: { workspaces: WORKSPACES.map((w) => ({ ...w, context_root: null })), active: null },
    set_active_workspace: null,
  };
  const fake = relay({ table });

  const app = await boot("listo", "settings-account-web", {}, undefined, {}, {
    web: true,
    beforeImport(w) {
      w.WebSocket = fake.Socket;
      globalThis.WebSocket = fake.Socket;
    },
  });
  t.after(() => app.w.dispatchEvent(new app.w.Event("pagehide")));

  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector('[data-workspace-tile="w_admin"]')));
  doc.querySelector('[data-workspace-tile="w_admin"]').click();
  assert.ok(await until(() => doc.querySelector('[data-workspace-tile="w_admin"]')?.getAttribute("aria-current") === "true"));

  const openWebProfileMenu = async () => {
    doc.querySelector("[data-profile-menu] button")?.click();
    assert.ok(await until(() => doc.querySelector('[aria-label="Tu cuenta y preferencias"]')));
    return doc.querySelector('[aria-label="Tu cuenta y preferencias"]');
  };
  const closeWebProfileMenu = async () => {
    doc.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await until(() => !doc.querySelector('[aria-label="Tu cuenta y preferencias"]'));
  };

  const webAdminMenu = await openWebProfileMenu();
  assert.ok(await until(() => webAdminMenu.querySelector("[data-profile-harness]")), "Web admin must see Ir a Harness de Organización");
  assert.ok(!webAdminMenu.textContent.includes("Cuentas de Danil"), "Web profile menu must not show Cuentas de Danil");
  await closeWebProfileMenu();

  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "account" }));
  assert.ok(await until(() => doc.querySelector("[data-account-name]")));

  assert.equal(doc.querySelector("#cfg-tab-billing"), null, "Web must not have dead billing entry");
  assert.equal(doc.querySelector('#cfg-panel [role="tablist"]'), null, "Web Cuenta must have no sub-tabs");
  assert.equal(doc.querySelector("[data-account-name]")?.textContent?.trim(), "QA Web");
  assert.equal(doc.querySelector("[data-account-photo-input]"), null, "Web Cuenta must not show photo input");
  assert.ok(doc.body.textContent.includes("web@example.test"));
  assert.ok(doc.querySelector("[data-account-sign-out]"), "Web Cuenta must show Cerrar sesión");

  assert.ok(await until(() => doc.querySelector("[data-account-plan]")), "Web admin must see Plan section");
  const planSection = doc.querySelector("[data-account-plan]");
  assert.ok(planSection.textContent.includes("Pro"));
  const link = planSection.querySelector("a[data-manage-plan]");
  assert.ok(link, "Web Administrar plan must be an anchor link");
  assert.equal(link.textContent?.trim(), "Administrar plan");
  assert.ok(link.getAttribute("href")?.endsWith("/billing"), `expected /billing href, got ${link.getAttribute("href")}`);

  // Switch workspace inside Settings to the member org workspace
  const trigger = doc.querySelector("[data-settings-workspace-trigger]");
  assert.ok(trigger, "Web SettingsWorkspaceSelector trigger should exist");
  trigger.click();
  assert.ok(await until(() => doc.querySelector('[data-settings-workspace-option="w_member"]')));
  doc.querySelector('[data-settings-workspace-option="w_member"]').click();

  assert.ok(await until(() => doc.querySelector("[data-account-plan]") === null), "Web member must NOT see Plan section");
  assert.equal(doc.querySelector("[data-manage-plan]"), null, "Web member must NOT see Administrar plan link");

  doc.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await until(() => !doc.querySelector("#cfg-panel"));
  const webMemberMenu = await openWebProfileMenu();
  assert.ok(!webMemberMenu.textContent.includes("Cuentas de Danil"), "Web member profile menu must not show Cuentas de Danil");
  assert.equal(webMemberMenu.querySelector("[data-profile-harness]"), null, "Web member must NOT see Ir a Harness de Organización");
  await closeWebProfileMenu();
  assert.deepEqual(
    app.failures.filter((f) => !f.includes("Not implemented: HTMLCanvasElement")),
    [],
  );
});
