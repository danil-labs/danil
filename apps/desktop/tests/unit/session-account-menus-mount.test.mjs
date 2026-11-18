import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { RESPONSES } from "../helpers/mount-guard.mjs";

const until = async (read) => { for (let i = 0; i < 80; i++) { if (read()) return true; await sleep(50); } return false; };
const escape = (app) => app.w.document.activeElement?.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

test("preferences have no global account entries, group menus scope credits and redemption, and 403 marks only its organization", async () => {
  const calls = [];
  const contexts = ["a", "b"].map((context_id) => ({ context_id, org: `org-${context_id}`, org_name: `Org ${context_id}`, plan: "paid" }));
  let status = { state: "connected", default_context: "a", sessions: [{ family: "family", email: "one@example.com", contexts }] };
  const closed = [];
  const logins = [];
  const app = await boot("listo", "group-account-menus", { ...RESPONSES,
    danil_session_status: () => structuredClone(status),
    danil_sign_in: (args) => { logins.push(args); return structuredClone(status); },
    danil_sign_out: (target) => { closed.push(target); status = { ...status, sessions: status.sessions.filter((f) => f.family !== target.family).map((f) => ({ ...f, contexts: f.contexts.filter((c) => c.context_id !== target.context) })) }; return structuredClone(status); },
    danil_edge_fetch: (args) => {
      calls.push(args);
      if (args.path === "/v1/identity/me") return { status: 200, body: { id: "person" } };
      if (args.path === "/v1/credits/balance") return args.context === "b" ? { status: 403, body: { code: "organization_selection_required" } } : { status: 200, body: { organization_id: "org-a", available: { currency: "MXN", amount_micro: "12500000" } } };
      if (args.path === "/v1/workspaces/promo/redeem") throw { detail: "invalid_request" };
      return { status: 404, body: {} };
    },
  });
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector('[data-danil-foot="preferences"]')));
  const footer = doc.querySelector('[data-danil-foot="preferences"]');
  assert.equal(footer.getAttribute("aria-label"), "Preferencias");
  assert.equal(footer.querySelector("img"), null);
  footer.click();
  assert.ok(await until(() => doc.body.textContent.includes("Reportar un bug")));
  assert.ok(!doc.body.textContent.includes("Canjear código"));
  assert.ok(![...doc.querySelectorAll("button")].some((b) => b.textContent.trim() === "Cuentas de Danil"));
  escape(app); await sleep(50);
  doc.querySelector('[data-account-header="a"]').click();
  assert.ok(await until(() => calls.some((c) => c.path === "/v1/credits/balance" && c.context === "a")));
  assert.ok(await until(() => [...doc.querySelectorAll('[role="menuitem"]')].some((b) => b.textContent === "Canjear código")));
  const content = [...doc.querySelectorAll('[role="menu"]')].find((menu) => menu.textContent.includes("Canjear código"));
  assert.ok(content.textContent.includes("Danil Credits"));
  assert.ok(!content.querySelector('[role="menuitem"] [role="status"]'), "balance is not a menu item");
  [...content.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === "Canjear código").click();
  assert.ok(await until(() => doc.querySelector("#promo-code")));
  const input = doc.querySelector("#promo-code");
  input.value = "CODE"; input.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  input.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(await until(() => calls.some((c) => c.path === "/v1/workspaces/promo/redeem")));
  const redeem = calls.find((c) => c.path === "/v1/workspaces/promo/redeem");
  assert.equal(redeem.context, "a");
  assert.equal(typeof redeem.idempotencyKey, "string");
  assert.ok(await until(() => input.closest("form").querySelector('[role="status"]')), "Rust route absence is a neutral unavailable state");
  assert.equal(input.closest("form").querySelector('[role="alert"]'), null);
  escape(app); await sleep(50);
  doc.querySelector('[data-account-header="b"]').click();
  assert.ok(await until(() => doc.querySelector('[data-account-header="b"] [data-tone="warning"]')));
  assert.equal(doc.querySelector('[data-account-header="a"] [data-tone="warning"]'), null);
  assert.ok(doc.body.textContent.includes("La organización requiere atención"));
  assert.equal(doc.querySelector('[data-account-header="b"]').getAttribute("aria-label"), "one@example.com · Org b: requiere atención");
  const bMenu = [...doc.querySelectorAll('[role="menu"]')].find((menu) => menu.textContent.includes("Cerrar sesión de Org b"));
  const notice = [...bMenu.querySelectorAll('[role="status"]')].find((row) => row.textContent === "La organización requiere atención");
  assert.equal(notice.previousElementSibling.textContent, "Org b", "group status follows the organization line");
  assert.equal(notice.nextElementSibling.tagName, "SPAN", "group status precedes its first separator");
  assert.equal(notice.nextElementSibling.getAttribute("aria-hidden"), "true");
  assert.ok(!doc.body.textContent.includes("Reportar un bug de Danil"), "organization refusal does not open preferences");
  escape(app); await sleep(50);
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "cuenta-danil" }));
  assert.ok(await until(() => doc.querySelector("[data-session-accounts]")));
  const panel = doc.querySelector("[data-session-accounts]");
  assert.ok(panel.textContent.includes("Cuentas de Danil"));
  assert.ok(panel.textContent.includes("Org a") && panel.textContent.includes("Org b"));
  const button = (text) => [...panel.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  button("Cerrar sesión de todas").click();
  assert.ok(await until(() => panel.textContent.includes("sus 2 organizaciones")));
  assert.equal(closed.length, 0, "several organizations require confirmation before closing");
  button("No").click();
  const orgClose = [...panel.querySelectorAll("button")].find((b) => b.textContent.trim() === "Cerrar sesión");
  orgClose.click();
  assert.ok(await until(() => closed.length === 1));
  assert.ok(await until(() => !panel.textContent.includes("Org a")));
  assert.equal(button("Cerrar sesión de todas"), undefined, "a single remaining organization has no close-all aside");
  button("Cerrar sesión").click();
  assert.ok(await until(() => closed.length === 2));
  assert.ok(await until(() => panel.textContent.includes("No hay sesiones abiertas.")));
  assert.ok(button("Agregar cuenta u organización"), "adding an account stays available after the last group closes");
  button("Agregar cuenta u organización").click();
  assert.ok(await until(() => logins.length === 1));
  assert.equal(logins[0].mode, "add");

});

