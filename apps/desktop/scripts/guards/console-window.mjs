#!/usr/bin/env node
/**
 * Ningún proceso de producción abre una ventana de consola en Windows.
 *
 * Un `Command` lanzado sin `CREATE_NO_WINDOW` abre y cierra una consola. Si
 * corre una vez pasa desapercibido; si corre en un bucle —`proceso_vivo` le
 * pregunta a `tasklist` cada 20 s por cada turno vivo— la pantalla parpadea
 * sola y no hay forma de saber quién lo hace. Esa es la señal que llegó como
 * «me abre y cierra una terminal», sin nada en ningún log.
 *
 * En macOS no existe: `no_console_window` no hace nada ahí. O sea que esto es
 * lo único que una máquina de desarrollo puede verificar de esta clase de
 * fallo. Ya reincidió tres veces —el login de MCP, el
 * `tasklist`—, que es el criterio del repo para
 * mecanizarlo.
 *
 * Los tests no cuentan: nadie los mira correr.
 */
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkFiles } from "../git.mjs";

const ROOT = fileURLToPath(new URL("../../src-tauri/src", import.meta.url));
/** El módulo que define la contención: es donde vive `no_console_window`. */
const OWNER = "console.rs";
/** Cuántas líneas alrededor de la llamada se acepta la contención. */
const WINDOW_SIZE = 14;

const violations = [];
for (const f of walkFiles(ROOT, [".rs"])) {
  const rel = relative(ROOT, f).split(sep).join("/");
  // Un archivo que es entero un módulo de pruebas no lleva el `#[cfg(test)]`
  // dentro: lo lleva el `mod tests;` del padre.
  if (/(^|\/)tests\.rs$|_tests\.rs$|(^|\/)tests\//.test(rel)) continue;
  const lines = readFileSync(f, "utf8").split("\n");
  // Dónde empieza cada bloque de pruebas: lo de dentro no se mira.
  let inTests = false;
  lines.forEach((l, i) => {
    if (/^\s*#\[cfg\(test\)\]/.test(l)) inTests = true;
    if (inTests) return;
    if (!/Command::new\s*\(/.test(l)) return;
    if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
    const nearby = lines.slice(Math.max(0, i - 3), i + WINDOW_SIZE).join("\n");
    if (/no_console_window/.test(nearby)) return;
    // Lo que solo existe en Unix no puede abrir una consola de Windows.
    if (/#\[cfg\((unix|not\(windows\))\)\]|#\[cfg\(target_os\s*=\s*"(macos|linux)"\)\]/.test(nearby)) return;
    if (/Command::new\s*\(\s*"\/usr\/bin\//.test(l)) return;
    // La consola que la persona pidió ver. Es el único caso legítimo: el
    // login manual de un CLI que no se puede conducir por tubería.
    if (/consola: a propósito/.test(nearby)) return;
    violations.push(`${rel}:${i + 1}  ${l.trim()}`);
  });
}

if (violations.length === 0) {
  console.log("Ningún proceso de producción abre una consola en Windows.");
  process.exit(0);
}

for (const f of violations) console.error(`Lanza un proceso sin ocultar la consola — ${f}`);
console.error(
  `\nPásalo por \`util::no_console_window\` (${OWNER}). En macOS no cambia nada,\n` +
    `y en Windows es la diferencia entre un proceso silencioso y una ventana\n` +
    `que aparece y desaparece sin decir de dónde salió.`,
);
process.exit(1);
