/**
 * Lo que se calcula por partes mientras llega una respuesta da lo mismo que
 * calcularlo de una vez: el corte en bloques incremental, la tanda de deltas
 * de un cuadro y el atajo de `<NEXT_STEPS>`.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "../helpers/catalog.ts";
import type { Msg } from "../../../../packages/features/chat/src/screens/Chat.tsx";
import { lotesDeDeltas } from "../../../../packages/features/chat/src/model/deltaFrames.ts";
import { anexarDelta, anexarDeltas, type Delta } from "../../../../packages/features/chat/src/model/transcript.ts";
import { MAX_CHAT_VISUALS } from "../../../../packages/ui/src/lib/chat/visual.ts";
import { splitChatVisuals } from "../../../../packages/features/chat/src/model/visualDirective.ts";
import { splitNextSteps } from "../../src/lib/nextSteps.ts";
import { bloquesDeMarkdown, partidorDeBloques } from "../../../../packages/ui/src/markdown-blocks.ts";

const FIXTURES: Record<string, string> = {
  prosa: "Voy a mirarlo.\n\nY luego **esto** con `código`.\n\n\n\nFin.",
  fenceAbierto: "Antes.\n\n```ts\nconst a = 1;\n\nconst b = 2;\n",
  fenceTildes: "~~~~md\n```\nno cierra\n```\n\nsigue dentro\n~~~~\n\nFuera.",
  fenceLargo: "````\n```\ndentro\n```\n````\n\ndespués",
  listaSuelta: "1. uno\n\n2. dos\n\n   sangrado\n\n3. tres\n\nPárrafo.",
  listaMixta: "- a\n- b\n\n* c\n\n+ d\n\n10) diez\n\nTexto\n- no es lista al empezar",
  citas: "> uno\n\n> dos\n>\n> tres\n\nFuera\n\n> otra",
  sangrado: "Texto\n\n  sigue\n\n\tcon tab\n\nnuevo",
  visual: 'Mira:\n\n::terminus-visual{file="chart-a.html" title="Uno"}\n\nY `::terminus-visual{file="x.html"}` en línea.\n\n::terminus-visual{file="b.html"}',
  nextSteps: "Hecho.\n\n<NEXT_STEPS>\nElige:\n- [ ] Uno\n- [ ] Dos\n</NEXT_STEPS>\n",
  nextStepsAbierto: "Hecho.\n<NEXT_STEPS>\n- [ ] Un",
  nextStepsEnCodigo: "```\n<NEXT_STEPS>\n- [ ] no\n```\n\nY <NEXT_ST",
  crlf: "uno\r\n\r\ndos\r\n- a\r\n\r\n- b\r\n",
  blancos: "\n\n  \n\nuno\n \n\t\ndos\n\n",
  vacio: "",
};

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Los prefijos por los que pasa un texto que llega en fragmentos de 1 a 12 caracteres. */
function prefijos(texto: string, seed: number): string[] {
  const rnd = prng(seed);
  const out: string[] = [];
  for (let i = 0; i < texto.length; ) {
    i = Math.min(texto.length, i + 1 + Math.floor(rnd() * 12));
    out.push(texto.slice(0, i));
  }
  return out;
}

test("el corte incremental da los mismos bloques que el corte entero en cada prefijo", () => {
  const todos = Object.values(FIXTURES).join("\n\n");
  for (const [nombre, texto] of Object.entries({ ...FIXTURES, todos })) {
    for (const seed of [1, 2, 3]) {
      const partir = partidorDeBloques();
      for (const p of prefijos(texto, seed)) assert.deepEqual(partir(p), bloquesDeMarkdown(p), `${nombre} en ${JSON.stringify(p)}`);
    }
    // Carácter a carácter, que pasa por cada línea a medias.
    const partir = partidorDeBloques();
    for (let i = 0; i <= texto.length; i++) assert.deepEqual(partir(texto.slice(0, i)), bloquesDeMarkdown(texto.slice(0, i)), nombre);
  }
});

test("el corte incremental vuelve a empezar con un texto que no sigue al anterior", () => {
  const partir = partidorDeBloques();
  partir("```\nabierto\n\nsigue");
  assert.deepEqual(partir("otro\n\ntexto"), bloquesDeMarkdown("otro\n\ntexto"));
  assert.deepEqual(partir(""), []);
  assert.deepEqual(partir("- a\n\n- b"), bloquesDeMarkdown("- a\n\n- b"));
});

test("las partes de visuales y respuestas rápidas no cambian con el atajo", () => {
  for (const texto of Object.values(FIXTURES)) {
    for (const p of prefijos(texto, 9)) {
      for (const streaming of [true, false]) {
        const partes = splitChatVisuals(p, streaming).flatMap<unknown>((parte) =>
          parte.kind === "visual" ? [parte] : splitNextSteps(parte.markdown, streaming),
        );
        const sinEtiqueta = !p.includes("<NEXT_STEPS>") && !p.includes("::terminus-visual");
        if (sinEtiqueta && !(streaming && /(^|\n)\s*<N?E?X?T?_?S?T?E?P?S?$/.test(p)))
          assert.deepEqual(partes, [{ kind: "markdown", id: "markdown:0", markdown: p }]);
      }
    }
  }
  assert.equal(splitNextSteps("Hecho.\n<NEXT_STEPS>\n- [ ] Uno", true)[1]?.kind, "next_steps");
  assert.deepEqual(splitNextSteps("Hecho.\n<NEXT_ST", true), [{ kind: "markdown", id: "markdown:0", markdown: "Hecho.\n" }]);
});

