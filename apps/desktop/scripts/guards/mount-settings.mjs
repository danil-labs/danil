#!/usr/bin/env node
/** Configuración: proveedores, integraciones, plugins, lengua, agentes y workspaces. */
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
providers.w.document.querySelector("#cfg-tab-projects")?.click();
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
/**
 * Configuración › Agentes contra un catálogo con estado: crear en otra
 * carpeta, agregar con mudanza, rechazo dentro del diálogo, quitar de
 * «todas», deshacer, y un deshacer que choca con un cambio hecho desde fuera.
 */
const catalogFolders = [
  { id: "app", name: "Terminus App", kind: "folder", sources: [], portfolio: null },
  { id: "rad", name: "Radiant", kind: "folder", sources: [], portfolio: null },
  { id: "kn", name: "kn", kind: "folder", sources: [], portfolio: null },
];
const catalogIds = catalogFolders.map((p) => p.id);
const folderNameOf = (id) => catalogFolders.find((p) => p.id === id)?.name ?? id;
const repositoryQa = "/repo/app/.agents/agents/qa/agent.md";
const radiantQa = "/repo/rad/.agents/agents/qa/agent.md";
let radiantDeclaresQa = false;
const ownAgents = [
  { name: "giskard-po", scope: { kind: "project", id: "app" }, list: ["app"], display: "Giskard Product Owner", description: "Product Owner de Terminus." },
  { name: "notas-de-version", scope: { kind: "workspace" }, list: null, display: null, description: "Escribe las notas de versión." },
  { name: "qa", scope: { kind: "project", id: "kn" }, list: ["kn"], display: "QA de kn", description: "Prueba los flujos de kn." },
];
const declaration = (a) => {
  const base = a.scope.kind === "project" ? `/ws/projects/${a.scope.id}/agents/${a.name}` : `/ws/agents/${a.name}`;
  return { name: a.name, description: a.description, instructions: "Trabaja.", tools: [], model: null, origin: `${base}/agent.md`, folder: base, providers: ["claude"], own: true, own_scope: a.scope };
};
const profileOf = (display) => ({ display_name: display, body: null, background: null, veil: 0.82, provider: null, model: null, effort: null, hidden: false });
const folderChanges = [];
const createdItems = [];
const agentsApp = await boot("listo", "settings-agents", {
  ...RESPONSES,
  list_projects: () => structuredClone(catalogFolders),
  list_language_packs: [], list_bundled_language_packs: [],
  list_agent_profiles: {},
  // Clonado como lo entrega el IPC: el front reconcilia sobre lo que recibe.
  list_machine_agents: () => structuredClone({
    own: ownAgents
      .map((a) => ({
        agent: declaration(a),
        profile: profileOf(a.display),
        folders: a.list === null ? catalogIds : catalogIds.filter((id) => a.list.includes(id)),
        all_folders: a.list === null,
        blocked: a.name === "qa" ? [{ folder: "app", origin: repositoryQa, repository: true }] : [],
        catalog_taken: null,
      }))
      .sort((x, y) => x.agent.name.localeCompare(y.agent.name)),
    repository: [{
      agent: { name: "qa", description: "Verifica que un cambio funcione.", instructions: "", tools: [], model: null, origin: repositoryQa, folder: "/repo/app/.agents/agents/qa", providers: ["claude"], own: false, own_scope: null },
      profile: profileOf(null),
      folders: ["app"],
    }],
  }),
  change_agent_folders: ({ scope, name, change }) => {
    folderChanges.push([name, scope, change]);
    const a = ownAgents.find((x) => x.name === name && JSON.stringify(x.scope) === JSON.stringify(scope));
    const denies = (codeText, origin = "") => Promise.reject({
      what: { clave: `settings.agents.error.${codeText}`, datos: { name, folder: change.folder ? folderNameOf(change.folder) : "", origin } },
      detail: codeText,
    });
    if (!a) return denies("missing");
    const current = a.list ?? catalogIds;
    if (change.kind === "add") {
      if (current.includes(change.folder)) return denies("already_active");
      if (name === "qa" && change.folder === "app") return denies("shadowed_repository", repositoryQa);
      if (name === "qa" && change.folder === "rad" && radiantDeclaresQa) return denies("shadowed_repository", radiantQa);
      a.scope = { kind: "workspace" };
      a.list = [...current, change.folder];
      return [...a.list];
    }
    if (change.kind === "remove") {
      const remaining = current.filter((id) => id !== change.folder);
      if (remaining.length === 0) return denies("last_folder");
      a.list = remaining;
      return [...remaining];
    }
    if (JSON.stringify(change.expected) !== JSON.stringify(a.list)) return denies("conflict");
    a.list = change.folders;
    return structuredClone(a.list);
  },
  create_agent: ({ name, description, scope }) => {
    createdItems.push([name, scope]);
    const a = { name, scope, list: [scope.id], display: null, description };
    ownAgents.push(a);
    return { agent: declaration(a), eclipsado_por: null };
  },
  save_agent_profile: ({ name, displayName }) => {
    const a = ownAgents.find((x) => x.name === name);
    if (a) a.display = displayName;
    return null;
  },
});
const agDoc = agentsApp.w.document;
let railNotices = 0;
agentsApp.w.addEventListener("harness:encargados", () => railNotices++);
let profileNotices = 0;
agentsApp.w.addEventListener("harness:profiles", () => profileNotices++);
const pressedKey = (key) =>
  agDoc.activeElement.dispatchEvent(new agentsApp.w.KeyboardEvent("keydown", { key, bubbles: true }));
