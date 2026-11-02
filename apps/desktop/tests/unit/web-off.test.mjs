/**
 * Opening Terminus in the browser on a computer that is off: the panel mounts
 * without starting it or waiting for it, reads say it is off without an error
 * notice, and the first message wakes it through the relay; once on, the panel
 * reads again. Mounts `dist-web/`.
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

test("an off computer mounts as it is and wakes with the first message", async () => {
  const fake = relay({ state: "offline" });
  engine.send_message = { session: "t1" };
  const posts = [];
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (!url.startsWith(API)) return own(input, init);
    if (init?.method === "POST") posts.push(url);
    return new Response(JSON.stringify([{ computer_id: "cmp_a", name: "Casa", state: "offline" }]), { status: 200 });
  };
  let w;
  const app = await boot("listo", "web-off", {}, undefined, { "sb-supabase-auth-token": session }, {
    web: true,
    beforeImport: (win) => {
      w = win;
      globalThis.WebSocket = fake.Socket;
      win.terminusWeb = { supabaseUrl: SUPABASE, supabaseKey: "public-anon-key" };
    },
  });
  const text = () => w.document.body.textContent ?? "";
  try {
    await sleep(6000);
    assert.deepEqual(posts, [], "opening does not start the computer");
    assert.equal(fake.sockets.length, 1, "the panel mounts against the off computer");
    assert.equal(w.document.querySelector("[data-web-sync]")?.dataset.state, "offline", "the indicator shows it off");
    assert.ok(!text().includes("La máquina de este host está apagada"), "no error notice");
    assert.ok(!text().includes("Algo se rompió"), "no generic failure");
    assert.ok(!text().includes("Preparando Danil"), "no installer");
    assert.ok(!fake.calls.some((c) => c.command === "prepare_runtime"));

    const before = fake.calls.filter((c) => c.command === "list_projects").length;
    const sent = w.__TAURI_INTERNALS__.invoke("send_message", { session: "t1", text: "hola" });
    assert.deepEqual(await sent, { session: "cmp_a~t1" }, "an intent reaches the relay, which wakes the computer; its ids keep their machine");
    await sleep(6000);
    assert.ok(fake.calls.filter((c) => c.command === "list_projects").length > before, "waiting reads go out once it is on");
    assert.ok(text().includes("Tarea t1"), "and the panel fills in");
    assert.equal(w.document.querySelector("[data-web-sync]")?.dataset.state, "online", "the indicator shows it on");
    assert.deepEqual(app.failures, []);
  } finally {
    globalThis.fetch = own;
  }
});
