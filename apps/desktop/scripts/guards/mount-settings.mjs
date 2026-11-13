#!/usr/bin/env node
/** Configuración: proveedores, integraciones, plugins, Radiant, lengua, agentes y workspaces. */
import assert from "node:assert/strict";
import { sleep } from "../../tests/helpers/jsdom-app.mjs";
import { RESPONSES, boot } from "../../tests/helpers/mount-guard.mjs";

let providerWorkspace = "ws-a";
let available = [{ key: "acme", name: "acme" }];
const selections = new Map([["ws-a", [{ key: "acme", installation_id: 42 }]]]);
let pendingAreas = null;
const providerCalls = [];
let authentications = 0;
const providerInfo = (scope) => ({
  id: "github", name: "GitHub", fields: [], browser_login: true,
  select_area: true, setup_url: "https://github.com/apps/terminus-app/installations/new",
  token_label: "Token", token_help: "", token_url: "", login_help: "",
  area_label: "organización", areas_label: "organizaciones", area_help: "",
  connected: { data: {}, workspace: "person", identity: { user: "person", name: "Person" },
    selected_area: null, selected_areas: selections.get(scope) ?? [], connected_at: 1 }, unverified: null,
});
const providers = await boot("listo", "provider-workspaces", {
  ...RESPONSES,
  list_workspaces: () => ({ ...RESPONSES.list_workspaces, active: providerWorkspace }),
  list_git_hosts: ({ scope }) => [providerInfo(scope)],
  check_git_host: ({ scope }) => providerInfo(scope),
  git_host_areas: ({ scope }) => (selections.get(scope) ?? []).map(({ key }) => ({ key, name: key })),
  git_host_available_areas: ({ scope }) => { providerCalls.push(scope); return scope === "ws-a" && pendingAreas ? pendingAreas : available; },
  select_git_host_area: ({ scope, area, enabled }) => {
    const next = (selections.get(scope) ?? []).filter(({ key }) => key !== area);
    if (enabled) next.push({ key: area, installation_id: area === "acme" ? 42 : 43 });
    selections.set(scope, next);
    return providerInfo(scope);
  },
  git_host_projects: ({ scope, area }) => {
    assert.ok(selections.get(scope)?.some(({ key }) => key === area));
    return [];
  },
  start_browser_login: () => {
    authentications += 1;
    return { code: "ABCD", url: "https://github.com/login/device", expires_at: 9999999999999 };
  },
  finish_browser_login: ({ scope }) => providerInfo(scope),
  git_host_pending_setup: null,
  open_external: ({ target }) => {
    assert.ok(["https://github.com/login/device", "https://github.com/apps/terminus-app/installations/new"].includes(target));
    if (target.endsWith("/installations/new")) available = [{ key: "acme", name: "acme" }, { key: "other", name: "other" }];
  },
});
const providerButton = (text) => [...providers.w.document.querySelectorAll("button")]
  .find((button) => button.textContent?.trim() === text || button.getAttribute("aria-label") === text);
