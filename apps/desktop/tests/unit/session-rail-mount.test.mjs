import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { RESPONSES } from "../helpers/mount-guard.mjs";

const context = (id, org, extra = {}) => ({ context_id: id, org, org_name: org, plan: "paid", ...extra });
const until = async (read) => {
  for (let i = 0; i < 60; i++) { if (read()) return true; await sleep(50); }
  return false;
};

test("D2a mounts context headers, opens later for one organization, and signs out every family of an email", async () => {
  let status = { state: "connected", sessions: [
    { family: "family-one", email: "one@example.com", available_contexts: 2, contexts: [context("a", "Org A"), context("b", "Org B", { workspaces: "later" })] },
    { family: "family-one-new", email: "one@example.com", contexts: [context("c", "Org C")] },
    { family: "family-two", email: "two@example.com", contexts: [context("d", "Org D")] },
  ] };
  const closed = [];
  const logins = [];
  let rejectLogin = true;
  const app = await boot("listo", "session-context-rail", {
    ...RESPONSES,
    danil_session_status: () => structuredClone(status),
    danil_edge_fetch: ({ path, context: id }) => path === "/v1/identity/me" ? { status: 200, body: { id: id === "d" ? "person-two" : "person-one" } } : { status: 404, body: {} },
    danil_sign_in: (args) => { logins.push(args); return rejectLogin ? Promise.reject({ detail: "too_many_contexts", what: { clave: "danil.error.too_many_contexts" } }) : structuredClone(status); },
    danil_sign_out: ({ family }) => { closed.push(family); status = { ...status, sessions: status.sessions.filter((s) => s.family !== family) }; return structuredClone(status); },
  });
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelectorAll("[data-account-header]").length === 4));
  assert.ok(doc.querySelector('[data-workspace-tile="w"]'), "local workspace stays visible");
  assert.ok(await until(() => doc.querySelector('[data-session-context="b"]')));
  assert.equal(doc.querySelectorAll("[data-session-context]").length, 1, "later opens the chosen organization");
  assert.ok(!doc.body.textContent.includes("Tu workspace Free"), "no Free row without E1/W1a data");
  doc.activeElement?.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(100);
  doc.querySelector("[data-add-workspace]").click();
  assert.ok(await until(() => [...doc.querySelectorAll('[role="menuitem"]')].some((b) => b.textContent === "Agregar cuenta u organización")));
  assert.ok(doc.body.textContent.includes("Hay workspaces nuevos para agregar"));
  [...doc.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === "Agregar cuenta u organización").click();
  assert.ok(await until(() => logins.length === 1));
  assert.equal(logins[0].mode, "add");
  assert.ok(await until(() => [...doc.querySelectorAll('[role="alert"]')].some((p) => p.textContent === "Llegaste al máximo de 20 organizaciones conectadas. Cierra una para agregar otra.")), "the cause is visible inside the open add menu");
  assert.equal(doc.querySelectorAll("[data-account-header]").length, 4);
  rejectLogin = false;
  [...doc.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === "Agregar cuenta u organización").click();
  assert.ok(await until(() => logins.length === 2));
  status.sessions[0].contexts = status.sessions[0].contexts.filter((c) => c.context_id !== "a");
  app.emit("danil-connect", structuredClone(status));
  assert.ok(await until(() => doc.querySelectorAll("[data-account-header]").length === 3));
  status.sessions[1].contexts = [];
  status.removed = [{ context_id: "c", org: "Org C", reason: "organization_access_denied" }];
  app.emit("danil-connect", structuredClone(status));
  assert.ok(await until(() => doc.querySelectorAll("[data-account-header]").length === 2));
  assert.ok(await until(() => doc.querySelector('[data-removed-context="c"]')?.textContent.includes("Se quitó Org C. No tienes acceso a los workspaces de esta organización")), "D1's removal cause stays visible in the add menu");
  doc.activeElement?.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(100);
  doc.querySelector('[data-account-header="b"]').click();
  assert.ok(await until(() => [...doc.querySelectorAll('[role="menuitem"]')].some((b) => b.textContent === "Cerrar sesión de one@example.com")));
  assert.equal(doc.querySelector('[data-account-header="b"] span').textContent.trim(), "O");
  doc.activeElement?.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.ok(await until(() => ![...doc.querySelectorAll('[role="menuitem"]')].some((b) => b.textContent === "Cerrar sesión de one@example.com")), "Escape closes the account menu");
  doc.querySelector('[data-account-header="b"]').click();
  assert.ok(await until(() => [...doc.querySelectorAll('[role="menuitem"]')].some((b) => b.textContent === "Cerrar sesión de one@example.com")));
  [...doc.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === "Cerrar sesión de one@example.com").click();
  assert.ok(await until(() => doc.querySelectorAll("[data-account-header]").length === 1));
  assert.deepEqual(closed, ["family-one", "family-one-new"]);
  assert.equal(doc.querySelector("[data-account-header]").dataset.accountHeader, "d");
  assert.ok(doc.querySelector('[data-workspace-tile="w"]'));
  assert.equal(doc.querySelector("[data-organization-menu]"), null);
});
