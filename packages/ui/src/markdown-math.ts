/**
 * Fórmulas LaTeX en el Markdown del chat: `$…$` y `\(…\)` en línea, `$$…$$` y
 * `\[…\]` en bloque. Un `$$` o un `\[` solo en su línea se pinta como bloque.
 *
 * Regla del dinero, la de pandoc: tras el `$` que abre no va un espacio; el
 * primer `$` sin escapar cierra solo si lo precede algo que no es espacio y no
 * lo sigue un dígito, y si no cierra no hay fórmula. «cuesta $5 y luego $10»
 * queda como texto. `\[` solo abre al principio de una línea.
 */
import type { Extension as ExtensionMdast } from "mdast-util-from-markdown";
import { mathFromMarkdown } from "mdast-util-math";
import { math } from "micromark-extension-math";
import type { Code, Construct, Effects, Extension, State, TokenizeContext } from "micromark-util-types";

const DOLAR = 36;
const BARRA = 92;
const PARENTESIS_ABRE = 40;
const PARENTESIS_CIERRA = 41;
const CORCHETE_ABRE = 91;
const CORCHETE_CIERRA = 93;
const ESPACIO = 32;
const TIPO = "formulaTerminus";
const TEXTO = "formulaTerminusTexto";

declare module "micromark-util-types" {
  interface TokenTypeMap {
    formulaTerminus: "formulaTerminus";
    formulaTerminusTexto: "formulaTerminusTexto";
  }
}

/** Fin de texto, salto de línea, tabulador o espacio. */
const esBlanco = (code: Code) => code === null || code < 0 || code === ESPACIO;
const esDigito = (code: Code) => code !== null && code >= 48 && code <= 57;

/** Consume dentro de la fórmula; cada salto de línea va en su propio token, como pide micromark. */
function consumidor(effects: Effects) {
  let dentro = false;
  return {
    consumir(code: Code) {
      if (code !== null && code < -2) {
        if (dentro) effects.exit(TEXTO);
        dentro = false;
        effects.enter("lineEnding");
        effects.consume(code);
        effects.exit("lineEnding");
        return;
      }
      if (!dentro) effects.enter(TEXTO);
      dentro = true;
      effects.consume(code);
    },
    cerrar() {
      if (dentro) effects.exit(TEXTO);
      effects.exit(TIPO);
    },
  };
}

function tokenizarDolar(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  const { consumir, cerrar } = consumidor(effects);
  let abre = 0;
  let cierra = 0;
  let previo: Code = null;

  const apertura: State = (code) => {
    if (code === DOLAR) {
      consumir(code);
      abre++;
      return apertura;
    }
    if (abre > 2 || (abre === 1 && esBlanco(code))) return nok(code);
    return contenido(code);
  };
  const contenido: State = (code) => {
    if (code === null) return nok(code);
    if (code === DOLAR) {
      if (abre === 1 && esBlanco(previo)) return nok(code);
      cierra = 0;
      return cierre(code);
    }
    consumir(code);
    previo = code;
    return code === BARRA ? escapado : contenido;
  };
  // `\$` es un dólar de TeX dentro de la fórmula, no su cierre.
  const escapado: State = (code) => {
    if (code === null) return nok(code);
    consumir(code);
    previo = code;
    return contenido;
  };
  const cierre: State = (code) => {
    if (code === DOLAR) {
      consumir(code);
      cierra++;
      return cierre;
    }
    if (abre === 1 && (cierra !== 1 || esDigito(code))) return nok(code);
    if (cierra !== abre) {
      previo = DOLAR;
      return contenido(code);
    }
    cerrar();
    return ok(code);
  };

  return (code) => {
    effects.enter(TIPO);
    return apertura(code);
  };
}

function tokenizarBarra(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  const { consumir, cerrar } = consumidor(effects);
  const inicioDeLinea = this.previous === null || this.previous < -2;
  let cierra: number;

  const tipo: State = (code) => {
    if (code === PARENTESIS_ABRE) cierra = PARENTESIS_CIERRA;
    else if (code === CORCHETE_ABRE && inicioDeLinea) cierra = CORCHETE_CIERRA;
    else return nok(code);
    consumir(code);
    return contenido;
  };
  const contenido: State = (code) => {
    if (code === null) return nok(code);
    consumir(code);
    return code === BARRA ? barra : contenido;
  };
  const barra: State = (code) => {
    if (code === null) return nok(code);
    consumir(code);
    return code === cierra ? fin : contenido;
  };
  // Un `\]` con texto detrás en la misma línea es contenido de la fórmula.
  const fin: State = (code) => {
    if (cierra === CORCHETE_CIERRA && !esBlanco(code)) return contenido(code);
    cerrar();
    return ok(code);
  };

  return (code) => {
    effects.enter(TIPO);
    consumir(code);
    return tipo;
  };
}

