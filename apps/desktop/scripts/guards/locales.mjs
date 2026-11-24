#!/usr/bin/env node
/**
 * Que la clave que el código pide exista, y que la traducción diga lo mismo.
 *
 * Los cuatro fallos que caza **no dan error en ningún sitio**: caen al respaldo y
 * se pintan en español, así que la app se ve entera y en la lengua equivocada.
 *
 * - **Una clave que nadie definió.** `t("settings.env.instal")` pinta la clave
 *   misma. En una pantalla que quien la escribió no volvió a abrir, eso llega a
 *   producción tal cual.
 * - **Una clave que ya no usa nadie.** El texto se borró del componente y la
 *   frase se quedó en el catálogo. No rompe nada, y por eso crece: alguien va a
 *   traducirla al maya y ese trabajo no se va a ver nunca.
 * - **Una clave que una lengua empotrada no tradujo.** Cae al respaldo y **se
 *   pinta en español**: la app en inglés se ve entera y con un renglón en otra
 *   lengua. Solo se exige a las de
 *   `src/locales/` —`en` es el puente desde el que traduce todo el mundo—; un
 *   paquete de disco siempre va por detrás y para eso está la cascada.
 * - **Un placeholder que la traducción escribió distinto.** `{ruta}` donde el
 *   original dice `{path}` no falla: **pinta la llave a pelo**, en medio de una
 *   frase por lo demás correcta.
 *
 * Y una cuarta, que es de rastreo y no de ejecución: **la clave empieza por el
 * nombre de su archivo**. Sin eso, `grep settings.env.install` encuentra el sitio
 * que la usa y no el que la define, que es justo lo que uno busca cuando quiere
 * cambiar una frase. Este repo se investiga con `git log -S`; una clave que no
 * se puede buscar rompe esa herramienta.
 *
 *   node scripts/guards/locales.mjs
 *
 * Sale con 1 si encuentra algo. No necesita `dist/`: lee el código fuente —el
 * del front **y el del backend**, porque desde que Rust manda claves en vez de
 * prosa (`util::Frase`) las suyas se comprueban igual que las del JSX.
 *
 * ## Qué NO puede ver, y por eso lo imprime cada vez
 *
 * - **Claves armadas en tiempo de ejecución** —`` t(`setup.row.${p.kind}`) ``—.
 *   No aparecen enteras en el código, así que ni se comprueban ni cuentan como
 *   uso. Se listan sus prefijos al final: una clave que empiece por uno de ellos
 *   no se reporta como huérfana, porque no se puede saber.
 * - **Si la traducción dice lo que dice el original.** Eso no lo comprueba un
 *   guarda. Lo comprueba quien habla la lengua.
 */
