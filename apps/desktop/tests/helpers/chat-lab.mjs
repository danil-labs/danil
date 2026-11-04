#!/usr/bin/env node
/**
 * El hilo real en un navegador real: `dist/` entero contra un motor simulado en la página, con
 * páginas de `bounded_history_v1`. Mide lo que jsdom no puede: geometría, nodos y identidad.
 *
 *   PLAYWRIGHT_CORE=/ruta/playwright-core node tests/helpers/chat-lab.mjs [--browser chromium|webkit] [--only caso] [--json salida]
 *
 * Requiere `pnpm build`. No forma parte de la cadena: necesita navegador y no es determinista en tiempos.
 */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { backend } from "./chat-lab-backend.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const dist = join(import.meta.dirname, "..", "..", "dist");
const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const browserType = flag("--browser", "chromium") === "webkit" ? webkit : chromium;
const only = flag("--only", null);
const jsonOut = flag("--json", null);

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const file = join(dist, path === "/" ? "index.html" : path);
  if (!existsSync(file)) return response.writeHead(404).end();
  response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await browserType.launch({ headless: true, args: flag("--browser", "chromium") === "chromium" ? ["--js-flags=--expose-gc", "--enable-precise-memory-info"] : [] });

async function open(options) {
  const context = await browser.newContext({ viewport: { width: options.width ?? 1280, height: 800 } });
  const page = await context.newPage();
  if (args.includes("--chunks")) await page.addInitScript(() => localStorage.setItem("terminus.chat.thread-chunks", "1"));
  const failures = [];
  page.on("pageerror", (error) => failures.push(String(error.stack ?? error)));
  page.on("console", (message) => { if (message.type() === "error" && !/sin stub|Failed to load resource/.test(message.text())) failures.push(message.text()); });
  await page.addInitScript(backend, options);
  await page.goto(url);
  await page.getByText("Tarea lab-0").first().click({ timeout: 20_000 });
  await page.waitForSelector("[data-chat-thread] article, [data-chat-thread] [data-thread-key]", { timeout: 20_000 });
  await page.waitForTimeout(600);
  return { page, context, failures };
}

const nodes = (page) => page.evaluate(() => ({
  rows: document.querySelector("[data-chat-thread]").children.length,
  dom: document.querySelector("[data-chat-thread]").querySelectorAll("*").length,
}));
const wheelTo = (page, top) => page.evaluate(async (y) => {
  const box = document.querySelector("[data-chat-thread]").parentElement;
  box.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true }));
  box.scrollTop = y;
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
}, top);
/** La fila que se lee, su nodo y su distancia al borde; el nodo se guarda para comprobar que sobrevive. */
const mark = (page) => page.evaluate(() => {
  const box = document.querySelector("[data-chat-thread]").parentElement;
  const top = box.getBoundingClientRect().top;
  const row = [...document.querySelector("[data-chat-thread]").children].find((el) => el.getBoundingClientRect().bottom > top + 40);
  window.__mark = row;
  row.dataset.labMark = "1";
  return { key: row.dataset.threadKey ?? "", top: row.getBoundingClientRect().top - top };
});
/** Muestrea la fila marcada en cada cuadro: un salto que se corrige después también cuenta. */
const watch = (page) => page.evaluate(() => {
  const box = document.querySelector("[data-chat-thread]").parentElement;
  const top = () => box.getBoundingClientRect().top;
  window.__samples = [];
  window.__watching = true;
  const tick = () => {
    if (!window.__watching) return;
    // Tras el pintado del cuadro: un rAF ve el layout antes de los observadores, que aún no corrigieron.
    setTimeout(() => {
      window.__samples.push(window.__mark?.isConnected ? window.__mark.getBoundingClientRect().top - top() : null);
      requestAnimationFrame(tick);
    });
  };
  requestAnimationFrame(tick);
});
const unwatch = (page) => page.evaluate(() => { window.__watching = false; return window.__samples; });
const spread = (samples, base) => ({
  frames: samples.length,
  lost: samples.filter((s) => s === null).length,
  worst: Math.max(0, ...samples.filter((s) => s !== null).map((s) => Math.abs(s - base))),
});
const walkUp = async (page, step = 700, until = () => false) => {
  for (let n = 0; n < 4000; n++) {
    const position = await page.evaluate(() => document.querySelector("[data-chat-thread]").parentElement.scrollTop);
    if (await until()) return n;
    if (position <= 0) {
      await page.waitForTimeout(150);
      if ((await page.evaluate(() => document.querySelector("[data-chat-thread]").parentElement.scrollTop)) <= 0) return n;
    }
    await wheelTo(page, Math.max(0, position - step));
    await page.waitForTimeout(12);
  }
  return -1;
};

