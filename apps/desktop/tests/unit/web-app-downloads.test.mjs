/**
 * «Descarga la app» en la Configuración de la web: los instaladores de
 * danil.ai/download/ con el de esta computadora primero. Monta `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { relay } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const SUPABASE = "https://supabase.test";
const API = "https://machines.danil.ai/v1/computers";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const session = JSON.stringify({
  access_token: "stored",
  refresh_token: "r",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "u1", aud: "authenticated", role: "authenticated", email: "persona@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
});

test("web Settings offers the desktop downloads, this computer's first", async () => {
  const fake = relay();
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (!url.startsWith(API)) return own(input, init);
    return new Response(JSON.stringify([{ computer_id: "cmp_a", name: "Casa", state: "online" }]), { status: 200 });
  };
  let w;
  const app = await boot("listo", "web-app-downloads", {}, WINDOWS, { "sb-supabase-auth-token": session }, {
    web: true,
    beforeImport: (win) => {
      w = win;
      globalThis.WebSocket = fake.Socket;
      win.terminusWeb = { supabaseUrl: SUPABASE, supabaseKey: "public-anon-key" };
    },
  });
  try {
    await sleep(1000);
    w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "download" }));
    await sleep(800);
    const section = w.document.querySelector("[data-app-downloads]");
    assert.ok(section, w.document.body.textContent.slice(0, 400));
    assert.ok(w.document.body.textContent.includes("Descarga la app"), "the tab is named");
    const rows = [...section.querySelectorAll("[data-app-download]")].map((r) => r.dataset.appDownload);
    assert.deepEqual(rows, ["windows", "macos", "linux"]);
    const links = [...section.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    assert.deepEqual(links, [
      "https://danil.ai/download/Danil-Windows-Setup.exe",
      "https://danil.ai/download/Danil-macOS.dmg",
      "https://danil.ai/download/Danil-Linux-x86_64.AppImage",
    ]);
    assert.equal(w.document.querySelector("[data-app-download-page]")?.getAttribute("href"), "https://danil.ai/download/");
    assert.ok(!/billing|precio|pago|checkout/i.test(section.innerHTML), "no payment link");
    assert.deepEqual(app.failures, []);
  } finally {
    globalThis.fetch = own;
  }
});
