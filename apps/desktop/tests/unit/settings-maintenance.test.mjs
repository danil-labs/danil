import assert from "node:assert/strict";
import test from "node:test";
import { sleep } from "../helpers/jsdom-app.mjs";
import { boot, RESPONSES } from "../helpers/mount-guard.mjs";

test("Settings › Maintenance renders in the rail footer with Desk updater and App/Engine versions", async () => {
  let installed = 0;
  let restarted = 0;
  const app = await boot("listo", "settings-maintenance-desk", {
    ...RESPONSES,
    "plugin:app|version": "0.3.5",
    "plugin:updater|check": {
      rid: 1,
      currentVersion: "0.3.5",
      version: "0.3.6",
      body: "Correcciones generales.",
      rawJson: { notes_by_locale: { es: "Mejoras en mantenimiento." } },
    },
    update_install: () => {
      installed += 1;
      return null;
    },
    restart_app: () => {
      restarted += 1;
      return null;
    },
    list_workspaces: {
      ...RESPONSES.list_workspaces,
      machine_resources: {
        measured_at: 1,
        storage: [],
        engine: { version: "0.3.5", build: "45867e9deadbeef" },
      },
    },
  });

  try {
    const { document } = app.w;
    document.querySelector('button[aria-label="Configuración"]')?.click();
    await sleep(150);

    const footer = document.querySelector("[data-settings-footer]");
    assert.ok(footer, "Maintenance lives in the separated footer of the Settings rail");
    const maintenanceTab = footer.querySelector("#cfg-tab-maintenance");
    assert.ok(maintenanceTab, "Maintenance tab is rendered in the Settings rail footer");
    assert.equal(maintenanceTab.textContent?.trim(), "Mantenimiento");

    maintenanceTab.click();
    await sleep(250);

    const panel = document.querySelector("[data-settings-maintenance]");
    assert.ok(panel, "Maintenance panel mounts when selected");
    assert.equal(document.querySelector("#cfg-panel h2")?.textContent?.trim(), "Mantenimiento");
    assert.ok(!panel.textContent?.includes("independientemente del workspace seleccionado arriba"), "no forbidden disclaimer");
    assert.equal(panel.querySelector("[data-app-downloads]"), null, "Desk does not render web AppDownloads");

    const appRow = panel.querySelector("[data-maintenance-app-version]");
    const engineRow = panel.querySelector("[data-maintenance-engine-version]");
    assert.ok(appRow?.textContent?.includes("Danil v0.3.5"), `app version shown: ${appRow?.textContent}`);
    assert.ok(engineRow?.textContent?.includes("v0.3.5 · 45867e9"), `engine version shown: ${engineRow?.textContent}`);

    const updatesSection = panel.querySelector("[data-maintenance-updates]");
    assert.ok(updatesSection?.textContent?.includes("v0.3.6"), `available update shown: ${updatesSection?.textContent}`);
    assert.ok(updatesSection?.textContent?.includes("Mejoras en mantenimiento."), "localized release notes shown");

    const installBtn = [...updatesSection.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Actualizar");
    assert.ok(installBtn, "Install update button is available");
    installBtn.click();
    await sleep(200);
    assert.equal(installed, 1, "clicking Update invokes update_install");

    const restartBtn = [...updatesSection.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Reiniciar ahora");
    assert.ok(restartBtn, "Restart button appears once update is installed");
    restartBtn.click();
    await sleep(50);
    assert.equal(restarted, 1, "clicking Restart invokes restart_app");
  } finally {
    app.w.close();
  }
});

test("Settings › Maintenance degrades cleanly when engine version is unavailable and updater fails", async () => {
  const app = await boot("listo", "settings-maintenance-offline", {
    ...RESPONSES,
    "plugin:app|version": "0.3.5",
    "plugin:updater|check": () => {
      throw new Error("network unreachable");
    },
    check_environment: () => {
      throw new Error("offline");
    },
  });

  try {
    const { document } = app.w;
    app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "download" }));
    await sleep(250);

    const panel = document.querySelector("[data-settings-maintenance]");
    assert.ok(panel, "opening legacy 'download' id lands on Maintenance");
    assert.ok(panel.textContent?.includes("No pude comprobar si hay una versión nueva."), "unreachable state shown");
    assert.ok(panel.textContent?.includes("network unreachable"), "raw failure detail kept collapsible");
    const engineRow = panel.querySelector("[data-maintenance-engine-version]");
    assert.ok(engineRow?.textContent?.includes("No disponible"), `unavailable engine degrades cleanly: ${engineRow?.textContent}`);
  } finally {
    app.w.close();
  }
});
