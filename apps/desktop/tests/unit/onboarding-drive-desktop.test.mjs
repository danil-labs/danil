/**
 * «Personaliza» → Google Drive con la app oficial de Google (Windows y Mac) contra
 * un motor simulado: peso, descarga, instalación, inicio de sesión, conectada,
 * dejar de usarla, cancelar y fallo. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)";

const BASE = {
  window_ready: null,
  window_vitals: null,
  setup_required: false,
  list_projects: [],
  list_sources: [],
  list_live_sessions: [],
  list_live_turns: [],
  list_surfaces: [],
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "test-service", reset: false },
  list_workspaces: { workspaces: [], active: null },
  workspaces_startup: { workspaces: [], active: null },
  list_providers: [
    { id: "codex", label: "Codex", available: true, sin_cuenta: false, source: null, system_broken: false, api_key: null, inferencia: "con_cuenta" },
  ],
  list_accounts: {
    provider: "codex", env_var: "", shared_credential: null, secret_note: null, active: "a1",
    accounts: [{ id: "a1", label: "", created_at: 1, identity: "yo@norte.mx", authenticated_at: 2 }],
  },
  add_workspace: ({ name }) => ({ id: "n", name }),
  set_active_workspace: null,
  set_workspace_language: null,
  list_git_hosts: [],
  list_known_mcp: [],
  list_mcp_providers: [],
  list_integrations: { workspace: "n", plugins: [] },
  google_drive_status: { supported: true, installed: false, install: null, connected: null, unverified: null },
  open_external: null,
};

const UNIDAD = { email: "yo@norte.mx", path: "G:\\Mi unidad" };
const BYTES = 293 * 1024 * 1024;
const EV = { operation: "google-drive-desktop", done: 0, bytes: 0 };

/** Un motor con la app de Google: `estado` se puede cambiar desde la prueba. */
function motor(inicial, extra = {}) {
  const m = { estado: { supported: true, installed: false, running: false, mounts: [], installer_bytes: BYTES, ...inicial }, llamadas: [] };
  m.respuestas = {
    ...BASE,
    google_drive_desktop_status: () => structuredClone(m.estado),
    open_google_drive_desktop: () => {
      m.llamadas.push("open");
      m.estado.running = true;
      return null;
    },
    cancel_install: ({ operation }) => {
      m.llamadas.push(`cancel:${operation}`);
      m.emit("install", { ...EV, kind: "cancelled" });
      return true;
    },
    // Responde al instante; lo demás llega por el evento `install`.
    install_google_drive_desktop: () => {
      m.llamadas.push("install");
      return null;
    },
    // «No usar» lo guarda el motor (`DesktopStatus.unused`); la app de Google se queda.
    set_google_drive_desktop_use: ({ used }) => {
      m.llamadas.push(`use:${used}`);
      m.estado.unused = !used;
      return null;
    },
    disconnect_google_drive: () => {
      m.llamadas.push("disconnect");
      return null;
    },
    ...extra,
  };
  return m;
}

const button = (root, label) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === label || b.getAttribute("aria-label") === label);

async function aPersonaliza(m, nombre, ua = WINDOWS) {
  const app = await boot("listo", nombre, m.respuestas, ua);
  m.emit = app.emit;
  await sleep(800);
  button(app.w.document, "Continuar").click();
  await sleep(500);
  // La tarjeta es la caja con borde; su primera fila (nombre y botón) va dentro.
  const card = () =>
    [...app.w.document.querySelectorAll("strong")].find((s) => s.textContent === "Google Drive")?.closest("div.rounded-lg.border");
  return { app, card };
}