test("una directiva completa al final del streaming aparece sin esperar done", () => {
  for (const directive of [
    '::terminus-visual{file="chart-a.html"}',
    '::terminus-visual{file="chart-a.html" title="Uno"}',
    '::terminus-visual{file="chart-a.html" title="Un \\"título\\""}',
  ]) {
    const text = `Mira:\n\n${directive}`;
    const streaming = splitChatVisuals(text, true);
    assert.equal(streaming.filter((part) => part.kind === "visual").length, 1, directive);
    assert.deepEqual(streaming, splitChatVisuals(text, false));
    assert.deepEqual(streaming.filter((part) => part.kind === "visual"),
      splitChatVisuals(`${text}\n`, true).filter((part) => part.kind === "visual"));
  }
});

test("ningún prefijo incompleto de la directiva se ejecuta mientras llega", () => {
  const directive = '::terminus-visual{file="chart-a.html" title="Uno"}';
  for (let end = 0; end < directive.length; end++) {
    const text = `Mira:\n\n${directive.slice(0, end)}`;
    assert.deepEqual(splitChatVisuals(text, true), [{ kind: "markdown", markdown: text }]);
  }
});

test("una directiva al final del streaming sigue siendo texto dentro de código, citas o listas", () => {
  const directive = '::terminus-visual{file="chart-a.html"}';
  for (const text of [
    `\`\`\`text\n${directive}`,
    `~~~~text\n${directive}`,
    `> Mira:\n${directive}`,
    `- Mira:\n${directive}`,
    `    ${directive}`,
  ]) assert.deepEqual(splitChatVisuals(text, true), [{ kind: "markdown", markdown: text }]);
});

test("el límite de visuales incluye la última directiva durante el streaming", () => {
  const directives = Array.from({ length: MAX_CHAT_VISUALS + 1 }, (_, i) =>
    `::terminus-visual{file="chart-${i}.html"}`);
  const atLimit = splitChatVisuals(directives.slice(0, MAX_CHAT_VISUALS).join("\n\n"), true);
  assert.equal(atLimit.filter((part) => part.kind === "visual").length, MAX_CHAT_VISUALS);
  const overLimit = splitChatVisuals(directives.join("\n\n"), true);
  assert.equal(overLimit.filter((part) => part.kind === "visual").length, MAX_CHAT_VISUALS);
  assert.ok(overLimit.some((part) => part.kind === "markdown" && part.markdown.includes(directives[MAX_CHAT_VISUALS])));
});

const autor = { kind: "agent" } as unknown as Delta["author"];
const otro = { kind: "otro" } as unknown as Delta["author"];

test("una tanda de deltas da el mismo hilo que aplicarlos uno a uno", () => {
  const rnd = prng(42);
  const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  for (let ronda = 0; ronda < 300; ronda++) {
    const inicio: Msg[] = pick([
      [],
      [{ role: "user", text: "Hola" }],
      [{ role: "agent", text: "Ya", nativeMessageId: "m1" }, { role: "system", text: "Read", meta: "usó" }],
      [{ role: "agent", text: "", images: ["data:image/png;base64,aGVsbG8="] }],
      [{ role: "agent", text: "x", nativeMessageId: "m2" }, { role: "system", text: "", meta: "task_launched" }],
    ]);
    const deltas: Delta[] = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => ({
      text: pick(["a", "b ", "\n", "\n\nc", "", "**d**"]),
      messageId: pick([undefined, undefined, "m1", "m2"]),
      startsMessage: rnd() < 0.15,
      author: pick([autor, autor, otro, null]),
      model: pick([null, null, "gpt-5.6"]),
    }));
    const unoAUno = deltas.reduce((m, d) => anexarDelta(m, d), inicio);
    assert.deepEqual(anexarDeltas(inicio, deltas), unoAUno, JSON.stringify({ inicio, deltas }));
  }
});

test("los deltas de un cuadro se aplican juntos, por hilo y en orden", () => {
  const aplicados: [string, string | undefined, string][] = [];
  let cuadro: (() => void) | null = null;
  let pedidos = 0;
  const lotes = lotesDeDeltas(
    (session, workspace, deltas) => aplicados.push([session, workspace, deltas.map((d) => d.text).join("")]),
    (run) => {
      pedidos++;
      cuadro = run;
      return () => (cuadro = null);
    },
  );
  const d = (text: string): Delta => ({ text, author: null });
  lotes.meter("a", "w", d("uno "));
  lotes.meter("b", "w", d("otro"));
  lotes.meter("a", "w", d("dos"));
  assert.equal(pedidos, 1);
  assert.deepEqual(aplicados, []);
  (cuadro as unknown as () => void)();
  assert.deepEqual(aplicados, [["a", "w", "uno dos"], ["b", "w", "otro"]]);
  // Vaciar a mano cancela el cuadro pedido: lo que llega después pide otro.
  lotes.meter("a", "w", d("tres"));
  lotes.vaciar();
  assert.equal(cuadro, null);
  assert.deepEqual(aplicados.at(-1), ["a", "w", "tres"]);
  lotes.meter("a", "w2", d("cuatro"));
  assert.equal(pedidos, 3);
});
