#!/usr/bin/env node
/**
 * La prosa de ayuda no crece.
 *
 * Cuenta las claves del catálogo fuente que nombran una explicación y no un
 * dato: `.description`, `.hint`, `.why`, `.lede`, `.intro`, `.help`, `.note`,
 * `.subtitle`, `.tagline`. El baseline solo baja.
 *
 *   node scripts/guards/copy.mjs            guarda
 *   node scripts/guards/copy.mjs --update   fija el trinquete
 *   node scripts/guards/copy.mjs --list     audita las claves contadas
 *
 * La regla y sus límites están en docs/copy.md.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, isMain } from "../git.mjs";

const CATALOGO = join(ROOT, "src/locales/es");
const BASELINE = join(import.meta.dirname, "copy-baseline.json");

/** Los nombres de clave que piden una explicación. */
const SUFIJOS = ["description", "hint", "why", "lede", "intro", "help", "note", "subtitle", "tagline"];

/** Un objeto plural se recorre hasta sus formas; la forma no es el nombre. */
const PLURALES = new Set(["one", "other", "many", "few", "two", "zero"]);

function* hojas(valor, ruta = "") {
  if (Array.isArray(valor)) return;
  if (valor && typeof valor === "object") {
    for (const [clave, hijo] of Object.entries(valor)) {
      yield* hojas(hijo, ruta ? `${ruta}.${clave}` : clave);
    }
    return;
  }
  if (typeof valor === "string") yield { clave: ruta, valor };
}

function sufijoDe(clave) {
  const partes = clave.split(".");
  while (partes.length > 1 && PLURALES.has(partes.at(-1))) partes.pop();
  const ultimo = partes.at(-1) ?? "";
  return SUFIJOS.find((sufijo) => ultimo === sufijo || ultimo.endsWith(`_${sufijo}`)) ?? null;
}

/** Los catálogos del fuente: el `en` repite las mismas claves. */
function catalogos() {
  return readdirSync(CATALOGO)
    .filter((nombre) => nombre.endsWith(".json"))
    .sort()
    .map((nombre) => ({
      nombre: nombre.slice(0, -5),
      claves: [...hojas(JSON.parse(readFileSync(join(CATALOGO, nombre), "utf8")))],
    }));
}

export function contar() {
  const totales = Object.fromEntries(SUFIJOS.map((sufijo) => [sufijo, 0]));
  const porArchivo = new Map();
  const hallazgos = [];
  let claves = 0;
  let archivos = 0;
  for (const catalogo of catalogos()) {
    archivos++;
    claves += catalogo.claves.length;
    const cuenta = Object.fromEntries(SUFIJOS.map((sufijo) => [sufijo, 0]));
    for (const hoja of catalogo.claves) {
      const sufijo = sufijoDe(hoja.clave);
      if (!sufijo) continue;
      totales[sufijo]++;
      cuenta[sufijo]++;
      hallazgos.push({ archivo: catalogo.nombre, sufijo, ...hoja });
    }
    if (Object.values(cuenta).some((n) => n > 0)) porArchivo.set(catalogo.nombre, cuenta);
  }
  return { totales, porArchivo, hallazgos, claves, archivos };
}

function leerBaseline() {
  if (!existsSync(BASELINE)) return null;
  return JSON.parse(readFileSync(BASELINE, "utf8"));
}

function resumen(totales) {
  return SUFIJOS.filter((sufijo) => totales[sufijo] > 0)
    .map((sufijo) => `${sufijo}=${totales[sufijo]}`)
    .join("  ");
}

function guarda() {
  const { totales, porArchivo, claves, archivos } = contar();
  const base = leerBaseline();
  if (!base) {
    console.error(`Falta ${relative(ROOT, BASELINE)}. Créalo con: node scripts/guards/copy.mjs --update`);
    return 1;
  }
  let fallo = false;
  let bajo = false;
  for (const sufijo of SUFIJOS) {
    const ahora = totales[sufijo];
    const tope = base[sufijo] ?? 0;
    if (ahora > tope) {
      fallo = true;
      console.error(`${sufijo}: ${ahora} (baseline ${tope}) — subió ${ahora - tope}`);
      const peores = [...porArchivo.entries()]
        .filter(([, cuenta]) => cuenta[sufijo] > 0)
        .sort((a, b) => b[1][sufijo] - a[1][sufijo])
        .slice(0, 8);
      for (const [archivo, cuenta] of peores) {
        console.error(`    ${cuenta[sufijo].toString().padStart(4)}  ${archivo}`);
      }
    } else if (ahora < tope) {
      bajo = true;
    }
  }
  if (fallo) {
    console.error(
      "\nEse texto explica la pantalla. Quita la frase o cambia la disposición; la regla está en docs/copy.md.",
    );
    return 1;
  }
  console.log(
    `La ayuda visible no crece: ${resumen(totales) || "sin claves"}. ${claves} frases en ${archivos} catálogos.`,
  );
  if (bajo) console.log("Bajaron: fija el trinquete con `node scripts/guards/copy.mjs --update`.");
  return 0;
}

function ajustar() {
  const { totales } = contar();
  const base = leerBaseline() ?? {};
  const nuevo = {};
  for (const sufijo of SUFIJOS) nuevo[sufijo] = Math.min(totales[sufijo], base[sufijo] ?? totales[sufijo]);
  writeFileSync(BASELINE, JSON.stringify(nuevo, null, 2) + "\n");
  console.log(`Baseline: ${resumen(nuevo) || "sin claves"}`);
  return 0;
}

function listar() {
  const { hallazgos } = contar();
  for (const hoja of hallazgos) {
    const texto = hoja.valor.replace(/\s+/g, " ").slice(0, 90);
    console.log(`${hoja.archivo}:${hoja.clave}  ${texto}`);
  }
  console.log(`${hallazgos.length} claves`);
  return 0;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const codigo = args.includes("--update") ? ajustar() : args.includes("--list") ? listar() : guarda();
  process.exit(codigo);
}
