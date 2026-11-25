import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { fromMarkdown } from "mdast-util-from-markdown";

const { remarkMatematicas } = await import("../../../../packages/ui/src/markdown-math.ts");
const { pintarFormula, OPCIONES_KATEX } = await import("../../../../packages/ui/src/markdown-katex.ts");
const { bloquesDeMarkdown } = await import("../../../../packages/ui/src/markdown-blocks.ts");
const katex = (await import("katex")).default;

type Nodo = { type: string; value?: string; children?: Nodo[] };

// El mismo camino que recorre `solid-markdown`: extensiones del plugin y su transformación.
function arbol(md: string): Nodo {
  const datos: Record<string, unknown> = {};
  const transformar = remarkMatematicas.call({ data: () => datos });
  const raiz = fromMarkdown(md, {
    extensions: datos.micromarkExtensions as never,
    mdastExtensions: datos.fromMarkdownExtensions as never,
  }) as unknown as Nodo;
  transformar(raiz);
  return raiz;
}

function formulas(md: string): { tipo: string; tex: string }[] {
  const out: { tipo: string; tex: string }[] = [];
  const visitar = (n: Nodo) => {
    if (n.type === "math" || n.type === "inlineMath") out.push({ tipo: n.type, tex: n.value ?? "" });
    n.children?.forEach(visitar);
  };
  visitar(arbol(md));
  return out;
}

const MAXWELL = `Aquí están, en forma diferencial (unidades del SI):

**Ley de Gauss**
$$\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}$$

**Ley de Gauss para el magnetismo**
$$\\nabla \\cdot \\mathbf{B} = 0$$

**Ley de Faraday**
$$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$

**Ley de Ampère-Maxwell**
$$\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}$$`;

test("las ecuaciones de Maxwell salen como cuatro fórmulas de bloque bajo su título", () => {
  const raiz = arbol(MAXWELL);
  assert.deepEqual(
    raiz.children?.map((n) => n.type),
    ["paragraph", "paragraph", "math", "paragraph", "math", "paragraph", "math", "paragraph", "math"],
  );
  assert.equal(raiz.children?.[1].children?.[0].type, "strong");
  assert.equal(raiz.children?.[2].value, "\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}");
  for (const f of formulas(MAXWELL)) assert.doesNotThrow(() => katex.renderToString(f.tex, OPCIONES_KATEX));
});

test("el dinero no es una fórmula", () => {
  for (const md of [
    "cuesta $5 y luego $10",
    "entre $5-$10 al mes",
    "US$5 y US$10",
    "El plan vale $20, el otro $30 y el tercero $40.",
    "pagas $ 5 y $ 6",
  ]) {
    assert.deepEqual(formulas(md), [], md);
  }
});

test("dinero y fórmula en la misma frase: solo la fórmula", () => {
  assert.deepEqual(formulas("cuesta $3.50 y $x^2$ es otra cosa"), [{ tipo: "inlineMath", tex: "x^2" }]);
});

test("las cuatro formas de delimitar", () => {
  assert.deepEqual(formulas("la energía $E = mc^2$ y \\(a+b\\) en línea"), [
    { tipo: "inlineMath", tex: "E = mc^2" },
    { tipo: "inlineMath", tex: "a+b" },
  ]);
  assert.deepEqual(formulas("Antes\n\\[\n\\int_0^1 x\\,dx\n\\]\nDespués"), [{ tipo: "math", tex: "\\int_0^1 x\\,dx" }]);
  assert.deepEqual(formulas("$$\nx = 1\n\ny = 2\n$$"), [{ tipo: "math", tex: "x = 1\n\ny = 2" }]);
});

test("un $$ en medio de la frase se queda en línea", () => {
  assert.deepEqual(formulas("el valor $$x$$ crece"), [{ tipo: "inlineMath", tex: "x" }]);
});

test("lo escapado y lo que va en código no es fórmula", () => {
  assert.deepEqual(formulas("cuesta \\$5 y \\$x\\$"), []);
  assert.deepEqual(formulas("usa `$x$` en la terminal"), []);
  assert.deepEqual(formulas("```\n$$x$$\n```"), []);
  // Un `\[` que no abre la línea es un corchete escapado.
  assert.deepEqual(formulas("ver la nota \\[1\\] al final"), []);
});

test("el énfasis no se come el subíndice de la fórmula", () => {
  assert.deepEqual(formulas("$x_1$ y $y_1$"), [
    { tipo: "inlineMath", tex: "x_1" },
    { tipo: "inlineMath", tex: "y_1" },
  ]);
});

test("a medio escribir, la fórmula abierta es texto y no rompe el resto", () => {
  assert.deepEqual(formulas("la suma $\\sum_{i=1}"), []);
  assert.deepEqual(formulas("**Ley**\n\\(\\frac{a}{"), []);
  // El bloque abierto llega al final del mensaje, como un bloque de código.
  assert.deepEqual(formulas("$$\n\\nabla \\cdot"), [{ tipo: "math", tex: "\\nabla \\cdot" }]);
});

test("un bloque $$ con líneas en blanco no se parte en el streaming", () => {
  const formula = "$$\n\\begin{aligned}\na &= b\n\n c &= d\n\\end{aligned}\n$$";
  assert.deepEqual(bloquesDeMarkdown(`Antes\n\n${formula}\n\nDespués`), ["Antes", formula, "Después"]);
  // Abierto mientras se escribe: todo lo que sigue es parte de la fórmula.
  assert.deepEqual(bloquesDeMarkdown("Antes\n\n$$\na\n\nb"), ["Antes", "$$\na\n\nb"]);
  // `$$…$$` en una sola línea no abre nada.
  assert.deepEqual(bloquesDeMarkdown("$$a$$\n\nDespués"), ["$$a$$", "Después"]);
});

const { window } = new JSDOM("");
globalThis.document = window.document;

test("KaTeX no crea enlaces ni HTML del agente", () => {
  for (const tex of [
    "\\href{https://ejemplo.com/?d=secreto}{x}",
    "\\url{https://ejemplo.com}",
    "\\htmlClass{x}{y}",
    "\\includegraphics{https://ejemplo.com/a.png}",
  ]) {
    const caja = document.createElement("span");
    pintarFormula(tex, false, caja);
    assert.equal(caja.querySelector("a, img"), null, tex);
    assert.ok(!caja.innerHTML.includes("ejemplo.com\""), tex);
  }
});

test("un error de LaTeX devuelve el mensaje y deja la caja vacía", () => {
  const caja = document.createElement("span");
  const fallo = pintarFormula("\\frac{a}{", true, caja);
  assert.match(fallo ?? "", /KaTeX parse error/);
  assert.equal(caja.textContent, "");
  assert.equal(pintarFormula("\\frac{a}{b}", true, caja), null);
  assert.ok(caja.querySelector(".katex-display"));
});

test("una macro global no pasa de una fórmula a la siguiente", () => {
  const caja = document.createElement("span");
  assert.equal(pintarFormula("\\gdef\\malo{1}\\malo", false, caja), null);
  assert.notEqual(pintarFormula("\\malo", false, caja), null);
});
