#!/usr/bin/env node
/**
 * El runtime del contenedor de artefactos vive como TEXTO, y nadie lo compila.
 *
 * El motor que corre dentro del marco —diapositivas, orden de tablas, edición y
 * el puente con la app— tiene que inyectarse dentro del documento del agente, y
 * por eso es una cadena en `packages/chat/src/sandbox.ts` (la comparten la ventana y el teléfono). Su CSS igual. Nada de lo que
 * hay ahí dentro lo mira `tsc`: para el compilador son dos literales.
 *
 * Escribirlo así tiene dos trampas, y la que duele no es la ruidosa:
 *
 *   - Un acento grave cierra la plantilla y el build truena. Ruidoso, un minuto.
 *   - **Una plantilla normal se come las barras invertidas.** `\s` vale `s`, así
 *     que `replace(/\s+/g, " ")` se convierte en `replace(/s+/g, " ")` y compila
 *     igual: el runtime arranca, la tabla se pinta, y lo único que pasa es que
 *     un texto con espacios se ordena mal. No hay error en ningún lado.
 *
 * El remedio es uno solo: comprobarlo. Esto es esa comprobación, más una
 * tercera que se ganó su sitio a base de un defecto real.
 *
 * ## Las tres cosas que mira
 *
 * 1. **Los dos literales se declaran con `String.raw`.** Es lo único que
 *    conserva las barras, y convertirlo a plantilla normal no rompe nada que se
 *    vea. Sin backticks dentro, que es la otra mitad de la trampa.
 * 2. **El runtime parsea.** Se le pasa por `new Function`, que compila sin
 *    ejecutar: un error de sintaxis en una cadena que nadie compila solo se
 *    descubre abriendo un artefacto, y ahí se ve como un documento en blanco.
 * 3. **Las clases `harness-` existen en los dos lados.** El CSS esconde
 * `section.slide` y enseña la que el runtime marca: cuando la migración a
 * inglés renombró `harness-activa` a `harness-active` **solo en el CSS**, una
 * presentación pasó a pintarse en blanco — sin error, sin aviso, y con las dos
 * mitades en el mismo archivo. Un nombre de clase entre CSS y JS es la misma
 * clase de cadena que un nombre de evento entre Rust y la interfaz, y
 * `bridge.mjs` existe por lo mismo.
 *
 * Node pelado, sin dependencias: lo corre `pnpm verificar`, en esta máquina.
 */
import { readFileSync } from "node:fs";
// `.pathname` en Windows da `/C:/…` y revienta.
import { fileURLToPath } from "node:url";

const RUTA = fileURLToPath(new URL("../../../../packages/chat/src/sandbox.ts", import.meta.url));
const fuente = readFileSync(RUTA, "utf8");

const failures = [];

/**
 * El cuerpo de un literal, y con qué se declaró.
 *
 * Se corta en el primer acento grave porque dentro no puede haber ninguno: uno
 * solo cierra la plantilla, y ese es el fallo ruidoso que el build ya caza.
 */
function literal(nombre, texto = fuente) {
  const i = texto.indexOf(`const ${nombre} =`);
  if (i < 0) return null;
  const abre = texto.indexOf("`", i);
  if (abre < 0) return null;
  const cierra = texto.indexOf("`", abre + 1);
  if (cierra < 0) return null;
  return {
    crudo: texto.slice(i, abre).includes("String.raw"),
    cuerpo: texto.slice(abre + 1, cierra),
  };
}

const CSS = literal("CSS_BASE");
const JS = literal("JS_RUNTIME");
const inline = readFileSync(fileURLToPath(new URL("../../../../packages/chat/src/inlineVisual.ts", import.meta.url)), "utf8");
const inlineCss = literal("CSS_INLINE", inline);
const inlineJs = literal("JS_INLINE", inline);