const DOLARES: Construct = {
  name: TIPO,
  tokenize: tokenizarDolar,
  previous(this: TokenizeContext, code: Code) {
    return code !== DOLAR || this.events[this.events.length - 1]?.[1].type === "characterEscape";
  },
};

const BARRAS: Construct = { name: TIPO, tokenize: tokenizarBarra };

export const EXTENSION_MICROMARK: Extension = {
  flow: math().flow,
  text: { [DOLAR]: DOLARES, [BARRA]: BARRAS },
};

const DELIMITADORES = [
  ["$$", "$$"],
  ["\\[", "\\]"],
  ["\\(", "\\)"],
  ["$", "$"],
] as const;

type Nodo = {
  type: string;
  value?: string;
  children?: Nodo[];
  position?: unknown;
  data?: Record<string, unknown>;
};

const EXTENSION_MDAST: ExtensionMdast = {
  enter: {
    [TIPO](token) {
      this.enter({ type: "inlineMath", value: "" } as never, token);
    },
  },
  exit: {
    [TIPO](token) {
      const nodo = this.stack[this.stack.length - 1] as unknown as Nodo;
      this.exit(token);
      const crudo = this.sliceSerialize(token);
      const [abre, cierra] = DELIMITADORES.find(([a]) => crudo.startsWith(a)) ?? ["", ""];
      const valor = crudo.slice(abre.length, crudo.length - cierra.length).trim();
      nodo.value = valor;
      nodo.data = {
        hName: "code",
        hProperties: { className: ["language-math", "math-inline"] },
        hChildren: [{ type: "text", value: valor }],
        enBloque: abre === "$$" || abre === "\\[",
      };
    },
  },
};

const finDeLinea = (nodo: Nodo | undefined, lado: "antes" | "despues") =>
  nodo === undefined ||
  nodo.type === "break" ||
  (nodo.type === "text" && (lado === "antes" ? /\n[ \t]*$/ : /^[ \t]*\n/).test(nodo.value ?? ""));

function enBloque(formula: Nodo): Nodo {
  const valor = formula.value ?? "";
  return {
    type: "math",
    value: valor,
    position: formula.position,
    data: {
      hName: "pre",
      hChildren: [
        {
          type: "element",
          tagName: "code",
          properties: { className: ["language-math", "math-display"] },
          children: [{ type: "text", value: valor }],
        },
      ],
    },
  };
}

function tramo(hijos: Nodo[]): Nodo[] {
  const resto = [...hijos];
  while (resto[0]?.type === "break") resto.shift();
  while (resto.at(-1)?.type === "break") resto.pop();
  const primero = resto[0];
  if (primero?.type === "text") resto[0] = { ...primero, value: primero.value?.trimStart() };
  const ultimo = resto.at(-1);
  if (ultimo?.type === "text") resto[resto.length - 1] = { ...ultimo, value: ultimo.value?.trimEnd() };
  const conTexto = resto.filter((h) => h.type !== "text" || h.value !== "");
  return conTexto.length > 0 ? [{ type: "paragraph", children: conTexto }] : [];
}

/** Saca de su párrafo cada fórmula de bloque que ocupa su propia línea. */
function aislar(parrafo: Nodo): Nodo[] {
  const hijos = parrafo.children ?? [];
  const solas = hijos.map(
    (h, i) =>
      h.type === "inlineMath" &&
      h.data?.enBloque === true &&
      finDeLinea(hijos[i - 1], "antes") &&
      finDeLinea(hijos[i + 1], "despues"),
  );
  if (!solas.includes(true)) return [parrafo];
  const partes: Nodo[] = [];
  let actual: Nodo[] = [];
  hijos.forEach((h, i) => {
    if (!solas[i]) {
      actual.push(h);
      return;
    }
    partes.push(...tramo(actual), enBloque(h));
    actual = [];
  });
  partes.push(...tramo(actual));
  return partes;
}

function formulasEnSuLinea(nodo: Nodo) {
  if (!nodo.children) return;
  nodo.children = nodo.children.flatMap((hijo) => {
    if (hijo.type === "paragraph") return aislar(hijo);
    formulasEnSuLinea(hijo);
    return [hijo];
  });
}

/** Plugin de remark: sintaxis, nodos `inlineMath`/`math` y fórmulas aisladas. */
export function remarkMatematicas(this: { data(): unknown }) {
  const datos = this.data() as { micromarkExtensions?: unknown[]; fromMarkdownExtensions?: unknown[] };
  (datos.micromarkExtensions ??= []).push(EXTENSION_MICROMARK);
  (datos.fromMarkdownExtensions ??= []).push(mathFromMarkdown(), EXTENSION_MDAST);
  return (arbol: unknown) => formulasEnSuLinea(arbol as Nodo);
}
