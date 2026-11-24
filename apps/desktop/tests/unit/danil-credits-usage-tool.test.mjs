import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { build } from "vite";
import solid from "vite-plugin-solid";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "../helpers/credits-usage-tool-fixture.tsx");
const TICK = () => new Promise((resolve) => setTimeout(resolve, 40));

async function withDom(fn) {
  const dir = await mkdtemp(join(tmpdir(), "danil-credits-usage-"));
  const dom = new JSDOM("<main id=\"root\"></main>", { url: "http://localhost" });
  const keys = [
    "window", "document", "navigator", "localStorage", "HTMLElement",
    "Element", "HTMLHeadElement", "SVGElement", "DocumentFragment", "Node", "MutationObserver", "Event", "MouseEvent",
    "KeyboardEvent", "PointerEvent", "CustomEvent", "getComputedStyle",
    "requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver",
  ];
  const saved = new Map();
  for (const key of keys) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    const value =
      key === "window"
        ? dom.window
        : key === "ResizeObserver"
          ? class { observe() {} unobserve() {} disconnect() {} }
          : key === "PointerEvent"
            ? dom.window.MouseEvent
            : dom.window[key];
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  dom.window.localStorage.setItem("harness:lengua", "es");
  try {
    await build({
      configFile: false,
      logLevel: "silent",
      plugins: [solid()],
      resolve: { conditions: ["browser"] },
      build: {
        outDir: dir,
        target: "esnext",
        minify: false,
        lib: { entry: FIXTURE, formats: ["es"], fileName: () => "bundle.mjs" },
      },
    });
    const mod = await import(pathToFileURL(join(dir, "bundle.mjs")));
    await fn(mod, dom.window.document.getElementById("root"));
  } finally {
    dom.window.close();
    for (const [key, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    }
    await rm(dir, { recursive: true, force: true });
  }
}

function fakeUsage(cards = []) {
  return {
    accountsByAgent: () => [],
    activeCards: () => cards,
    reads: () => ({
      "opencode\u0000acc-1": { mode: "read", plan: "Go", fetched_at: Date.now(), windows: [{ label: "5h", used_pct: 25, resets_at: Date.now() + 3600_000 }] },
    }),
    lastGoodReads: () => ({}),
    statuses: () => ({}),
    inProgress: () => ({}),
    updating: () => false,
    rename: async () => {},
    refresh: () => {},
    refreshAll: () => {},
  };
}

test("UsageTool muestra logo Danil y saldo compacto para Danil Credits, y vuelve a OpenCode con otro modelo", async () => {
  await withDom(async ({ createSignal, setCapabilities, mountUsageTool }, root) => {
    let calls = 0;
    setCapabilities({
      danilCredits: {
        readBalance: async () => {
          calls += 1;
          return 974.879097;
        },
      },
    });
    const [model, setModel] = createSignal("danil-credits/danil/avanzado");
    const usage = fakeUsage([{ agent: "opencode", label: "OpenCode", active: "acc-1", accounts: [], cuenta: { id: "acc-1", label: "a@danil.ai" } }]);
    const dispose = mountUsageTool(root, { usage, agent: "opencode", get model() { return model(); }, pressed: false, onToggle: () => {} });
    await TICK();

    const btn = root.querySelector("button");
    assert.ok(btn, "botón de consumo visible");
    assert.equal(btn.querySelector("[data-danil-credits-balance]")?.textContent?.trim(), "974.88");
    assert.equal(btn.querySelector('[role="progressbar"]'), null, "sin barra de progreso para Danil Credits");
    assert.match(btn.getAttribute("aria-label") ?? "", /Danil Credits.*974\.88/);
    assert.equal(calls, 1);

    setModel("opencode-go/kimi");
    await TICK();
    assert.equal(btn.querySelector("[data-danil-credits-balance]"), null);
    assert.ok(btn.querySelector('[role="progressbar"]'), "con OpenCode muestra barra de progreso");
    dispose();
  });
});

test("createDanilCreditsBalance comparte caché SWR entre vistas, no vuelve a Consultando al reabrir y refresca sin parpadeo", async () => {
  await withDom(async ({ createSignal, setCapabilities, mountCredits, refreshDanilCreditsBalance }, root) => {
    let calls = 0;
    let cleared = 0;
    let nextValue = 974.879097;
    const [ctx, setCtx] = createSignal("ctx-org-a");
    let resolvePending = null;
    setCapabilities({
      danilCredits: {
        scope: () => ctx(),
        clearCache: () => { cleared += 1; },
        readBalance: async () => {
          calls += 1;
          if (nextValue === "DEFER") {
            return await new Promise((resolve) => { resolvePending = resolve; });
          }
          if (nextValue === "FAIL") throw new Error("network");
          return nextValue;
        },
      },
    });

    // 1. Primera apertura: carga y cachea 974.88
    const d1 = mountCredits(root);
    await TICK();
    assert.equal(root.querySelector('[role="status"]')?.textContent?.trim(), "974.88 créditos");
    assert.equal(calls, 1);
    d1();
    root.innerHTML = "";

    // 2. Segunda apertura dentro del TTL: muestra 974.88 al instante sin Consultando ni nueva llamada
    const d2 = mountCredits(root);
    assert.equal(root.querySelector('[role="status"]')?.textContent?.trim(), "974.88 créditos");
    await TICK();
    assert.equal(calls, 1, "no reconsulta dentro del TTL");

    // 3. Refresco forzado (ej. tras terminar un turno) conserva el saldo visible mientras consulta y luego actualiza
    nextValue = "DEFER";
    const pending = refreshDanilCreditsBalance({ force: true });
    assert.equal(cleared, 1);
    assert.equal(root.querySelector('[role="status"]')?.textContent?.trim(), "974.88 créditos", "no vuelve a Consultando mientras revalida");
    resolvePending(973.5);
    await pending;
    await TICK();
    assert.equal(root.querySelector('[role="status"]')?.textContent?.trim(), "973.5 créditos");

    // 4. Fallo transitorio conserva el último saldo conocido
    nextValue = "FAIL";
    await refreshDanilCreditsBalance({ force: true });
    await TICK();
    assert.equal(root.querySelector('[role="status"]')?.textContent?.trim(), "973.5 créditos");

    // 5. Cambiar de organización/contexto aísla el saldo y consulta la nueva org
    nextValue = 50;
    setCtx("ctx-org-b");
    await TICK();
    assert.equal(root.querySelector('[role="status"]')?.textContent?.trim(), "50 créditos");
    d2();
  });
});