for (const [nombre, l] of [
  ["CSS_BASE", CSS],
  ["JS_RUNTIME", JS],
  ["CSS_INLINE", inlineCss],
  ["JS_INLINE", inlineJs],
]) {
  if (!l) {
    failures.push(
      `No encuentro \`const ${nombre} = String.raw\`…\`\` en packages/chat/src/.\n` +
        `  Ahí vive lo que corre dentro del contenedor; sin ello este chequeo no mira nada.`,
    );
    continue;
  }
  if (!l.crudo) {
    failures.push(
      `\`${nombre}\` no se declara con \`String.raw\`.\n` +
        `  Una plantilla normal se come las barras invertidas: \`\\s\` pasa a valer \`s\`, así que\n` +
        `  \`replace(/\\s+/g, " ")\` se vuelve \`replace(/s+/g, " ")\` y compila igual.`,
    );
  }
}

// --------------------------------------------------- 2. el runtime parsea

for (const [name, runtime] of [["JS_RUNTIME", JS], ["JS_INLINE", inlineJs]]) {
  if (!runtime?.cuerpo) continue;
  // `"__FORMA__"` es el hueco que `envolver()` sustituye por la forma del
  // documento. Como literal ya parsea, así que se le pasa tal cual.
  try {
    new Function(runtime.cuerpo);
  } catch (e) {
    failures.push(
      `El runtime ${name} no parsea: ${e.message}\n` +
        `  Es una cadena, así que \`tsc\` la da por buena. Un error de sintaxis aquí no se ve\n` +
        `  hasta abrir un artefacto, y se ve como un documento en blanco.`,
    );
  }
}

// ------------------------------------- 3. las clases existen en los dos lados

/** Lo que el CSS estiliza: `.harness-x`, venga pegado a una etiqueta o no. */
function clasesDelCss(cuerpo) {
  return new Set([...cuerpo.matchAll(/\.(harness-[a-z0-9-]+)/g)].map((m) => m[1]));
}

/**
 * Lo que el runtime escribe: solo cadenas que **empiezan** por `harness-`.
 *
 * Deja fuera a propósito los atributos `data-harness-…`, que son marcas para
 * volver a encontrar un nodo y no tienen por qué estar estilizadas.
 */
function clasesDelJs(cuerpo) {
  return new Set([...cuerpo.matchAll(/["'](harness-[a-z0-9-]+)["']/g)].map((m) => m[1]));
}

if (CSS?.cuerpo && JS?.cuerpo) {
  const enCss = clasesDelCss(CSS.cuerpo);
  const enJs = clasesDelJs(JS.cuerpo);

  const soloCss = [...enCss].filter((c) => !enJs.has(c)).sort();
  const soloJs = [...enJs].filter((c) => !enCss.has(c)).sort();

  for (const c of soloCss) {
    failures.push(
      `El CSS del artefacto estiliza «${c}» y el runtime no se la pone a nada.\n` +
        `  Esa regla no se aplica nunca. Si el runtime pone otra parecida, son la misma\n` +
        `  clase escrita dos veces: `.trim() +
        (soloJs.length ? ` mira ${soloJs.map((x) => `«${x}»`).join(", ")}.` : ""),
    );
  }
  for (const c of soloJs) {
    failures.push(
      `El runtime pone la clase «${c}» y el CSS del artefacto no la estiliza.` +
        (soloCss.length
          ? `\n  Si es la misma que ${soloCss.map((x) => `«${x}»`).join(", ")}, están escritas distinto.`
          : ""),
    );
  }
}

// ----------------------------------------------------------------- el fallo

if (!failures.length) {
  console.log(
    "El runtime del artefacto conserva sus escapes, parsea, y sus clases existen en los dos lados.",
  );
  process.exit(0);
}

for (const f of failures) console.error(f + "\n");
console.error(
  "Lo que corre dentro del contenedor no lo compila nadie: es una cadena que se\n" +
    "inyecta en el documento del agente. Cuando falla, falla en la máquina de otro\n" +
    "y en silencio — un documento en blanco, una tabla que ordena mal.",
);
process.exit(1);