const providerAction = async (text) => {
  providerButton("Más acciones de GitHub").dispatchEvent(new providers.w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  await sleep(50);
  const item = [...providers.w.document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent?.trim() === text);
  assert.ok(item, text);
  item.dispatchEvent(new providers.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
};
const areaButton = (key) => [...providers.w.document.querySelectorAll("li")]
  .find((li) => li.textContent?.startsWith(key))
  ?.querySelectorAll("button");
const clickArea = (key, text) => [...(areaButton(key) ?? [])]
  .find((button) => button.textContent?.trim() === text)?.click();
const selectedKeys = (scope) => (selections.get(scope) ?? []).map(({ key }) => key);
providers.w.document.querySelector('button[aria-label="Configuración"]')?.click();
await sleep(100);
providers.w.document.querySelector("#cfg-tab-source-control")?.click();
await sleep(50);
providers.w.document.querySelector("#cfg-sub-fuentes")?.click();
await sleep(100);
assert.equal(providerButton("Quitar del workspace"), undefined, "la conexión previa muestra solo el resumen");
assert.ok(providers.w.document.body.textContent.includes("acme"));
assert.equal(providerButton("Usar en este workspace"), undefined, "agregar requiere abrir el selector");
await providerAction("Administrar permisos en GitHub");
await sleep(30);
providerButton("Actualizar acceso")?.click();
await sleep(100);
assert.equal(authentications, 0);
assert.ok(providerButton("Usar en este workspace"), "GitHub permite elegir las instalaciones disponibles");
assert.deepEqual(selectedKeys("ws-a"), ["acme"], "ampliar GitHub no cambia la selección");
clickArea("other", "Usar en este workspace");
await sleep(100);
assert.deepEqual(selectedKeys("ws-a"), ["acme", "other"]);
providerButton("Listo")?.click();
await sleep(50);
assert.equal(providerButton("Quitar del workspace"), undefined, "Listo oculta las acciones de selección");
providerButton("Cambiar acceso")?.click();
await sleep(50);
clickArea("acme", "Quitar del workspace");
await sleep(100);
assert.deepEqual(selectedKeys("ws-a"), ["other"]);
providerButton("Listo")?.click();
await sleep(50);
assert.equal(providerButton("Usar en este workspace"), undefined, "Listo conserva la selección y oculta las opciones");
await providerAction("Administrar permisos en GitHub");
await sleep(30);
providerButton("Actualizar acceso")?.click();
await sleep(100);
let finishOldAreas;
pendingAreas = new Promise((resolve) => { finishOldAreas = resolve; });
providerButton("Cambiar acceso")?.click();
await sleep(50);
providerWorkspace = "ws-b";
providers.w.dispatchEvent(new providers.w.CustomEvent("harness:workspace"));
await sleep(100);
assert.ok(providers.w.document.body.textContent.includes("Sin acceso seleccionado"));
await providerAction("Administrar permisos en GitHub");
await sleep(30);
providerButton("Actualizar acceso")?.click();
await sleep(100);
clickArea("acme", "Usar en este workspace");
await sleep(100);
finishOldAreas([{ key: "stale", name: "stale" }]);
await sleep(50);
assert.ok(!providers.w.document.body.textContent.includes("stale"), "una respuesta vieja no cruza de workspace");
assert.deepEqual(selectedKeys("ws-b"), ["acme"]);
assert.deepEqual(selectedKeys("ws-a"), ["other"]);
assert.equal(authentications, 0);
assert.ok(providerCalls.includes("ws-a") && providerCalls.includes("ws-b"));
assert.deepEqual(providers.failures, []);
let integrationStatus = { installed: true, enabled: false };
let pendingIntegration = null;
const integration = await boot("listo", 9, {
  ...RESPONSES,
  agentsview_status: () => pendingIntegration ?? integrationStatus,
});
const integrationButton = () => integration.w.document.querySelector('button[aria-label="Analytics"]');
const workspaceChanged = () => integration.w.dispatchEvent(new integration.w.CustomEvent("harness:workspace"));
assert.equal(integrationButton(), null);
integrationStatus = { installed: true, enabled: true };
workspaceChanged();
await sleep(30);
assert.ok(integrationButton(), "switching to an enabled workspace reveals AgentsView");
let finishIntegration;
pendingIntegration = new Promise(resolve => { finishIntegration = resolve; });
workspaceChanged();
assert.equal(integrationButton(), null);
pendingIntegration = null;
integrationStatus = { installed: true, enabled: false };
workspaceChanged();
await sleep(30);
finishIntegration({ installed: true, enabled: true });
await sleep(30);
assert.equal(integrationButton(), null, "a late response cannot enable AgentsView in another workspace");
integration.emit("agentsview-changed", true);
await sleep(30);
assert.equal(integrationButton(), null, "integration events must read the active workspace");
integrationStatus = { installed: true, enabled: true };
integration.emit("agentsview-changed", true);
await sleep(30);
assert.ok(integrationButton());
assert.deepEqual(integration.failures, []);
let pluginWorkspace = "w";
let officeInstalled = false;
let officeEnabled = false;
let pendingCatalog = null;
const pluginCalls = [];
const catalog = () => ({ workspace: pluginWorkspace, plugins: [
  { id: "agentsview", installed: true, enabled: true, version: "0.39.0", bytes: 1000, supported: true },
  { id: "libreoffice", installed: officeInstalled, enabled: officeEnabled, version: officeInstalled ? "26.2.6" : null, bytes: officeInstalled ? 800000000 : null, supported: true },
] });
const plugins = await boot("listo", "plugins", {
  ...RESPONSES,
  list_integrations: () => pendingCatalog ?? catalog(),
  install_integration: ({ id }) => { pluginCalls.push(["install", id]); officeInstalled = true; },
  set_integration_enabled: ({ id, workspace, enabled }) => {
    pluginCalls.push(["enable", id, workspace, enabled]); officeEnabled = enabled;
  },
  uninstall_integration: ({ id }) => { pluginCalls.push(["uninstall", id]); officeInstalled = false; officeEnabled = false; },
  list_language_packs: [], list_bundled_language_packs: [],
});
plugins.w.document.querySelector('button[aria-label="Configuración"]')?.click();
await sleep(100);
plugins.w.document.querySelector('#cfg-tab-connections')?.click();
await sleep(50);
plugins.w.document.querySelector('#cfg-sub-plugins')?.click();
await sleep(100);
const officeCard = () => [...plugins.w.document.querySelectorAll("div")].find(d => d.textContent === "LibreOffice")?.parentElement?.parentElement?.parentElement;
const officeButton = (text) => [...officeCard().querySelectorAll("button")].find(b => b.textContent?.trim() === text);
const officeSwitch = () => officeCard().querySelector('button[role="switch"][aria-label="Activar en este espacio"]');
assert.ok(officeCard(), "Connections offers LibreOffice alongside AgentsView");
officeButton("Instalar").click();
await sleep(50);
assert.deepEqual(pluginCalls, [["install", "libreoffice"]]);
assert.equal(officeSwitch()?.getAttribute("aria-checked"), "false");
officeSwitch().click();
await sleep(50);
assert.equal(officeSwitch()?.getAttribute("aria-checked"), "true");
assert.deepEqual(pluginCalls.at(-1), ["enable", "libreoffice", "w", true]);
officeButton("Desinstalar").click();
await sleep(30);
const removalDialog = () => [...plugins.w.document.querySelectorAll('[role="dialog"]')].find(d => d.textContent.includes("Desinstalar") && d.textContent.includes("Cancelar"));
assert.ok(removalDialog(), "uninstall requires a visible confirmation");
[...removalDialog().querySelectorAll("button")].find(b => b.textContent?.trim() === "Cancelar").click();
await sleep(30);
assert.equal(pluginCalls.length, 2, "cancelling uninstall changes nothing");
officeButton("Desinstalar").click();
await sleep(50);
[...removalDialog().querySelectorAll("button")].find(b => b.textContent?.trim() === "Desinstalar").click();
await sleep(50);
assert.deepEqual(pluginCalls.at(-1), ["uninstall", "libreoffice"]);
assert.ok(officeButton("Instalar"));
let finishCatalog;
pendingCatalog = new Promise(resolve => { finishCatalog = resolve; });
plugins.w.dispatchEvent(new plugins.w.CustomEvent("harness:workspace"));
assert.equal(officeCard(), undefined);
pendingCatalog = null;
pluginWorkspace = "other";
plugins.w.dispatchEvent(new plugins.w.CustomEvent("harness:workspace"));
await sleep(30);
finishCatalog({ workspace: "w", plugins: [{ id: "libreoffice", installed: true, enabled: true, supported: true, version: "stale", bytes: 10 }] });
await sleep(30);
assert.ok(officeButton("Instalar"), "an old catalog cannot replace the new workspace");
assert.deepEqual(plugins.failures, []);
/**
 * Configuración › Radiant: Cloud se confirma con un botón, el código del login se
 * ve mientras se espera al navegador, la cuenta sale de `/v1/me`, una URL HTTP no
 * entra y cambiar de workspace de Terminus no deja nada del anterior.
 */
const CLOUD = "https://radiant.danil.ai";
const radiantCalls = [];
const radiant = { server: null, signed_in: false, workspace: null, login: null };
const radiantAccount = {
  status: "ok", email: "ana@example.test", organization: "Danil", organizations: [], note: null,
  workspaces: [{ id: "eng", name: "Ingeniería" }, { id: "ops", name: "Operación" }], revocada: false,
};
let radiantIdentityPending = null;
let radiantWorkspacesPending = null;
const radiantStatus = () => ({ cloud_server: CLOUD, ...radiant });
const radiantIdentity = () => ({
  status: radiantAccount.status, email: radiantAccount.email, name: null,
  organization: radiantAccount.organization, organizations: radiantAccount.organizations, note: radiantAccount.note,
});
const UNGOVERNED = { governed: null, stale: false, notice: null, summary: null };
const GOVERNED = () => ({
  governed: {
    workspace_id: "eng", workspace_name: "Ingeniería", server: CLOUD, mode: "managed",
    locked: ["context_sources", "mcp_servers", "skills", "agents", "models"],
    policy_revision: "b".repeat(64), expires_at: 1_900_000_300, last_ok: 1_900_000_000,
  },
  stale: false,
  notice: null,
  summary: {
    sources: [{ id: "gov", name: "gobierno", role: "governance_root", files: 1 }],
    skills: ["revisar"],
    agents: ["revisor"],
    mcp: [
      { id: "radiant", name: "Radiant", url: "https://radiant.example.test/mcp", auth: "radiant", tailnet: false, active: true },
      { id: "interno", name: "Interno", url: "https://interno.example.ts.net/mcp", auth: "none", tailnet: true,
        active: false, reason: "radiant.governance.tailscale.missing" },
    ],
    models: { providers: ["Claude"], allowed: [], default: "sonnet" },
    connections: [{ id: "jira", provider: "jira", name: "Jira", owner: "user", purpose: "work_tracking", status: "not_connected" }],
    tailnet: { tailnet: "example.ts.net", required: true, state: { kind: "missing" } },
    issued_at: 1_900_000_000,
  },
});
let governance = UNGOVERNED;
const radiantSessions = [];
const radiantApp = await boot("listo", "settings-radiant", {
  radiant_governance_status: () => structuredClone(governance),
  radiant_govern_enable: () => {
    radiantCalls.push(["govern"]);
    governance = GOVERNED();
    return structuredClone(governance);
  },
  radiant_govern_disable: () => {
    radiantCalls.push(["ungovern"]);
    governance = UNGOVERNED;
    return structuredClone(governance);
  },
  radiant_govern_refresh: () => {
    throw { what: { clave: "radiant.error.unreachable" }, detail: "connection_failed" };
  },
  list_radiant_connections: () => structuredClone(GOVERNED().summary.connections),
  list_governed_mcp_logins: () =>
    governance.governed ? [{ id: "atlassian", name: "Atlassian", sesiones: radiantSessions.slice() }] : [],
  list_mcp_providers: () => [
    { id: "claude", label: "Claude Code", recibe: true, instalado: true, login: true },
    { id: "grok", label: "Grok", recibe: true, instalado: true, login: false,
      sin_login: { clave: "mcp.session.cli_has_none" } },
    { id: "codex", label: "Codex", recibe: false, instalado: false, login: true },
  ],
  mcp_login: ({ provider: agent, id }) => {
    radiantCalls.push(["mcp_login", agent, id]);
    return { clave: "mcp.login.opened_browser", datos: { service: "Atlassian" } };
  },
  radiant_connect_account: ({ id }) => {
    radiantCalls.push(["connect", id]);
    return null;
  },
  ...RESPONSES,
  list_language_packs: [], list_bundled_language_packs: [],
  radiant_status: () => radiantStatus(),
  radiant_set_server: ({ server }) => {
    radiantCalls.push(["server", server]);
    if (server.startsWith("http://")) {
      throw { what: { clave: "radiant.error.http_not_allowed" }, detail: server };
    }
    radiant.server = server;
    return radiantStatus();
  },
  radiant_login: () => {
    radiantCalls.push(["login"]);
    radiant.login = { server: radiant.server, running: true, failure: null,
      prompt: { uri: "https://auth.example.test/activate", code: "WDJB-MJHT" } };
    return radiantStatus();
  },
  get_radiant_identity: () => radiantIdentityPending ?? radiantIdentity(),
  // Objetos nuevos en cada llamada, como por IPC: el `For` del selector recrea sus opciones.
  list_radiant_workspaces: () => radiantWorkspacesPending ?? structuredClone(radiantAccount.workspaces),
  radiant_select_workspace: ({ id }) => {
    radiantCalls.push(["workspace", id]);
    if (radiantAccount.revocada) {
      Object.assign(radiant, { signed_in: false, workspace: null });
      throw { what: { clave: "radiant.error.no_session" }, detail: "HTTP 401 session_revoked" };
    }
    radiant.workspace = { id, name: id === "eng" ? "Ingeniería" : "Operación" };
    if (id === "ops") radiantAccount.organization = "Danil Operación";
    return radiantStatus();
  },
  radiant_select_organization: ({ id }) => {
    radiantCalls.push(["organization", id]);
    Object.assign(radiantAccount, { status: "ok", organization: id === "org_otra" ? "Otra" : "Danil", note: null });
    return radiantStatus();
  },
  radiant_logout: () => {
    radiantCalls.push(["logout"]);
    Object.assign(radiant, { signed_in: false, workspace: null });
    return radiantStatus();
  },
});
const rDoc = radiantApp.w.document;
const rPanel = () => rDoc.querySelector("#cfg-panel");
const rBoton = (textValue) => [...rPanel().querySelectorAll("button")].find((b) => b.textContent?.trim() === textValue);
const rPick = async (select, valueText) => {
  select.value = valueText;
  select.dispatchEvent(new radiantApp.w.Event("change", { bubbles: true }));
  await sleep(120);
};
const completeLogin = async () => {
  Object.assign(radiant, { signed_in: true, login: null });
  radiantApp.emit("radiant", null);
  await sleep(120);
};
rDoc.querySelector('button[aria-label="Configuración"]')?.click();
await sleep(100);
rDoc.querySelector("#cfg-tab-connections")?.click();
await sleep(50);
rDoc.querySelector("#cfg-sub-operation")?.click();
await sleep(100);
assert.ok(rPanel().textContent.includes(CLOUD), "Radiant Cloud enseña su origen");
assert.equal(rBoton("Iniciar sesión"), undefined, "sin servidor elegido no hay sesión que iniciar");
rBoton("Usar este servidor").click();
await sleep(80);
assert.deepEqual(radiantCalls.at(-1), ["server", CLOUD]);
assert.ok(rPanel().textContent.includes(`Sin sesión en ${CLOUD}.`));
assert.ok(rBoton("Iniciar sesión"), "una instalación sin la CLI de Radiant ofrece iniciar sesión");
rBoton("Iniciar sesión").click();
await sleep(80);
assert.ok(rPanel().textContent.includes("WDJB-MJHT"), "el código se ve mientras se espera al navegador");
assert.ok(rBoton("Cancelar"));
assert.ok(rBoton("Servidor propio").disabled, "no se cambia de servidor con un login en vuelo");
await completeLogin();
assert.ok(
  rPanel().textContent.includes(`Sesión iniciada como ana@example.test · Danil en ${CLOUD}.`),
  "la cuenta y la organización salen del servidor",
);
const rSelect = rPanel().querySelector('select[aria-label="Workspace de Danil Teams"]');
assert.ok(rSelect, "con sesión se elige workspace remoto");
await rPick(rSelect, "ops");
assert.deepEqual(radiantCalls.at(-1), ["workspace", "ops"]);
assert.ok(
  rPanel().textContent.includes("ana@example.test · Danil Operación"),
  "elegir workspace cambia de organización y la cuenta se relee",
);
const rShown = () => {
  const select = rPanel().querySelector('select[aria-label="Workspace de Danil Teams"]');
  return [select.value, select.selectedOptions[0]?.textContent];
};
assert.deepEqual(rShown(), ["ops", "Operación"], "tras elegir, el selector enseña el workspace elegido");
rBoton("Actualizar").click();
await sleep(80);
assert.deepEqual(rShown(), ["ops", "Operación"], "y lo sigue enseñando al actualizar la lista");
const insights = rPanel().querySelector("[data-harness-insights]");
assert.ok(insights, "la sección sin servicio conserva la tarjeta de consumo y actividad");
assert.ok(insights.classList.contains("bg-surface-raised") && insights.classList.contains("p-4"), "la tarjeta conserva la superficie y el espacio del diseño original");
assert.equal(insights.querySelector("header h3")?.textContent, "Consumo y actividad");
assert.ok(insights.querySelector("header p")?.textContent.includes("Lo que reporta el servidor de tu organización"));
assert.ok(insights.querySelector('[role="status"]')?.textContent.includes("todavía no expone"));
assert.equal(radiantApp.commands.includes("harness_org_fetch"), false, "sin contrato no vuelve a invocar el lector retirado");

radiantAccount.organization = "Danil";
rBoton("Servidor propio").click();
await sleep(50);
const rUrl = rPanel().querySelector('input[aria-label="Dirección del servidor"]');
rUrl.value = "http://radiant.example.com";
rUrl.dispatchEvent(new radiantApp.w.Event("input", { bubbles: true }));
rBoton("Usar este servidor").click();
await sleep(80);
assert.ok(rPanel().textContent.includes("El servidor necesita HTTPS."), "una URL HTTP se rechaza con su motivo");
assert.equal(radiant.server, CLOUD, "y el servidor elegido no cambia");
rBoton("Cerrar sesión").click();
await sleep(80);
assert.deepEqual(radiantCalls.at(-1), ["logout"]);
assert.ok(!rPanel().textContent.includes("ana@example.test"), "cerrar sesión borra la cuenta de la pantalla");
// Cuenta A, la sesión se revoca en el servidor y entra la cuenta B: nada de A se queda.
rBoton("Iniciar sesión").click();
await sleep(80);
await completeLogin();
assert.ok(rPanel().textContent.includes("ana@example.test · Danil"));
radiantAccount.revocada = true;
await rPick(rPanel().querySelector('select[aria-label="Workspace de Danil Teams"]'), "eng");
assert.ok(rPanel().textContent.includes(`Sin sesión en ${CLOUD}.`), "la revocación se ve como sesión cerrada");
assert.ok(!rPanel().textContent.includes("ana@example.test"), "sin sesión no se enseña la cuenta anterior");
Object.assign(radiantAccount, { email: "bea@example.test", organization: "Otra", workspaces: [{ id: "legal", name: "Legal" }], revocada: false });
rBoton("Iniciar sesión").click();
await sleep(80);
await completeLogin();
assert.ok(rPanel().textContent.includes("bea@example.test · Otra"), "el login nuevo enseña su propia cuenta");
assert.ok(!rPanel().textContent.includes("ana@example.test"));
const optionList = [...rPanel().querySelectorAll('select[aria-label="Workspace de Danil Teams"] option')].map((o) => o.value).filter(Boolean);
assert.deepEqual(optionList, ["legal"], "y los workspaces de su cuenta, no los de la anterior");
// Cloud con la cuenta y la lista en camino, y se pasa a un servidor propio que ya tiene sesión de otra cuenta.
const OWN = "https://radiant.example.com";
const rWorkspaces = () => rPanel().querySelector('select[aria-label="Workspace de Danil Teams"]');
const rOptions = () => [...rWorkspaces().querySelectorAll("option")].map((o) => o.value).filter(Boolean);
const rRequestAccountAndList = async (id) => {
  const requested = {};
  radiantIdentityPending = new Promise((deliver, failNow) => Object.assign(requested, { cuenta: { entregar: deliver, fallar: failNow } }));
  radiantWorkspacesPending = new Promise((deliver, failNow) => Object.assign(requested, { lista: { entregar: deliver, fallar: failNow } }));
  await rPick(rWorkspaces(), id);
  rBoton("Actualizar").click();
  await sleep(50);
  radiantIdentityPending = null;
  radiantWorkspacesPending = null;
  return requested;
};
const fromCloud = { cuenta: radiantIdentity(), lista: radiantAccount.workspaces };
const lateOnes = await rRequestAccountAndList("legal");
radiant.workspace = null;
Object.assign(radiantAccount, { email: "dora@example.test", organization: "Propia", workspaces: [{ id: "casa", name: "Casa" }] });
rBoton("Servidor propio").click();
await sleep(50);
const rOwn = rPanel().querySelector('input[aria-label="Dirección del servidor"]');
rOwn.value = OWN;
rOwn.dispatchEvent(new radiantApp.w.Event("input", { bubbles: true }));
rBoton("Usar este servidor").click();
await sleep(120);
assert.deepEqual(radiantCalls.at(-1), ["server", OWN]);
assert.ok(rPanel().textContent.includes(`Sesión iniciada como dora@example.test · Propia en ${OWN}.`));
lateOnes.cuenta.entregar(fromCloud.cuenta);
lateOnes.lista.entregar(fromCloud.lista);
await sleep(80);
assert.ok(!rPanel().textContent.includes("bea@example.test"), "la cuenta de Cloud que llega tarde no entra en el servidor propio");
assert.ok(rPanel().textContent.includes("dora@example.test · Propia"));
assert.deepEqual(rOptions(), ["casa"], "ni sus workspaces");
// Cuenta A con sus peticiones en camino, cierra sesión y entra la cuenta B: el fallo tardío de A no borra a B.
const failedOnes = await rRequestAccountAndList("casa");
rBoton("Cerrar sesión").click();
await sleep(80);
Object.assign(radiantAccount, { email: "eva@example.test", workspaces: [{ id: "taller", name: "Taller" }] });
rBoton("Iniciar sesión").click();
await sleep(80);
await completeLogin();
assert.ok(rPanel().textContent.includes("eva@example.test · Propia"));
const expired = { what: { clave: "radiant.error.no_session" }, detail: "HTTP 401 session_revoked" };
failedOnes.cuenta.fallar(expired);
failedOnes.lista.fallar(expired);
await sleep(80);
assert.ok(rPanel().textContent.includes("eva@example.test · Propia"), "el fallo tardío de la cuenta anterior no borra la nueva");
assert.deepEqual(rOptions(), ["taller"]);
assert.ok(!rPanel().textContent.includes("No hay sesión en este servidor"), "ni enseña su error");
rBoton("Danil Cloud").click();
await sleep(120);
assert.deepEqual(radiantCalls.at(-1), ["server", CLOUD]);
// Una cuenta en varias organizaciones elige una antes de ver workspaces.
rBoton("Cerrar sesión").click();
await sleep(80);
Object.assign(radiantAccount, {
  status: "organization_selection_required", email: "carla@example.test", organization: null,
  organizations: [{ id: "org_danil", name: "Danil" }, { id: "org_otra", name: "Otra" }],
  note: { clave: "radiant.identity.organization_selection_required" },
});
rBoton("Iniciar sesión").click();
await sleep(80);
await completeLogin();
assert.ok(rPanel().textContent.includes("Tu cuenta pertenece a varias organizaciones."), "lo que falta sale del catálogo");
assert.equal(rPanel().querySelector('select[aria-label="Workspace de Danil Teams"]'), null, "sin organización no se ofrecen workspaces");
const rOrganization = rPanel().querySelector('select[aria-label="Organización"]');
assert.deepEqual([...rOrganization.querySelectorAll("option")].map((o) => o.value).filter(Boolean), ["org_danil", "org_otra"]);
await rPick(rOrganization, "org_otra");
assert.deepEqual(radiantCalls.at(-1), ["organization", "org_otra"]);
assert.ok(rPanel().textContent.includes("carla@example.test · Otra"), "la organización elegida queda en la cuenta");
assert.equal(rPanel().querySelector('select[aria-label="Organización"]'), null);
assert.ok(rPanel().querySelector('select[aria-label="Workspace de Danil Teams"]'));
// Gobernar el workspace con el remoto elegido: lo instalado se resume y lo que falta se dice.
const rGovernance = () => rPanel().querySelector('button[aria-label="Administrar este workspace con Danil Teams"]');
assert.ok(rGovernance()?.disabled, "sin workspace remoto elegido no se gobierna");
radiant.workspace = { id: "eng", name: "Ingeniería" };
radiantApp.emit("radiant", null);
await sleep(120);
assert.ok(rPanel().textContent.includes("Administrar este workspace con Danil Teams (Ingeniería)."));
rGovernance().click();
await sleep(120);
assert.deepEqual(radiantCalls.at(-1), ["govern"]);
assert.ok(rPanel().textContent.includes("Lo administra Danil Teams · workspace Ingeniería."), "el interruptor queda puesto");
assert.ok(rPanel().textContent.includes("gobierno (raíz)"), "la raíz de gobierno sale en el resumen");
assert.ok(rPanel().textContent.includes("revisar") && rPanel().textContent.includes("revisor"));
assert.ok(rPanel().textContent.includes("Tailscale no está instalado en este equipo."), "un MCP de tailnet dice por qué no se activa");
assert.ok(rPanel().textContent.includes("No instalado"), "y el estado de Tailscale se ve");
rBoton("Conectar").click();
await sleep(80);
assert.deepEqual(radiantCalls.at(-1), ["connect", "jira"], "Conectar pide la URL de Pipes al backend");
// El MCP gobernado con OAuth: el login lo hace la CLI de cada agente que recibe servidores.
assert.ok(rPanel().textContent.includes("Inicio de sesión de los servidores MCP"));
assert.ok(rPanel().textContent.includes("Esta CLI no inicia sesión en servidores MCP · su CLI no la ofrece"),
  "el agente sin login MCP lo dice con su motivo");
assert.ok(!rPanel().textContent.includes("Codex"), "un agente que no recibe servidores no sale");
rBoton("Iniciar sesión con Claude Code").click();
await sleep(80);
assert.deepEqual(radiantCalls.at(-1), ["mcp_login", "claude", "atlassian"]);
assert.ok(rPanel().textContent.includes("Se abrió tu navegador para autorizar Atlassian."));
radiantSessions.push("claude");
radiantApp.emit("mcp", null);
await sleep(120);
assert.equal(rBoton("Iniciar sesión con Claude Code"), undefined, "con sesión ya no se ofrece");
assert.ok(rPanel().textContent.includes("Sesión iniciada"));
governance = { ...GOVERNED(), stale: true };
governance.governed.last_error = "radiant.error.unreachable";
rBoton("Renovar").click();
await sleep(60);
radiantApp.emit("radiant", null);
await sleep(120);
assert.ok(rPanel().textContent.includes("Vencido"), "un gobierno sin renovar se marca vencido");
assert.ok(rPanel().textContent.includes("No se pudo renovar."), "y se dice que lo instalado sigue");
rGovernance().click();
await sleep(120);
assert.deepEqual(radiantCalls.at(-1), ["ungovern"]);
assert.ok(!rPanel().textContent.includes("Lo administra Danil Teams"), "desactivar quita el gobierno de la pantalla");
governance = { ...UNGOVERNED, notice: "radiant.governance.notice.denied" };
radiantApp.emit("radiant", null);
await sleep(120);
assert.ok(rPanel().textContent.includes("Danil Teams dejó de conceder este workspace"), "un 403 se avisa");
governance = UNGOVERNED;
radiant.workspace = null;
// Cambiar de workspace de Terminus borra lo mostrado, y la respuesta tardía del anterior no entra.
const switchWorkspace = () => radiantApp.w.dispatchEvent(new radiantApp.w.CustomEvent("harness:workspace"));
const carla = radiantIdentity();
let deliverIdentity;
radiantIdentityPending = new Promise((resolve) => { deliverIdentity = resolve; });
rBoton("Cerrar sesión").click();
await sleep(80);
rBoton("Iniciar sesión").click();
await sleep(80);
await completeLogin();
assert.ok(rPanel().textContent.includes(`Sesión iniciada en ${CLOUD}.`), "la identidad del primer workspace sigue en camino");
radiantIdentityPending = null;
Object.assign(radiant, { server: CLOUD, signed_in: true, workspace: null, login: null });
Object.assign(radiantAccount, { status: "ok", email: "bea@example.test", organization: "Otra", organizations: [], note: null, workspaces: [{ id: "legal", name: "Legal" }] });
switchWorkspace();
assert.ok(!rPanel().textContent.includes("Sesión iniciada"), "el cambio borra la sesión mostrada sin esperar al servicio");
await sleep(120);
assert.ok(rPanel().textContent.includes("bea@example.test · Otra"), "el workspace nuevo enseña su propia cuenta");
deliverIdentity(carla);
await sleep(80);
assert.ok(!rPanel().textContent.includes("carla@example.test"), "la respuesta tardía del workspace anterior se descarta");
assert.ok(rPanel().textContent.includes("bea@example.test · Otra"));
Object.assign(radiant, { server: null, signed_in: false, workspace: null, login: null });
switchWorkspace();
await sleep(80);
assert.equal(rBoton("Iniciar sesión"), undefined, "un workspace sin servidor elegido no hereda el del anterior");
assert.equal(rPanel().querySelector("select"), null, "ni su cuenta ni sus workspaces remotos");
assert.ok(!rPanel().textContent.includes("bea@example.test"));
assert.deepEqual(radiantApp.failures, []);
/**
 * El selector de lengua dice la lengua que se acaba de poner, también
 * mientras el disco no ha terminado de guardarla. Si cambiar de lengua
 * remonta General, el selector nuevo relee la anterior y queda un paso atrás.
 */
let savedLanguage = null;
const languageSaves = [];
const languageApp = await boot("listo", "language-select", {
  ...RESPONSES,
  list_workspaces: () => ({ workspaces: [{ id: "w", name: "W", context_root: null, lengua: savedLanguage }], active: "w" }),
  list_language_packs: [], list_bundled_language_packs: [],
  set_workspace_language: ({ lengua: language }) =>
    new Promise((resolve) => languageSaves.push(() => { savedLanguage = language; resolve(null); })),
});
const languageDoc = languageApp.w.document;
languageDoc.querySelector('button[aria-label="Configuración"]')?.click();
await sleep(100);
languageDoc.querySelector("#cfg-tab-preferences")?.click();
await sleep(50);
const languageSelect = () =>
  [...languageDoc.querySelectorAll("select")].find((s) => s.querySelector('option[value="en"]') && s.querySelector('option[value=""]'));
const pickLanguage = async (code) => {
  const select = languageSelect();
  select.value = code;
  select.dispatchEvent(new languageApp.w.Event("change", { bubbles: true }));
  await sleep(80);
};
assert.ok(languageSelect(), "General shows the language select");
await pickLanguage("en");
assert.equal(languageDoc.documentElement.lang, "en");
assert.equal(languageSelect().value, "en", "the select names the language just applied");
await pickLanguage("es");
assert.equal(languageDoc.documentElement.lang, "es");
assert.equal(languageSelect().value, "es");
languageSaves.splice(0).forEach((save) => save());
assert.deepEqual(languageApp.failures, []);
/** Configuración global administra solo agentes del workspace, incluso sin carpetas. */
const ownAgents = [
  { name: "giskard-po", scope: { kind: "project", id: "app" }, description: "Proyecto." },
  { name: "notas-de-version", scope: { kind: "workspace" }, description: "Escribe las notas." },
  { name: "ventas", scope: { kind: "workspace" }, package: "business", description: "Ventas." },
];
const declaration = a => ({ name: a.name, description: a.description, instructions: "Trabaja.", tools: [], model: null, origin: `/ws/.agents/agents/${a.name}/agent.md`, folder: `/ws/.agents/agents/${a.name}`, providers: ["claude"], own: true, own_scope: a.scope, package: a.package });
const createdItems = [];
const deletedItems = [];
const agentsApp = await boot("listo", "settings-agents", {
  ...RESPONSES,
  list_projects: [],
  list_language_packs: [], list_bundled_language_packs: [],
  list_agent_profiles: {},
  list_machine_agents: () => structuredClone({
    own: ownAgents.map(a => ({ agent: declaration(a), profile: {}, folders: [], all_folders: true, blocked: [], catalog_taken: null })),
    repository: [{ agent: { ...declaration({ name: "repo-qa", description: "Repositorio." }), own: false, own_scope: null }, profile: {}, folders: ["app"] }],
  }),
  create_agent: ({ name, description, scope }) => {
    createdItems.push([name, scope]);
    const a = { name, scope, description };
    ownAgents.push(a);
    return { agent: declaration(a), eclipsado_por: null };
  },
  delete_agent: args => { deletedItems.push(args); ownAgents.splice(ownAgents.findIndex(a => a.name === args.name), 1); return null; },
  save_agent_profile: () => null,
});
const agDoc = agentsApp.w.document;
await sleep(150);
assert.ok(agDoc.querySelector('[role="group"][aria-label="Agentes"] button[aria-label="Nuevo agente"]'), "el alta permanece disponible sin agentes ni proyectos");
assert.equal(agDoc.querySelector('[data-dock-loading]'), null, "el workspace vacío termina de cargar");
const buttonWith = (root, text) => [...root.querySelectorAll("button")].find(b => b.textContent?.trim() === text);
const ownItem = name => [...agDoc.querySelectorAll('section[aria-labelledby="agents-own"] [role="listitem"]')].find(li => li.textContent.includes(name));
const settingsPanel = () => agDoc.querySelector("#cfg-panel");
agDoc.querySelector('button[aria-label="Configuración"]').click();
await sleep(100);
agDoc.querySelector("#cfg-tab-agents-skills").click();
for (let i = 0; i < 120 && !ownItem("notas-de-version"); i++) await sleep(25);
assert.ok(ownItem("notas-de-version"));
assert.ok(ownItem("ventas"));
assert.equal(ownItem("giskard-po"), undefined, "los instalados en proyectos no aparecen en configuración global");
assert.doesNotMatch(settingsPanel().textContent, /repo-qa|\.agents|\/ws\//, "ni repositorios ni rutas internas");
assert.equal(buttonWith(ownItem("ventas"), "Eliminar agente"), undefined, "Business no ofrece eliminar");
buttonWith(settingsPanel(), "Agregar nuevo agente").click();
await sleep(100);
const newItem = [...agDoc.querySelectorAll('[role="dialog"]')].find(d => d.textContent.includes("Nuevo agente"));
assert.ok(newItem, "crear funciona sin ningún proyecto");
assert.equal([...newItem.querySelectorAll("option")].some(o => o.value === "project"), false, "configuración solo crea en workspace");
const typeText = (field, text) => { field.value = text; field.dispatchEvent(new agentsApp.w.InputEvent("input", { bubbles: true })); };
const [nameInput, descriptionInput] = newItem.querySelectorAll("input");
typeText(nameInput, "Revisor");
typeText(descriptionInput, "Revisa antes de que aterrice.");
typeText(newItem.querySelector("textarea"), "Con criterio.");
buttonWith(newItem, "Crear").click();
await sleep(200);
assert.deepEqual(createdItems, [["revisor", { kind: "workspace" }]]);
assert.ok(ownItem("revisor"), "crear refresca la lista");
buttonWith(ownItem("revisor"), "Eliminar agente").click();
await sleep(80);
let deletion = agDoc.querySelector('[role="alertdialog"]');
assert.ok(deletion, "eliminar pide confirmar");
assert.match(deletion.textContent, /memoria/);
buttonWith(deletion, "Cancelar").click();
await sleep(80);
assert.equal(deletedItems.length, 0, "cancelar conserva el agente");
buttonWith(ownItem("revisor"), "Eliminar agente").click();
await sleep(80);
deletion = agDoc.querySelector('[role="alertdialog"]');
buttonWith(deletion, "Eliminar").click();
await sleep(200);
assert.deepEqual(deletedItems, [{ project: "", name: "revisor" }]);
assert.equal(ownItem("revisor"), undefined);
assert.ok(ownItem("ventas"));
assert.deepEqual(agentsApp.failures, []);
/**
 * Renombrar un workspace es un gesto con nombre, vale para el que no está
 * activo, y cancelar cancela: Escape cierra el campo sin guardar y sin
 * llevarse por delante el diálogo de Configuración.
 */
let spaces = {
  workspaces: [
    { id: "w", name: "Acme", context_root: null, sessions: 0 },
    { id: "w2", name: "Beta", context_root: null, sessions: 0 },
  ],
  active: "w",
};
const renames = [];
const workspaceChanges = [];
const renameApp = await boot("listo", "workspace-rename", {
  ...RESPONSES,
  list_workspaces: () => spaces,
  workspaces_startup: () => spaces,
  list_language_packs: [], list_bundled_language_packs: [],
  set_active_workspace: ({ id }) => { workspaceChanges.push(id); },
  rename_workspace: ({ id, name }) => {
    renames.push([id, name]);
    spaces = { ...spaces, workspaces: spaces.workspaces.map((w) => (w.id === id ? { ...w, name } : w)) };
    return spaces.workspaces.find((w) => w.id === id);
  },
});
await sleep(300);
renameApp.w.document.querySelector('[data-workspace-column] [data-workspace-tile="w"]')
  ?.dispatchEvent(new renameApp.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
await sleep(80);
[...renameApp.w.document.querySelectorAll('[role="menuitem"]')]
  .find((b) => b.textContent?.trim() === "Administrar workspaces")?.click();
await sleep(100);
const pencil = (name) =>
  renameApp.w.document.querySelector(`button[aria-label="Cambiarle el nombre a «${name}»"]`);
const nameField = (name) =>
  renameApp.w.document.querySelector(`input[aria-label="Nuevo nombre de «${name}»"]`);
assert.ok(pencil("Beta"), "renombrar el workspace que no es el activo tiene que ser un gesto visible");
assert.ok(pencil("Acme"), "y el activo también");
pencil("Beta").click();
await sleep(50);
assert.deepEqual(workspaceChanges, [], "pedir renombrar no cambia de cliente");
const wasCancelled = nameField("Beta");
assert.ok(wasCancelled, "el gesto abre el campo del nombre");
wasCancelled.value = "Gamma";
wasCancelled.dispatchEvent(new renameApp.w.InputEvent("input", { bubbles: true }));
wasCancelled.dispatchEvent(new renameApp.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await sleep(50);
assert.deepEqual(renames, [], "Escape cancela sin guardar");
assert.ok(pencil("Beta"), "y Escape no se lleva por delante Configuración");
pencil("Beta").click();
await sleep(50);
const typed = nameField("Beta");
typed.value = "Gamma";
typed.dispatchEvent(new renameApp.w.InputEvent("input", { bubbles: true }));
typed.dispatchEvent(new renameApp.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await sleep(150);
assert.deepEqual(renames, [["w2", "Gamma"]], "Enter guarda el que no es el activo");
assert.deepEqual(workspaceChanges, [], "renombrar no cambia de cliente");
assert.ok(pencil("Gamma"), "la lista se relee con el nombre nuevo");
assert.deepEqual(renameApp.failures, []);

// Los árboles montados conservan sus relojes: el proceso no termina solo.
process.exit(0);
