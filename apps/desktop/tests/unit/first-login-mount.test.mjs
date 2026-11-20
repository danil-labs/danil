import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { RESPONSES } from "../helpers/mount-guard.mjs";

const PENDING = { "harness.layout.onboarding.first_login_v1": "false" };
const DONE_KEY = "harness.layout.onboarding.first_login_v1";
const FEATURES = ["account_workspace_v1", "account_adoption_v1", "account_adoption_proof_v1"];
/** Lo que pinta workspaces o tareas: nada de esto puede salir antes de confirmar la sesión. */
const CONTENT = ["list_workspaces", "task_history", "list_sessions", "load_session", "list_projects", "workspaces_startup"];
const context = (id, org, extra = {}) => ({ context_id: id, org, org_name: org, plan: "paid", ...extra });
const until = async (read, tries = 80) => {
  for (let i = 0; i < tries; i++) { if (read()) return true; await sleep(50); }
  return false;
};
const textOf = (doc, selector) => doc.querySelector(selector)?.textContent ?? "";
const rail = (doc) => doc.querySelector("[data-workspace-tile], [data-add-workspace]");
const connected = { state: "connected", email: "ana@danil.ai", sessions: [{ family: "f1", email: "ana@danil.ai", contexts: [context("ctx-danil", "Danil")] }] };

test("without a session the rail never mounts and nothing that paints workspaces or tasks is asked", async () => {
  const logins = [];
  const app = await boot("listo", "gate-no-session", {
    ...RESPONSES,
    list_workspaces: { active: "w", workspaces: [{ id: "w", name: "Local" }] },
    danil_session_status: { state: "disconnected" },
    danil_sign_in: (args) => { logins.push(args ?? {}); return new Promise(() => {}); },
  });
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector('[data-session-gate="sign_in"]')));
  await sleep(500);
  assert.equal(rail(doc), null, "no rail behind the login");
  const asked = app.commands.filter((c) => CONTENT.includes(c));
  assert.deepEqual(asked, [], `asked before a session: ${asked.join(", ")}`);
  assert.equal(textOf(doc, "[data-first-login-sign-in]"), "Conectar cuenta");
  doc.querySelector("[data-first-login-sign-in]").click();
  assert.ok(await until(() => logins.length === 1), "the usual browser login");
  assert.ok(await until(() => doc.querySelector('[data-session-gate] [role="status"]')?.textContent.includes("Termina de entrar en el navegador.")));
});

test("a valid session that takes three seconds shows the loading first and the rail only after it", async () => {
  let answered = false;
  const app = await boot("listo", "gate-slow-session", {
    ...RESPONSES,
    list_workspaces: { active: "w", workspaces: [{ id: "w", name: "Local" }] },
    danil_session_status: () => new Promise((resolve) => setTimeout(() => { answered = true; resolve(connected); }, 3000)),
    danil_edge_fetch: ({ path }) => path === "/v1/identity/me" ? { status: 200, body: { id: "person-ana" } } : { status: 200, body: { items: [] } },
  });
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector('[data-session-gate="loading"]')), "the neutral loading");
  let railEarly = false;
  while (!answered) { if (rail(doc)) railEarly = true; await sleep(50); }
  assert.equal(railEarly, false, "never the rail before the session");
  assert.ok(await until(() => rail(doc)), "the rail after the session");
  assert.equal(doc.querySelector("[data-session-gate]"), null);
});

