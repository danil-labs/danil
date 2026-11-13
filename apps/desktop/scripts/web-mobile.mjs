#!/usr/bin/env node
/**
 * Exporta Expo en `dist-web/<base>m/` después de Vite; requiere `npm ci` en móvil.
 * Comparte borde, orígenes de relay y CSP con la web, sin los servicios de alfa.
 * Escribe también las cabeceras y el manifest de la PWA.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PHONE_DIR, phoneHeaders, phoneManifest, phoneWorker } from "./web-phone-pwa.mjs";
import { webRelayOrigins, webSessionDeployment } from "../src/web/session-config.ts";

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

// Las mismas entradas que la web: sin borde válido no se publica nada.
const edge = webSessionDeployment(env);
const relays = webRelayOrigins(env.RELAY_ORIGIN);
const expoEnv = {
  ...env,
  TERMINUS_MOBILE_WEB_BASE: `${base}${PHONE_DIR}`,
  // La raíz de la web de escritorio, para «Ver la versión de escritorio» sin adivinarla de la ruta.
  EXPO_PUBLIC_TERMINUS_WEB_BASE: base,
  EXPO_PUBLIC_TERMINUS_PHONE_BASE: `${base}${PHONE_DIR}/`,
  // Sin las secciones de alfa: la mensajería no se monta (regla 7).
  EXPO_PUBLIC_TERMINUS_ALPHA: "0",
  EXPO_PUBLIC_DANIL_EDGE_ORIGIN: edge.origin,
  EXPO_PUBLIC_DANIL_EDGE_TIMEOUT_MS: String(edge.timeoutMs),
  EXPO_PUBLIC_DANIL_RELAY_ORIGINS: relays.join(","),
  EXPO_PUBLIC_TERMINUS_PUSH_TEST: "0",
};
for (const key of Object.keys(expoEnv)) if (/^EXPO_PUBLIC_(SUPABASE_|COMPUTERS_|TERMINUS_WEB_WORKOS|TERMINUS_WEB_LOGIN)/.test(key)) delete expoEnv[key];
// El worker de pdf.js va en `public/` (lo copia el `postinstall`); por si el `npm ci` fue anterior.
const worker = spawnSync(process.execPath, ["scripts/pdf-worker.mjs"], { cwd: mobile, stdio: "inherit" });
if (worker.status !== 0) process.exit(worker.status ?? 1);

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = spawnSync(npx, ["expo", "export", "--platform", "web", "--clear", "--output-dir", out], {
  cwd: mobile,
  env: expoEnv,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (run.status !== 0) process.exit(run.status ?? 1);

// Las caras de los agentes Business y sus versiones planas: los mismos SVG del
// escritorio, servidos junto al teléfono (`AgentAvatar` los pide por URL).
cpSync(fileURLToPath(new URL("../src/features/projects/business-icons/", import.meta.url)), join(out, "agent-icons"), { recursive: true });
// Un aviso de «inicia sesión» abre la entrada del propio teléfono (`signin.web.tsx`).
writeFileSync(join(out, "sw.js"), phoneWorker(readFileSync(join(out, "sw.js"), "utf8"), `${base}${PHONE_DIR}/signin`, base));
writeFileSync(join(out, "manifest.webmanifest"), `${JSON.stringify(phoneManifest(base), null, 2)}\n`);
appendFileSync(join(root, "_headers"), `\n${phoneHeaders(base).join("\n")}`);
console.log(`web-mobile: ${out}`);
