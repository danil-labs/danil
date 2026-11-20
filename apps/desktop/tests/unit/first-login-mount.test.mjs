import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { RESPONSES } from "../helpers/mount-guard.mjs";

const PENDING = { "harness.layout.onboarding.first_login_v1": "false" };
const DONE_KEY = "harness.layout.onboarding.first_login_v1";
const FEATURES = ["account_workspace_v1", "account_adoption_v1", "account_adoption_proof_v1"];
const context = (id, org, extra = {}) => ({ context_id: id, org, org_name: org, plan: "paid", ...extra });
const until = async (read, tries = 80) => {
  for (let i = 0; i < tries; i++) { if (read()) return true; await sleep(50); }
  return false;
};
const textOf = (doc, selector) => doc.querySelector(selector)?.textContent ?? "";

test("with a saved session the first login offers «Continue as» and enters without opening the browser", async () => {
  const logins = [];
  const app = await boot("listo", "first-login-continue", {
    ...RESPONSES,
    list_workspaces: { active: "w", workspaces: [{ id: "w", name: "Local" }] },
    danil_session_status: { state: "connected", email: "ana@danil.ai", sessions: [{ family: "f1", email: "ana@danil.ai", contexts: [context("ctx-danil", "Danil")] }] },
    danil_edge_fetch: ({ path }) => path === "/v1/identity/me" ? { status: 200, body: { id: "person-ana" } } : { status: 200, body: { items: [] } },
    danil_sign_in: (args) => { logins.push(args); return { state: "connected" }; },
  }, undefined, PENDING);
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector('[data-first-login="continue"]')), "the screen covers the rail on the first start of this version");
  assert.equal(textOf(doc, "[data-first-login-continue]"), "Continuar como ana@danil.ai");
  assert.equal(textOf(doc, "[data-first-login-other]"), "Iniciar sesión con otra cuenta");
  doc.querySelector("[data-first-login-continue]").click();
  assert.ok(await until(() => !doc.querySelector("[data-first-login]")), "without locals to link the screen closes");
  assert.deepEqual(logins, [], "continuing does not open a new browser login");
  assert.equal(app.w.localStorage.getItem(DONE_KEY), "true", "and it does not come back");
});

test("without a session the first login offers to connect the account", async () => {
  const logins = [];
  const app = await boot("listo", "first-login-sign-in", {
    ...RESPONSES,
    list_workspaces: { active: "w", workspaces: [{ id: "w", name: "Local" }] },
    danil_session_status: { state: "disconnected" },
    danil_sign_in: (args) => { logins.push(args ?? {}); return new Promise(() => {}); },
  }, undefined, PENDING);
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector('[data-first-login="sign_in"]')));
  assert.equal(textOf(doc, "[data-first-login-sign-in]"), "Conectar cuenta");
  doc.querySelector("[data-first-login-sign-in]").click();
  assert.ok(await until(() => logins.length === 1), "it is the usual browser login");
  assert.ok(await until(() => doc.querySelector('[data-first-login] [role="status"]')?.textContent.includes("Termina de entrar en el navegador.")));
});

test("with locals and the personal org not open, continuing opens it, links them and hands back the rail", async () => {
  let opened = false;
  let left = [{ id: "qlocal01", name: "Maayataan", adoptable: true }];
  const posts = [];
  let n = 0;
  const status = () => ({ state: "connected", email: "ana@danil.ai", default_context: opened ? "ctx-personal" : "ctx-danil", sessions: [{ family: "f1", email: "ana@danil.ai", contexts: [context("ctx-danil", "org_danil", { org_name: "Danil" }), ...(opened ? [context("ctx-personal", "org_personal", { org_name: "Cuenta de Ana", plan: "free" })] : [])] }] });
  const app = await boot("listo", "first-login-link", {
    ...RESPONSES,
    machine_list: [{ id: "local", local: true, active: true, on: true, hosts: true, features: FEATURES }],
    list_workspaces: () => ({ active: "w", workspaces: [{ id: "w", name: "Local" }, { id: "qdanil01", name: "Danil Workspace", account: { org: "org_danil", account_id: "9001" } }] }),
    adoption_candidates: () => left,
    adoption_proof: ({ nonce }) => ({ jwk: { kty: "EC", crv: "P-256", x: "x".repeat(43), y: "y".repeat(43) }, jkt: "j".repeat(43), sig: `sig-${nonce}` }),
    adopt_account_workspace: ({ id }) => { left = left.filter((c) => c.id !== id); return null; },
    danil_session_status: () => status(),
    danil_edge_fetch: ({ method, path, body, context: ctx }) => {
      if (method === "GET" && path === "/v1/identity/me") return { status: 200, body: { id: "person-ana", organizations: [{ id: "org_danil", type: "team" }, { id: "org_personal", type: "personal" }] } };
      if (method === "GET") return { status: 200, body: { items: [], next_cursor: null } };
      posts.push([ctx, path, body]);
      if (path === "/v1/identity/organizations/select") { if (body.organization_id === "org_personal") opened = true; return { status: 200, body: {} }; }
      if (path === "/v1/workspaces/adopt/challenge") return { status: 200, body: { nonce: String(++n).padStart(43, "N") } };
      if (path === "/v1/workspaces/adopt") return { status: 201, body: { id: "5001", engine_workspace_id: body.engine_workspace_id, org: "org_personal", possession: { jkt: "j".repeat(43) } } };
      return { status: 404, body: {} };
    },
  }, undefined, PENDING);
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector("[data-first-login-continue]")));
  assert.ok(textOf(doc, "[data-first-login]").includes("Encontramos 1 workspace de esta computadora sin organización."));
  await sleep(300);
  assert.equal(posts.length, 0, "nothing is selected or sealed before the person confirms the account");
  doc.querySelector("[data-first-login-continue]").click();
  assert.ok(await until(() => !doc.querySelector("[data-first-login]"), 160), "the rail is handed back when the linking ends");
  assert.deepEqual(posts.filter(([, path]) => path === "/v1/identity/organizations/select").map(([ctx, , body]) => [ctx, body.organization_id]), [["ctx-danil", "org_personal"], ["ctx-danil", "org_danil"]], "opens the personal org, then goes back to the active one");
  assert.ok(app.commands.includes("adopt_account_workspace"), "the local is sealed into the personal org");
  assert.equal(app.w.localStorage.getItem(DONE_KEY), "true");
});
