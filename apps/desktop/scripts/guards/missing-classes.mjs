#!/usr/bin/env node
/**
 * Clases escritas en el TSX que la hoja compilada no define.
 *
 * Una clase escrita **que Tailwind nunca generó** no da error de tipos, no rompe el
 * build, no deja rastro en consola — pinta nada.
 *
 * Costó cinco sitios y un reporte del dueño. `bg-surface-sunken` se escribió en
 * cinco componentes porque `--surface-sunken` existe en `global.css`; lo que no
 * existe es `--color-surface-sunken` **dentro de `@theme`**, que es de donde
 * Tailwind v4 saca las utilities. El interruptor de «Publicar código» salió con
 * la píldora transparente: una perilla blanca sobre una tarjeta blanca, que se
 * reportó como «no veo nada, solo un mensaje, ¿cómo lo activo?».
 *
 *   pnpm build && pnpm web:build && node scripts/guards/missing-classes.mjs
 *
 * Sale con 1 si encuentra alguna. Necesita `dist/assets` y `dist-web`: compara contra el CSS
 * **compilado**, no contra `global.css` — leer el token en el archivo fuente es
 * justo el paso que da por buena una clase que no se emitió.
 *
 * ## Qué NO puede ver, y por eso lo imprime cada vez
 *
 * Un guarda que se cree completo enseña un verde que nadie puso. Este mira
 * dentro de `class=`, `className=`, `cn()`, `cva()`, `clsx()` y `cx()` de los
 * `.tsx`, y de ahí:
 *
 * - **No comprueba las de una sola palabra** —`flex`, `grid`, `sheet`—: sin
 *   guion, dos puntos ni corchete no se distinguen de una cadena cualquiera, y
 *   `cva` tiene literales que no son clases (`defaultVariants: "primary"`).
 * - **No comprueba las armadas por plantilla** —`` `limite-${n}` ``—: no
 *   aparecen enteras en el código. Se listan sus prefijos al final.
 * - **No mira fuera de esos contextos.** Una clase escrita en una cadena suelta
 *   que acabe en el DOM por otro camino no la ve. El HTML del contenedor de
 *   artefactos entra por ahí y es de `artifact.mjs`, no de aquí.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..");
const FUENTE = join(RAIZ, "src");
const DIST = join(RAIZ, "dist/assets");
const GLOBAL = join(RAIZ, "src/styles/global.css");
const WEB = join(RAIZ, "dist-web");

/** Dónde se escriben clases. Lo de fuera de aquí no se mira, y se dice. */
const LLAMADAS = ["cn", "cva", "clsx", "cx"];

// ------------------------------------------------- las clases que la hoja tiene

if (!existsSync(DIST)) {
  console.error("No hay `dist/assets`. Corre `pnpm build` primero.");
  process.exit(2);
}
const hojas = readdirSync(DIST).filter((f) => f.endsWith(".css"));
if (hojas.length === 0) {
  console.error(
    "No hay hojas en dist/assets. Corre `pnpm build` primero.",
  );
  process.exit(2);
}
const css = hojas.map((hoja) => readFileSync(join(DIST, hoja), "utf8")).join("\n");

/**
 * Los nombres se comparan **desescapados**, no escapando los míos.
 *
 * Tailwind escribe `.hover\:bg-primary\/40` y `.w-\[min\(880px\,100\%\)\]`.
 * Reproducir ese escapado aquí es adivinar sus reglas y equivocarse en el caso
 * raro, que es donde importa. `(?:\\.|[\w-])+` consume el par barra-carácter
 * entero, así que el nombre termina solo donde empieza la pseudo-clase —el `:`
 * de `:hover` no va escapado— y quitarle las barras devuelve la clase tal como
 * se escribe en el TSX.
 */
const clasesEn = (texto) => new Set(
  [...texto.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1].replace(/\\(.)/g, "$1")),
);
const definidas = clasesEn(css);
function* hojasWeb(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* hojasWeb(path);
    else if (entry.name.endsWith(".css")) yield path;
  }
}
if (!existsSync(WEB)) {
  console.error("No hay dist-web. Corre `pnpm web:build` primero.");
  process.exit(2);
}
const webHojas = [...hojasWeb(WEB)];
if (!webHojas.length) {
  console.error("No hay hojas en dist-web. Corre `pnpm web:build` primero.");
  process.exit(2);
}
const definidasWeb = clasesEn(webHojas.map((f) => readFileSync(f, "utf8")).join("\n"));

// ------------------------------------------------ los alias que no son utility

/**
 * Un alias del legacy —`--surface-sunken: var(--color-surface-muted)`— es la
 * pista que convierte «esta clase no existe» en «usa esta otra». Es la única
 * forma de que el mensaje sirva sin volver a investigar de cero.
 */
