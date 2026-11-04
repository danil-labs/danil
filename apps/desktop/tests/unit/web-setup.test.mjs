/**
 * The browser never waits for a computer to prepare: no installer, no
 * «preparing» or «connecting» screen, the app at once, even when a machine
 * would say it is still preparing. Mounts `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { engine, relay } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const SUPABASE = "https://supabase.test";
const API = "https://machines.danil.ai/v1/computers";
const session = JSON.stringify({
  access_token: "stored",
  refresh_token: "r",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "u1", aud: "authenticated", role: "authenticated", email: "persona@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
});

test("the app opens at once, never the installer nor a preparation screen", async () => {
  const fake = relay();
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (!url.startsWith(API)) return own(input, init);
    return new Response(JSON.stringify([{ computer_id: "cmp_a", name: "Casa", state: "online" }]), { status: 200 });
  };
  engine.setup_required = true;
  engine.prepare_runtime = { running: true, stages: [{ name: "platform", essential: true, state: "succeeded" }, { name: "work-tools", essential: true, state: "running" }] };

  let w;
  const app = await boot("listo", "web-setup", {}, undefined, { "sb-supabase-auth-token": session }, {
    web: true,
    beforeImport: (win) => {
      w = win;
      globalThis.WebSocket = fake.Socket;
      win.terminusWeb = { supabaseUrl: SUPABASE, supabaseKey: "public-anon-key" };
    },
  });
  const text = () => w.document.body.textContent ?? "";
  try {
    await sleep(1000);
    assert.equal(fake.sockets.length, 1, "the only computer opens");
    assert.ok(text().includes("Tarea t1"), "the app is already there");
    assert.ok(!/Preparando tu computadora|Conectando con tu computadora|Connecting to your computer/.test(text()), "no waiting screen");
    assert.ok(!text().includes("Preparando Danil"), "never the installer");
    assert.ok(!fake.calls.some((c) => ["check_environment", "prepare_runtime", "setup_required"].includes(c.command)), "nor its checks");
    assert.deepEqual(app.failures, []);
  } finally {
    globalThis.fetch = own;
    engine.setup_required = false;
    delete engine.prepare_runtime;
  }
});
