import assert from "node:assert/strict";
import { boot as arrancar, sleep as espera } from "./jsdom-app.mjs";

const base = {
  launcher_state: { phase: "ready", blank_0274: false },
  check_environment: () => ({ ready: true, blocked: false, reason: null, items: [], githubCli: { available: true, version: "gh version 2.102.0", managed_supported: true, installable: true } }),
  list_language_packs: [], list_bundled_language_packs: [], window_ready: null,
  window_vitals: null, setup_required: false, list_providers: [],
  list_workspaces: { workspaces: [{ id: "fixture-a", name: "A" }], active: "fixture-a" },
  workspaces_startup: { workspaces: [{ id: "fixture-a", name: "A" }], active: "fixture-a" },
  list_projects: [], list_sources: [], list_surfaces: [], list_live_sessions: [],
  list_live_turns: [], list_models: { models: [], fallback: false },
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "fixture", reset: false },
};
const install = "https://github.com/apps/terminus-app/installations/new";
for (const scenario of ["connected-workspace", "existing-installation", "no-installation", "cancel-login"]) {
  let connected = scenario === "connected-workspace";
  let loginCount = 0;
  let selected = connected ? [{ key: "acme", installation_id: 42 }] : [];
  let available = connected || scenario === "existing-installation" ? [{ key: "acme", name: "acme" }] : [];
  let finishLogin;
  let pendingAreas = null;
  const opens = [];
  const info = () => ({ id: "github", name: "GitHub", fields: [], browser_login: true,
    select_area: true, setup_url: install, token_label: "Token", token_help: "",
    token_url: "", login_help: "", area_label: "cuenta", areas_label: "cuentas", area_help: "",
    connected: connected ? { data: {}, workspace: "person", identity: { user: "person", name: "Person" },
      selected_area: null, selected_areas: selected, connected_at: 1 } : null, unverified: null });
  const app = await arrancar("listo", `github-${scenario}`, { ...base,
    list_git_hosts: () => [info()], check_git_host: () => info(),
    start_browser_login: () => { loginCount++; return { code: "ABCD", url: "https://github.com/login/device", expires_at: 9999999999999 }; },
    finish_browser_login: () => scenario === "cancel-login" ? new Promise((_resolve, reject) => { finishLogin = reject; }) : (connected = true, info()),
    cancel_browser_login: () => { if (finishLogin) finishLogin(new Error("cancelled")); },
    git_host_pending_setup: null,
    git_host_available_areas: () => available,
    git_host_areas: () => pendingAreas ?? selected.map(({ key }) => ({ key, name: key })),
    select_git_host_area: ({ scope, area, enabled }) => {
      assert.equal(scope, "fixture-a");
      selected = selected.filter(({ key }) => key !== area);
      if (enabled) selected.push({ key: area, installation_id: 42 });
      return info();
    },
    disconnect_git_host: ({ scope }) => { assert.equal(scope, "fixture-a"); connected = false; },
    open_external: ({ target }) => { opens.push(target); },
  });
  const button = text => [...app.w.document.querySelectorAll("button")].find(b => b.textContent?.trim() === text || b.getAttribute("aria-label") === text);
  const menuItem = text => [...app.w.document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent?.trim() === text);
  const action = async text => {
    assert.ok(button("Más acciones de GitHub"));
    button("Más acciones de GitHub").dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); await espera(50);
    assert.ok(menuItem(text), text);
    menuItem(text).dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await espera(100);
  };
  button("Configuración")?.click(); await espera(100);
  app.w.document.querySelector("#cfg-tab-projects")?.click(); await espera(50);
  button("Control de Fuentes")?.click(); await espera(100);
  if (scenario === "connected-workspace") {
    const rows = () => app.w.document.querySelectorAll("section li");
    assert.ok(app.w.document.body.textContent.includes("Acceso de este workspace"));
    assert.ok(app.w.document.body.textContent.includes("acme"));
    assert.ok(app.w.document.body.textContent.includes("Acceso: todos los repositorios que tu GitHub permite"));
    assert.ok(button("Cambiar en GitHub"), "el alcance por repositorio se cambia en GitHub");
    assert.equal(rows().length, 0, "el acceso guardado se resume sin desplegar organizaciones");
    app.w.dispatchEvent(new app.w.Event("focus")); await espera(100);
    assert.equal(button("comprobar"), undefined);
    assert.equal(button("desconectar"), undefined);
    assert.equal(menuItem("Administrar permisos en GitHub"), undefined);
    assert.ok(app.w.document.body.textContent.includes("Person · @person"));
    const tools = [...app.w.document.querySelectorAll("details")].find(el => el.querySelector("summary")?.textContent === "Herramientas para agentes");
    assert.ok(tools);
    assert.equal(tools.open, false);
    assert.equal(app.w.document.body.textContent.includes("Requiere atención"), false);
    tools.querySelector("summary").click(); await espera(30);
    assert.equal(tools.open, true);
    assert.ok(tools.textContent.includes("gh version 2.102.0"));
    tools.querySelector("summary").click(); await espera(30);
    button("Más acciones de GitHub").dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); await espera(50);
    let finishAreas;
    pendingAreas = new Promise(resolve => { finishAreas = resolve; });
    app.w.dispatchEvent(new app.w.Event("focus")); await espera(30);
    const items = [...app.w.document.querySelectorAll('[role="menuitem"]')];
    assert.equal(items.length, 3);
    assert.ok(items.every(item => item.getAttribute("aria-disabled") === "true"), "un menú abierto bloquea acciones mientras se actualiza el acceso");
    pendingAreas = null;
    finishAreas(selected.map(({ key }) => ({ key, name: key }))); await espera(100);
    assert.equal(menuItem("Desconectar").getAttribute("aria-disabled"), "false");
    app.w.document.querySelector('[role="menu"]').dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await espera(50);
    assert.equal(app.w.document.querySelector('[role="menu"]'), null);
    assert.ok(button("Cambiar acceso"), "Escape conserva abierta Configuración");
    await action("Comprobar conexión");
    assert.equal(rows().length, 0, "comprobar o volver al foco conserva el resumen");
    available.push({ key: "other", name: "other" });
    button("Cambiar acceso").click(); await espera(100);
    assert.equal(rows().length, 2);
    assert.equal(button("ver qué trae"), undefined);
    assert.equal(button("Cambiar acceso").getAttribute("aria-expanded"), "true");
    button("Usar en este workspace").click(); await espera(100);
    assert.deepEqual(selected.map(({ key }) => key), ["acme", "other"]);
    button("Listo").click(); await espera(100);
    assert.equal(rows().length, 0, "Listo oculta el selector");
    assert.equal(button("Cambiar acceso").getAttribute("aria-expanded"), "false");
    assert.ok(app.w.document.body.textContent.includes("acme y other"));
    assert.equal(button("Ver repositorios"), undefined);
    assert.equal(button("ver qué trae"), undefined);
    assert.equal(app.commands.includes("git_host_projects"), false, "Configuración no consulta repositorios");
    assert.equal(app.commands.includes("attach_repo"), false, "las fuentes se agregan desde el compositor");
    button("Cambiar acceso").click(); await espera(100);
    button("Quitar del workspace").click(); await espera(100);
    button("Listo").click(); await espera(100);
    assert.deepEqual(selected.map(({ key }) => key), ["other"]);
    assert.equal(rows().length, 0);
    assert.equal(loginCount, 0);
    assert.deepEqual(opens, []);
    await action("Desconectar");
    assert.equal(connected, false);
    assert.ok(button("Conectar con GitHub"));
    assert.deepEqual(app.failures, []);
    console.log("PASS connected-workspace: resumen, edición y administración sin explorar repositorios");
    continue;
  }
  assert.ok(button("Conectar con GitHub"));
  button("Conectar con GitHub").click(); await espera(150);
  if (scenario === "cancel-login") {
    button("cancelar").click(); await espera(100);
    assert.equal(connected, false);
    assert.deepEqual(opens, ["https://github.com/login/device"]);
  } else {
    assert.ok(opens.includes(install), "todo primer login abre el selector oficial");
    assert.ok(button("Actualizar acceso"));
    button("cancelar").click(); await espera(100);
    assert.equal(connected, true);
    assert.equal(selected.length, 0);
    assert.ok(app.w.document.body.textContent.includes("Sin acceso seleccionado"));
    assert.equal(button("Usar en este workspace"), undefined);
    assert.equal(button("Administrar permisos en GitHub"), undefined);
    await action("Administrar permisos en GitHub");
    assert.equal(loginCount, 1, "configurar no repite login");
    available = [{ key: "acme", name: "acme" }, { key: "other", name: "other" }];
    app.w.dispatchEvent(new app.w.Event("focus")); await espera(100);
    assert.equal(button("Actualizar acceso"), undefined);
    assert.equal(selected.length, 0, "volver no incorpora organizaciones");
    assert.equal(app.w.document.body.textContent.includes("Acceso: todos los repositorios"), false, "sin cuenta elegida no se promete acceso");
    button("Usar en este workspace").click(); await espera(100);
    assert.equal(selected.length, 1);
    assert.equal(button("Confirmar repositorios disponibles"), undefined, "no hay paso de confirmación de repositorios");
    button("Listo").click(); await espera(100);
    assert.deepEqual(selected.map(({ key }) => key), ["acme"]);
    assert.equal(button("Usar en este workspace"), undefined, "Listo oculta las opciones disponibles");
    assert.ok(app.w.document.body.textContent.includes("Acceso: todos los repositorios que tu GitHub permite"));
  }
  assert.deepEqual(app.failures, []);
  console.log(`PASS ${scenario}: selector, regreso, cancelación y acceso heredado sin confirmar`);
}
for (const scenario of ["absent", "incompatible", "unknown"]) {
  let supported = false;
  let failInstall = true;
  let installCount = 0;
  const app = await arrancar("listo", `github-cli-${scenario}`, { ...base,
    check_environment: () => ({ ready: true, blocked: false, reason: null, items: [],
      ...(scenario === "unknown" ? {} : { githubCli: { available: scenario !== "absent" || supported,
        version: scenario === "absent" && !supported ? null : "gh version fixture",
        managed_supported: supported, installable: true } }) }),
    list_git_hosts: [{ id: "github", name: "GitHub", fields: [], browser_login: true,
      select_area: true, setup_url: install, token_label: "Token", token_help: "", token_url: "",
      login_help: "", area_label: "cuenta", areas_label: "cuentas", area_help: "", connected: null, unverified: null }],
    install_gh: () => { installCount++; if (failInstall) throw { what: "No se pudo descargar gh", detail: "fixture" }; supported = true; },
  });
  const button = text => [...app.w.document.querySelectorAll("button")].find(el => el.textContent?.trim() === text || el.getAttribute("aria-label") === text);
  button("Configuración").click(); await espera(100);
  app.w.document.querySelector("#cfg-tab-projects").click(); await espera(50);
  button("Control de Fuentes").click(); await espera(100);
  const tools = [...app.w.document.querySelectorAll("details")].find(el => el.querySelector("summary")?.textContent.startsWith("Herramientas para agentes"));
  const summary = tools.querySelector("summary");
  assert.equal(tools.open, false);
  assert.equal(summary.textContent.includes("Requiere atención"), scenario === "incompatible", "la ausencia opcional no dispara alertas");
  summary.click(); await espera(30);
  assert.equal(tools.open, true);
  if (scenario === "unknown") {
    assert.ok(tools.textContent.includes("Estado no disponible"));
  } else {
    button("Descargar gh compatible").click(); await espera(100);
    summary.click(); await espera(30);
    assert.equal(tools.open, false);
    const error = [...app.w.document.querySelectorAll("span")].find(el => el.textContent === "No se pudo descargar gh");
    assert.ok(error);
    assert.equal(error.closest("details"), null, "el error se ve aunque las herramientas estén plegadas");
    assert.ok(summary.textContent.includes("Requiere atención"));
    summary.click(); await espera(30);
    failInstall = false;
    button("Descargar gh compatible").click(); await espera(100);
    assert.equal(installCount, 2);
    assert.equal(summary.textContent.includes("Requiere atención"), false);
    assert.equal(button("Descargar gh compatible"), undefined);
    assert.ok(tools.textContent.includes("Compatible"));
    assert.equal(app.w.document.body.textContent.includes("No se pudo descargar gh"), false);
  }
  assert.deepEqual(app.failures, []);
  console.log(`PASS github-cli-${scenario}: herramientas plegadas y estado visible`);
}
process.exit(0);
