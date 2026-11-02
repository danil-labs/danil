/**
 * With the computer off, the relay answers reads from its own copy with a
 * `cached` mark: the panel fills in from it, says how old it is, and nothing
 * wakes the computer. Mounts `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { relay } from "../helpers/fake-relay.mjs";
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

test("reads the relay kept show with their age while the computer is off", async () => {
  const fake = relay({ state: "offline", cachedAt: "2026-10-18T21:30:00Z" });
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (!url.startsWith(API)) return own(input, init);
    return new Response(JSON.stringify([{ computer_id: "cmp_a", name: "Casa", state: "offline" }]), { status: 200 });
  };
  let w;
  const app = await boot("listo", "web-cached", {}, undefined, { "sb-supabase-auth-token": session }, {
    web: true,
    beforeImport: (win) => {
      w = win;
      globalThis.WebSocket = fake.Socket;
      win.terminusWeb = { supabaseUrl: SUPABASE, supabaseKey: "public-anon-key" };
    },
  });
  const text = () => w.document.body.textContent ?? "";
  try {
    await sleep(2000);
    assert.ok(text().includes("Tarea t1"), "the relay's copy fills the panel");
    assert.ok(w.document.querySelector("[data-web-sync]")?.title.includes("Última sincronización"), "with its age");
    assert.ok(!fake.calls.some((c) => c.command === "send_message"));
    assert.equal(fake.sockets.length, 1);
    fake.setState("online");
    await sleep(300);
    assert.ok(!w.document.querySelector("[data-web-sync]")?.title, "the age leaves once the computer is on");
    assert.deepEqual(app.failures, []);
  } finally {
    globalThis.fetch = own;
  }
});
