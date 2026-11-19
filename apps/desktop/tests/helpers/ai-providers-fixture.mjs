/**
 * H-PV1: un motor simulado por proveedor, con estado mutable y registro de
 * llamadas, y el montaje de `ai-providers-accounts.tsx` sobre la ventana de
 * `boot`. Cada comando se puede cambiar por un diferido o un rechazo con
 * `m.on[cmd] = (args) => …` para inyectar fallos o pausas.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import solid from "vite-plugin-solid";
import { boot, sleep } from "./jsdom-app.mjs";

/**
 * La app de `dist/` programa sus sondeos con los temporizadores de Node, que
 * `boot` no pisa, y cerrar la ventana de jsdom no los cancela: sin esto el
 * proceso no termina solo. Se anotan los que siguen pendientes para cancelarlos
 * al cerrar cada montaje.
 */
const reloj = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
const pendientes = new Set();
globalThis.setTimeout = (fn, ms, ...rest) => {
  const h = reloj.setTimeout((...a) => { pendientes.delete(h); return typeof fn === "function" ? fn(...a) : undefined; }, ms, ...rest);
  pendientes.add(h);
  return h;
};
globalThis.clearTimeout = (h) => { pendientes.delete(h); reloj.clearTimeout(h); };
globalThis.setInterval = (...args) => { const h = reloj.setInterval(...args); pendientes.add(h); return h; };
globalThis.clearInterval = (h) => { pendientes.delete(h); reloj.clearInterval(h); };
/** Los montajes abiertos: `cerrarTodo` va en el `afterEach` de cada archivo, así una aserción que falla no deja el proceso vivo. */
const abiertos = new Set();
export function cerrarTodo() {
  for (const cerrar of [...abiertos]) cerrar();
}
function cancelarRelojes() {
  for (const h of pendientes) { reloj.clearTimeout(h); reloj.clearInterval(h); }
  pendientes.clear();
}

const W = { id: "w", name: "Danil", context_root: null };
const BASE = {
  window_ready: null,
  window_vitals: null,
  setup_required: false,
  list_projects: [],
  list_sources: [],
  list_live_sessions: [],
  list_live_turns: [],
  list_surfaces: [],
  list_models: { models: [], fallback: false },
  set_active_workspace: null,
  list_workspaces: { workspaces: [W], active: "w" },
  workspaces_startup: { workspaces: [W], active: "w" },
  list_known_mcp: [],
  list_mcp_providers: [],
  list_integrations: { workspace: "w", plugins: [] },
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "test-service", reset: false },
};

/** Una promesa que la prueba resuelve o rechaza cuando quiere. */
export function diferido() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

export const cuenta = (id, extra = {}) => ({ id, label: "", created_at: 1, identity: `${id}@ejemplo.test`, authenticated_at: 1, ...extra });

