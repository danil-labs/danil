#!/usr/bin/env node
/**
 * Un tamaño de letra con token se escribe con el token (`text-caption`, no
 * `text-[0.6875rem]`), y los que aún no tienen escalón solo pueden bajar. La
 * escala vive en `packages/design/src/scale.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const { TEXT } = await import(join(ROOT, "../../packages/design/src/scale.ts"));

/** Baja cuando un valor suelto pasa a la escala; no sube para aceptar uno nuevo. */
const TECHO_SUELTOS = 74;

const pixeles = (valor, unidad) => Number(valor) * (unidad === "rem" ? 16 : 1);
const escalones = new Map(Object.entries(TEXT).map(([nombre, px]) => [px, nombre]));
const ARBITRARIO = /(?<![\w-])text-\[([\d.]+)(rem|px)\]/g;

const failures = [];
let sueltos = 0;
for (const entrada of readdirSync(join(ROOT, "src"), { recursive: true, withFileTypes: true })) {
  if (!entrada.isFile() || !/\.tsx?$/.test(entrada.name)) continue;
  const ruta = join(entrada.parentPath, entrada.name);
  for (const m of readFileSync(ruta, "utf8").matchAll(ARBITRARIO)) {
    const escalon = escalones.get(pixeles(m[1], m[2]));
    if (escalon) failures.push(`${relative(ROOT, ruta)}: ${m[0]} es text-${escalon}`);
    else sueltos++;
  }
}

if (sueltos > TECHO_SUELTOS) failures.push(`${sueltos} tamaños sueltos superan el techo de ${TECHO_SUELTOS}: usa un escalón de la escala.`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
if (sueltos < TECHO_SUELTOS) console.log(`Baja TECHO_SUELTOS a ${sueltos}.`);
console.log(`Los tamaños de letra usan la escala (${sueltos} sueltos de un techo de ${TECHO_SUELTOS}).`);