const results = [];
const cases = {
  async "dom-bounded"() {
    for (const blocks of [100, 1000, 10000]) {
      const { page, context, failures } = await open({ turns: blocks, pageTurns: blocks, unbounded: true });
      const at = await nodes(page);
      let max = at.dom, maxRows = at.rows;
      const box = await page.evaluate(() => { const b = document.querySelector("[data-chat-thread]").parentElement; return { h: b.scrollHeight, c: b.clientHeight }; });
      const stops = 40;
      for (let n = 1; n <= stops; n++) {
        await wheelTo(page, Math.max(0, box.h * (1 - n / stops)));
        await page.waitForTimeout(16);
        const now = await nodes(page);
        max = Math.max(max, now.dom);
        maxRows = Math.max(maxRows, now.rows);
      }
      results.push({ case: "dom-bounded", blocks, atOpen: at, maxRows, maxDom: max, scrollHeight: box.h, failures });
      await context.close();
    }
  },
  async "reach-first-active"() {
    const { page, context, failures } = await open({ turns: 388, activeEveryMs: 120 });
    const steps = await walkUp(page, 700, () => page.evaluate(() => document.body.innerText.includes("Pregunta 0 ")));
    const state = await page.evaluate(() => ({ first: document.body.innerText.includes("Pregunta 0 "), total: window.lab.total(), reads: window.lab.reads() }));
    results.push({ case: "reach-first-active", steps, ...state, failures });
    await context.close();
  },
  async "over-budget"() {
    const { page, context, failures } = await open({ turns: 200, turnBytes: 40_000, activeEveryMs: 400 });
    const steps = await walkUp(page, 900, () => page.evaluate(() => document.body.innerText.includes("Pregunta 0 ")));
    const reached = await page.evaluate(() => document.body.innerText.includes("Pregunta 0 "));
    const gap = await page.locator("[data-history-gap]").count();
    await page.getByRole("button", { name: /mensajes recientes|recent messages/i }).first().click();
    await page.waitForTimeout(800);
    const back = await page.evaluate(() => ({ last: new RegExp(`(Respuesta|Pregunta) ${window.lab.total() - 1} `).test(document.body.innerText), total: window.lab.total() }));
    results.push({ case: "over-budget", steps, reached, gap, back, failures });
    await context.close();
  },
  async "prepend-anchor"() {
    const { page, context, failures } = await open({ turns: 300, latencyMs: 180 });
    await wheelTo(page, 300);
    await page.waitForTimeout(100);
    const marked = await mark(page);
    await watch(page);
    await page.waitForTimeout(1500);
    const samples = await unwatch(page);
    const after = await page.evaluate(() => ({ same: window.__mark?.isConnected }));
    results.push({ case: "prepend-anchor", series: samples.filter((v, i, all) => v !== all[i - 1]).slice(0, 20), marked, ...spread(samples, marked.top), ...after, failures });
    await context.close();
  },
  async "prepend-with-append"() {
    const { page, context, failures } = await open({ turns: 300, latencyMs: 300, activeEveryMs: 100 });
    await wheelTo(page, 100);
    await page.waitForTimeout(100);
    const marked = await mark(page);
    await watch(page);
    await page.waitForTimeout(1600);
    const samples = await unwatch(page);
    const seen = await page.evaluate(() => [...document.querySelectorAll("[data-thread-key]")].map((row) => row.dataset.threadKey));
    results.push({ case: "prepend-with-append", series: samples.filter((v, i, all) => v !== all[i - 1]).slice(0, 20), marked, ...spread(samples, marked.top), unique: new Set(seen).size === seen.length, failures });
    await context.close();
  },
  async "error-retry"() {
    const { page, context, failures } = await open({ turns: 300, failOlder: true });
    await wheelTo(page, 50);
    const alert = page.getByRole("alert");
    await alert.waitFor({ timeout: 8000 });
    const shown = await alert.innerText();
    const draft = page.locator("textarea").first();
    await draft.fill("borrador intacto");
    await page.evaluate(() => window.lab.heal());
    await page.getByRole("button", { name: /Reintentar|Retry/ }).click();
    await page.waitForFunction(() => window.lab.reads() > 1, undefined, { timeout: 8000 });
    await page.waitForTimeout(500);
    const after = { alerts: await page.getByRole("alert").count(), draft: await draft.inputValue() };
    results.push({ case: "error-retry", shown, ...after, failures });
    await context.close();
  },
  async "late-growth"() {
    const { page, context, failures } = await open({ turns: 40 });
    await wheelTo(page, 2000);
    await page.waitForTimeout(150);
    const marked = await mark(page);
    await watch(page);
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll("[data-thread-key]")].filter((row) => !row.dataset.labMark);
      const above = rows.find((row) => row.getBoundingClientRect().bottom < row.closest("[data-chat-thread]").parentElement.getBoundingClientRect().top + 30) ?? rows[0];
      const late = document.createElement("div");
      late.style.height = "240px";
      above.prepend(late);
    });
    await page.waitForTimeout(500);
    const samples = await unwatch(page);
    results.push({ case: "late-growth", marked, ...spread(samples, marked.top), failures });
    await context.close();
  },
  async streaming() {
    const { page, context, failures } = await open({ turns: 60 });
    await page.evaluate(() => window.lab.stream(40));
    await page.waitForTimeout(1200);
    const stuck = await page.evaluate(() => { const b = document.querySelector("[data-chat-thread]").parentElement; const h = b.querySelector("[data-chat-thread]").lastElementChild.previousElementSibling; const t = b.querySelector("[data-chat-thread]"); return { padding: t.style.paddingBottom, kids: [...t.children].slice(-4).map((c) => [c.tagName, Math.round(c.getBoundingClientRect().height), getComputedStyle(c).marginBottom]), scroll: b.scrollHeight - b.clientHeight - b.scrollTop, lastBottom: h?.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom }; });
    await wheelTo(page, 1500);
    await page.waitForTimeout(100);
    const marked = await mark(page);
    await watch(page);
    await page.evaluate(() => window.lab.stream(40));
    await page.waitForTimeout(1200);
    const samples = await unwatch(page);
    results.push({ case: "streaming", shown: await page.evaluate(() => document.body.innerText.includes("palabra39")), distanceFollowing: stuck, marked, ...spread(samples, marked.top), failures });
    await context.close();
  },
  async "selection-focus"() {
    const { page, context, failures } = await open({ turns: 200, pageTurns: 200 });
    await wheelTo(page, 4000);
    await page.waitForTimeout(150);
    const key = await page.evaluate(() => {
      const row = [...document.querySelectorAll("[data-thread-key]")].find((el) => el.querySelector("[data-thread-search-text], p"));
      const text = row.querySelector("[data-thread-search-text], p");
      const range = document.createRange();
      range.selectNodeContents(text);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      window.__selected = row;
      window.__selectedText = getSelection().toString().length;
      return row.dataset.threadKey;
    });
    await page.waitForTimeout(100);
    await wheelTo(page, 0);
    await page.waitForTimeout(300);
    const kept = await page.evaluate(() => ({ node: window.__selected.isConnected, before: window.__selectedText, text: getSelection().toString().length }));
    results.push({ case: "selection-focus", key, ...kept, failures });
    await context.close();
  },
  async "selection-pages"() {
    const { page, context, failures } = await open({ turns: 400, pageTurns: 50 });
    await wheelTo(page, 2500);
    await page.waitForTimeout(150);
    const key = await page.evaluate(() => {
      const row = [...document.querySelectorAll("[data-thread-key]")].find((el) => el.querySelector("p") && el.getBoundingClientRect().top > 100);
      const text = row.querySelector("p");
      const range = document.createRange();
      range.selectNodeContents(text);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      window.__selected = row;
      window.__text = text;
      window.__chain = [];
      for (let el = text; el && el !== row; el = el.parentElement) window.__chain.push(el);
      return row.dataset.threadKey;
    });
    await page.waitForTimeout(100);
    await walkUp(page, 900, () => page.evaluate(() => window.lab.reads() >= 2));
    await page.waitForTimeout(400);
    const kept = await page.evaluate(() => ({ row: window.__selected.isConnected, node: window.__text.isConnected, text: getSelection().toString().length, reads: window.lab.reads(), chain: window.__chain.map((el) => `${el.tagName}.${String(el.className).slice(0, 24)}:${el.isConnected}`), rows: document.querySelectorAll("[data-thread-key]").length }));
    results.push({ case: "selection-pages", key, ...kept, failures });
    await context.close();
  },
  async "jump-unmounted"() {
    const { page, context, failures } = await open({ turns: 400, pageTurns: 400 });
    await page.keyboard.press("Control+f");
    const search = page.getByRole("search").getByRole("textbox");
    await search.waitFor({ timeout: 4000 });
    await search.fill("Pregunta 6 ");
    await page.waitForTimeout(900);
    const seen = await page.evaluate(() => {
      const box = document.querySelector("[data-chat-thread]").parentElement;
      const rect = box.getBoundingClientRect();
      const row = [...document.querySelectorAll("[data-thread-key]")].find((el) => el.textContent.includes("Pregunta 6 "));
      const top = row?.getBoundingClientRect().top;
      return { mounted: Boolean(row), inView: top !== undefined && top >= rect.top - 400 && top <= rect.bottom, marks: document.querySelectorAll(".outline-primary").length };
    });
    results.push({ case: "jump-unmounted", ...seen, failures });
    await context.close();
  },
  async "width-change"() {
    const { page, context, failures } = await open({ turns: 120 });
    await wheelTo(page, 3000);
    await page.waitForTimeout(150);
    const marked = await mark(page);
    await watch(page);
    await page.setViewportSize({ width: 820, height: 800 });
    await page.waitForTimeout(600);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(600);
    const samples = await unwatch(page);
    const settled = samples.slice(-5).filter((s) => s !== null);
    results.push({ case: "width-change", marked, last: settled.at(-1), failures });
    await context.close();
  },
  async "task-switch"() {
    const { page, context, failures } = await open({ turns: 200, latencyMs: 250, tasks: 2 });
    await wheelTo(page, 100);
    await page.waitForTimeout(40);
    await page.getByText("Tarea lab-1").first().click();
    await page.waitForTimeout(900);
    const leaked = await page.evaluate(() => document.querySelector("[data-chat-thread]").textContent.includes("de lab-0"));
    results.push({ case: "task-switch", leaked, failures });
    await context.close();
  },
  async "reading-return"() {
    const { page, context, failures } = await open({ turns: 200, pageTurns: 200, tasks: 2 });
    await wheelTo(page, 3000);
    await page.waitForTimeout(200);
    const marked = await mark(page);
    await page.getByText("Tarea lab-1").first().click();
    await page.waitForTimeout(700);
    await page.getByText("Tarea lab-0").first().click();
    await page.waitForTimeout(900);
    const back = await page.evaluate((key) => {
      const row = document.querySelector(`[data-thread-key="${CSS.escape(key)}"]`);
      const box = document.querySelector("[data-chat-thread]").parentElement;
      return row ? row.getBoundingClientRect().top - box.getBoundingClientRect().top : null;
    }, marked.key);
    results.push({ case: "reading-return", marked, back, failures });
    await context.close();
  },
  async "heap-cycles"() {
    const { page, context, failures } = await open({ turns: 400, pageTurns: 400 });
    const sample = async () => {
      await page.evaluate(() => globalThis.gc?.());
      await page.waitForTimeout(120);
      return page.evaluate(() => ({ heap: performance.memory?.usedJSHeapSize ?? null, ...{ rows: document.querySelector("[data-chat-thread]").children.length, dom: document.querySelectorAll("*").length } }));
    };
    const box = await page.evaluate(() => document.querySelector("[data-chat-thread]").parentElement.scrollHeight);
    const rounds = [];
    for (let round = 0; round < 10; round++) {
      for (let n = 0; n <= 20; n++) {
        await wheelTo(page, box * (1 - n / 20));
        await page.waitForTimeout(8);
      }
      for (let n = 20; n >= 0; n--) {
        await wheelTo(page, box * (1 - n / 20));
        await page.waitForTimeout(8);
      }
      rounds.push(await sample());
    }
    results.push({ case: "heap-cycles", rounds, failures });
    await context.close();
  },
  async "expanded-visual-pages"() {
    const { page, context, failures } = await open({ turns: 400, pageTurns: 50, visuals: 8 });
    await walkUp(page, 300, () => page.evaluate(() => Boolean(document.querySelector("iframe")?.isConnected && document.querySelector("[data-chat-visual] button[aria-expanded]"))));
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__frame = document.querySelector("iframe");
      window.__frame.closest("[data-chat-visual]").querySelector("button[aria-expanded]").click();
    });
    await page.waitForTimeout(300);
    await walkUp(page, 900, () => page.evaluate(() => window.lab.reads() >= 2));
    await page.waitForTimeout(400);
    const kept = await page.evaluate(() => ({ frame: window.__frame.isConnected, expanded: document.querySelectorAll("dialog[data-expanded]").length, reads: window.lab.reads() }));
    results.push({ case: "expanded-visual-pages", ...kept, failures });
    await context.close();
  },
  async "visual-rows"() {
    const { page, context, failures } = await open({ turns: 120, pageTurns: 120, visuals: 8 });
    await page.evaluate(() => {
      window.__long = 0;
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__long = Math.max(window.__long, entry.duration); }).observe({ entryTypes: ["longtask"] });
    });
    const box = await page.evaluate(() => document.querySelector("[data-chat-thread]").parentElement.scrollHeight);
    let frames = 0;
    for (let n = 0; n <= 30; n++) {
      await wheelTo(page, box * (1 - n / 30));
      await page.waitForTimeout(120);
      frames = Math.max(frames, await page.evaluate(() => document.querySelectorAll("iframe").length));
    }
    const settle = await page.evaluate(() => window.lab.visualReads());
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => ({ reads: window.lab.visualReads(), longest: window.__long, frames: document.querySelectorAll("iframe").length }));
    results.push({ case: "visual-rows", maxFrames: frames, readsAtStop: settle, ...state, failures });
    await context.close();
  },
  async "open-latency"() {
    const times = [];
    for (let n = 0; n < 6; n++) {
      const start = Date.now();
      const { context } = await open({ turns: 1000, pageTurns: 1000 });
      times.push(Date.now() - start - 600);
      await context.close();
    }
    results.push({ case: "open-latency", times, failures: [] });
  },
};

for (const [name, run] of Object.entries(cases)) {
  if (only && only !== name) continue;
  const started = results.length;
  try {
    await run();
  } catch (error) {
    results.push({ case: name, crashed: String(error.message ?? error).slice(0, 400) });
  }
  for (const result of results.slice(started)) console.log(JSON.stringify(result));
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
await browser.close();
server.close();
