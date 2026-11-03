/**
 * Terminus in the browser with several Danil accounts (`docs/web-multi-account.md`):
 * the column shows the open account's workspaces and, under each other account,
 * its own; opening one of those reloads with its account, an expired one asks to
 * sign in again. With a single workspace, the name menu opens creation and
 * offers another account within that flow. Mounts `dist-web/`.
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

test("the column lists other accounts' workspaces and opens them with their account", async () => {
  const opened = [];
  const added = [];
  let signedOut = 0;
  const own = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 404 });
  try {
    const computers = [{ computer_id: "cmp_vm", name: "Danil VM", state: "online", provider: "aws-ec2" }];
    const f = fleet({ cmp_vm: { table: engine, state: "online" } });
    const others = [
      {
        user_id: "u-fund",
        email: "alberto@fundacion.org",
        name: null,
        extra: true,
        signedIn: true,
        stale: false,
        workspaces: [
          { id: "f1", name: "Donde Banco", logo: async () => null },
          { id: "f2", name: "Proyecto 2", logo: async () => null },
        ],
      },
      { user_id: "u-ytw", email: "alberto@ytw.mx", name: null, extra: true, signedIn: false, stale: true, workspaces: [{ id: "y1", name: "Tech Week", logo: async () => null }] },
    ];
    const app = await boot("listo", "web-other-accounts", {}, undefined, {}, {
      web: true,
      beforeImport: (w) => {
        globalThis.WebSocket = f.Socket;
        w.terminusWeb = {
          endpoint: API,
          computers,
          getToken: async () => "tok",
          webAccounts: {
            current: { user_id: "u-alberto", email: "alberto@danil.ai", name: "Alberto", extra: false },
            others: () => others,
            open: (id) => opened.push(id),
            add: (email) => added.push(email ?? null),
            remove: async () => undefined,
            signOut: () => signedOut++,
          },
        };
      },
    });
    const doc = app.w.document;
    assert.ok(await until(() => doc.querySelector("[data-workspace-column]")), "other accounts keep the column visible");
    const headers = () => [...doc.querySelectorAll("[data-account-header]")].map((h) => h.getAttribute("data-account-header"));
    assert.ok(await until(() => headers().length === 3), "one header per account");
    assert.deepEqual(headers(), ["u-alberto", "u-fund", "u-ytw"]);
    const tiles = [...doc.querySelectorAll("[data-other-workspace-tile]")];
    assert.deepEqual(
      tiles.map((t) => t.getAttribute("data-other-workspace-tile")),
      ["f1", "f2", "y1"],
    );
    assert.match(tiles[0].getAttribute("aria-label"), /Donde Banco · alberto@fundacion\.org/);

    tiles[1].click();
    assert.deepEqual(opened, ["f2"], "another account's workspace opens through its account");
    tiles[2].click();
    assert.deepEqual(opened, ["f2"], "an expired account does not open");
    assert.deepEqual(added, ["alberto@ytw.mx"], "it asks to sign in again with that email");
    assert.equal(doc.querySelector("[data-add-account]"), null, "workspace creation is the only add action");

    doc.querySelector("[data-profile-menu] button").click();
    assert.ok(await until(() => doc.querySelector("[data-sign-out]")), "the profile menu offers signing out in the browser");
    doc.querySelector("[data-sign-out]").click();
    assert.equal(signedOut, 1, "it signs the open account out");
  } finally {
    globalThis.fetch = own;
  }
});

for (const emptyAccount of [false, true]) test(`a single workspace keeps the column, whose «+» only adds workspaces, with empty extra account: ${emptyAccount}`, async () => {
  const added = [];
  const own = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 404 });
  let app;
  try {
    const f = fleet({ cmp_vm: { table: engine, state: "online" } });
    app = await boot("listo", `web-single-workspace-${emptyAccount}`, {}, undefined, {}, {
      web: true,
      beforeImport: (w) => {
        globalThis.WebSocket = f.Socket;
        w.terminusWeb = {
          endpoint: API,
          computers: [{ computer_id: "cmp_vm", name: "Danil VM", state: "online", provider: "aws-ec2" }],
          getToken: async () => "tok",
          webAccounts: {
            current: { user_id: "u-alberto", email: "alberto@danil.ai", name: "Alberto", extra: false },
            others: () => emptyAccount ? [{ user_id: "empty", email: "empty@example.com", extra: true, signedIn: true, stale: false, workspaces: [] }] : [],
            open: () => undefined,
            add: () => added.push(true),
            remove: async () => undefined,
          },
        };
      },
    });
    const doc = app.w.document;
    // The column is the only place to switch workspaces, so it stays with one.
    assert.ok(await until(() => doc.querySelector('[data-workspace-column] [data-workspace-tile="w"]')), "the column shows the single workspace");
    const column = doc.querySelector("[data-workspace-column]");
    assert.equal([...column.querySelectorAll("button")].some((el) => el.textContent.trim() === "Agregar cuenta"), false, "the column only adds workspaces");
    column.querySelector('button[aria-label="Agregar workspace"]').click();
    assert.ok(await until(() => [...doc.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent.trim() === "Crear workspace")), "the plus offers a new workspace");
    [...doc.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent.trim() === "Crear workspace").click();
    assert.ok(await until(() => doc.querySelector('[data-web-onboarding="space"]')), "creation opens the existing workspace flow");
    const other = [...doc.querySelectorAll("button")].find(el => el.textContent.trim() === "Usar otra cuenta");
    assert.ok(other, "the workspace flow keeps access to other Danil accounts");
    other.click();
    assert.deepEqual(added, [true]);
    assert.equal(f.relays.cmp_vm.calls.some(call => call.command === "add_workspace"), false, "choosing another account does not create in the previous account");
    assert.deepEqual(app.failures, []);
  } finally {
    app?.w.close();
    globalThis.fetch = own;
  }
});