test("with a saved session the first login offers «Continue as» and enters without opening the browser", async () => {
  const logins = [];
  const app = await boot("listo", "gate-continue", {
    ...RESPONSES,
    machine_list: [{ id: "local", local: true, active: true, on: true, hosts: true, features: FEATURES }],
    adoption_candidates: [],
    list_workspaces: { active: "w", workspaces: [{ id: "w", name: "Local" }] },
    danil_session_status: connected,
    danil_edge_fetch: ({ path }) => path === "/v1/identity/me" ? { status: 200, body: { id: "person-ana" } } : { status: 200, body: { items: [] } },
    danil_sign_in: (args) => { logins.push(args); return { state: "connected" }; },
  }, undefined, PENDING);
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector('[data-session-gate="continue"]')));
  assert.equal(rail(doc), null);
  assert.equal(textOf(doc, "[data-first-login-continue]"), "Continuar como ana@danil.ai");
  assert.equal(textOf(doc, "[data-first-login-other]"), "Iniciar sesión con otra cuenta");
  doc.querySelector("[data-first-login-continue]").click();
  assert.ok(await until(() => rail(doc)), "without locals to link the app opens");
  assert.deepEqual(logins, [], "continuing does not open a new browser login");
  assert.equal(app.w.localStorage.getItem(DONE_KEY), "true", "and it does not come back");
});

test("with seven locals, an empty fleet inventory and the personal org not open, continuing links them before the rail", async () => {
  let opened = false;
  let left = Array.from({ length: 7 }, (_, i) => ({ id: `qlocal0${i + 1}`, name: `Local ${i + 1}`, adoptable: true }));
  const posts = [];
  let n = 0;
  const status = () => ({ state: "connected", email: "ana@danil.ai", default_context: opened ? "ctx-personal" : "ctx-danil", sessions: [{ family: "f1", email: "ana@danil.ai", contexts: [context("ctx-danil", "org_danil", { org_name: "Danil" }), ...(opened ? [context("ctx-personal", "org_personal", { org_name: "Cuenta de Ana", plan: "free" })] : [])] }] });
  let railBeforeLinked = false;
  const app = await boot("listo", "gate-link", {
    ...RESPONSES,
    // El motor anuncia la adopción; la fila de la flota (inventario de computers) no trae rasgos.
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
      if (path === "/v1/workspaces/adopt") return { status: 201, body: { id: String(5000 + n), engine_workspace_id: body.engine_workspace_id, org: "org_personal", possession: { jkt: "j".repeat(43) } } };
      return { status: 404, body: {} };
    },
  }, undefined, PENDING);
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector("[data-first-login-continue]")));
  assert.ok(textOf(doc, "[data-session-gate]").includes("Encontramos 7 workspaces de esta computadora sin organización."));
  await sleep(300);
  assert.equal(posts.length, 0, "nothing is selected or sealed before the person confirms the account");
  doc.querySelector("[data-first-login-continue]").click();
  for (let i = 0; i < 200 && left.length; i++) { if (rail(doc)) railBeforeLinked = true; await sleep(50); }
  assert.equal(left.length, 0, "the seven locals are sealed");
  assert.equal(railBeforeLinked, false, "the rail waits for the linking");
  assert.ok(await until(() => rail(doc), 160));
  assert.deepEqual(posts.filter(([, path]) => path === "/v1/identity/organizations/select").map(([ctx, , body]) => [ctx, body.organization_id]), [["ctx-danil", "org_personal"], ["ctx-danil", "org_danil"]], "opens the personal org, then goes back to the active one");
  assert.equal(app.w.localStorage.getItem(DONE_KEY), "true");
  assert.ok(await until(() => textOf(doc, "[data-adoption-report]").includes("Trajimos 7 workspaces")), "the existing notice says what was linked");
});

test("closing the session with the app open unmounts it and the login comes back", async () => {
  let status = connected;
  const app = await boot("listo", "gate-sign-out", {
    ...RESPONSES,
    list_workspaces: { active: "w", workspaces: [{ id: "w", name: "Local" }] },
    danil_session_status: () => structuredClone(status),
    danil_edge_fetch: ({ path }) => path === "/v1/identity/me" ? { status: 200, body: { id: "person-ana" } } : { status: 200, body: { items: [] } },
  });
  const doc = app.w.document;
  assert.ok(await until(() => rail(doc)));
  status = { state: "disconnected" };
  app.emit("danil-connect", status);
  assert.ok(await until(() => doc.querySelector('[data-session-gate="sign_in"]')));
  assert.equal(rail(doc), null, "the content is gone");
});

