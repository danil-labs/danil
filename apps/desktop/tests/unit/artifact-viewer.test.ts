import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { envolver, leerEstado } from "../../../../packages/features/artifacts/src/model/sandbox.ts";
import { JS_INLINE } from "../../../../packages/features/artifacts/src/model/inlineVisual.ts";

// jsdom prueba navegación y mensajes; no demuestra aislamiento de un navegador.
test("legacy HTML slides retain navigation after removing the editor", () => {
  const dom = new JSDOM(envolver('<section class="slide">One</section><section class="slide">Two</section>'), {
    runScripts: "dangerously",
    beforeParse(window) { window.scrollTo = () => {}; },
  });
  try {
    const { window } = dom;
    const active = () => window.document.querySelector(".harness-active")?.textContent;
    assert.equal(active(), "One");
    window.dispatchEvent(new window.MessageEvent("message", { data: { harness: "control", accion: "siguiente" } }));
    assert.equal(active(), "Two");
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft" }));
    assert.equal(active(), "One");
  } finally { dom.window.close(); }
});

test("retired editor and converter controls cannot extract or edit the document", () => {
  const dom = new JSDOM(envolver("<p>Original</p>"), { runScripts: "dangerously" });
  try {
    const { window } = dom;
    const messages: unknown[] = [];
    window.postMessage = (message: unknown) => { messages.push(message); };
    for (const action of ["editar", "formato", "contenido", "bloques"]) {
      window.dispatchEvent(new window.MessageEvent("message", { data: {
        harness: "control", accion: action, on: true, cual: "negrita", peticion: 1,
      } }));
      assert.equal(leerEstado({ harness: action, html: "hostile", bloques: [] }), null);
    }
    assert.notEqual(window.document.body.contentEditable, "true");
    assert.deepEqual(messages, []);
    assert.equal(window.document.querySelector("p")?.textContent, "Original");
  } finally { dom.window.close(); }
});

test("inline sizing measures content without the viewport scrollbar and restores scrolling", async () => {
  const dom = new JSDOM('<html style="overflow-y:auto !important"><body></body></html>', { runScripts: "outside-only" });
  try {
    const { window } = dom;
    const root = window.document.documentElement;
    const frames: FrameRequestCallback[] = [];
    const heights: number[] = [];
    let naturalHeight = 480.25;
    let viewportHeight = 320;
    let horizontalScrollbar = 0;
    const layoutHeight = () => naturalHeight + (root.style.overflowY !== "hidden" && viewportHeight < naturalHeight ? 21 : 0);
    root.getBoundingClientRect = window.document.body.getBoundingClientRect = () => ({ height: layoutHeight() }) as DOMRect;
    Object.defineProperty(window.document.body, "scrollHeight", { get: () => Math.round(layoutHeight()) });
    Object.defineProperty(root, "clientHeight", { get: () => viewportHeight - horizontalScrollbar });
    Object.defineProperty(window, "innerHeight", { get: () => viewportHeight });
    Object.defineProperty(window.document, "fonts", { value: { ready: Promise.resolve() } });
    window.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
    window.postMessage = (message: { type: string; height: number }) => {
      if (message.type !== "terminus:visual-height") return;
      heights.push(message.height);
      viewportHeight = message.height;
      window.dispatchEvent(new window.Event("resize"));
    };
    const flush = () => {
      for (let i = 0; frames.length && i < 20; i++) frames.shift()!(i);
      assert.equal(frames.length, 0, "height must settle without a resize feedback loop");
      assert.equal(root.style.getPropertyValue("overflow-y"), "auto");
      assert.equal(root.style.getPropertyPriority("overflow-y"), "important");
    };
    window.eval(JS_INLINE);
    await Promise.resolve();
    flush();
    assert.deepEqual(heights, [481]);
    naturalHeight = 224.25;
    window.dispatchEvent(new window.Event("resize"));
    flush();
    assert.deepEqual(heights, [481, 225]);
    horizontalScrollbar = 5;
    window.dispatchEvent(new window.Event("resize"));
    flush();
    assert.deepEqual(heights, [481, 225, 230]);
    naturalHeight = 6000;
    window.dispatchEvent(new window.Event("resize"));
    flush();
    assert.deepEqual(heights, [481, 225, 230, 4096]);
  } finally { dom.window.close(); }
});
