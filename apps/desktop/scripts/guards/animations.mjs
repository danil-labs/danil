#!/usr/bin/env node
/**
 * Ninguna animación infinita con timing continuo fuera de la lista de abajo.
 *
 * WebKit recompone la ventana a 60 cuadros por segundo mientras haya una en
 * pantalla, y un punto de 7 px pulsando ocupaba dos tercios de un núcleo. Con
 * `steps()` solo repinta cuando cambia de paso.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { walkFiles } from "../git.mjs";

const RAIZ = fileURLToPath(new URL("../../src", import.meta.url));

/** Animaciones de CSS que corren solo mientras dura un gesto corto. */
const KEYFRAMES_PERMITIDOS = new Set(["finish-task-ignition", "finish-task-exhaust"]);

const DECLARACION = /(?:^|[;{\s])(?:animation|--animate-[\w-]+)\s*:\s*([^;}]+)/g;
const POR_PASOS = /\bsteps\(|\bstep-(?:start|end)\b/;
/** `animate-spin` y `animate-pulse` van por pasos (`global.css`); estos dos no. */
const TAILWIND_CONTINUA = /\banimate-(?:ping|bounce)(?![\w-])/g;
/** Una animación escrita en la clase, `animate-[nombre_1s_infinite]`. */
const CLASE_ARBITRARIA = /\banimate-\[([^\]]+)\]/g;

const failures = [];
for (const f of walkFiles(RAIZ, [".css"])) {
  const fuente = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  for (const m of fuente.matchAll(DECLARACION)) {
    const valor = m[1].trim();
    if (!/\binfinite\b/.test(valor) || POR_PASOS.test(valor)) continue;
    if (valor.split(/\s+/).some((palabra) => KEYFRAMES_PERMITIDOS.has(palabra))) continue;
    const linea = fuente.slice(0, m.index).split("\n").length;
    failures.push(`${relative(RAIZ, f)}:${linea}  ${valor}`);
  }
}

for (const f of walkFiles(RAIZ, [".ts", ".tsx"])) {
  const fuente = readFileSync(f, "utf8");
  const clave = relative(RAIZ, f).replaceAll("\\", "/");
  for (const m of fuente.matchAll(TAILWIND_CONTINUA)) failures.push(`${clave}  ${m[0]}`);
  for (const m of fuente.matchAll(CLASE_ARBITRARIA)) {
    const valor = m[1].replaceAll("_", " ");
    if (/\binfinite\b/.test(valor) && !POR_PASOS.test(valor)) failures.push(`${clave}  ${m[0]}`);
  }
}

if (failures.length === 0) {
  console.log("Ninguna animación infinita nueva repinta la ventana a 60 cuadros por segundo.");
  process.exit(0);
}

for (const f of failures) console.error(`Animación infinita continua — ${f}`);
console.error(
  "\nMientras esté en pantalla, WebKit recompone la ventana a 60 cuadros por segundo.\n" +
    "Usa `steps()` —o los tokens `animate-spin`, `animate-pulse` y `animate-skeleton`— y, si\n" +
    "hay varias a la vez, periodos múltiplos de un mismo paso anclados a un reloj\n" +
    "común (`lib/sharedClock.ts`).",
);
process.exit(1);
