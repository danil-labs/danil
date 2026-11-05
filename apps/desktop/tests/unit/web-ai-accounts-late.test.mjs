/**
 * Configuración › Cuentas de IA en la web abierta mientras la VM todavía no
 * contesta: el panel no queda en blanco y se llena cuando contesta. Monta `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { engine, relay } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const SUPABASE = "https://supabase.test";
const API = "https://machines.danil.ai/v1/computers";
const session = JSON.stringify({
  access_token: "stored", refresh_token: "r", token_type: "bearer", expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "u1", aud: "authenticated", role: "authenticated", email: "persona@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
});
async function openWeb(name, fake) {
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (!url.startsWith(API)) return own(input, init);
    if (init?.method === "POST") return new Response(JSON.stringify({ state: "starting" }), { status: 202 });
    return new Response(JSON.stringify([{ computer_id: "cmp_a", name: "Prueba Danil Business", state: "online", provider: "aws-ec2", workspaces: ["w"] }]), { status: 200 });
  };
  let w;
  const app = await boot("listo", name, {}, undefined, { "sb-supabase-auth-token": session }, {
    web: true,
    beforeImport: (win) => {
      w = win;
      globalThis.WebSocket = fake.Socket;
      win.terminusWeb = { supabaseUrl: SUPABASE, supabaseKey: "public-anon-key" };
    },
  });
  return { app, w, restore: () => { globalThis.fetch = own; } };
}

const AGENTS = [
  ["claude", "Claude Code"], ["codex", "Codex"], ["antigravity", "Antigravity"], ["grok", "Grok"],
].map(([id, label]) => ({ id, label, available: true, driver: true }));

test("opened while the VM is starting, the panel says «Encendiendo…» and fills in once it is online", async () => {
  const table = {
    ...engine,
    list_providers: AGENTS,
    list_surfaces: AGENTS.map((a) => ({ id: a.id, provider: a.id, label: a.label, catalogo: "todo", usable: false, marca: "sin cuenta", porque: null })),
    list_accounts: { accounts: [], active: null },
  };
  const fake = relay({ table, state: "starting", wakeAfter: 60_000 });
  const { app, w, restore } = await openWeb("web-ai-accounts-late", fake);
  try {
    await sleep(1500);
    w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "proveedores-ia" }));
    await sleep(1500);
    const panel = () => w.document.querySelector("#cfg-panel");
    const text = () => panel()?.textContent ?? "";
    assert.ok(panel().querySelector("[data-ai-providers]"), `never blank: ${text().slice(0, 200)}`);
    assert.ok(text().includes("Encendiendo Prueba Danil Business…") || text().includes("Cargando…"), text().slice(0, 300));
    assert.ok(!text().includes("Verifica que Danil esté abierto"), "not the own-computer notice");
    fake.setState("online");
    await sleep(3000);
    for (const name of ["Claude Code", "Grok"]) assert.ok(text().includes(name), `${name}: ${text().slice(0, 300)}`);
    assert.ok(text().includes("Agregar cuenta"));
    assert.deepEqual(app.failures, []);
  } finally {
    restore();
  }
});
