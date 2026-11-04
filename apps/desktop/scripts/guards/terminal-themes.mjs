#!/usr/bin/env node
/**
 * La segunda capa de color no toca la primera: `docs/visual-system.md` § Las
 * reglas. Un tema que declarara `--color-surface` repintaría el chrome y
 * dejaría sin base todas las mediciones de esa página.
 *
 * Comprueba cinco cosas: contención, que los temas declaren el mismo juego de
 * tokens, que el de por omisión repita `@theme`, que los identificadores del
 * CSS y los del catálogo TypeScript coincidan, y el contraste medido.
 *
 *   node scripts/guards/terminal-themes.mjs [--table]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CSS = join(ROOT, "src/styles/terminal.css");
const GLOBAL = join(ROOT, "src/styles/global.css");
const CATALOGO = join(ROOT, "src/lib/terminal-themes.ts");

const PROPIOS = ["--color-terminal", "--color-diff-"];
const POR_OMISION = "terminus";

const MINIMOS = {
  "--color-terminal-text": 4.5,
  "--color-terminal-muted": 4.5,
  "--color-terminal-ok": 4.5,
  "--color-terminal-warn": 4.5,
  "--color-terminal-error": 4.5,
  // El acento pinta el cursor y la barra de avance, que son formas y no texto:
  // WCAG 2.2 § 1.4.11 pide 3:1 para un componente no textual.
  "--color-terminal-accent": 3,
};

const lineal = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);

function luminancia(hex) {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => lineal(Number.parseInt(n.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function bloques(css) {
  const salida = new Map();
  for (const m of css.matchAll(/\[data-terminal-theme="([a-z0-9-]+)"\]\s*\{([^}]*)\}/g)) {
    salida.set(m[1], declaraciones(m[2]));
  }
  return salida;
}

function declaraciones(cuerpo) {
  const sinComentarios = cuerpo.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = new Map();
  for (const linea of sinComentarios.split(";")) {
    const [clave, ...resto] = linea.split(":");
    const nombre = clave.trim();
    if (nombre) tokens.set(nombre, resto.join(":").trim());
  }
  return tokens;
}

const css = readFileSync(CSS, "utf8");
const temas = bloques(css);
const failures = [];

if (temas.size === 0) failures.push(`${CSS} no declara ni un bloque \`[data-terminal-theme="…"]\`.`);

// Nada fuera del archivo puede escribir estos bloques: si alguien los mueve, el
// guarda dejaría de mirar sin fallar.
const ajenos = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/^\s*[^@\s/][^{]*\{/gm) ?? [];
for (const sel of ajenos) {
  if (!/\[data-terminal-theme="[a-z0-9-]+"\]/.test(sel)) {
    failures.push(`Selector que no es un tema de terminal en ${CSS}: ${sel.trim()}`);
  }
}

for (const [id, tokens] of temas) {
  for (const nombre of tokens.keys()) {
    if (!PROPIOS.some((p) => nombre.startsWith(p))) {
      failures.push(
        `«${id}» declara \`${nombre}\`, que es chrome de la app. La segunda capa ` +
          `solo posee ${PROPIOS.join(" y ")}.`,
      );
    }
  }
}

const referencia = temas.get(POR_OMISION);
if (!referencia) {
  failures.push(`Falta el bloque del tema por omisión «${POR_OMISION}».`);
} else {
  for (const [id, tokens] of temas) {
    for (const nombre of referencia.keys()) {
      if (!tokens.has(nombre)) failures.push(`«${id}» no declara \`${nombre}\`.`);
    }
    for (const nombre of tokens.keys()) {
      if (!referencia.has(nombre)) failures.push(`«${id}» declara \`${nombre}\`, que «${POR_OMISION}» no tiene.`);
    }
  }

  const base = declaraciones(readFileSync(GLOBAL, "utf8").match(/@theme static\s*\{([\s\S]*?)\n\}/)?.[1] ?? "");
  for (const [nombre, valor] of referencia) {
    if (base.get(nombre) !== valor) {
      failures.push(
        `«${POR_OMISION}» dice \`${nombre}: ${valor}\` y \`@theme\` dice ` +
          `\`${base.get(nombre) ?? "nada"}\`. Quien no elige tema vería dos cosas distintas.`,
      );
    }
  }
}

const fuente = readFileSync(CATALOGO, "utf8");
const declarados = new Set([...fuente.matchAll(/id:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]));
for (const id of temas.keys()) {
  if (!declarados.has(id)) failures.push(`«${id}» está en el CSS y no en ${CATALOGO}.`);
}
for (const id of declarados) {
  if (!temas.has(id)) failures.push(`«${id}» está en ${CATALOGO} y no tiene bloque en el CSS.`);
}

const tabla = [];
for (const [id, tokens] of temas) {
  const fondo = tokens.get("--color-terminal");
  const barra = tokens.get("--color-terminal-bar");
  if (!fondo) continue;
  for (const [nombre, minimo] of Object.entries(MINIMOS)) {
    const color = tokens.get(nombre);
    if (!color) continue;
    const sobreFondo = contrast(color, fondo);
    tabla.push([id, nombre.replace("--color-terminal-", ""), sobreFondo, minimo]);
    if (sobreFondo < minimo) {
      failures.push(
        `«${id}»: \`${nombre}\` da ${sobreFondo.toFixed(2)}:1 sobre el fondo y pide ${minimo}:1.`,
      );
    }
  }
  // La barra de título lleva el nombre del tema y el contador de etapas.
  if (barra) {
    for (const nombre of ["--color-terminal-text", "--color-terminal-muted"]) {
      const sobreBarra = contrast(tokens.get(nombre), barra);
      tabla.push([id, `${nombre.replace("--color-terminal-", "")} / barra`, sobreBarra, 4.5]);
      if (sobreBarra < 4.5) {
        failures.push(
          `«${id}»: \`${nombre}\` da ${sobreBarra.toFixed(2)}:1 sobre la barra y pide 4.5:1.`,
        );
      }
    }
  }
}

if (process.argv.includes("--table")) {
  for (const [id, token, valor, minimo] of tabla) {
    console.log(`${id.padEnd(22)} ${token.padEnd(16)} ${valor.toFixed(2).padStart(6)}:1  (≥${minimo})`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problema(s) en el catálogo de temas de terminal:\n`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error("");
  process.exit(1);
}

console.log(
  `${temas.size} temas de terminal: solo tocan la segunda capa y todos llegan a AA en su texto.`,
);
