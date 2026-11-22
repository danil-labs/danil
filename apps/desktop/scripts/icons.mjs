#!/usr/bin/env node
/**
 * Genera el catálogo de iconos de archivo del árbol de código.
 *
 *   node scripts/icons.mjs            → regenera el catálogo
 *   node scripts/icons.mjs --check    → falla si el catálogo no dice lo que hay
 *
 * ## Por qué se genera y no se escribe a mano
 *
 * Los iconos son **material-icon-theme**, el tema de VS Code, que es un paquete
 * npm con 1.250 SVG y los mapas de qué archivo lleva cuál. Copiarlos a mano
 * sería copiar mal: 772 extensiones y 932 nombres exactos apuntan a los 122
 * iconos que este repo empaqueta, y esos mapas los mantiene su autor. Aquí se
 * elige **qué iconos entran** y el script trae todo lo que apunte a ellos.
 *
 * ## Se empaqueta un subconjunto, y ese es el número que importa
 *
 * Los 632 iconos de archivo del tema pesan **512 kB**. Metidos en el bundle son
 * medio megabyte que el webview parsea en cada arranque para pintar veinte
 * filas. La lista de [`ICONOS`] son 118 —122 con las variantes claras— y el
 * archivo generado pesa **123 kB**, y con ellos quedan cubiertas 772
 * extensiones: los mapas van de muchas extensiones a pocos
 * iconos, así que recortar por icono cuesta mucho menos cobertura de la que
 * parece.
 *
 * Lo que caiga fuera sale con el icono genérico, que es lo que hacía **todo**
 * hasta ahora. Añadir uno es una línea en [`ICONOS`] y volver a correr esto.
 *
 * ## El tema claro tiene sus propias variantes, y hacen falta
 *
 * Cuatro de los que entran son casi negros —`toml`, `bun`, `deno`, `pnpm`— y
 * sobre el fondo claro de la app desaparecen. El tema publica una variante
 * `_light` para justo esos, y el mapa `light` dice cuál. Se empaquetan las dos
 * y elige el componente.
 *
 * ## Qué se copia y qué no
 *
 * Del SVG se guarda **solo el interior y el `viewBox`**. Los atributos de
 * alrededor los pone el componente, que es quien sabe el tamaño; y así un SVG
 * con `xml:space` o un `width` fijo dentro del paquete no se cuela en el DOM.
 *
 * Licencia: MIT, y los logos son de sus dueños. Está en `CREDITS.md`.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const TEMA = join(RAIZ, "node_modules/material-icon-theme/dist/material-icons.json");
const DESTINO = join(RAIZ, "../../packages/ui/src/file-icons.ts");

/**
 * Qué iconos se empaquetan. **Es la única decisión de este script.**
 *
 * El criterio es qué se ve en un repositorio que este producto vaya a abrir: los
 * lenguajes, los formatos de dato, las herramientas cuyo archivo de
 * configuración está en la raíz, y las clases genéricas —imagen, vídeo, fuente,
 * comprimido— que recogen lo demás.
 *
 * Un id que no exista en el tema para el build: es un nombre inventado, y
 * fallar aquí es la única forma de enterarse —el mapa lo daría por ausente y el
 * archivo saldría con el icono genérico, sin decir nada—.
 */
