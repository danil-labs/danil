#!/usr/bin/env node
/**
 * Compila el Terminus del teléfono (`apps/mobile`, Expo para web) dentro de la
 * web: `dist-web/<base>m/`, después de `vite build --mode web`. La web de
 * escritorio manda ahí a los teléfonos (`toPhone` en `src/web/main.tsx`), y
 * las dos comparten origen, sesión de la app de Danil y política (`_headers`
 * cubre `<base>*`).
 *
 * Toma los mismos valores públicos que `vite.config.ts` (`TERMINUS_WEB_*`) y
 * se los pasa a Expo como `EXPO_PUBLIC_*`. Necesita `npm ci` en `apps/mobile`.
 * Al final escribe el manifest de la PWA y sus cabeceras (`web-phone-pwa.mjs`).
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PHONE_DIR, phoneHeaders, phoneManifest, phoneWorker } from "./web-phone-pwa.mjs";

const env = process.env;
const mobile = fileURLToPath(new URL("../../mobile/", import.meta.url));
const root = fileURLToPath(new URL("../dist-web/", import.meta.url));
const base = `/${(env.TERMINUS_WEB_BASE ?? "/terminus/").replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");
const out = join(root, base, PHONE_DIR);

if (!existsSync(join(mobile, "node_modules", "expo"))) {
  console.error("web-mobile: falta `npm ci` en apps/mobile; la web saldría sin la versión del teléfono.");
  process.exit(1);
}
if (!existsSync(join(root, base, "index.html"))) {
  console.error("web-mobile: corre primero `vite build --mode web` (no encuentro dist-web).");
  process.exit(1);
}

const origin = (value) => (value ? new URL(value).origin : "");
const expoEnv = {
  ...env,
  TERMINUS_MOBILE_WEB_BASE: `${base}${PHONE_DIR}`,
  // La raíz de la web de escritorio, para «Ver la versión de escritorio» sin adivinarla de la ruta.
  EXPO_PUBLIC_TERMINUS_WEB_BASE: base,
  EXPO_PUBLIC_TERMINUS_ALPHA: env.TERMINUS_WEB_ALPHA === "1" ? "1" : "0",
  EXPO_PUBLIC_COMPUTERS_ENDPOINT: origin(env.TERMINUS_WEB_ENDPOINT || "https://machines.danil.ai"),
  EXPO_PUBLIC_TERMINUS_WEB_LOGIN: env.TERMINUS_WEB_LOGIN || `${base}auth`,
  EXPO_PUBLIC_TERMINUS_WEB_WORKOS: env.TERMINUS_WEB_WORKOS === "1" ? "1" : "0",
  EXPO_PUBLIC_TERMINUS_PUSH_TEST: env.TERMINUS_WEB_PUSH_TEST === "1" ? "1" : "0",
  ...(env.TERMINUS_WEB_SUPABASE_URL ? { EXPO_PUBLIC_SUPABASE_URL: origin(env.TERMINUS_WEB_SUPABASE_URL) } : {}),
  ...(env.TERMINUS_WEB_SUPABASE_KEY ? { EXPO_PUBLIC_SUPABASE_KEY: env.TERMINUS_WEB_SUPABASE_KEY.trim() } : {}),
};
// El worker de pdf.js va en `public/` (lo copia el `postinstall`); por si el `npm ci` fue anterior.
const worker = spawnSync(process.execPath, ["scripts/pdf-worker.mjs"], { cwd: mobile, stdio: "inherit" });
if (worker.status !== 0) process.exit(worker.status ?? 1);

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = spawnSync(npx, ["expo", "export", "--platform", "web", ...(env.TERMINUS_WEB_ALPHA === "1" ? ["--clear"] : []), "--output-dir", out], {
  cwd: mobile,
  env: expoEnv,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (run.status !== 0) process.exit(run.status ?? 1);

writeFileSync(join(out, "sw.js"), phoneWorker(readFileSync(join(out, "sw.js"), "utf8"), expoEnv.EXPO_PUBLIC_TERMINUS_WEB_LOGIN, base));
writeFileSync(join(out, "manifest.webmanifest"), `${JSON.stringify(phoneManifest(base), null, 2)}\n`);
appendFileSync(join(root, "_headers"), `\n${phoneHeaders(base).join("\n")}`);
console.log(`web-mobile: ${out}`);
