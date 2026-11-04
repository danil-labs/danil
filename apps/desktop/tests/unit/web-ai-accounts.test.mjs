/**
 * Configuración › Cuentas de IA en la web, por el relay, con una VM que trae los
 * agentes y ninguna cuenta: se ven los agentes y «Agregar cuenta». Monta `dist-web/`.
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
const AGENTS = [
  ["claude", "Claude Code"], ["codex", "Codex"], ["antigravity", "Antigravity"], ["grok", "Grok"],
].map(([id, label]) => ({ id, label, available: true, driver: true }));

test("the web lists the VM's agents and offers to add an account through the relay", async () => {
  const table = {
    ...engine,
    list_providers: AGENTS,
    list_surfaces: AGENTS.map((a) => ({ id: a.id, provider: a.id, label: a.label, catalogo: "todo", usable: false, marca: "sin cuenta", porque: null })),
    list_accounts: { accounts: [], active: null },
  };
  const fake = relay({ table });
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (!url.startsWith(API)) return own(input, init);
    return new Response(JSON.stringify([{ computer_id: "cmp_a", name: "Prueba Danil Business", state: "online", provider: "aws-ec2", workspaces: ["w"] }]), { status: 200 });
  };
  let w;
  const app = await boot("listo", "web-ai-accounts", {}, undefined, { "sb-supabase-auth-token": session }, {
    web: true,
    beforeImport: (win) => {
      w = win;
      globalThis.WebSocket = fake.Socket;
      win.terminusWeb = { supabaseUrl: SUPABASE, supabaseKey: "public-anon-key" };
    },
  });
  try {
    await sleep(1500);
    w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "proveedores-ia" }));
    await sleep(2000);
    const panel = w.document.querySelector("#cfg-panel");
    const text = panel?.textContent ?? "";
    for (const name of ["Claude Code", "Codex", "Antigravity", "Grok"]) assert.ok(text.includes(name), name);
    assert.equal(panel.querySelectorAll("button").length > 4, true, "each agent has its actions");
    assert.ok(text.includes("Agregar cuenta"));
    assert.deepEqual(app.failures, []);
  } finally {
    globalThis.fetch = own;
  }
});