import { readFileSync, readdirSync, } from "node:fs";
import { join, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..");
const FUENTE = join(RAIZ, "src");
const LENGUAS = join(RAIZ, "src/locales");
/** Las claves que manda el motor: su código no vive en este repositorio. */
const ENGINE_KEYS = join(RAIZ, "src-tauri/crates/engine-protocol/phrase-keys.json");
/** El Rust de la ventana pide sus claves con `Frase::new("clave")`. */
const WINDOW_RUST = join(RAIZ, "src-tauri/src");
/** La lengua en la que se escribe el catálogo fuente. Ver `lib/i18n.ts`. */
const BASE = "es";
/** La versión del formato de paquete. Espeja `CONTRATO` de `src-tauri/src/environment/locales.rs`. */
const CONTRATO = 1;
/** La oficial de semver.org, sin el `v` de delante: `1.2.3`, `1.0.0-beta.1`. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function tsx(dir, salida = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) tsx(p, salida);
    else if (/\.tsx?$/.test(e.name)) salida.push(p);
  }
  return salida;
}

/** Quita comentarios: una clave citada en una cabecera de módulo no es un uso. */
const sinComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── Lo que el código pide ────────────────────────────────────────────────────
/** clave → [{archivo, linea}] */
const usos = new Map();
/** Prefijos de claves compuestas: `t(\`setup.row.${x}\`)` → `setup.row.` */
const dinamicas = new Set();

for (const archivo of tsx(FUENTE)) {
  if (archivo.startsWith(LENGUAS)) continue;
  const crudo = readFileSync(archivo, "utf8");
  const limpio = sinComentarios(crudo);
  for (const m of limpio.matchAll(/\bt\(\s*"([^"]+)"/g)) {
    const linea = limpio.slice(0, m.index).split("\n").length;
    if (!usos.has(m[1])) usos.set(m[1], []);
    usos.get(m[1]).push({ archivo: relative(RAIZ, archivo), linea });
  }
  for (const m of limpio.matchAll(/\bt\(\s*`([^`$]*)\$\{/g)) dinamicas.add(m[1]);
}

/**
 * Y lo que pide el backend, que hasta ahora no lo miraba nadie.
 *
 * **La prosa que Rust mandaba a la pantalla no la podía traducir ningún
 * catálogo**: llegaba escrita, en español, y el selector de idioma no tenía
 * nada que hacer con ella. Ahora Rust manda `Frase::new("clave")` y traduce
 * quien pinta (`src/lib/prose.ts`, `src-tauri/src/util.rs`).
 *
 * Eso mete las claves del backend en las dos comprobaciones de este guarda, que
 * es la mitad que impide que esto se vuelva a desincronizar: una clave mal
 * escrita en Rust **no da error en ningún sitio** —cae al respaldo de `t()` y se
 * pinta la clave en medio de la pantalla— y una frase que el backend dejó de
 * pedir se quedaría en el catálogo para que alguien la tradujera al maya sin
 * que se vea nunca.
 *
 * **Se lee el literal en el sitio de la llamada, como `bridge.mjs` y
 * `commands.mjs`.** No se buscan cadenas con forma de clave por todo el
 * archivo: `ai.danil.harness` tiene esa forma y no es una frase. Y por eso la
 * clave no se puede componer en Rust — un `format!` aquí sale de la
 * comprobación sin que nada avise.
 */
function rust(dir, salida = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) rust(p, salida);
    else if (e.name.endsWith(".rs")) salida.push(p);
  }
  return salida;
}
for (const archivo of rust(WINDOW_RUST)) {
  const limpio = sinComentarios(readFileSync(archivo, "utf8"));
  for (const m of limpio.matchAll(/\bFrase::new\(\s*"([^"]+)"/g)) {
    const linea = limpio.slice(0, m.index).split("\n").length;
    if (!usos.has(m[1])) usos.set(m[1], []);
    usos.get(m[1]).push({ archivo: relative(RAIZ, archivo), linea });
  }
}

const engineKeys = JSON.parse(readFileSync(ENGINE_KEYS, "utf8")).keys;
for (const clave of engineKeys) {
  if (!usos.has(clave)) usos.set(clave, []);
  usos.get(clave).push({ archivo: relative(RAIZ, ENGINE_KEYS), linea: 0 });
}

// ── Lo que el catálogo define ────────────────────────────────────────────────
/** código → { frases: Map<clave, {valor, archivo}>, manifiesto } */
const catalogos = new Map();
const problemas = [];

// Solo las carpetas: `lenguas/catalogs.ts` vive al lado y no es una lengua.
for (const entrada of readdirSync(LENGUAS, { withFileTypes: true })) {
  if (!entrada.isDirectory()) continue;
  const codigo = entrada.name;
  const dir = join(LENGUAS, codigo);
  const frases = new Map();
  let manifiesto = null;
  for (const nombre of readdirSync(dir)) {
    if (!nombre.endsWith(".json")) continue;
    const ruta = join(dir, nombre);
    let json;
    try {
      json = JSON.parse(readFileSync(ruta, "utf8"));
    } catch (e) {
      problemas.push(`${relative(RAIZ, ruta)} no es JSON válido: ${e.message}`);
      continue;
    }
    if (nombre === "manifiesto.json") {
      manifiesto = { ...json, ruta: relative(RAIZ, ruta) };
      continue;
    }
    const prefijo = basename(nombre, ".json");
    for (const [clave, valor] of Object.entries(json)) {
      if (!clave.startsWith(prefijo + ".")) {
        problemas.push(
          `${relative(RAIZ, ruta)}: «${clave}» no empieza por «${prefijo}.», ` +
            `así que buscarla en el repo no lleva a este archivo`,
        );
      }
      frases.set(clave, { valor, archivo: relative(RAIZ, ruta) });
    }
  }
  catalogos.set(codigo, { frases, manifiesto });
}