test("the enabled Desk promo route sends a trimmed code and displays rejection codes and retry delay", async () => {
  const sent = [];
  const replies = [
    { status: 422, body: { code: "invalid_code" } },
    { status: 409, body: { code: "already_redeemed" } },
    { status: 429, body: { code: "rate_limited" }, retry_after_ms: 2500 },
    { status: 201, body: { machine: { state: "ready" } } },
  ];
  const app = await boot("listo", "promo-rejections-context", { ...RESPONSES,
    danil_session_status: { state: "connected", sessions: [{ family: "family", email: "one@example.com", contexts: [{ context_id: "a", org: "org-a", org_name: "A", plan: "paid" }] }] },
    danil_edge_fetch: (args) => {
      if (args.path === "/v1/identity/me") return { status: 200, body: { id: "person" } };
      if (args.path === "/v1/workspaces/promo/redeem") { sent.push(args); return replies.shift(); }
      return { status: 404, body: {} };
    },
  });
  const doc = app.w.document;
  assert.ok(await until(() => doc.querySelector('[data-account-header="a"]')));
  doc.querySelector('[data-account-header="a"]').click();
  assert.ok(await until(() => [...doc.querySelectorAll('[role="menuitem"]')].some((b) => b.textContent === "Canjear código")));
  [...doc.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === "Canjear código").click();
  assert.ok(await until(() => doc.querySelector("#promo-code")));
  const input = doc.querySelector("#promo-code");
  const submit = (value) => { input.value = value; input.dispatchEvent(new app.w.Event("input", { bubbles: true })); input.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true })); };
  submit("x".repeat(65));
  assert.equal(sent.length, 0, "a too-long code never reaches the window");
  submit("  FIRST  ");
  assert.ok(await until(() => doc.querySelector('[data-rejection-code="invalid_code"]')));
  assert.deepEqual(sent[0].body, { code: "FIRST" });
  assert.equal(sent[0].context, "a");
  submit("SECOND");
  assert.ok(await until(() => doc.querySelector('[data-rejection-code="already_redeemed"]')));
  assert.ok(doc.body.textContent.includes("Este código ya fue canjeado"));
  assert.ok(doc.querySelector('[data-rejection-code="already_redeemed"]').classList.contains("text-error-strong"));
  submit("THIRD");
  assert.ok(await until(() => doc.querySelector('[data-retry-after-ms="2500"]')));
  assert.ok(doc.body.textContent.includes("Espera 3 segundos antes de reintentar"));
  submit("THIRD");
  assert.ok(await until(() => sent.length === 4 && input.closest("form").querySelector('[role="status"]')));
  assert.equal(sent[2].idempotencyKey, sent[3].idempotencyKey, "the same code retry keeps its intention key");
});
