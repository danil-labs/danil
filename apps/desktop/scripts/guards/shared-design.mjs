#!/usr/bin/env node
/**
 * Que `packages/design` diga lo mismo que el escritorio.
 *
 *   node --experimental-strip-types scripts/guards/shared-design.mjs
 *
 * El paquete lo usan los clientes que no leen el CSS ni los catálogos de la
 * ventana (la app móvil). Falla si una de sus copias se aparta del original:
 * - cada token con fuente en `CSS_SOURCE` contra `src/styles/global.css`, en el
 *   orden de bloques de `CSS_THEME_BLOCKS`;
 * - cada frase de `STATUS_LABELS` contra `projects.status.*` de los catálogos;
 * - cada ícono de `STATUS_ICONS` contra el que importa `TaskStatus.tsx`;
 * - cada palabra de `WORDS` (lista de tareas, dock, máquinas) contra la misma
 *   clave en los catálogos de su lengua.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { ASTRO_BODIES, astroColors, CHANNEL_COLORS, CSS_SOURCE, CSS_THEME_BLOCKS, RADIUS, STATUS_ICONS, STATUS_LABELS, TEXT, THEMES, WORDS } = await import(
  pathToFileURL(join(ROOT, "..", "..", "packages/design/src/index.ts")).href
);

const failures = [];

function blocks(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = new Map();
  let depth = 0;
  let start = 0;
  let selector = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) {
        selector = text.slice(start, i).split(";").pop().trim();
        start = i + 1;
      }
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        const declarations = found.get(selector) ?? new Map();
        for (const match of text.slice(start, i).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) declarations.set(match[1], match[2].trim());
        found.set(selector, declarations);
        start = i + 1;
      }
    }
  }
  return found;
}

function rgba(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const fn = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!fn) return null;
  const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return parts.length === 3 ? parts.concat(1) : parts.length === 4 ? parts : null;
}

const css = blocks(readFileSync(join(ROOT, "src/styles/global.css"), "utf8"));
for (const [mode, selectors] of Object.entries(CSS_THEME_BLOCKS)) {
  const vars = new Map();
  for (const selector of selectors) {
    const block = css.get(selector);
    if (!block) failures.push(`global.css no tiene el bloque ${selector}`);
    for (const [name, value] of block ?? []) vars.set(name, value);
  }
  const resolve = (value, seen = 0) => {
    const ref = value.match(/^var\((--[\w-]+)\)$/);
    return ref && seen < 8 ? resolve(vars.get(ref[1]) ?? value, seen + 1) : value;
  };
  for (const body of ASTRO_BODIES) {
    const astroVars = new Map(css.get(":root"));
    for (const selector of selectors) for (const [key, value] of css.get(selector) ?? []) astroVars.set(key, value);
    const colors = astroColors(body, mode === "dark");
    colors.forEach((actual, index) => {
      const variable = `--astro-${body}-${index + 1}`;
      if (actual !== astroVars.get(variable)) failures.push(`${mode}.${variable}: ${actual} != ${astroVars.get(variable)}`);
    });
  }
  for (const [key, variable] of Object.entries(CSS_SOURCE)) {
    const expected = vars.get(variable);
    const actual = THEMES[mode][key];
    const a = rgba(actual);
    const e = expected === undefined ? null : rgba(resolve(expected));
    if (!a || !e || a.some((n, i) => Math.abs(n - e[i]) > 0.001)) {
      failures.push(`${mode}.${key} es ${actual}; ${variable} en global.css es ${expected === undefined ? "(no está)" : resolve(expected)}`);
    }
  }
}

const hoja = readFileSync(join(ROOT, "src/styles/global.css"), "utf8");
const medida = (variable) => hoja.match(new RegExp(`${variable}:\\s*([\\d.]+)(rem|px);`));
const enPx = (variable) => {
  const m = medida(variable);
  return m ? Number(m[1]) * (m[2] === "rem" ? 16 : 1) : null;
};
for (const [step, px] of Object.entries(TEXT)) {
  if (enPx(`--text-${step}`) !== px) failures.push(`TEXT.${step} es ${px}; --text-${step} en global.css es ${enPx(`--text-${step}`)}`);
}
for (const [step, px] of Object.entries(RADIUS)) {
  if (enPx(`--radius-${step}`) !== px) failures.push(`RADIUS.${step} es ${px}; --radius-${step} en global.css es ${enPx(`--radius-${step}`)}`);
}
for (const [channel, color] of Object.entries(CHANNEL_COLORS)) {
  if (!hoja.includes(`--color-inbox-channel-${channel}: ${color};`)) failures.push(`CHANNEL_COLORS.${channel} es ${color} y global.css dice otra cosa`);
}

// `delivered` solo lo muestra el teléfono; una tarea vista no lleva marca en el escritorio.
const PHONE_ONLY = new Set(["delivered"]);
for (const lang of Object.keys(STATUS_LABELS)) {
  const catalog = JSON.parse(readFileSync(join(ROOT, `src/locales/${lang}/projects.json`), "utf8"));
  for (const [state, text] of Object.entries(STATUS_LABELS[lang])) {
    if (PHONE_ONLY.has(state)) continue;
    const desktop = catalog[`projects.status.${state}`];
    if (desktop !== text) failures.push(`${lang}: STATUS_LABELS.${state} es "${text}"; projects.status.${state} es "${desktop}"`);
  }
}

// Las palabras de la lista de tareas, el dock y las máquinas, contra cualquier catálogo de su lengua.
for (const lang of Object.keys(WORDS)) {
  const dir = join(ROOT, `src/locales/${lang}`);
  const catalog = Object.assign({}, ...readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8"))));
  for (const [key, text] of Object.entries(WORDS[lang])) {
    if (JSON.stringify(catalog[key]) !== JSON.stringify(text)) {
      failures.push(`${lang}: WORDS["${key}"] es ${JSON.stringify(text)}; el catálogo dice ${JSON.stringify(catalog[key])}`);
    }
  }
}

// lucide-solid conserva los nombres viejos como alias de los renombrados.
const ALIASES = { "circle-help": "circle-question-mark", "shield-question": "shield-question-mark" };
const status = readFileSync(join(ROOT, "src/features/projects/TaskStatus.tsx"), "utf8");
const imported = new Map(
  [...status.matchAll(/import (\w+) from "lucide-solid\/icons\/([\w-]+)"/g)].map((m) => [m[1], ALIASES[m[2]] ?? m[2]]),
);
const body = status.slice(status.indexOf("export function stateIcon"));
const icons = new Map([...body.matchAll(/case "(\w+)": return (\w+);/g)].map((m) => [m[1], imported.get(m[2])]));
const fallback = body.match(/default: return (\w+);/);
if (fallback) icons.set("asked", imported.get(fallback[1]));
icons.set("delivered", imported.get("Check"));
for (const [state, name] of Object.entries(STATUS_ICONS)) {
  if (icons.get(state) !== name) failures.push(`STATUS_ICONS.${state} es ${name}; TaskStatus.tsx usa ${icons.get(state) ?? "(ninguno)"}`);
}

if (failures.length) {
  console.error(`packages/design se apartó del escritorio:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("packages/design coincide con global.css, los catálogos (estados y palabras) y TaskStatus.tsx.");
