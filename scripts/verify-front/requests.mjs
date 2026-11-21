#!/usr/bin/env node
// Gate de peticiones (plan front-move 3.2): una carga real pide cada recurso del borde una sola vez.
// Sirve la build web de apps/desktop (base /) con el borde simulado de scripts/verify-parity/edge-fixtures.mjs,
// abre la página como persona con sesión, espera a que quede quieta (networkidle + 3 s) y cuenta por recurso.
// Imprime `machines=N sessions=N catalog=N me=N` y sale 1 si alguno pasa de 1. Un recurso con contexto
// (`X-Danil-Session`, una organización del conjunto) se cuenta por contexto: la lista de máquinas de dos
// organizaciones son dos recursos. N es el máximo entre contextos; REQUESTS_VERBOSE=1 da el detalle.
// Una vez: `npm ci` en scripts/verify-parity (Playwright). Recompila con REQUESTS_BUILD=1:
//   DANIL_WEB_API_ORIGIN=https://edge.danil.ai TERMINUS_WEB_BASE=/ pnpm -C apps/desktop web:build
// REQUESTS_VERBOSE=1 lista todas las peticiones al borde.
import http from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const PARITY = join(ROOT, "scripts/verify-parity");
const DIST = join(ROOT, "apps/desktop/dist-web");
let chromium;
try { ({ chromium } = createRequire(join(PARITY, "package.json"))("playwright")); }
catch { console.error("falta Playwright: npm ci en scripts/verify-parity"); process.exit(2); }
const { handleEdgeRoute } = await import(join(PARITY, "edge-fixtures.mjs"));

/** Cada recurso y la ruta del borde que lo sirve (sin query: una página siguiente es otra petición). */
const RESOURCES = {
  machines: (p) => p === "/v1/machines",
  sessions: (p) => p === "/v1/identity/sessions",
  catalog: (p) => p === "/v1/identity/sessions/catalog",
  me: (p) => p === "/v1/identity/me",
};

// Una build con otra base (move-gate compila con `/terminus/`) no sirve aquí: se recompila con base `/`.
const builtAtRoot = () => existsSync(join(DIST, "index.html")) && /(src|href)="\/assets\//.test(readFileSync(join(DIST, "index.html"), "utf8"));
if (process.env.REQUESTS_BUILD || !builtAtRoot()) {
  execSync("pnpm -C apps/desktop web:build", { cwd: ROOT, stdio: "inherit", env: { ...process.env, DANIL_WEB_API_ORIGIN: "https://edge.danil.ai", TERMINUS_WEB_BASE: "/" } });
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".wasm": "application/wasm" };
const server = http.createServer((req, res) => {
  let p = join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
  createReadStream(p).pipe(res);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-MX", colorScheme: "dark" });
const page = await ctx.newPage();
/** recurso → contexto (o «-») → peticiones. */
const counts = Object.fromEntries(Object.keys(RESOURCES).map((k) => [k, new Map()]));
const seen = [];
const t0 = Date.now();
await page.route("https://edge.danil.ai/**", (route) => {
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() !== "OPTIONS") {
    const context = req.headers()["x-danil-session"] ?? "-";
    seen.push(`+${Date.now() - t0}ms ${req.method()} ${url.pathname}${url.search} [${context}]`);
    for (const [name, match] of Object.entries(RESOURCES)) if (req.method() === "GET" && match(url.pathname)) counts[name].set(context, (counts[name].get(context) ?? 0) + 1);
  }
  return handleEdgeRoute(route);
});
await page.goto(base + "/");
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(3000);
await browser.close();
server.close();

if (process.env.REQUESTS_VERBOSE) {
  console.log(seen.join("\n"));
  for (const [k, by] of Object.entries(counts)) console.log(`${k}: ${[...by].map(([c, n]) => `${c}=${n}`).join(" ") || "ninguna"}`);
}
const most = Object.fromEntries(Object.entries(counts).map(([k, by]) => [k, Math.max(0, ...by.values())]));
console.log(Object.entries(most).map(([k, n]) => `${k}=${n}`).join(" "));
const over = Object.entries(most).filter(([, n]) => n > 1);
if (over.length) {
  console.log(`FALLA: se pide más de una vez ${over.map(([k]) => k).join(", ")}`);
  process.exit(1);
}
