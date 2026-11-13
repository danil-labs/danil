/**
 * Configuración → Cuenta de Danil contra una ventana simulada: entrar por el
 * navegador del sistema (`danil_sign_in`, login de identity), sus fallos y
 * cerrar sesión. Desk tiene una sola cuenta: cambiar de usuario es cerrar
 * sesión y entrar con otra. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const BASE = {
  danil_sessions: Object.assign(new Error("command"), { detail: "command" }),
  window_ready: null,
  window_vitals: null,
  setup_required: false,
  list_providers: [],
  list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  list_projects: [],
  list_sources: [],
  list_live_sessions: [],
  list_live_turns: [],
  list_surfaces: [],
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "test-service", reset: false },
};

test("la cuenta de Danil entra por el navegador, muestra a la persona y cierra sesión", async () => {
  let status = { state: "disconnected" };
  let refuseOnce = true;
  const calls = [];
  const record = (command, reply) => (args) => {
    calls.push({ command, args });
    return reply(args);
  };
  const app = await boot("listo", "danil-account", {
    ...BASE,
    danil_connect_status: record("danil_connect_status", () => status),
    danil_session_status: record("danil_session_status", () => status),
    danil_connect_options: record("danil_connect_options", () => [{ workspace: "w-ok", name: "Danil", email: "alberto@danil.ai" }]),
    danil_connect_start: record("danil_connect_start", () => ({ state: "pending" })),
    // Rust abre el navegador, espera la vuelta por loopback y canjea en identity.
    danil_sign_in: record("danil_sign_in", () => {
      if (refuseOnce) {
        refuseOnce = false;
        throw Object.assign(new Error("rate_limited"), { what: { clave: "danil.error.rate_limited" }, detail: "rate_limited" });
      }
      status = { state: "connected", account: "user_1", email: "alberto@danil.ai", online: true };
      return status;
    }),
    danil_sign_out: record("danil_sign_out", () => {
      status = { state: "disconnected" };
      return status;
    }),
    open_external: record("open_external", () => null),
  });
  const { w } = app;
  const panel = () => w.document.querySelector("[data-danil-account]");
  const text = () => panel()?.textContent ?? "";
  const button = (label) => [...(panel()?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === label);
  const settle = () => sleep(300);

  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "cuenta-danil" }));
  await sleep(800);
  assert.ok(w.document.getElementById("cfg-tab-account")?.textContent.includes("Cuenta"), "the rail shows the section");
  assert.equal(panel()?.dataset.danilAccount, "disconnected");
  assert.ok(!text().includes("Continuar como"), "one account: no emails to pick");
  assert.ok(!calls.some((c) => c.command === "danil_connect_options"), "nor are the known emails asked for");
  assert.ok(button("Iniciar sesión con Danil"), "the browser is the way in");

  button("Iniciar sesión con Danil").click();
  await settle();
  assert.ok(text().includes("Demasiados intentos"), text());
  assert.equal(panel()?.dataset.danilAccount, "disconnected");

  button("Iniciar sesión con Danil").click();
  await settle();
  assert.equal(calls.filter((c) => c.command === "danil_sign_in").length, 2);
  assert.ok(!calls.some((c) => c.command === "danil_connect_start" || c.command === "open_external"), "the engine flow and its page are gone");
  assert.equal(panel()?.dataset.danilAccount, "connected");
  assert.equal(panel().querySelector("[data-account-name]")?.textContent, "alberto@danil.ai", "without a name the email stands for the person");
  assert.ok(!text().includes("Demasiados intentos"), "a new attempt clears the old failure");

  // Rust avisa por el evento cuando la sesión cambia fuera del panel.
  app.emit("danil-connect", { state: "connected", account: "user_1", email: "alberto@danil.ai", online: false });
  await settle();
  assert.ok(text().includes("Sin conexión con Danil por ahora."), text());

  button("Cerrar sesión").click();
  await settle();
  assert.equal(calls.at(-1)?.command, "danil_sign_out");
  assert.equal(panel()?.dataset.danilAccount, "disconnected");
  assert.ok(button("Iniciar sesión con Danil"), "to use another account, sign in again");
});

test("sin licencia, la sección abre la prueba en el navegador y reintenta", async () => {
  let licensed = false;
  const calls = [];
  const record = (command, reply) => (args) => {
    calls.push({ command, args });
    return reply(args);
  };
  const app = await boot("listo", "danil-account-license", {
    ...BASE,
    danil_connect_status: { state: "disconnected" },
    danil_session_status: { state: "disconnected" },
    danil_sign_in: record("danil_sign_in", () => {
      if (!licensed) throw Object.assign(new Error("license_required"), { what: { clave: "danil.error.license_required" }, detail: "license_required" });
      return { state: "connected", account: "user_1", email: "alberto@danil.ai", online: true };
    }),
    open_external: record("open_external", () => null),
  });
  const { w } = app;
  const panel = () => w.document.querySelector("[data-danil-account]");
  const text = () => panel()?.textContent ?? "";
  const button = (label) => [...(panel()?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === label);
  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "cuenta-danil" }));
  await sleep(800);

  button("Iniciar sesión con Danil").click();
  await sleep(300);
  assert.ok(text().includes("Solicita acceso a Danil"), text());
  assert.ok(text().includes("se abren cuenta por cuenta"), text());
  assert.ok(!text().includes("7 días gratis"), "no trial is offered");
  assert.ok(!text().includes("no tiene licencia"), "the bare refusal is gone");

  button("Solicitar acceso").click();
  await sleep(100);
  assert.equal(
    calls.find((c) => c.command === "open_external")?.args?.target,
    `mailto:hola@danil.ai?subject=${encodeURIComponent("Solicitar acceso a Danil")}`,
  );

  licensed = true;
  button("Ya tengo acceso · Reintentar").click();
  await sleep(300);
  assert.equal(calls.filter((c) => c.command === "danil_sign_in").length, 2, "retrying signs in again");
  assert.ok(!text().includes("Solicita acceso a Danil"), text());
  assert.equal(panel()?.dataset.danilAccount, "connected");
  assert.deepEqual(app.failures, []);
});

test("con un motor que no trae el flujo, la sección lo dice en vez de fallar", async () => {
  // Lo que contesta el proxy de la ventana a un nombre que su contrato no trae.
  const unknown = () => Object.assign(new Error("command"), { what: { clave: "shell.service.command" }, detail: "command" });
  const app = await boot("listo", "danil-account-old-engine", { ...BASE, danil_connect_status: unknown(), danil_session_status: unknown(), danil_connect_options: unknown() });
  const { w } = app;
  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "cuenta-danil" }));
  await sleep(800);
  const panel = w.document.querySelector("[data-danil-account]");
  assert.equal(panel?.dataset.danilAccount, "unavailable", panel?.outerHTML);
});

test("la cuenta muestra nombre y foto, cambia la foto en la cuenta y la quita", async () => {
  const PROVIDER = "/data/danil-computers/avatar-v1.png";
  const OWN = "/data/danil-computers/avatar-up1.png";
  const connected = (extra) => ({
    state: "connected",
    computer_id: "cmp_1",
    name: "Mac de Alberto",
    email: "alberto@danil.ai",
    account_name: "Alberto Ceballos",
    online: true,
    ...extra,
  });
  let status = connected({ avatar: PROVIDER, avatar_source: "provider" });
  const calls = [];
  const record = (command, reply) => (args) => {
    calls.push({ command, args });
    return reply(args);
  };
  const app = await boot("listo", "danil-account-photo", {
    ...BASE,
    danil_connect_status: () => status,
    danil_session_status: () => status,
    danil_account_refresh: record("danil_account_refresh", () => status),
    danil_account_set_photo: record("danil_account_set_photo", () => (status = connected({ avatar: OWN, avatar_source: "danil" }))),
    danil_account_remove_photo: record("danil_account_remove_photo", () => (status = connected({}))),
    preview_file: ({ path }) => ({ data_url: path === OWN ? "data:image/png;base64,T1dO" : "data:image/png;base64,UFJPVg==" }),
  });
  const { w } = app;
  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "cuenta-danil" }));
  await sleep(800);
  const panel = () => w.document.querySelector("[data-danil-account]");
  const text = () => panel()?.textContent ?? "";
  const photo = () => panel()?.querySelector("[data-account-identity] img")?.getAttribute("src") ?? null;
  const button = (label) => [...(panel()?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === label);
  const pick = async (bytes, type, name = "yo") => {
    const input = panel().querySelector("[data-account-photo-input]");
    Object.defineProperty(input, "files", { value: [new w.File([bytes], name, { type })], configurable: true });
    input.dispatchEvent(new w.Event("change", { bubbles: true }));
    await sleep(300);
  };

  assert.ok(calls.some((c) => c.command === "danil_account_refresh"), "opening the section asks the engine for the account again");
  assert.equal(panel().querySelector("[data-account-name]")?.textContent, "Alberto Ceballos");
  assert.ok(text().includes("alberto@danil.ai") && text().includes("Esta computadora: Mac de Alberto"), text());
  assert.equal(photo(), "data:image/png;base64,UFJPVg==", "the provider photo the engine saved");
  assert.ok(!button("Quitar foto"), "a provider photo is not the account's to remove");

  await pick(new Uint8Array([0x47, 0x49, 0x46, 0x38]), "image/gif");
  assert.ok(text().includes("Esa foto no es PNG, JPEG ni WebP."), text());
  await pick(new Uint8Array(2 * 1024 * 1024 + 1), "image/png");
  assert.ok(text().includes("La foto pesa más de 2 MB."), text());
  assert.ok(!calls.some((c) => c.command === "danil_account_set_photo"), "a refused photo never reaches the engine");

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  await pick(png, "image/png");
  const sent = calls.find((c) => c.command === "danil_account_set_photo")?.args?.image ?? "";
  assert.ok(sent.startsWith("data:image/png;base64,"), sent.slice(0, 40));
  assert.deepEqual([...Buffer.from(sent.split(",")[1], "base64")], [...png]);
  app.emit("danil-connect", status);
  await sleep(300);
  assert.equal(photo(), "data:image/png;base64,T1dO", "the new photo shows at once");
  assert.ok(!text().includes("La foto pesa"), "a new attempt clears the old failure");

  button("Quitar foto").click();
  await sleep(300);
  assert.equal(calls.at(-1)?.command, "danil_account_remove_photo");
  assert.equal(photo(), null);
  assert.equal(panel().querySelector("[data-account-avatar]")?.textContent, "AC", "back to the initials");
  assert.deepEqual(app.failures, []);
});

const session = (extra) => ({
  account: "u_alberto",
  email: "alberto@danil.ai",
  name: "Alberto Ceballos",
  photo: null,
  computer_id: "cmp_a",
  computer_name: "Mac de Alberto",
  default: true,
  workspaces: ["w"],
  status: "connected",
  online: true,
  ...extra,
});
const FUNDACION = { account: "u_fdb", email: "alberto@dondebanco.org", name: "Alberto (FDB)", computer_id: "cmp_b", default: false, workspaces: ["w2", "w3"], online: false };

test("Desk tiene una sola cuenta aunque el motor guarde varias: salir es cerrar sesión", async () => {
  const sessions = [session(), session(FUNDACION)];
  const calls = [];
  let status = { state: "connected", account: "user_1", email: "alberto@danil.ai", account_name: "Alberto Ceballos", online: true };
  const app = await boot("listo", "danil-single-account", {
    ...BASE,
    danil_sessions: sessions,
    danil_workspace_account: { account: "u_fdb", email: FUNDACION.email, signed_in: true, linked: true },
    danil_connect_status: () => status,
    danil_session_status: () => status,
    danil_account_refresh: () => status,
    danil_disconnect: ({ account }) => {
      calls.push({ command: "danil_disconnect", account });
      return { state: "disconnected" };
    },
    danil_sign_out: () => {
      calls.push({ command: "danil_sign_out" });
      status = { state: "disconnected" };
      return status;
    },
  });
  const { w } = app;
  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "cuenta-danil" }));
  await sleep(900);
  const panel = () => w.document.querySelector("[data-danil-account]");
  assert.equal(panel()?.dataset.danilAccount, "connected", "the Desk session, not a list of accounts");
  assert.equal(panel().querySelector("[data-danil-session]"), null);
  assert.ok(!panel().textContent.includes("alberto@dondebanco.org"), "the engine's other accounts are not offered");
  assert.ok(!panel().textContent.includes("Agregar otra cuenta"));
  [...panel().querySelectorAll("button")].find((b) => b.textContent.trim() === "Cerrar sesión").click();
  await sleep(300);
  assert.deepEqual(calls, [{ command: "danil_sign_out" }], "one command closes the session; switching user does not exist");
  assert.equal(panel()?.dataset.danilAccount, "disconnected");
  assert.deepEqual(app.failures, []);
});

test("sin danil_sessions en el motor, la sección es la misma cuenta única", async () => {
  const unknown = () => Object.assign(new Error("command"), { what: { clave: "shell.service.command" }, detail: "command" });
  const app = await boot("listo", "danil-accounts-old-engine", {
    ...BASE,
    danil_sessions: unknown(),
    danil_workspace_account: unknown(),
    danil_connect_status: { state: "connected", computer_id: "cmp_1", name: "Mac", email: "alberto@danil.ai", online: true },
    danil_session_status: { state: "connected", computer_id: "cmp_1", name: "Mac", email: "alberto@danil.ai", online: true },
    danil_account_refresh: { state: "connected", computer_id: "cmp_1", name: "Mac", email: "alberto@danil.ai", online: true },
  });
  const { w } = app;
  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "cuenta-danil" }));
  await sleep(800);
  const panel = w.document.querySelector("[data-danil-account]");
  assert.equal(panel?.dataset.danilAccount, "connected");
  assert.ok(panel.textContent.includes("Esta computadora: Mac"));
  assert.ok(!panel.textContent.includes("Agregar otra cuenta"), "no second account without the engine's sessions");
  assert.deepEqual(app.failures, []);
});