/** `provs`: `{ claude: { cuentas, active, shared_credential, available, external, status, limites, espera } }`. */
export function motor() {
  const m = { provs: {}, llamadas: [], on: {}, activo: false, nuevas: 0 };
  const p = (provider) => m.provs[provider];
  const quitar = (provider, id) => { p(provider).cuentas = p(provider).cuentas.filter((a) => a.id !== id); };
  const handlers = {
    check_environment: () => ({ ready: true, blocked: false, reason: null, items: [] }),
    // Hasta `m.activo`, la app de fondo no ve agentes: sus lecturas de consumo no se mezclan con las del grupo.
    list_providers: () => m.activo ? Object.entries(m.provs).map(([id, x]) => ({ id, label: x.label ?? id, available: x.available ?? true, external_install_url: x.external ?? null, limits: x.limits ?? true, api_key: x.api_key ?? null })) : [],
    // Como `accounts_in` del motor: un alta a medias no se publica.
    list_accounts: ({ provider }) => ({ provider, env_var: "", shared_credential: p(provider).shared_credential ?? null, secret_note: null, active: p(provider).active ?? null, accounts: structuredClone(p(provider).cuentas.filter((a) => !a.pendiente)) }),
    account_status: ({ provider, id }) => p(provider).status?.[id] ?? { id, authenticated: true, detail: "" },
    account_limits: ({ provider, id }) => ({ mode: "read", plan: null, fetched_at: Date.now(), windows: p(provider).limites?.[id] ?? [] }),
    tasks_awaiting_quota: ({ provider }) => p(provider).espera ?? [],
    resume_awaiting_quota: ({ provider }) => { const n = (p(provider).espera ?? []).length; p(provider).espera = []; return n; },
    add_account: ({ provider }) => { const a = cuenta(`${provider}-nueva-${++m.nuevas}`, { identity: null, authenticated_at: null, pendiente: true }); p(provider).cuentas.push(a); return structuredClone(a); },
    login_account: () => null,
    cancel_login: () => null,
    submit_login_code: () => null,
    open_external: () => null,
    install_provider: ({ provider }) => { p(provider).available = true; return null; },
    discard_account: ({ provider, id }) => { quitar(provider, id); return true; },
    remove_account: ({ provider, id }) => { quitar(provider, id); return null; },
    set_active_account: ({ provider, id }) => { p(provider).active = id; return null; },
  };
  m.responses = { ...BASE };
  for (const [cmd, fn] of Object.entries(handlers)) {
    m.responses[cmd] = (args = {}, options) => {
      m.llamadas.push({ cmd, args, t: Date.now() });
      return (m.on[cmd] ?? fn)(args, options);
    };
  }
  /** El login terminó bien: la cuenta se publica, como hace el motor. */
  m.publicar = (provider, id) => { const a = p(provider).cuentas.find((x) => x.id === id); delete a.pendiente; a.authenticated_at = 2; };
  m.de = (cmd, provider) => m.llamadas.filter((c) => c.cmd === cmd && (provider === undefined || c.args.provider === provider));
  return m;
}

/** Compila el fixture una vez por archivo de prueba. `limpiar` va en el `after` del archivo. */
export async function compilar() {
  const dir = await mkdtemp(join(tmpdir(), "danil-ai-providers-"));
  const entry = fileURLToPath(new URL("./ai-providers-accounts.tsx", import.meta.url));
  await build({ configFile: false, root: fileURLToPath(new URL("../../", import.meta.url)), plugins: [solid()], logLevel: "silent", define: { __TERMINUS_VERSION__: JSON.stringify("test") }, build: { outDir: dir, emptyOutDir: true, lib: { entry, formats: ["es"], fileName: () => "fixture.mjs" }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  return { url: pathToFileURL(join(dir, "fixture.mjs")).href, limpiar: () => rm(dir, { recursive: true, force: true }) };
}

/** Arranca la app con el motor y monta los grupos en un nodo propio. */
export async function montar({ url }, nombre, m, ids, options) {
  const app = await boot("listo", nombre, m.responses);
  await sleep(300);
  m.activo = true;
  m.llamadas.length = 0;
  const root = app.w.document.createElement("div");
  app.w.document.body.append(root);
  const { mountAccounts, ESPERA_ANTES_DE_LA_TERMINAL_MS } = await import(`${url}?v=${nombre}`);
  const g = mountAccounts(root, ids, options);
  const grupo = (id) => root.querySelector(`[data-test-group="${id}"]`);
  // El cuerpo del grupo que monta `Accounts`: el que lleva `@container` y siempre existe.
  const cuerpo = (id) => root.querySelector(`[data-provider-group="${id}"]`);
  const boton = (id, texto) => [...(grupo(id)?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === texto || b.getAttribute("aria-label") === texto);
  const enDialogo = (texto) => [...app.w.document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === texto);
  const cerrar = () => {
    if (!abiertos.delete(cerrar)) return;
    g.dispose(); root.remove(); app.w.close(); cancelarRelojes();
  };
  abiertos.add(cerrar);
  return { app, root, g, grupo, cuerpo, boton, enDialogo, esperaTerminal: ESPERA_ANTES_DE_LA_TERMINAL_MS, texto: (id) => grupo(id)?.textContent ?? "", cerrar };
}

/** Sondea hasta que `read()` dé algo, con plazo; nunca una espera fija. */
export async function waitFor(read, message, ms = 4000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    const value = read();
    if (value) return value;
    await sleep(20);
  }
  throw new Error(`No llegó: ${message}`);
}
