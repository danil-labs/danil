#!/usr/bin/env node
/**
 * Que un paquete de lengua de `plugins/languages/` diga lo que la app sabe pedir.
 *
 * `scripts/guards/locales.mjs` no lo mira, y no debe: exige traducción **completa**, y
 * un paquete de disco va por detrás de la app a propósito —para eso está la
 * cascada de respaldo—. Lo que sí falla en silencio es lo otro:
 *
 * - **Una clave que `es` no define.** El motor la tira al cargar
 *   (`lenguas/packs.ts` la cuenta como ignorada) y quien tradujo no se
 *   entera de que ese trabajo no se pinta en ninguna parte.
 * - **Un placeholder escrito distinto.** `{ruta}` donde el original dice
 *   `{path}` no da error: **pinta la llave a pelo** en medio de la frase.
 * - **Un saltillo que no es `U+02BC`.** El motor lo normaliza al cargar, así
 *   que la app se ve bien y el archivo miente: dos frases que se ven iguales no
 *   coinciden con `grep` ni con una búsqueda.
 * - **Un manifiesto que Rust rechazaría.** Se descubre al instalar, que es
 *   tarde: hasta entonces la carpeta parece un paquete bueno.
 *
 * No exige cobertura: dice cuánta hay. Un paquete al 59 % es un estado
 * legítimo, y el número es lo que deja verlo crecer.
 *
 *   node scripts/guards/plugins.mjs
 *
 * Sale con 1 si encuentra algo.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PAQUETES = join(RAIZ, "plugins/languages");
const BASE = join(RAIZ, "src/locales/es");
/** Espeja `CONTRATO` de `src-tauri/src/environment/locales.rs`. */
const CONTRATO = 2;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
/** La única variante que Unicode clasifica como letra. Ver `saltillo` en `lib/i18n.ts`. */
const _SALTILLO = "ʼ";
const IMPOSTORES = /['‘’ʻ´`]/;

const llaves = (s) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const formas = (v) => (typeof v === "string" ? { other: v } : v);

/**
 * Las frases del paquete, y **solo las frases**.
 *
 * `omitir` lleva lo que el manifiesto declara como otra cosa —hoy el perfil de
 * salida del agente (`salida.perfil`)—, que es un JSON del paquete pero no un
 * catálogo. Sin esa exclusión sus campos (`instrucciones`, `glosario`,
 * `referencias`) se leen como claves de interfaz y este guarda las reporta como
 * inexistentes en `es/`. Es la misma exclusión que hace `validar` en
 * `src-tauri/src/environment/locales.rs`, y por el mismo motivo.
 */
function leer(dir, omitir = new Set()) {
  const frases = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "manifiesto.json" || omitir.has(f)) continue;
    Object.assign(frases, JSON.parse(readFileSync(join(dir, f), "utf8")));
  }
  return frases;
}

if (!existsSync(PAQUETES)) {
  console.log("Sin paquetes de lengua externos en plugins/languages/ (yua ya viaja embebido en src/locales/yua/).");
  process.exit(0);
}
const base = leer(BASE);
const problemas = [];
const codigos = readdirSync(PAQUETES).filter(
  (nombre) => !nombre.startsWith(".") && statSync(join(PAQUETES, nombre)).isDirectory(),
);
if (codigos.length === 0) {
  console.log("Sin paquetes de lengua externos en plugins/languages/.");
  process.exit(0);
}

for (const codigo of codigos) {
  const dir = join(PAQUETES, codigo);
  const mf = join(dir, "manifiesto.json");
  if (!existsSync(mf)) {
    problemas.push(`plugins/languages/${codigo}/ no tiene manifiesto.json`);
    continue;
  }
  const m = JSON.parse(readFileSync(mf, "utf8"));
  if (m.contrato > CONTRATO) problemas.push(`${codigo}: habla el contrato ${m.contrato} y la app entiende hasta el ${CONTRATO}`);
  if (m.aporta !== "lengua") problemas.push(`${codigo}: «aporta» es «${m.aporta}» y solo se conoce «lengua»`);
  if (m.gate !== "ninguno") problemas.push(`${codigo}: «gate» es «${m.gate}» y un catálogo no atraviesa nada`);
  if (m.codigo !== codigo) problemas.push(`${codigo}: el manifiesto dice «${m.codigo}» y la carpeta se llama «${codigo}»`);
  if (!SEMVER.test(m.version)) problemas.push(`${codigo}: «${m.version}» no es semver`);
  if (!["ltr", "rtl"].includes(m.direccion)) problemas.push(`${codigo}: «direccion» es «${m.direccion}»`);
  try {
    if (Intl.NumberFormat.supportedLocalesOf([m.formato]).length === 0)
      problemas.push(`${codigo}: Intl no conoce el formato «${m.formato}», así que los números saldrían con las reglas de otra lengua`);
  } catch {
    problemas.push(`${codigo}: «${m.formato}» no tiene forma de locale (BCP-47, como es-MX)`);
  }
  if (IMPOSTORES.test(m.endonimo)) problemas.push(`${codigo}: el endónimo «${m.endonimo}» no usa el saltillo U+02BC — y el manifiesto NO se normaliza al cargar`);

  const frases = leer(dir, new Set(m.salida?.perfil ? [m.salida.perfil] : []));
  let traducidas = 0;
  for (const [clave, valor] of Object.entries(frases)) {
    if (!(clave in base)) {
      problemas.push(`${codigo}: «${clave}» no existe en es/ — el motor la tira al cargar`);
      continue;
    }
    traducidas++;
    const orig = formas(base[clave]);
    const suyas = formas(valor);
    if (!suyas.other) problemas.push(`${codigo}: «${clave}» no declara la forma «other», que es la única obligatoria`);
    const esperadas = llaves(Object.values(orig).join(" "));
    for (const [forma, texto] of Object.entries(suyas)) {
      for (const l of llaves(texto))
        if (!esperadas.has(l)) problemas.push(`${codigo}: «${clave}» (${forma}) usa {${l}} y el original no lo tiene`);
      for (const l of esperadas)
        if (!llaves(texto).has(l)) problemas.push(`${codigo}: «${clave}» (${forma}) no usa {${l}}, que el original sí`);
      if (IMPOSTORES.test(texto.replaceAll("`", "")))
        problemas.push(`${codigo}: «${clave}» (${forma}) no usa el saltillo U+02BC`);
    }
  }
  const pct = ((traducidas / Object.keys(base).length) * 100).toFixed(1);
  console.log(`${codigo} (${m.endonimo}) v${m.version} — ${traducidas}/${Object.keys(base).length} claves (${pct} %)`);
}

if (problemas.length) {
  console.error(`\n${problemas.length} problema(s):`);
  for (const p of problemas.slice(0, 40)) console.error(`  · ${p}`);
  if (problemas.length > 40) console.error(`  … y ${problemas.length - 40} más`);
  process.exit(1);
}
console.log("Sin problemas.");