if (!catalogos.has(BASE)) {
  console.error(`No hay catálogo «${BASE}», que es el respaldo de todo.`);
  process.exit(1);
}
const base = catalogos.get(BASE);

// ── 1 · Claves que el código pide y nadie definió ────────────────────────────
const faltantes = [...usos.keys()].filter((c) => !base.frases.has(c));

// ── 2 · Claves definidas que nadie usa ───────────────────────────────────────
const esDinamica = (c) => [...dinamicas].some((p) => c.startsWith(p));
const huerfanas = [...base.frases.keys()].filter(
  (c) => !usos.has(c) && !esDinamica(c),
);

// ── 3 · Manifiestos ──────────────────────────────────────────────────────────
for (const [codigo, cat] of catalogos) {
  if (!cat.manifiesto) {
    problemas.push(`src/locales/${codigo}/ no tiene manifiesto.json`);
    continue;
  }
  const m = cat.manifiesto;
  for (const campo of ["contrato", "aporta", "gate", "codigo", "endonimo", "version", "formato", "direccion"]) {
    if (!m[campo]) problemas.push(`${m.ruta}: falta «${campo}»`);
  }
  // Los empotrados hablan el mismo formato que uno instalado y lo declaran igual
  // — es lo que hace que el precedente valga. Los valores cerrados los impone
  // `src-tauri/src/environment/locales.rs` con `enum` de serde; esto es la mitad que se ve
  // sin compilar Rust, y sin ella `es` podría declarar un contrato que la app
  // rechazaría si viniera de disco.
  if (m.contrato !== CONTRATO)
    problemas.push(
      `${m.ruta}: «contrato» es ${JSON.stringify(m.contrato)} y esta app habla el ${CONTRATO}`,
    );
  if (m.aporta && m.aporta !== "lengua")
    problemas.push(`${m.ruta}: «aporta» dice «${m.aporta}», y solo vale: lengua`);
  if (m.gate && m.gate !== "ninguno")
    problemas.push(
      `${m.ruta}: «gate» dice «${m.gate}», y un catálogo no atraviesa nada: ninguno`,
    );
  if (m.codigo !== codigo)
    problemas.push(`${m.ruta}: dice «${m.codigo}» y su carpeta se llama «${codigo}»`);
  // Semver, y no «un número cualquiera»: la versión existe para poder decir si
  // el paquete que alguien tiene es el corregido o el de hace tres meses, y eso
  // es una comparación. «2» y «v1.2» se leen como versiones y no se ordenan.
  if (m.version && !SEMVER.test(m.version))
    problemas.push(
      `${m.ruta}: «${m.version}» no es semver (mayor.menor.parche), así que no ` +
        `se puede decir si es anterior o posterior a otro paquete`,
    );
  if (m.direccion && !["ltr", "rtl"].includes(m.direccion))
    problemas.push(`${m.ruta}: «direccion» es «${m.direccion}», y solo vale ltr o rtl`);
  // Un locale que `Intl` no reconoce no falla al usarse: contesta con otro. Es
  // exactamente el motivo por el que el manifiesto declara este campo.
  if (m.formato) {
    try {
      if (Intl.NumberFormat.supportedLocalesOf([m.formato]).length === 0)
        problemas.push(
          `${m.ruta}: «${m.formato}» no lo reconoce Intl, así que los números y ` +
            `las fechas saldrían en otra lengua sin dar error`,
        );
    } catch {
      problemas.push(`${m.ruta}: «${m.formato}» no es un locale válido`);
    }
  }
}

// ── 4 · Placeholders que no coinciden con el original ────────────────────────
const marcas = (v) =>
  new Set(
    [...String(typeof v === "string" ? v : Object.values(v ?? {}).join(" ")).matchAll(
      /\{(\w+)\}/g,
    )].map((m) => m[1]),
  );

/** Lenguas embebidas cuya traducción parcial cae al respaldo (`es`) de forma explícita. */
const PARCIALES = new Set(["yua"]);

