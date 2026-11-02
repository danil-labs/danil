/**
 * Las máquinas de la organización salen en «Ejecutar en», con su estado y el
 * encendido, y no se pueden elegir como destino de una tarea. Escritorio y web.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { HOME, localNewTask, open as openDesktop, until } from "../helpers/desktop-account.mjs";
import { sleep } from "../helpers/jsdom-app.mjs";
import { VM, open as openWeb, table } from "../helpers/web-machines.mjs";

const verify = () => ({
  computer_id: "cmp_verify",
  name: "vm-verify",
  organization_id: "org_danil",
  purpose: "resource",
  access: "service",
  can_stop: false,
  power: "stopped",
});

async function openMenu(doc) {
  assert.ok(await until(() => doc.querySelector('[aria-label="Ejecutar en"]')), "the machine menu is in the toolbar");
  doc.querySelector('[aria-label="Ejecutar en"]').click();
  assert.ok(await until(() => doc.querySelector('[data-shared-machine="cmp_verify"]')), "vm-verify is listed with the shared machines");
}

test("en el escritorio vm-verify se enciende desde el menú y no es destino de tareas", async () => {
  const shared = [verify()];
  const { app, doc, invoke } = await openDesktop("desktop-shared-machines", { computers: [HOME], shared });
  localNewTask(doc).click();
  await openMenu(doc);
  const row = doc.querySelector('[data-shared-machine="cmp_verify"]');
  assert.equal(row.getAttribute("data-shared-power"), "stopped");
  assert.ok(row.textContent.includes("vm-verify"));
  assert.ok(row.textContent.includes("apagada"));
  assert.ok(doc.querySelector("[data-shared-section]")?.textContent.includes("No corren tareas"));
  assert.equal(doc.querySelector('[data-machine-option="cmp_verify"]'), null);
  assert.equal(row.querySelector("[data-machine-form]")?.getAttribute("data-machine-form"), "vm");
  const trigger = doc.querySelector('[aria-label="Ejecutar en"]').textContent;
  row.click();
  assert.equal(doc.querySelector('[aria-label="Ejecutar en"]').textContent, trigger, "clicking the shared row does not choose it");
  doc.querySelector('[data-shared-start="cmp_verify"]').click();
  assert.ok(await until(() => doc.querySelector('[data-shared-machine="cmp_verify"]')?.getAttribute("data-shared-power") === "starting"));
  assert.equal(doc.querySelector('[data-shared-start="cmp_verify"]'), null, "a machine that is starting is not offered start again");
  assert.equal((await invoke("machine_list")).some((machine) => machine.id === "cmp_verify"), false);
  assert.ok(!doc.querySelector('[aria-label="Ejecutar en"]').textContent.includes("vm-verify"));
  assert.deepEqual(app.failures, []);
});

test("en el escritorio, sin licencia, encender vm-verify se niega y sigue apagada", async () => {
  const { app, doc } = await openDesktop("desktop-shared-license", {
    computers: [HOME],
    shared: [verify()],
    sharedStart: { status: 403, body: { error: "license_required" } },
  });
  localNewTask(doc).click();
  await openMenu(doc);
  doc.querySelector('[data-shared-start="cmp_verify"]').click();
  assert.ok(await until(() => doc.querySelector("[data-shared-notice]")?.textContent.includes("licencia")));
  assert.equal(doc.querySelector('[data-shared-machine="cmp_verify"]').getAttribute("data-shared-power"), "stopped");
  assert.ok(doc.querySelector('[data-shared-start="cmp_verify"]'));
  assert.deepEqual(app.failures, []);
});

test("en la web vm-verify se enciende desde el menú y no es destino de tareas", async () => {
  const shared = [verify()];
  const { app, doc, invoke } = await openWeb("web-shared-machines", [VM], {
    cmp_vm: { table: table("Panel", "Tarea de la VM") },
  }, undefined, { shared });
  await openMenu(doc);
  const row = doc.querySelector('[data-shared-machine="cmp_verify"]');
  assert.equal(row.getAttribute("data-shared-power"), "stopped");
  assert.ok(row.textContent.includes("apagada"));
  assert.equal(doc.querySelector('[data-machine-option="cmp_verify"]'), null);
  assert.equal(doc.querySelector('[data-machine-option="cmp_vm"]')?.disabled, false, "the personal machine stays a task target");
  doc.querySelector('[data-shared-start="cmp_verify"]').click();
  assert.ok(await until(() => doc.querySelector('[data-shared-machine="cmp_verify"]')?.getAttribute("data-shared-power") === "starting"));
  assert.equal((await invoke("machine_list")).some((machine) => machine.id === "cmp_verify"), false);
  assert.ok(!doc.querySelector('[aria-label="Ejecutar en"]').textContent.includes("vm-verify"));
  assert.deepEqual(app.failures, []);
  await sleep(50);
});