const alias = new Map();
if (existsSync(GLOBAL)) {
  const g = readFileSync(GLOBAL, "utf8");
  for (const m of g.matchAll(/--([\w-]+)\s*:\s*var\(--color-([\w-]+)\)/g)) {
    alias.set(m[1], m[2]);
  }
}

// ------------------------------------------------- las clases que se escriben

function* archivos(x) {
  if (statSync(x).isDirectory()) {
    for (const e of readdirSync(x)) yield* archivos(join(x, e));
  } else if (extname(x) === ".tsx") yield x;
}

/**
 * Un escáner de una pasada, y no una regex por contexto.
 *
 * `class={cn(a ? "x" : "y", { ... })}` anida llaves, paréntesis y cadenas: una
 * regex que busque el cierre acierta hasta el primer `)` dentro de un literal.
 * Este recorre carácter a carácter sabiendo cuándo está dentro de una cadena o
 * de un comentario, lleva la pila de lo que hay abierto, y apunta en qué nivel
 * empezó un contexto de clase para saber dónde termina.
 */
function literalesDeClase(texto) {
  const salida = [];
  const plantillas = [];
  const pila = [];
  const marcas = [];
  let linea = 1;

  const cierreDe = { "(": ")", "{": "}", "[": "]" };
  const enContexto = () => marcas.length > 0;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (c === "\n") { linea++; continue; }

    // Comentarios: su prosa nombra clases al explicarlas, y nombrarlas no es
    // escribirlas.
    if (c === "/" && texto[i + 1] === "/") {
      while (i < texto.length && texto[i] !== "\n") i++;
      linea++;
      continue;
    }
    if (c === "/" && texto[i + 1] === "*") {
      const fin = texto.indexOf("*/", i + 2);
      const trozo = texto.slice(i, fin < 0 ? texto.length : fin);
      linea += (trozo.match(/\n/g) ?? []).length;
      i = fin < 0 ? texto.length : fin + 1;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      const desde = i;
      const empieza = linea;
      i++;
      while (i < texto.length && texto[i] !== c) {
        if (texto[i] === "\\") i++;
        else if (texto[i] === "\n") linea++;
        i++;
      }
      const crudo = texto.slice(desde + 1, i);
      if (enContexto()) {
        // `x === "abierto"` mete una cadena que no es una clase dentro de un
        // `class={}`. Se descarta mirando el operador de al lado.
        const antes = texto.slice(Math.max(0, desde - 3), desde).trimEnd();
        const despues = texto.slice(i + 1, i + 4).trimStart();
        const comparada = /[=!]=$/.test(antes) || /^[=!]=/.test(despues);
        if (!comparada) {
          if (crudo.includes("${")) plantillas.push({ crudo, linea: empieza });
          else salida.push({ crudo, linea: empieza });
        }
      }
      continue;
    }

    if (c in cierreDe) {
      pila.push(cierreDe[c]);
      continue;
    }
    if (c === ")" || c === "}" || c === "]") {
      pila.pop();
      if (marcas.length && pila.length < marcas[marcas.length - 1]) marcas.pop();
      continue;
    }

    // `class=` / `className=`, con su valor entre comillas o entre llaves.
    if (c === "c" && /^class(Name)?\s*=/.test(texto.slice(i, i + 12))) {
      const igual = texto.indexOf("=", i);
      let j = igual + 1;
      while (j < texto.length && /\s/.test(texto[j])) j++;
      if (texto[j] === "{") marcas.push(pila.length + 1);
      else if (texto[j] === '"' || texto[j] === "'") marcas.push(pila.length + 1);
      // Con comillas no hay llave que empujar la pila, así que el contexto se
      // cierra solo al leer ese literal: se marca y se desmarca en el acto.
      if (texto[j] === '"' || texto[j] === "'") {
        const fin = texto.indexOf(texto[j], j + 1);
        const crudo = texto.slice(j + 1, fin);
        if (crudo.includes("${")) plantillas.push({ crudo, linea });
        else salida.push({ crudo, linea });
        marcas.pop();
        linea += (texto.slice(i, fin).match(/\n/g) ?? []).length;
        i = fin;
      }
      continue;
    }

    // `cn(`, `cva(`, `clsx(`, `cx(`
    if (/[a-z]/.test(c)) {
      const resto = texto.slice(i, i + 8);
      const m = /^([a-z]+)\s*\(/.exec(resto);
      if (m && LLAMADAS.includes(m[1]) && !/[\w.$]/.test(texto[i - 1] ?? "")) {
        marcas.push(pila.length + 1);
        i += m[0].length - 1;
        pila.push(")");
      }
    }
  }

  return { literales: salida, plantillas };
}