test("an engine that does not say what it announces opens the app but leaves the first login pending", async () => {
  const app = await boot("listo", "gate-unknown-features", {
    ...RESPONSES,
    list_workspaces: { active: "w", workspaces: [{ id: "w", name: "Local" }] },
    danil_session_status: connected,
    danil_edge_fetch: ({ path }) => path === "/v1/identity/me" ? { status: 200, body: { id: "person-ana" } } : { status: 200, body: { items: [] } },
  }, undefined, PENDING);
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector("[data-first-login-continue]")));
  doc.querySelector("[data-first-login-continue]").click();
  assert.ok(await until(() => rail(doc)));
  assert.equal(app.w.localStorage.getItem(DONE_KEY), "false", "not marked: it comes back on the next start");
});

test("when the engine owns adoption the window only paints its state and event, and orchestrates nothing", async () => {
  const items = (step) => Array.from({ length: 7 }, (_, i) => ({ id: `qlocal0${i + 1}`, name: `Local ${i + 1}`, step: i === 0 ? "done" : step }));
  const posts = [];
  const app = await boot("listo", "gate-engine-adoption", {
    ...RESPONSES,
    machine_list: [{ id: "local", local: true, active: true, on: true, hosts: true, features: [...FEATURES, "engine_adoption_v1"] }],
    list_workspaces: { active: "w", workspaces: [{ id: "w", name: "Local" }] },
    adoption_candidates: Array.from({ length: 7 }, (_, i) => ({ id: `qlocal0${i + 1}`, name: `Local ${i + 1}`, adoptable: true })),
    adoption_status: { state: "running", org: "org_personal", org_name: "Cuenta de Ana", pending: 6, items: [...items("waiting"), { id: "qdanil01", name: "Danil Workspace", step: "stays", org_name: "Danil" }] },
    danil_session_status: { ...connected, sessions: [{ ...connected.sessions[0], contexts: [context("ctx-danil", "org_danil", { org_name: "Danil" }), context("ctx-personal", "org_personal", { org_name: "Cuenta de Ana", plan: "free" })] }] },
    danil_edge_fetch: ({ method, path }) => {
      if (method !== "GET") posts.push(path);
      return path === "/v1/identity/me" ? { status: 200, body: { id: "person-ana", organizations: [{ id: "org_personal", type: "personal" }] } } : { status: 200, body: { items: [], next_cursor: null } };
    },
  }, undefined, PENDING);
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector("[data-first-login-continue]")));
  doc.querySelector("[data-first-login-continue]").click();
  assert.ok(await until(() => doc.querySelector('[data-session-gate="linking"]')), "«Ligando…» from the engine state");
  assert.ok(await until(() => doc.querySelector('[data-first-login-row="qlocal01"]')), textOf(doc, "[data-session-gate]"));
  assert.equal(doc.querySelector('[data-first-login-row="qlocal01"]')?.dataset.step, "done");
  assert.equal(doc.querySelector('[data-first-login-row="qlocal02"]')?.dataset.step, "waiting");
  assert.ok(textOf(doc, '[data-first-login-row="qdanil01"]').includes("ya está en Danil · se queda"));
  assert.ok(textOf(doc, "[data-session-gate]").includes("Van a «Cuenta de Ana»."));
  assert.equal(rail(doc), null, "the rail waits for the engine");
  app.emit("adoption.changed", { state: "done", org: "org_personal", org_name: "Cuenta de Ana", pending: 0, items: items("done") });
  assert.ok(await until(() => rail(doc)), "the engine's done hands back the rail");
  assert.equal(app.w.localStorage.getItem(DONE_KEY), "true");
  assert.ok(await until(() => textOf(doc, "[data-adoption-report]").includes("Trajimos 7 workspaces")), "the existing notice, from the engine's result");
  assert.deepEqual(app.commands.filter((c) => ["adoption_proof", "adopt_account_workspace"].includes(c)), [], "no proof or seal from the window");
  assert.deepEqual(posts.filter((p) => p.startsWith("/v1/workspaces/adopt") || p === "/v1/identity/organizations/select"), [], "no challenge, adopt or select from the window");
});
