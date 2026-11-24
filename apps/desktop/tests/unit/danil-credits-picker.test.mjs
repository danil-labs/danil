import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { build } from "vite";
import solid from "vite-plugin-solid";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "../helpers/credits-picker-fixture.tsx");
const TICK = () => new Promise((resolve) => setTimeout(resolve, 40));

async function withDom(fn) {
  const dir = await mkdtemp(join(tmpdir(), "danil-credits-picker-"));
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

const idleRouter = {
  ready: false,
  selected: false,
  onUse: () => {},
  state: "unavailable",
  activating: false,
  onActivate: () => {},
};

const fakeConsent = () => ({
  cargado: () => true,
  texto: () => null,
  aceptado: () => false,
  routeAvailable: () => false,
  guardando: () => false,
  cargar: () => Promise.resolve(),
  preguntar: () => Promise.resolve(),
  dialogo: () => null,
});

const creditsOption = (id, label) => ({
  key: `danil-credits\u0000${id}`,
  superficie: "danil-credits",
  agent: "opencode",
  usable: true,
  proveedor: { id: "danil-credits", label: "Danil Credits", logo: "danil" },
  model: { id, label, note: null, efforts: [], default_effort: null, gratis: false },
});

test("DanilServices oculta el botón Usar cuando hay modos y lo conserva como respaldo sin modos", async () => {
  await withDom(async ({ mountServices }, root) => {
    const picked = [];
    const dispose = mountServices(root, {
      credits: {
        ready: true,
        selected: true,
        onUse: () => picked.push("use"),
        tiers: [
          { id: "danil-credits/danil/ligero", label: "Ligero", ready: true, selected: false, onUse: () => picked.push("ligero") },
          { id: "danil-credits/danil/equilibrado", label: "Equilibrado", ready: true, selected: true, onUse: () => picked.push("equilibrado") },
          { id: "danil-credits/danil/avanzado", label: "Avanzado", ready: true, selected: false, onUse: () => picked.push("avanzado") },
        ],
      },
      router: idleRouter,
    });
    await TICK();
    const section = root.querySelector("section[aria-label=\"Danil Credits\"]");
    const buttons = [...section.querySelectorAll("button")].map((b) => b.textContent.trim());
    assert.deepEqual(buttons, ["Ligero", "Equilibrado", "Avanzado"]);
    assert.equal(buttons.includes("Usar"), false);
    assert.equal(buttons.includes("En uso"), false);
    section.querySelectorAll("button")[2].click();
    assert.deepEqual(picked, ["avanzado"]);
    dispose();

    root.innerHTML = "";
    const disposeFallback = mountServices(root, {
      credits: { ready: false, selected: false, onUse: () => {}, tiers: [] },
      router: idleRouter,
    });
    await TICK();
    const fallbackBtn = root.querySelector("section[aria-label=\"Danil Credits\"] button");
    assert.ok(fallbackBtn?.disabled);
    assert.equal(fallbackBtn?.textContent.trim(), "Usar");
    disposeFallback();
  });
});

test("SelectorDeModelo muestra Danil · <modo> sin la palabra Credits en la píldora y ordena Ligero, Equilibrado, Avanzado", async () => {
  await withDom(async ({ mountPicker }, root) => {
    const models = [
      creditsOption("danil-credits/danil/equilibrado", "Equilibrado"),
      creditsOption("danil-credits/danil/avanzado", "Avanzado"),
      creditsOption("danil-credits/danil/ligero", "Ligero"),
    ];
    let chosen = null;
    const dispose = mountPicker(root, {
      createFreeRouterConsent: fakeConsent,
      models,
      superficie: "danil-credits",
      model: "danil-credits/danil/equilibrado",
      pildora: true,
      marca: "danil",
      onChange: (opt) => { chosen = opt.model.id; },
    });
    await TICK();
    const trigger = root.querySelector("button");
    const pillText = trigger.textContent.replace(/\s+/g, " ").trim();
    assert.equal(pillText.includes("Credits"), false, `la píldora no debe incluir Credits: ${pillText}`);
    assert.match(pillText, /^Danil\s*·\s*Equilibrado$/);
    assert.ok(trigger.getAttribute("aria-label")?.includes("Equilibrado"));

    trigger.click();
    await TICK();
    await TICK();
    const section = document.querySelector("section[aria-label=\"Danil Credits\"]");
    assert.ok(section, "la sección Danil Credits debe abrirse");
    const tierButtons = [...section.querySelectorAll("[role=\"group\"] button")];
    assert.deepEqual(tierButtons.map((b) => b.textContent.trim()), ["Ligero", "Equilibrado", "Avanzado"]);
    assert.equal(tierButtons[1].getAttribute("aria-pressed"), "true");
    const allSectionButtons = [...section.querySelectorAll("button")].map((b) => b.textContent.trim());
    assert.equal(allSectionButtons.includes("Usar"), false);
    assert.equal(allSectionButtons.includes("En uso"), false);

    tierButtons[0].click();
    assert.equal(chosen, "danil-credits/danil/ligero");
    dispose();
    await TICK();
  });
});
