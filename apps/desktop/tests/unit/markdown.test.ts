import assert from "node:assert/strict";
import test from "node:test";

/**
 * **Partir la respuesta en bloques, sin cambiar lo que se ve.**
 *
 * El corte existe para que lo ya escrito deje de reconstruirse en cada token
 * (`src/ui/markdown-blocks.ts`), y su riesgo es de una sola clase: **cortar de más**.
 * Un bloque partido por dentro se renderiza como dos, y eso sí se nota — una
 * lista ordenada partida reinicia su numeración, y un bloque de código partido
 * se convierte en dos recuadros con el texto de dentro interpretado como
 * markdown.
 *
 * Cortar de menos no rompe nada: deja un bloque más grande, que es exactamente
 * lo que había antes de esto. Por eso todas las pruebas de aquí van en la misma
 * dirección — que **no se corte donde no se debe**— y solo un par comprueban que
 * sí se corta donde es seguro.
 */

const { bloquesDeMarkdown } = await import("../../../../packages/ui/src/markdown-blocks.ts");

test("dos párrafos son dos bloques", () => {
  assert.deepEqual(bloquesDeMarkdown("uno\n\ndos"), ["uno", "dos"]);
  // Varias líneas en blanco seguidas no crean bloques vacíos: una celda sin
  // contenido se pintaría como un hueco.
  assert.deepEqual(bloquesDeMarkdown("uno\n\n\n\ndos"), ["uno", "dos"]);
  assert.deepEqual(bloquesDeMarkdown("\n\nuno\n\n"), ["uno"]);
});

test("un ``` dentro de un ~~~~ es contenido, no un cierre", () => {
  const md = "~~~~\n```\nno cierra\n```\n\ntodavía dentro\n~~~~";
  assert.deepEqual(bloquesDeMarkdown(md), [md]);
});

test("un párrafo indentado bajo una lista se queda con ella", () => {
  const md = "- uno\n\n  su segundo párrafo\n\n- dos";
  assert.deepEqual(bloquesDeMarkdown(md), [md]);
});

test("una cita con párrafos sigue siendo UNA cita", () => {
  const md = "> uno\n\n> dos";
  assert.deepEqual(bloquesDeMarkdown(md), [md]);
});

test("una lista y el párrafo de después SÍ se separan", () => {
  // Aquí sí hay que cortar: son dos bloques distintos, y el párrafo es lo que
  // sigue creciendo mientras el agente escribe.
  assert.deepEqual(bloquesDeMarkdown("- uno\n- dos\n\ny luego esto"), [
    "- uno\n- dos",
    "y luego esto",
  ]);
});

test("el caso que más importa: prosa, código y más prosa", () => {
  const md = [
    "Voy a mirarlo.",
    "",
    "```ts\nconst a = 1;\n```",
    "",
    "Y eso es todo.",
  ].join("\n");
  assert.deepEqual(bloquesDeMarkdown(md), [
    "Voy a mirarlo.",
    "```ts\nconst a = 1;\n```",
    "Y eso es todo.",
  ]);
});

test("mientras se escribe, solo el último bloque cambia", () => {
  // Es la propiedad de la que depende todo: los bloques anteriores son la misma
  // cadena en cada token, así que `Index` de Solid no los toca y su DOM no se
  // mueve. Sin esto el hilo vuelve a dar brincos.
  const previo = "Voy a mirarlo.\n\n```ts\nconst a = 1;\n```\n\nY ahora";
  const uno = bloquesDeMarkdown(previo);
  const dos = bloquesDeMarkdown(previo + " escribo");
  const tres = bloquesDeMarkdown(previo + " escribo más");
  assert.deepEqual(uno.slice(0, -1), dos.slice(0, -1));
  assert.deepEqual(dos.slice(0, -1), tres.slice(0, -1));
  assert.notEqual(dos.at(-1), tres.at(-1), "y el último sí");
});

const { textoDelBloque } = await import("../../../../packages/ui/src/markdown-code.ts");

// El árbol que entrega `mdast-util-to-hast` para un ```bash: el valor del
// `code` termina en el salto que añade el markdown.
const bloque = (valor: string) => ({
  type: "element",
  tagName: "pre",
  children: [
    {
      type: "element",
      tagName: "code",
      properties: { className: ["language-bash"] },
      children: [{ type: "text", value: valor }],
    },
  ],
});

test("copiar un bloque de código deja el comando sin el salto final", () => {
  assert.equal(textoDelBloque(bloque("pnpm verify\n")), "pnpm verify");
});

test("copiar un bloque conserva sus líneas en blanco y su sangría", () => {
  assert.equal(textoDelBloque(bloque("  cd src\n\n  ls\n")), "  cd src\n\n  ls");
});