const buttonWith = (rootDir, textValue) => [...rootDir.querySelectorAll("button")].find((b) => b.textContent?.trim() === textValue);
const ownItem = (name) =>
  [...agDoc.querySelectorAll('section[aria-labelledby="agents-own"] [role="list"] > [role="listitem"]')]
    .find((li) => [...li.querySelectorAll("span")].some((s) => s.textContent === name));
const foldersLabel = (name) => ownItem(name).querySelector('[role="group"] > span').textContent;
const chips = (name) => [...ownItem(name).querySelectorAll('[role="group"] > span')].slice(1).map((s) => s.textContent);
const removeFrom = (name, folder) => ownItem(name).querySelector(`button[aria-label="Quitar ${name} de ${folder}"]`);
const menuOf = (name) => agDoc.querySelector(`[role="menu"][aria-label="Agregar ${name} a un proyecto"]`);
const openMenuOf = async (name) => {
  buttonWith(ownItem(name), "Agregar a proyecto…").click();
  await sleep(60);
  return menuOf(name);
};
const lineEls = (menu) => [...menu.querySelectorAll('[role="menuitem"]')];
const lineEl = (menu, folder) => lineEls(menu).find((r) => r.textContent.startsWith(folder));
const moveDialog = (name) =>
  [...agDoc.querySelectorAll('[role="dialog"],[role="alertdialog"]')]
    .find((d) => d.textContent.includes(`¿Pasar ${name} al catálogo del workspace?`));
const settingsPanel = () => agDoc.querySelector("#cfg-panel");

agDoc.querySelector('button[aria-label="Configuración"]')?.click();
await sleep(100);
const tabs = [...agDoc.querySelectorAll('[role="tab"][id^="cfg-tab-"]')].map((b) => b.id);
const projects = tabs.indexOf("cfg-tab-projects");
assert.deepEqual(tabs.slice(projects, projects + 2), ["cfg-tab-projects", "cfg-tab-agents-skills"]);
agDoc.querySelector("#cfg-tab-projects").click();
// La página llega en su propio trozo: se espera a que pinte sus filas.
for (let i = 0; i < 120 && !agDoc.querySelector("#cfg-panel [data-settings-project]"); i++) await sleep(25);
const projectRows = [...agDoc.querySelectorAll("#cfg-panel [data-settings-project]")];
assert.deepEqual(projectRows.map((f) => f.getAttribute("data-settings-project")), catalogIds, "Ajustes › Proyectos lista las carpetas del espacio");
assert.ok(projectRows.every((f) => f.textContent.includes("Archivos") && f.textContent.includes("sin tareas")), "cada fila dice su tipo en palabras y que no tiene tareas");
assert.doesNotMatch(settingsPanel().textContent, /\bgit\b/i, "la página no le habla de git a la persona");
agDoc.querySelector("#cfg-tab-agents-skills").click();
// Agentes llega en su propio trozo: se espera a que pinte sus filas.
for (let i = 0; i < 120 && !ownItem("giskard-po"); i++) await sleep(25);

assert.ok(ownItem("giskard-po"), "la sección lista los agentes propios");
assert.deepEqual(chips("giskard-po"), ["Terminus App"]);
assert.equal(removeFrom("giskard-po", "Terminus App"), null, "la última carpeta no lleva ×");
assert.equal(foldersLabel("notas-de-version"), "Activo en todos los proyectos:");
assert.deepEqual(chips("notas-de-version"), ["Terminus App", "Radiant", "kn"]);
assert.ok(removeFrom("notas-de-version", "kn"), "«todas» se ve carpeta por carpeta, cada una con ×");
assert.equal(buttonWith(ownItem("notas-de-version"), "Agregar a proyecto…"), undefined);
const fromRepo = agDoc.querySelector('section[aria-labelledby="agents-repository"]');
assert.ok(fromRepo?.textContent.includes("Declarado en:"), "los del repositorio se ven aparte y solo se leen");
assert.equal(buttonWith(fromRepo, "Agregar a proyecto…"), undefined);

