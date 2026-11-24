import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { envolver, formaDe } from "../../../../packages/features/artifacts/src/model/sandbox.ts";

/**
 * **Un artefacto web se pinta como un sitio, y lo que decide eso no da error si
 * se rompe.**
 *
 * Un sitio o un mockup llenan la pestaña y no llevan nada alrededor: ni franja,
 * ni cadena de versiones, ni las cuatro salidas. Un informe sí. La diferencia
 * entera cuelga de una palabra en un `<meta>` y de tres decisiones dentro del
 * contenedor, y las tres fallan calladas:
 *
 * - **La forma.** Si `formaDe` deja de reconocer `web`, el sitio vuelve a
 *   pintarse como una hoja de 17 cm con su barra encima. Se ve raro; no falla.
 * - **El tema.** No se estampa ninguno: tematizar desde el envoltorio ganaba
 *   por especificidad al CSS del agente y le metía un fondo `#141417` debajo
 *   de su propia paleta. El fondo lo pinta el HTML.
 * - **Las tablas.** El runtime le pone a cada tabla su caja de desplazamiento y
 *   convierte las cabeceras en botones de orden. En un informe es la
 *   funcionalidad; en un mockup es la maqueta cambiada por debajo, sin poder
 *   deshacerlo desde la app.
 *
 * `scripts/guards/artifact.mjs` comprueba que el runtime **parsea**. Esto lo
 * **ejecuta**, que es lo único que dice qué hace.
 *
 * El documento se corre en jsdom con `runScripts`, así que lo que se mide es el
 * runtime de verdad y no una copia de sus reglas — igual que `tests/security/` ataca
 * las funciones del contenedor y no una imitación.
 */

/** El artefacto ya envuelto y **corriendo**, tal como lo recibe el marco. */
function corrido(html: string) {
  const dom = new JSDOM(envolver(html), { runScripts: "dangerously" });
  return dom.window.document;
}

const PAGINA = `<!doctype html><html><head>
<meta name="harness-artefacto" content="web">
<style>body{margin:0;background:#0b1020;color:#e8ecf7}</style>
</head><body>
<header><h1>Producto</h1></header>
<main><table><thead><tr><th>Plan</th><th>Precio</th></tr></thead>
<tbody><tr><td>Base</td><td>100</td></tr></tbody></table></main>
</body></html>`;

/** El control: lo mismo declarado como informe. */
const INFORME = PAGINA.replace('content="web"', 'content="documento"');

/**
 * **Y sin declarar sigue siendo un documento.** Una página de aterrizaje y un
 * informe se escriben con las mismas etiquetas: adivinarlo acertaría uno y
 * fallaría el otro, y fallar hacia `web` le quita a un informe su cadena de
 * versiones y sus cuatro salidas. Se degrada al caso que no pierde nada.
 */
test("sin declarar nada, se degrada a documento", () => {
  const sinDeclarar = `<!doctype html><html><head>
<style>body{margin:0}</style></head><body>
<header><h1>Producto</h1><nav><a href="#precios">Precios</a></nav></header>
<main><p>Una página de aterrizaje corriente, con su prosa y sus secciones,
escrita con las mismas etiquetas con las que se escribe un informe.</p></main>
<footer><p>© 2026</p></footer></body></html>`;
  assert.equal(formaDe(sinDeclarar), "documento");
});

test("una web ocupa la ventana: ni relleno de hoja ni medida de hoja", () => {
  const doc = corrido(PAGINA);
  assert.ok(doc.body.classList.contains("harness-web"));
  // `harness-suelto` es la medida de un A4 para cuando nadie embebe el
  // documento. En jsdom `window.parent === window`, que es justo ese caso: un
  // sitio no se estrecha a 17 cm ni ahí.
  assert.ok(!doc.body.classList.contains("harness-suelto"));
});

/** El control de la de arriba: un informe suelto **sí** toma medida de hoja. */
test("un documento suelto sí toma la medida de una hoja", () => {
  assert.ok(corrido(INFORME).body.classList.contains("harness-suelto"));
});

test("a una web no se le tocan las tablas", () => {
  const doc = corrido(PAGINA);
  assert.equal(doc.querySelectorAll(".harness-caja-tabla").length, 0);
  assert.equal(doc.querySelectorAll("th[data-harness-th]").length, 0);
});

/** Y el control: en un informe la tabla es un dato que se ordena. */
test("a un documento sí, porque ahí la tabla es un dato", () => {
  const doc = corrido(INFORME);
  assert.equal(doc.querySelectorAll(".harness-caja-tabla").length, 1);
  assert.equal(doc.querySelectorAll("th[data-harness-th]").length, 2);
});

/**
 * El marco no tematiza nada: el fondo lo pinta el HTML, y tematizar desde el
 * envoltorio le ganaba por especificidad al `body` del documento.
 */
test("ninguna forma se tematiza: el fondo lo pone el HTML", () => {
  assert.equal(corrido(PAGINA).documentElement.getAttribute("data-theme"), null);
  assert.equal(corrido(INFORME).documentElement.getAttribute("data-theme"), null);
});

/**
 * **La política y el sandbox no cambian con la forma**, y esta es la prueba que
 * lo dice en el archivo donde alguien va a añadir la quinta forma: una web es
 * HTML del agente escrito sobre material del cliente, o sea la misma superficie
 * con otro nombre. Los tres candados de `lib/sandbox.ts` valen igual.
 */
test("una web va al mismo contenedor cerrado que todo lo demás", () => {
  const doc = corrido(PAGINA);
  const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
  assert.ok(csp);
  const politica = csp.getAttribute("content") ?? "";
  for (const regla of [
    "default-src 'none'",
    "connect-src 'none'",
    "img-src data:",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ]) {
    assert.ok(politica.includes(regla), `falta «${regla}» en la política`);
  }
});