/** Sin guion, dos puntos ni corchete no se distingue de una cadena cualquiera. */
const comprobable = (t) => /[-:[]/.test(t) && /^[a-zA-Z[!]/.test(t);

const muertas = new Map();
const armadas = new Set();
let escritas = 0;
let saltadas = 0;

/**
 * **Contra una hoja vieja este guarda miente en las dos direcciones.**
 *
 * Una clase escrita después del último `build` no está en el CSS, y sale
 * acusada de no existir; una que se acaba de borrar sigue en el CSS y no se
 * echa de menos. Se descubrió con su propio control negativo: el archivo de
 * prueba estrenaba `hover:bg-neutral-200`, que es correctísima, y el guarda la
 * dio por muerta.
 *
 * Así que la frescura se comprueba y se falla distinto —código 2, no 1—: una
 * cosa es «encontré clases muertas» y otra «no estoy en condiciones de mirar».
 */
const nuevos = [];
const tCss = Math.min(...hojas.map((hoja) => statSync(join(DIST, hoja)).mtimeMs), ...webHojas.map((hoja) => statSync(hoja).mtimeMs));
for (const f of archivos(FUENTE)) {
  if (statSync(f).mtimeMs > tCss) nuevos.push(relative(RAIZ, f));
}
if (nuevos.length) {
  console.error(
    `La hoja compilada es más vieja que ${nuevos.length} archivo(s) del código:\n`,
  );
  for (const n of nuevos.slice(0, 8)) console.error(`  ${n}`);
  if (nuevos.length > 8) console.error(`  … y ${nuevos.length - 8} más`);
  console.error(
    "\nComparar contra ella daría por muertas las clases que aún no se han\n" +
      "compilado, y por vivas las que ya se borraron. Compila escritorio y web primero.",
  );
  process.exit(2);
}

for (const f of archivos(FUENTE)) {
  const donde = relative(RAIZ, f).replaceAll("\\", "/");
  const { literales, plantillas } = literalesDeClase(readFileSync(f, "utf8"));
  const clases = /^src\/web\/(admin|auth|connect)\//.test(donde) ? definidasWeb : definidas;
  for (const { crudo } of plantillas) {
    for (const m of crudo.matchAll(/([a-zA-Z][\w-]*)-\$\{/g)) armadas.add(m[1]);
  }

  for (const { crudo, linea } of literales) {
    for (const token of crudo.split(/\s+/)) {
      if (!token) continue;
      if (!comprobable(token)) { saltadas++; continue; }
      escritas++;
      if (clases.has(token)) continue;
      const clave = `${token} ${donde}:${linea}`;
      if (!muertas.has(clave)) muertas.set(clave, { token, donde, linea });
    }
  }
}

// ------------------------------------------------------------------ el informe

const noComprueba = () => {
  console.log(
    `\n  No comprobadas: ${saltadas} de una sola palabra —sin guion no se ` +
      `distinguen de\n  una cadena cualquiera— y las armadas por plantilla` +
      (armadas.size ? `, con prefijo: ${[...armadas].sort().join(", ")}` : "") +
      `.\n  Solo se mira dentro de class=, className=, ${LLAMADAS.map((l) => l + "()").join(", ")}.`,
  );
};

if (muertas.size === 0) {
  console.log(`Las ${escritas} clases que se escriben existen en la hoja compilada.`);
  noComprueba();
  process.exit(0);
}

console.error(
  `${muertas.size} clase(s) escritas que la hoja compilada no define:\n`,
);
for (const { token, donde, linea } of [...muertas.values()].sort((a, b) =>
  a.token.localeCompare(b.token),
)) {
  console.error(`  ${token}`);
  console.error(`    ${donde}:${linea}`);
  // La pista que ahorra la investigación entera: el token existe, pero como
  // alias del legacy y no dentro de `@theme`.
  const sufijo = token.replace(/^[a-z-]*?-/, "");
  const destino =
    alias.get(sufijo) ??
    alias.get(token.split("-").slice(1).join("-")) ??
    null;
  if (destino) {
    const prefijo = token.slice(0, token.length - sufijo.length);
    console.error(
      `    \`--${sufijo}\` existe, pero como alias fuera de \`@theme\`: apunta a ` +
        `\`--color-${destino}\`.\n    Tailwind no emite clases para eso. Usa ` +
        `\`${prefijo}${destino}\`, o declara el token en \`@theme\`.`,
    );
  } else {
    console.error(
      `    No hay token suyo en \`@theme\`, así que Tailwind no emitió la clase.`,
    );
  }
  console.error("");
}
console.error(
  "Una clase que no existe no da error, no rompe el build y no pinta nada:\n" +
    "se queda hasta que alguien mira la pantalla. `bg-surface-sunken` estuvo en\n" +
    "cinco sitios.",
);
noComprueba();
process.exit(1);
