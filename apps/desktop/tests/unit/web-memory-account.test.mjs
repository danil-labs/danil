/**
 * En la web la memoria es la de la cuenta (`/v1/workspaces/:id/memory/*` del
 * Worker): se ve, se edita y se lee su historial con TODAS las máquinas
 * apagadas, y nada pasa por el relay. Editar sobre una versión que cambió deja la
 * copia del conflicto visible; un borrado contra otra versión no borra (409) y
 * una memoria ocupada (503) lo dice. Monta `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { fakeMemoryWorker, oidOf } from "../helpers/fake-memory-worker.mjs";
import { engine, fleet } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const REGISTRY = [
  {
    id: "w1",
    name: "Producto",
    radiant_workspace_id: null,
    settings: { lengua: null, lengua_de_salida: null, default_permission_mode: null, terminal_theme: null },
    settings_version: 1,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    projects: [{ id: "p1", name: "terminus", remote_url: "https://github.com/ana/app", default_branch: "main", home_computer_id: "cmp_vm" }],
    computers: ["cmp_vm"],
  },
];
const VM = { computer_id: "cmp_vm", name: "Danil VM", state: "stopped", provider: "aws-ec2", workspaces: ["w1"] };

const DEPLOY = "projects/p1/memory/deploy.md";
const entry = (body, type = "decision") => `---\ntype: ${type}\nmodified: 2026-10-2${body.length % 9}T00:00:00Z\norigin:\n  workspace: w1\n  project: p1\n---\n\n${body}\n`;

const buttons = (root, label) => [...root.querySelectorAll("button")].filter((b) => b.textContent.trim() === label);
const memory = (w) => [...w.document.querySelectorAll("section")].find((s) => s.querySelector('[aria-label="Alcance de la memoria"]'));
function type(w, el, value) {
  el.value = value;
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
}

test("la memoria de la cuenta se ve, se edita y tiene historial con las máquinas apagadas", async () => {
  const worker = fakeMemoryWorker({ workspace: "w1", token: "tok" });
  try {
    worker.push(DEPLOY, entry("Desplegar con pnpm"), { name: "Claude", email: "agent@vm" });
    const base = oidOf(entry("Desplegar con pnpm"));
    // Una VM empuja otra versión mientras la web tiene abierta la vieja.
    worker.push("memory/regla.md", entry("Una regla del workspace", "regla"), { name: "Claude", email: "agent@vm" });

    const vm = { ...engine, list_workspaces: { workspaces: [{ id: "w1", name: "Producto", context_root: null }], active: "w1" } };
    const f = fleet({ cmp_vm: { table: vm, state: "offline" } });
    const app = await boot("listo", "web-memory-account", {}, undefined, {}, {
      web: true,
      workspaces: REGISTRY,
      beforeImport: (w) => {
        globalThis.WebSocket = f.Socket;
        w.terminusWeb = { endpoint: "https://computers.danil.ai", computers: [VM], getToken: async () => "tok" };
      },
    });
    const { w } = app;
    await sleep(2500);
    w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "proyectos" }));
    await sleep(900);
    const actions = w.document.querySelector('[aria-label="Acciones de «terminus»"]');
    assert.ok(actions, w.document.body.textContent.slice(0, 500));
    actions.click();
    await sleep(300);
    [...w.document.querySelectorAll("[role=menuitem]")].find((b) => b.textContent.trim() === "Material que lee").click();
    await sleep(1500);

    const section = memory(w);
    assert.ok(section, "the project view shows its memory");
    assert.ok(section.textContent.includes("Desplegar con pnpm"), section.textContent);
    assert.equal(f.relays.cmp_vm.calls.filter((c) => /memory/.test(c.command)).length, 0, "nothing about memory goes through the relay");

    // Editar mientras otra máquina ya cambió la entrada: gana la web y la versión pisada queda como copia.
    worker.push(DEPLOY, entry("Desplegar con wrangler"), { name: "Mac de Ana", email: "ana@mac" });
    buttons(section, "Editar")[0].click();
    await sleep(300);
    const dialog = w.document.querySelector("[role=dialog]");
    type(w, dialog.querySelector("textarea"), "Desplegar con wrangler y --env staging");
    await sleep(50);
    buttons(dialog, "Guardar")[0].click();
    await sleep(1200);
    const put = worker.requests.find((r) => r.method === "PUT");
    assert.equal(put.body.path, DEPLOY);
    assert.equal(put.body.base, base, "the edit says which version it started from");
    assert.match(put.body.content, /^---\ntype: decision\nmodified: .+\norigin:\n {2}workspace: w1\n {2}project: p1\n---\n\nDesplegar con wrangler y --env staging\n$/);
    assert.ok(section.querySelector("[data-memory-notice]")?.textContent.includes("deploy.conflicto-mac-de-ana.md"), section.textContent);
    assert.ok(section.querySelector("[data-memory-conflict-copy]"), "the conflict copy is in the list, marked");
    assert.ok(section.querySelector("[data-memory-conflicts]"));
    assert.equal(worker.files().get("projects/p1/memory/deploy.conflicto-mac-de-ana.md"), entry("Desplegar con wrangler"));

    // Historial de la entrada: tres versiones, y la primera se puede leer.
    const deployItem = [...section.querySelectorAll("li")].find((li) => li.textContent.includes("deploy.md") && !li.textContent.includes("conflicto"));
    buttons(deployItem, "Historial")[0].click();
    await sleep(600);
    const history = w.document.querySelector("[data-memory-history]");
    const versions = [...history.querySelectorAll("[data-memory-version]")];
    assert.equal(versions.length, 3, history.textContent);
    assert.ok(versions[0].textContent.includes("Ana"));
    buttons(versions[2], "Ver esta versión")[0].click();
    await sleep(400);
    assert.equal(versions[2].querySelector("[data-memory-version-text]")?.textContent.trim(), "Desplegar con pnpm");
    buttons(history, "Cerrar")[0].click();
    await sleep(300);

    // Un borrado contra una versión que cambió no borra: 409 y aviso.
    worker.push(DEPLOY, entry("Otra máquina lo cambió"), { name: "Danil VM", email: "vm@vm" });
    const confirmBefore = w.confirm;
    w.confirm = () => true;
    globalThis.confirm = () => true;
    const deleteButton = buttons([...section.querySelectorAll("li")].find((li) => li.textContent.includes("Desplegar con wrangler y --env staging")), "Borrar")[0];
    deleteButton.click();
    await sleep(1200);
    assert.ok(worker.requests.some((r) => r.method === "DELETE"), "the delete went to the Worker");
    assert.ok(worker.files().has(DEPLOY), "a changed entry is never deleted");
    assert.ok(section.querySelector("[data-memory-notice]")?.textContent.includes("cambió mientras la tenías abierta"), section.textContent);
    w.confirm = confirmBefore;

    // Memoria ocupada (503): se dice, no se pierde lo escrito.
    worker.setBusy(true);
    buttons(section, "Escribir a mano")[0].click();
    await sleep(300);
    const form = w.document.querySelector("[role=dialog]");
    type(w, form.querySelector('input[placeholder="nombre-de-archivo.md"]'), "nueva");
    type(w, form.querySelector("textarea"), "Una idea nueva");
    await sleep(50);
    buttons(form, "Guardar")[0].click();
    await sleep(800);
    assert.ok(w.document.querySelector("[role=dialog]")?.textContent.includes("ocupada"), "busy is said in the form");
    worker.setBusy(false);
    buttons(w.document.querySelector("[role=dialog]"), "Guardar")[0].click();
    await sleep(1200);
    assert.ok(worker.files().has("projects/p1/memory/nueva.md"), "the retry writes it, with .md");
  } finally {
    worker.restore();
  }
});
