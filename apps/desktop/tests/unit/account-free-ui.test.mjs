import assert from "node:assert/strict";
import { test } from "node:test";
import { RESPONSES, mount } from "../helpers/mount-guard.mjs";
import { sleep } from "../helpers/jsdom-app.mjs";

const policy = { version: "v1", generation: 1, locale: "es", lines: ["Aviso literal", "Segunda línea"], text_sha256: "a".repeat(64) };
const session = { account: "user", email: "a@example.test", name: "A", photo: null, computer_id: "machine", default: true, workspaces: ["w"], status: "connected", online: true };

async function screen(decision, handler, storage = {}, duplicate = false, readPolicy = () => policy) {
  const app = await mount("listo", `free-${crypto.randomUUID()}`, {
    ...RESPONSES,
    list_providers: [{ id: "opencode-zen", label: "OpenCode", available: true, driver: true, inferencia: "sin_pedir_nada" }],
    list_surfaces: ["free", ...(duplicate ? ["free2"] : [])].map((id) => ({ id, provider: "opencode-zen", label: "OpenCode Free", catalogo: "gratuitos", usable: false, marca: null, porque: null })),
    danil_workspace_account: { account: "user", email: "a@example.test", signed_in: true, linked: true },
    danil_sessions: [session], agents_session_status: { state: "active", user: { user_id: "user", email: "a@example.test", name: "A" }, storage: "memory" },
    account_free_consent_get: () => ({ account_id: "42", session_id: "session", provider: "opencode", decision: decision(), revision: 1, policy: readPolicy() }),
    account_free_consent_decide: handler,
  }, undefined, storage);
  app.w.document.querySelector('button[aria-label="Configuración"]')?.click();
  await sleep(100);
  [...app.w.document.querySelectorAll("button")].find((el) => el.textContent?.trim() === "Cuentas de IA")?.click();
  await sleep(100);
  app.w.document.querySelector("#cfg-tab-proveedores-ia")?.click();
  await sleep(350);
  return app;
}

const button = (app, text) => [...app.w.document.querySelectorAll("button")].find((element) => element.textContent?.trim() === text);

for (const appliedBeforeLoss of [false, true]) test(`a pending revocation is explicit when the first request ${appliedBeforeLoss ? "was" : "was not"} applied`, async () => {
  let current = "accepted";
  const requests = [];
  const app = await screen(() => current, ({ body }) => {
    requests.push(body);
    if (requests.length === 1) {
      if (appliedBeforeLoss) current = "revoked";
      throw { detail: "unavailable" };
    }
    current = "revoked";
    return { status: 200, body: { account_id: "42", operation_id: body.operation_id, decision: "revoked", revision: 2, policy_version: null, policy_generation: null } };
  });
  assert.ok(button(app, "Desactivar"), app.w.document.body.textContent);
  button(app, "Desactivar").click();
  await sleep(150);
  app.w.dispatchEvent(new app.w.Event("focus"));
  await sleep(150);
  assert.ok(button(app, "Reintentar desactivación"));
  assert.equal(button(app, "Activar modelos gratuitos"), undefined);
  button(app, "Reintentar desactivación").click();
  await sleep(150);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].operation_id, requests[1].operation_id);
  assert.equal(requests[1].accepted, false);
});

for (const appliedBeforeLoss of [false, true]) test(`a lost acceptance ${appliedBeforeLoss ? "applied" : "not applied"} survives reopening and a rejected retry`, async () => {
  let current = "unknown";
  const requests = [];
  const handler = ({ body }) => {
    requests.push(body);
    if (requests.length === 1) {
      if (appliedBeforeLoss) current = "accepted";
      throw { detail: "unavailable" };
    }
    if (requests.length === 2) return { status: 401, body: { error: { code: "invalid_credential" } } };
    current = "accepted";
    return { status: 200, body: { account_id: "42", operation_id: body.operation_id, decision: "accepted", revision: 2, policy_version: "v1", policy_generation: 1 } };
  };
  const app = await screen(() => current, handler);
  assert.ok(button(app, "Activar modelos gratuitos"));
  button(app, "Activar modelos gratuitos").click();
  await sleep(100);
  assert.ok(app.w.document.body.textContent.includes("Aviso literal"));
  button(app, "Activar").click();
  await sleep(150);
  assert.ok(button(app, "Reintentar activación"));
  button(app, "Reintentar activación").click();
  await sleep(150);
  assert.ok(button(app, "Reintentar activación"));
  assert.ok(app.w.document.body.textContent.includes("La sesión cambió"));
  const saved = Object.fromEntries(Object.keys(app.w.localStorage).map((key) => [key, app.w.localStorage.getItem(key)]));
  const reopened = await screen(() => current, handler, saved);
  assert.ok(button(reopened, "Reintentar activación"));
  button(reopened, "Reintentar activación").click();
  await sleep(150);
  assert.equal(requests.length, 3);
  assert.ok(requests.every((item) => item.operation_id === requests[0].operation_id));
  assert.ok(requests.every((item) => item.accepted === true));
  assert.equal(button(reopened, "Reintentar activación"), undefined);
});