// Crear desde Configuración: el formulario del riel, con la carpeta elegible.
buttonWith(settingsPanel(), "Agregar nuevo agente").click();
await sleep(80);
const newItem = [...agDoc.querySelectorAll('[role="dialog"]')].find((d) => d.textContent.includes("Nuevo agente"));
assert.ok(newItem, "«Agregar nuevo agente» abre el formulario de siempre");
const newFolder = newItem.querySelector("select");
assert.equal(newFolder.value, "app", "sin carpeta abierta, nace en la primera");
newFolder.value = "rad";
newFolder.dispatchEvent(new agentsApp.w.Event("change", { bubbles: true }));
const typeText = (inputField, textValue) => {
  inputField.value = textValue;
  inputField.dispatchEvent(new agentsApp.w.InputEvent("input", { bubbles: true }));
};
const [nameInput, whatItDoesField] = newItem.querySelectorAll("input");
typeText(nameInput, "Revisor");
typeText(whatItDoesField, "Revisa antes de que aterrice.");
typeText(newItem.querySelector("textarea"), "Con criterio.");
buttonWith(newItem, "Crear").click();
await sleep(150);
assert.deepEqual(createdItems, [["revisor", { kind: "project", id: "rad" }]], "nace de proyecto en la carpeta elegida");
assert.equal([...agDoc.querySelectorAll('[role="dialog"]')].some((d) => d.textContent.includes("Nuevo agente")), false);
assert.deepEqual(chips("revisor"), ["Radiant"], "aparece en la lista sin reabrir Configuración");

// Menú: marcadas, deshabilitadas con su razón, flechas, y Esc devuelve el foco.
let menu = await openMenuOf("giskard-po");
assert.ok(menu, "«Agregar a proyecto…» abre el menú de carpetas");
assert.equal(lineEl(menu, "Terminus App").getAttribute("aria-disabled"), "true");
assert.ok(lineEl(menu, "Terminus App").textContent.includes("Ya está aquí"));
assert.equal(agDoc.activeElement, lineEl(menu, "Radiant"), "el foco entra al primer renglón elegible");
pressedKey("ArrowDown");
assert.equal(agDoc.activeElement, lineEl(menu, "kn"));
pressedKey("Escape");
await sleep(60);
assert.equal(menuOf("giskard-po"), null, "Esc cierra el menú");
assert.ok(settingsPanel(), "y no se lleva Configuración");
assert.equal(agDoc.activeElement, buttonWith(ownItem("giskard-po"), "Agregar a proyecto…"), "el foco vuelve al botón");

// Agregar uno de proyecto a otra carpeta pide la mudanza; Cancelar va primero.
menu = await openMenuOf("giskard-po");
lineEl(menu, "Radiant").click();
await sleep(80);
assert.ok(moveDialog("giskard-po"), "uno de proyecto pide pasar al catálogo");
assert.equal(agDoc.activeElement?.textContent?.trim(), "Cancelar", "el foco empieza en Cancelar");
pressedKey("Escape");
await sleep(80);
assert.equal(moveDialog("giskard-po"), undefined);
assert.ok(settingsPanel(), "Esc en el diálogo no cierra Configuración");
assert.deepEqual(folderChanges, [], "cancelar no cambia nada");
assert.equal(agDoc.activeElement, buttonWith(ownItem("giskard-po"), "Agregar a proyecto…"));
menu = await openMenuOf("giskard-po");
lineEl(menu, "Radiant").click();
await sleep(80);
const noticesBefore = railNotices;
buttonWith(moveDialog("giskard-po"), "Pasar al catálogo y agregar").click();
await sleep(150);
assert.deepEqual(folderChanges.at(-1), ["giskard-po", { kind: "project", id: "app" }, { kind: "add", folder: "rad" }]);
assert.equal(moveDialog("giskard-po"), undefined);
assert.deepEqual(chips("giskard-po"), ["Terminus App", "Radiant"]);
assert.ok(removeFrom("giskard-po", "Radiant"), "ya en el catálogo, cada carpeta se puede quitar");
assert.ok(settingsPanel().textContent.includes("giskard-po pasó al catálogo del workspace."));
assert.ok(settingsPanel().textContent.includes("Ya está activo en Terminus App y en Radiant."));
assert.ok(railNotices > noticesBefore, "el riel se entera");

