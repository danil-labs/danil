/**
 * En la ventana, la memoria se lee del motor local y el historial de cada entrada
 * sale de la cuenta de Danil del workspace (`GET …/memory/history|file` con el
 * token de cliente de ESA cuenta): versiones con autor y fecha, y una versión
 * vieja se puede ver. Una copia `.conflicto-*` que dejó una edición simultánea
 * se marca y se avisa. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { fakeMemoryWorker } from "../helpers/fake-memory-worker.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const W = { id: "w1", name: "Danil", context_root: null };
const P = { id: "p1", name: "terminus", node: null, sources: [], working_directory: "/tmp/terminus", created_at: 1, updated_at: 1, sessions: 0, kind: "folder" };
const ORIGIN = { workspace: "w1", project: "p1", task: null, provider: null, handler: null, branch: null, commit: null };
const entry = (file, text) => ({ file, type: "decision", modified: "2026-10-21T00:00:00Z", origin: ORIGIN, text, in_index: true });

function engine() {
  const calls = [];
  const record = (command, reply) => (args) => {
    calls.push({ command, args });
    return reply(args ?? {});
  };
  return {
    calls,
    table: {
      window_ready: null,
      window_vitals: null,
      setup_required: false,
      list_providers: [],
      list_projects: [P],
      list_sources: [],
      list_live_sessions: [],
      list_live_turns: [],
      list_surfaces: [],
      set_active_workspace: null,
      service_poll: { cursor: 0, gap: false, replay: false, runtime: "test-service", reset: false },
      list_workspaces: { workspaces: [W], active: "w1" },
      workspaces_startup: { workspaces: [W], active: "w1" },
      list_memory_entries: record("list_memory_entries", () => ({
        entries: [entry("deploy.md", "Desplegar con wrangler"), entry("deploy.conflicto-mac-de-ana.md", "Desplegar a mano")],
        total: 2,
        index: { lines: 2, bytes: 80, line_limit: 200, byte_limit: 8192 },
      })),
      danil_workspace_account: record("danil_workspace_account", () => ({ account: "u_ana", email: "ana@danil.ai", signed_in: true, linked: true })),
      account_relay_token: record("account_relay_token", () => ({ token: "client-tok", expires_at: Date.now() + 3_600_000, endpoint: "https://computers.danil.ai", computer_id: "cmp_mac" })),
    },
  };
}

const buttons = (root, label) => [...root.querySelectorAll("button")].filter((b) => b.textContent.trim() === label);
const memory = (w) => [...w.document.querySelectorAll("section")].find((s) => s.querySelector('[aria-label="Alcance de la memoria"]'));

async function openMemory(w) {
  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "proyectos" }));
  await sleep(900);
  w.document.querySelector('[aria-label="Acciones de «terminus»"]').click();
  await sleep(300);
  [...w.document.querySelectorAll("[role=menuitem]")].find((b) => b.textContent.trim() === "Material que lee").click();
  await sleep(1200);
  return memory(w);
}

test("la ventana muestra el historial de la cuenta y marca las copias de conflicto", async () => {
  const worker = fakeMemoryWorker({ workspace: "w1", token: "client-tok" });
  try {
    worker.push("projects/p1/memory/deploy.md", "---\ntype: decision\nmodified: 2026-10-19T00:00:00Z\n---\n\nDesplegar con pnpm\n", { name: "Claude", email: "agent@mac" });
    worker.push("projects/p1/memory/deploy.md", "---\ntype: decision\nmodified: 2026-10-21T00:00:00Z\n---\n\nDesplegar con wrangler\n", { name: "Ana López", email: "ana@danil.ai" });
    const e = engine();
    const { w } = await boot("listo", "memory-history-window", e.table);
    await sleep(900);
    const section = await openMemory(w);
    assert.ok(section, "the project view shows its memory");

    // La copia que dejó un conflicto: marcada en su entrada y avisada arriba.
    assert.ok(section.querySelector("[data-memory-conflict-copy]")?.textContent.includes("deploy.md"), section.textContent);
    assert.ok(section.querySelector("[data-memory-conflicts]"), "the conflict copies are announced");

    // El token se pidió para la cuenta del workspace abierto (la lectura del montaje va sin workspace).
    assert.ok(e.calls.some((c) => c.command === "danil_workspace_account" && c.args?.workspace === "w1"), "the workspace account is read with its workspace");
    assert.deepEqual(e.calls.find((c) => c.command === "account_relay_token")?.args, { account: "u_ana" });

    const history = buttons(section, "Historial");
    assert.equal(history.length, 2, "each entry offers its history");
    history[0].click();
    await sleep(600);
    const dialog = w.document.querySelector("[data-memory-history]");
    assert.ok(dialog, "the history opens");
    const versions = [...dialog.querySelectorAll("[data-memory-version]")];
    assert.equal(versions.length, 2, dialog.textContent);
    assert.ok(versions[0].textContent.includes("Ana López") && versions[0].textContent.includes("Actual"), versions[0].textContent);
    assert.ok(versions[1].textContent.includes("Claude"));
    assert.ok(worker.requests.some((r) => r.path.startsWith("/v1/workspaces/w1/memory/history?path=projects%2Fp1%2Fmemory%2Fdeploy.md") && r.auth === "Bearer client-tok"));

    buttons(versions[1], "Ver esta versión")[0].click();
    await sleep(400);
    assert.equal(versions[1].querySelector("[data-memory-version-text]")?.textContent.trim(), "Desplegar con pnpm", "an old version can be read");
    // La memoria sigue saliendo del motor local: el Worker solo da el historial.
    assert.ok(e.calls.some((c) => c.command === "list_memory_entries"));
    assert.ok(!worker.requests.some((r) => r.method !== "GET"), "the window never writes through the Worker");
  } finally {
    worker.restore();
  }
});

test("sin cuenta de Danil en el workspace no hay historial, y la memoria local sigue", async () => {
  const e = engine();
  e.table.danil_workspace_account = () => ({ account: null, signed_in: false, linked: false });
  const { w } = await boot("listo", "memory-history-window-sin-cuenta", e.table);
  await sleep(900);
  const section = await openMemory(w);
  assert.ok(section.textContent.includes("Desplegar con wrangler"));
  assert.equal(buttons(section, "Historial").length, 0);
});