test("two rendered instances find a shared pending decision before creating another", async () => {
  let current = "accepted";
  const requests = [];
  const app = await screen(() => current, ({ body }) => {
    requests.push(body);
    if (requests.length === 1) throw { detail: "unavailable" };
    current = "revoked";
    return { status: 200, body: { account_id: "42", operation_id: body.operation_id, decision: "revoked", revision: 2, policy_version: null, policy_generation: null } };
  }, {}, true);
  const actions = [...app.w.document.querySelectorAll("button")].filter((el) => el.textContent?.trim() === "Desactivar");
  assert.equal(actions.length, 2);
  actions[0].click();
  await sleep(150);
  actions[1].click();
  await sleep(150);
  assert.equal(requests.length, 1, "the second instance discovers the saved operation");
  const retries = [...app.w.document.querySelectorAll("button")].filter((el) => el.textContent?.trim() === "Reintentar desactivación");
  assert.equal(retries.length, 2);
  retries[1].click();
  await sleep(150);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].operation_id, requests[1].operation_id);
});

test("two pending operations in shared storage are resolved individually before a new choice", async () => {
  let current = "unknown";
  const requests = [];
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  const storedPolicy = { version: "v1", generation: 1, locale: "es", text_sha256: "a".repeat(64) };
  const storage = Object.fromEntries(ids.map((id, index) => [`danil:free:pending:${id}`, JSON.stringify({ account: "42", accepted: index === 0, policy: storedPolicy, operationId: id })]));
  const app = await screen(() => current, ({ body }) => {
    requests.push(body);
    current = body.accepted ? "accepted" : "revoked";
    return { status: 200, body: { account_id: "42", operation_id: body.operation_id, decision: current, revision: requests.length, policy_version: body.accepted ? "v1" : null, policy_generation: body.accepted ? 1 : null } };
  }, storage, true);
  assert.ok(button(app, "Reintentar activación"));
  assert.equal(button(app, "Activar modelos gratuitos"), undefined);
  button(app, "Reintentar activación").click();
  await sleep(150);
  assert.ok(button(app, "Reintentar desactivación"));
  button(app, "Reintentar desactivación").click();
  await sleep(150);
  assert.deepEqual(requests.map((body) => body.operation_id), ids);
  assert.equal(app.w.localStorage.getItem(`danil:free:pending:${ids[0]}`), null);
  assert.equal(app.w.localStorage.getItem(`danil:free:pending:${ids[1]}`), null);
});

test("a policy-changed resolution removes the old operation and displays the new literal notice", async () => {
  let currentPolicy = policy;
  const id = "33333333-3333-4333-8333-333333333333";
  const saved = { account: "42", accepted: true, policy: { version: "v1", generation: 1, locale: "es", text_sha256: "a".repeat(64) }, operationId: id };
  const app = await screen(() => "unknown", () => {
    currentPolicy = { ...policy, version: "v2", generation: 2, lines: ["Aviso nuevo", "Nueva segunda línea"], text_sha256: "b".repeat(64) };
    return { status: 409, body: { error: { code: "policy_changed" } } };
  }, { [`danil:free:pending:${id}`]: JSON.stringify(saved) }, false, () => currentPolicy);
  assert.ok(button(app, "Reintentar activación"));
  button(app, "Reintentar activación").click();
  await sleep(200);
  assert.equal(app.w.localStorage.getItem(`danil:free:pending:${id}`), null);
  assert.ok(app.w.document.body.textContent.includes("Aviso nuevo"));
  assert.ok(button(app, "Activar"));
});
