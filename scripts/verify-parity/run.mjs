#!/usr/bin/env node
// Gate de paridad visual. Uso: node scripts/verify-parity/run.mjs [pantalla ...]
// Sirve apps/desktop (modo web, base /) y apps/workspace compiladas, con el mismo
// borde simulado, en es-MX y tema oscuro, captura cada receta de screens/ en las
// dos y compara píxeles. Sale 1 si alguna pasa su umbral. Capturas en out/.
// Recompila con PARITY_BUILD=1 (vieja: pnpm -C apps/desktop web:build con TERMINUS_WEB_BASE=/; nueva: apps/workspace build).
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { extname, join } from "node:path";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { attachFixtures } from "./edge-fixtures.mjs";

const HERE = import.meta.dirname;
const ROOT = join(HERE, "..", "..");
const OLD = join(ROOT, "apps/desktop/dist-web");
const NEW = join(ROOT, "apps/workspace/dist");
const OUT = join(HERE, "out");
const VIEWPORT = { width: 1280, height: 800 };
const DEFAULT_THRESHOLD = 0.02; // fracción de píxeles distintos tolerada

if (process.env.PARITY_BUILD || !existsSync(join(OLD, "index.html"))) {
  execSync("pnpm -C apps/desktop exec vite build --mode web", { cwd: ROOT, stdio: "inherit", env: { DANIL_WEB_API_ORIGIN: "https://edge.danil.ai", ...process.env, TERMINUS_WEB_BASE: "/" } });
}
if (process.env.PARITY_BUILD || !existsSync(join(NEW, "index.html"))) {
  execSync("pnpm --filter @danil/app-workspace build", { cwd: ROOT, stdio: "inherit" });
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".wasm": "application/wasm" };
function serve(dir) {
  const s = http.createServer((req, res) => {
    let p = join(dir, decodeURIComponent(req.url.split("?")[0]));
    if (!existsSync(p) || statSync(p).isDirectory()) p = join(dir, "index.html");
    res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
    createReadStream(p).pipe(res);
  });
  return new Promise((ok) => s.listen(0, "127.0.0.1", () => ok({ s, url: `http://127.0.0.1:${s.address().port}` })));
}

const wanted = process.argv.slice(2);
const recipes = readdirSync(join(HERE, "screens")).filter((f) => f.endsWith(".mjs")).map((f) => f.replace(/\.mjs$/, ""))
  .filter((n) => !wanted.length || wanted.includes(n));
if (!recipes.length) { console.error(`sin recetas para: ${wanted.join(" ")}`); process.exit(1); }

mkdirSync(OUT, { recursive: true });
const [oldSrv, newSrv] = await Promise.all([serve(OLD), serve(NEW)]);
const browser = await chromium.launch();
let failed = 0;
const report = [];

async function shoot(base, step, file) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "es-MX", colorScheme: "dark", timezoneId: "America/Mexico_City" });
  const page = await ctx.newPage();
  await attachFixtures(page);
  await page.goto(base + "/");
  await page.waitForLoadState("networkidle").catch(() => {});
  await step(page, base);
  await page.waitForTimeout(800);
  await page.screenshot({ path: file, animations: "disabled", caret: "hide" });
  await ctx.close();
}

for (const name of recipes) {
  const r = (await import(join(HERE, "screens", `${name}.mjs`))).default;
  const a = join(OUT, `${name}-old.png`), b = join(OUT, `${name}-new.png`), d = join(OUT, `${name}-diff.png`);
  try {
    await shoot(oldSrv.url, r.old, a);
    await shoot(newSrv.url, r.new, b);
  } catch (e) {
    failed++; report.push(`FAIL ${name}: la receta falló: ${e.message.split("\n")[0]}`); continue;
  }
  const A = PNG.sync.read(readFileSync(a)), B = PNG.sync.read(readFileSync(b));
  const diff = new PNG({ width: A.width, height: A.height });
  const n = pixelmatch(A.data, B.data, diff.data, A.width, A.height, { threshold: 0.1 });
  writeFileSync(d, PNG.sync.write(diff));
  const frac = n / (A.width * A.height), max = r.threshold ?? DEFAULT_THRESHOLD;
  const ok = frac <= max;
  if (!ok) failed++;
  report.push(`${ok ? "ok  " : "FAIL"} ${name}: ${(frac * 100).toFixed(2)} % distinto (máx ${(max * 100).toFixed(1)} %)  ${d}`);
}
await browser.close(); oldSrv.s.close(); newSrv.s.close();
console.log(report.join("\n"));
process.exit(failed ? 1 : 0);