const descuadres = [];
for (const [codigo, cat] of catalogos) {
  if (codigo === BASE) continue;

  /**
   * Y **lo que le falta**, que es el mismo defecto por el otro lado.
   *
   * Una clave sin traducir cae al respaldo y **se pinta en español**: la app en
   * inglés se ve entera, correcta, y con un renglón en otra lengua — sin dar
   * error en ningún sitio.
   *
   * Se exige cobertura completa a `en` (puente desde el que traduce cualquier
   * comunidad). Las lenguas embebidas en `PARCIALES` (como `yua`) viven en el
   * bundle con cobertura parcial y caen al respaldo para las claves faltantes.
   */
  if (!PARCIALES.has(codigo)) {
    for (const clave of base.frases.keys()) {
      if (!cat.frases.has(clave))
        descuadres.push({
          codigo,
          clave,
          archivo: `src/locales/${codigo}/`,
          que: `no está traducida, así que se pinta en «${BASE}»`,
        });
    }
  }

  for (const [clave, { valor, archivo }] of cat.frases) {
    if (!base.frases.has(clave)) {
      descuadres.push({ codigo, clave, archivo, que: `no existe en «${BASE}»` });
      continue;
    }
    const suyas = marcas(valor);
    const originales = marcas(base.frases.get(clave).valor);
    const sobran = [...suyas].filter((x) => !originales.has(x));
    const faltan = [...originales].filter((x) => !suyas.has(x));
    if (sobran.length || faltan.length) {
      const partes = [];
      if (faltan.length) partes.push(`le falta {${faltan.join("}, {")}}`);
      if (sobran.length) partes.push(`sobra {${sobran.join("}, {")}}`);
      descuadres.push({ codigo, clave, archivo, que: partes.join(" y ") });
    }
  }
}

// ── Salida ───────────────────────────────────────────────────────────────────
function noComprueba() {
  console.error(
    "\nLo que este guarda NO mira: las claves armadas en tiempo de ejecución\n" +
      (dinamicas.size
        ? `(prefijos vistos: ${[...dinamicas].join(", ")}) `
        : "") +
      "y si la traducción dice lo que dice el original — eso lo comprueba quien\n" +
      "habla la lengua, no un script.",
  );
}

const hay = faltantes.length || huerfanas.length || descuadres.length || problemas.length;
if (!hay) {
  const cuenta = [...catalogos]
    .map(([c, { frases }]) => `${c}: ${frases.size}`)
    .join(" · ");
  console.log(`Catálogo consistente — ${cuenta}, ${usos.size} claves usadas.`);
  noComprueba();
  process.exit(0);
}

if (faltantes.length) {
  console.error(`\n${faltantes.length} clave(s) que el código pide y «${BASE}» no define:\n`);
  for (const c of faltantes.sort()) {
    console.error(`  ${c}`);
    for (const { archivo, linea } of usos.get(c)) console.error(`    ${archivo}:${linea}`);
  }
  console.error("\n  Se pinta la clave misma, sin error y sin nada en consola.");
}

if (huerfanas.length) {
  console.error(`\n${huerfanas.length} frase(s) que ya no usa nadie:\n`);
  for (const c of huerfanas.sort())
    console.error(`  ${c}    ${base.frases.get(c).archivo}`);
  console.error(
    "\n  No rompen nada, y por eso crecen: alguien va a traducirlas y ese\n" +
      "  trabajo no se va a ver nunca.",
  );
}

if (descuadres.length) {
  console.error(`\n${descuadres.length} desajuste(s) entre una traducción y «${BASE}»:\n`);
  for (const d of descuadres)
    console.error(`  [${d.codigo}] ${d.clave} — ${d.que}\n    ${d.archivo}`);
  console.error(
    "\n  Una clave sin traducir se pinta en español; un placeholder que no\n" +
      "  coincide pinta la llave a pelo. Ninguno de los dos da error.",
  );
}

if (problemas.length) {
  console.error(`\n${problemas.length} problema(s) de catálogo:\n`);
  for (const p of problemas) console.error(`  ${p}`);
}

noComprueba();
process.exit(1);