// Rechazo: en el menú, con la razón; y el que llega del backend, dentro del diálogo.
menu = await openMenuOf("qa");
assert.equal(lineEl(menu, "Terminus App").getAttribute("aria-disabled"), "true");
assert.ok(lineEl(menu, "Terminus App").textContent.includes("Gana el qa del repositorio de Terminus App"));
const changesBefore = folderChanges.length;
lineEl(menu, "Terminus App").click();
await sleep(40);
assert.equal(folderChanges.length, changesBefore, "un renglón deshabilitado no pide nada");
pressedKey("Escape");
await sleep(60);
radiantDeclaresQa = true;
menu = await openMenuOf("qa");
lineEl(menu, "Radiant").click();
await sleep(80);
buttonWith(moveDialog("qa"), "Pasar al catálogo y agregar").click();
await sleep(120);
const rejection = moveDialog("qa")?.querySelector('[role="alert"]');
assert.equal(
  rejection?.textContent,
  `No se agregó qa a Radiant. Ahí gana el qa del repositorio, que se declara en ${radiantQa}.`,
  "el rechazo se lee dentro del diálogo, con quién gana y dónde",
);
buttonWith(moveDialog("qa"), "Cancelar").click();
await sleep(80);
assert.deepEqual(chips("qa"), ["kn"]);

// Quitar de «todas» la vuelve lista fija; Deshacer la devuelve a «todas».
const profilesBefore = profileNotices;
removeFrom("notas-de-version", "kn").click();
await sleep(120);
assert.deepEqual(folderChanges.at(-1), ["notas-de-version", { kind: "workspace" }, { kind: "remove", folder: "kn" }]);
assert.equal(foldersLabel("notas-de-version"), "Activo en:");
assert.deepEqual(chips("notas-de-version"), ["Terminus App", "Radiant"]);
assert.ok(buttonWith(ownItem("notas-de-version"), "Agregar a proyecto…"), "vuelve «Agregar a proyecto…»");
assert.ok(settingsPanel().textContent.includes("notas-de-version ya no está en kn."));
assert.ok(settingsPanel().textContent.includes("Ahora está en una lista fija de proyectos: los nuevos no lo tendrán."));
assert.equal(agDoc.activeElement?.getAttribute("aria-label"), "Quitar notas-de-version de Radiant", "el foco pasa a la vecina");
buttonWith(settingsPanel(), "Deshacer").click();
await sleep(150);
assert.deepEqual(folderChanges.at(-1)[2], { kind: "restore", expected: ["app", "rad"], folders: null });
assert.equal(
  profileNotices - profilesBefore,
  2,
  "quitar y deshacer releen las caras: el riel las lee por carpeta, y el que vuelve a una se pintaría sin su cara ni su fondo",
);
assert.equal(foldersLabel("notas-de-version"), "Activo en todos los proyectos:");
assert.deepEqual(chips("notas-de-version"), ["Terminus App", "Radiant", "kn"]);

// Un deshacer que choca con un cambio hecho desde fuera no lo pisa.
removeFrom("giskard-po", "Radiant").click();
await sleep(120);
assert.ok(settingsPanel().textContent.includes("giskard-po ya no aparece en Radiant."));
assert.equal(removeFrom("giskard-po", "Terminus App"), null);
ownAgents.find((a) => a.name === "giskard-po").list = ["app", "kn"];
buttonWith(settingsPanel(), "Deshacer").click();
await sleep(150);
assert.deepEqual(folderChanges.at(-1)[2], { kind: "restore", expected: ["app"], folders: ["app", "rad"] });
assert.deepEqual(ownAgents.find((a) => a.name === "giskard-po").list, ["app", "kn"], "no pisa el cambio de fuera");
assert.ok(
  [...settingsPanel().querySelectorAll('[role="alert"]')].some((a) =>
    a.textContent.includes("giskard-po cambió mientras tanto. Revisa la lista y vuelve a intentarlo.")),
  "el conflicto se enseña",
);
assert.deepEqual(chips("giskard-po"), ["Terminus App", "kn"], "y la lista se relee");

// Abrir perfil cierra Configuración y lo abre en su primera carpeta.
buttonWith(ownItem("giskard-po"), "Abrir perfil").click();
await sleep(100);
assert.equal(agentsApp.commands.includes("send_message"), false, "abrir el perfil no crea un chat persistente");
assert.equal(settingsPanel(), null);
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