const ICONOS = [
  // Lenguajes
  "javascript", "typescript", "react", "react_ts", "vue", "svelte", "angular",
  "astro", "html", "css", "sass", "less", "rust", "python", "go", "java",
  "kotlin", "swift", "c", "cpp", "csharp", "php", "ruby", "lua", "dart",
  "elixir", "scala", "zig", "haskell", "r", "matlab", "tex", "proto", "bicep",
  "nix", "jupyter", "console", "powershell", "assembly", "webassembly",
  // Datos y documentos
  "json", "yaml", "toml", "xml", "markdown", "document", "pdf", "table",
  "word", "powerpoint", "database", "diff", "log", "i18n", "email",
  // Medios
  "image", "svg", "favicon", "video", "audio", "font", "3d", "figma", "sketch",
  // Empaquetado y opacos
  "zip", "exe", "hex", "disc", "lib", "certificate", "key", "lock",
  // Herramientas cuyo archivo se reconoce por el logo
  "docker", "git", "gitlab", "nodejs", "npm", "pnpm", "yarn", "bun", "deno",
  "vite", "webpack", "rollup", "esbuild", "babel", "eslint", "prettier",
  "tailwindcss", "jest", "vitest", "playwright", "cypress", "storybook",
  "tauri", "graphql", "prisma", "supabase", "firebase", "terraform",
  "kubernetes", "nginx", "makefile", "cmake", "gradle", "maven", "fastlane",
  "tsconfig", "settings", "tune", "editorconfig",
  // Los que nombran su papel en el repositorio
  "readme", "changelog", "license", "todo", "test-js", "test-ts", "test-jsx",
];

const tema = JSON.parse(readFileSync(TEMA, "utf8"));
const defs = tema.iconDefinitions;

const inventados = ICONOS.filter((i) => !defs[i]);
if (inventados.length) {
  console.error(`Estos iconos no existen en el tema: ${inventados.join(", ")}`);
  process.exit(1);
}

const elegidos = new Set(ICONOS);

/**
 * Las variantes claras de lo que se empaqueta, y solo esas.
 *
 * El tema declara el override por extensión y por nombre, no por icono, así que
 * hay que recorrer los mapas para saber qué variante le toca a cada uno.
 */
const claro = new Map();
for (const donde of ["fileExtensions", "fileNames"]) {
  for (const [clave, id] of Object.entries(tema.light?.[donde] ?? {})) {
    const base = tema[donde][clave];
    if (elegidos.has(base) && defs[id]) claro.set(base, id);
  }
}

/** El interior del SVG y su `viewBox`. Lo de alrededor lo pone el componente. */
function leer(id) {
  const ruta = normalize(join(dirname(TEMA), defs[id].iconPath));
  if (!existsSync(ruta)) throw new Error(`sin archivo: ${id} → ${ruta}`);
  const svg = readFileSync(ruta, "utf8").trim();
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  if (!viewBox) throw new Error(`sin viewBox: ${id}`);
  const cuerpo = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1];
  if (!cuerpo) throw new Error(`sin cuerpo: ${id}`);
  return { viewBox, cuerpo: cuerpo.trim() };
}

const cuerpos = new Map();
for (const id of [...elegidos, ...claro.values()]) cuerpos.set(id, leer(id));

/** Los mapas del tema, recortados a lo que se empaqueta. */
const recortar = (mapa) =>
  Object.fromEntries(
    Object.entries(mapa)
      .filter(([, id]) => elegidos.has(id))
      .sort(([a], [b]) => a.localeCompare(b)),
  );

const extensiones = recortar(tema.fileExtensions);
const nombres = recortar(tema.fileNames);

const cita = (s) => JSON.stringify(s);
/**
 * Los mapas grandes van en archivos de a lo más `POR_ARCHIVO` entradas (tope R6 de 400 líneas).
 * Cada trozo es `file-icons-<tipo>-<n>.ts`; `file-icons.ts` los junta en orden.
 */
const POR_ARCHIVO = 390;
const trozos = new Map();
const modulo = (nombre) => trozos.get(nombre).modulo;
function partir(tipo, titulo, mapa) {
  const filas = Object.entries(mapa);
  const nombres = [];
  for (let i = 0, n = 1; i < filas.length; i += POR_ARCHIVO, n++) {
    const nombre = `${tipo.toUpperCase()}_${n}`;
    const cuerpo = [
      `// GENERADO por \`node scripts/icons.mjs\`. No se edita a mano.`,
      ``,
      `/** ${titulo}, parte ${n}: se juntan en \`file-icons.ts\`. */`,
      `export const ${nombre}: Record<string, string> = {`,
      ...filas.slice(i, i + POR_ARCHIVO).map(([k, v]) => `  ${cita(k)}: ${cita(v)},`),
      `};`,
      ``,
    ].join("\n");
    trozos.set(nombre, { modulo: `file-icons-${tipo}-${n}`, cuerpo });
    nombres.push(nombre);
  }
  return nombres;
}