test("Drive oficial: del peso a conectada sola tras iniciar sesión", async () => {
  const m = motor({});
  const { app, card } = await aPersonaliza(m, "drive-oficial-flujo");
  assert.ok(card()?.textContent.includes("293 MB"), card()?.textContent);

  button(card(), "Conectar").click();
  await sleep(100);
  assert.deepEqual(m.llamadas, ["install"]);
  app.emit("install", { ...EV, kind: "sizing" });
  app.emit("install", { ...EV, kind: "downloading", done: BYTES / 2, bytes: BYTES });
  await sleep(50);
  assert.ok(card().textContent.includes("Descargando Google Drive"), card().textContent);
  assert.ok(button(card(), "Cancelar la conexión con Google Drive"), "falta la × mientras descarga");

  app.emit("install", { ...EV, kind: "installing" });
  await sleep(50);
  assert.ok(card().textContent.includes("acepta el permiso de Windows"), card().textContent);
  assert.ok(!button(card(), "Cancelar la conexión con Google Drive"), "con el permiso pedido ya no se cancela");

  m.estado.installed = true;
  m.estado.running = true;
  app.emit("install", { ...EV, kind: "done" });
  await sleep(100);
  assert.ok(card().textContent.includes("Inicia sesión en la ventana de Google Drive"), card().textContent);
  button(card(), "Abrir Google Drive").click();
  await sleep(50);
  assert.ok(m.llamadas.includes("open"));

  m.estado.mounts = [UNIDAD];
  await sleep(3000);
  assert.ok(card().textContent.includes("Conectado"), card().textContent);
  assert.ok(card().textContent.includes("yo@norte.mx · G:\\Mi unidad"), card().textContent);
  assert.deepEqual(app.failures, []);
});

test("Drive oficial: cancelar la descarga devuelve la tarjeta al instante", async () => {
  const m = motor({});
  const { app, card } = await aPersonaliza(m, "drive-oficial-cancelar");
  button(card(), "Conectar").click();
  await sleep(50);
  button(card(), "Cancelar la conexión con Google Drive").click();
  assert.ok(button(card(), "Conectar"), card().textContent);
  await sleep(100);
  assert.deepEqual(m.llamadas, ["install", "cancel:google-drive-desktop"]);
  assert.ok(button(card(), "Conectar"), card().textContent);
  assert.ok(!card().className.includes("border-error-strong"), "cancelar no es un fallo");
  assert.deepEqual(app.failures, []);
});

test("Drive oficial ya con sesión sale conectada; desconectar no desinstala y «Usar esta» vuelve", async () => {
  const m = motor({ installed: true, running: true, mounts: [UNIDAD] });
  const { app, card } = await aPersonaliza(m, "drive-oficial-detectada", MAC);
  assert.ok(card()?.textContent.includes("Conectado"), card()?.textContent);

  button(card(), "Dejar de usar Google Drive en Danil (la app de Google sigue instalada)").click();
  await sleep(50);
  assert.ok(card().textContent.includes("Danil no la usa"), card().textContent);
  assert.deepEqual(m.llamadas, ["use:false"], "dejar de usarla solo se guarda en el motor: no desinstala ni desconecta");

  button(card(), "Usar esta").click();
  await sleep(50);
  assert.ok(card().textContent.includes("Conectado"), card().textContent);
  assert.deepEqual(m.llamadas, ["use:false", "use:true"], "«Usar esta» se lo dice al motor");
  assert.deepEqual(app.failures, []);
});

test("Drive oficial: si la instalación falla, borde rojo, el error y «Reintentar»", async () => {
  const m = motor({});
  const { app, card } = await aPersonaliza(m, "drive-oficial-fallo", MAC);
  button(card(), "Conectar").click();
  await sleep(50);
  app.emit("install", { ...EV, kind: "installing" });
  await sleep(50);
  assert.ok(card().textContent.includes("escribe tu contraseña de Mac"), card().textContent);
  app.emit("install", { ...EV, kind: "error", failure: "settings.google_drive_desktop.error_declined" });
  await sleep(200);
  assert.ok(card().className.includes("border-error-strong"), card().className);
  assert.ok(card().textContent.includes("no se dio el permiso de administrador"), card().textContent);
  assert.ok(button(card(), "Reintentar"), card().textContent);
  assert.deepEqual(app.failures, []);
});