const lineas = [];
lineas.push(`// GENERADO por \`node scripts/icons.mjs\`. No se edita a mano.`);
lineas.push(`//`);
lineas.push(`// Origen: material-icon-theme v${leerVersion()} (MIT). Qué entra y por qué,`);
lineas.push(`// en la cabecera de ese script; qué obliga la licencia, en CREDITS.md.`);
lineas.push(``);
lineas.push(`/** El dibujo de un icono: lo de dentro del \`<svg>\` y su sistema de coordenadas. */`);
lineas.push(`export type Dibujo = { viewBox: string; cuerpo: string };`);
lineas.push(``);
lineas.push(`export const DIBUJOS: Record<string, Dibujo> = {`);
for (const [id, d] of [...cuerpos].sort(([a], [b]) => a.localeCompare(b))) {
  lineas.push(`  ${cita(id)}: { viewBox: ${cita(d.viewBox)}, cuerpo: ${cita(d.cuerpo)} },`);
}
lineas.push(`};`);
lineas.push(``);
lineas.push(`/** El icono que usa el tema claro cuando el normal se pierde sobre fondo claro. */`);
lineas.push(`export const EN_CLARO: Record<string, string> = {`);
for (const [base, id] of [...claro].sort(([a], [b]) => a.localeCompare(b))) {
  lineas.push(`  ${cita(base)}: ${cita(id)},`);
}
lineas.push(`};`);
lineas.push(``);
lineas.push(`/** Nombre de archivo completo, en minúsculas → icono. Se mira antes que la extensión. */`);
const partesNombre = partir("names", "Nombres de archivo", nombres);
lineas.push(`export const POR_NOMBRE: Record<string, string> = { ${partesNombre.map((p) => `...${p}`).join(", ")} };`);
lineas.push(``);
lineas.push(`/** Extensión, en minúsculas y sin el punto → icono. */`);
const partesExtension = partir("extensions", "Extensiones", extensiones);
lineas.push(`export const POR_EXTENSION: Record<string, string> = { ${partesExtension.map((p) => `...${p}`).join(", ")} };`);
lineas.push(``);
lineas.splice(5, 0, ...[...partesNombre, ...partesExtension].map((p) => `import { ${p} } from "./${modulo(p)}.ts";`), ``);

function leerVersion() {
  const p = join(RAIZ, "node_modules/material-icon-theme/package.json");
  return JSON.parse(readFileSync(p, "utf8")).version;
}

const salida = lineas.join("\n");
const cuenta =
  `${cuerpos.size} iconos · ${Object.keys(extensiones).length} extensiones · ` +
  `${Object.keys(nombres).length} nombres · ${Math.round(Buffer.byteLength(salida) / 1024)} kB`;

/**
 * **El guarda es que el generado cuadre con el paquete instalado.** Sin esto,
 * actualizar `material-icon-theme` no cambia nada visible: el catálogo sigue
 * siendo el de la versión anterior, con los logos viejos y sin las extensiones
 * nuevas, y nada lo dice. Es el mismo trato que `docs/PHRASES.md`.
 */
if (process.argv.includes("--check")) {
  const igual = (ruta, texto) => (existsSync(ruta) ? readFileSync(ruta, "utf8") : "") === texto;
  if (!igual(DESTINO, salida) || [...trozos.values()].some((t) => !igual(join(dirname(DESTINO), `${t.modulo}.ts`), t.cuerpo))) {
    console.error(
      "packages/ui/src/file-icons.ts está desactualizado.\n" +
        "Córrelo: node scripts/icons.mjs",
    );
    process.exit(1);
  }
  console.log(`Catálogo de iconos al día — ${cuenta}.`);
  process.exit(0);
}

writeFileSync(DESTINO, salida);
for (const t of trozos.values()) writeFileSync(join(dirname(DESTINO), `${t.modulo}.ts`), t.cuerpo);
console.log(cuenta);
