import { StreamLanguage } from "@codemirror/language";

/** Las palabras que tras `#` son del lenguaje y no una función. */
const CLAVES = new Set([
  "let", "set", "show", "import", "include", "if", "else", "for", "in", "while",
  "return", "break", "continue", "context", "as", "none", "auto", "true", "false",
]);

/** `profundidad`: cuántos `(`, `[` y `{` siguen abiertos; de ahí sale la sangría. */
type Estado = { comentario: boolean; matematica: boolean; profundidad: number };

/**
 * Resaltado de Typst por líneas: marcado, `#código`, matemáticas y comentarios.
 * No analiza el código dentro de llaves; el catálogo de CodeMirror no trae Typst.
 */
export const typst = StreamLanguage.define<Estado>({
  name: "typst",
  startState: () => ({ comentario: false, matematica: false, profundidad: 0 }),
  copyState: (estado) => ({ ...estado }),
  token(stream, estado) {
    if (estado.comentario) {
      if (stream.skipTo("*/")) {
        stream.match("*/");
        estado.comentario = false;
      } else stream.skipToEnd();
      return "comment";
    }
    if (estado.matematica) {
      if (stream.skipTo("$")) {
        stream.next();
        estado.matematica = false;
      } else stream.skipToEnd();
      return "atom";
    }
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match("/*")) {
      estado.comentario = true;
      return "comment";
    }
    if (stream.eat("$")) {
      estado.matematica = true;
      return "atom";
    }
    if (stream.sol() && stream.match(/^\s*=+\s/)) {
      stream.skipToEnd();
      return "heading";
    }
    if (stream.match(/^#[A-Za-z_][\w-]*/)) {
      return CLAVES.has(stream.current().slice(1)) ? "keyword" : "macroName";
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
    if (stream.match(/^<[\w:.-]+>/)) return "tagName";
    if (stream.match(/^@[\w:.-]+/)) return "link";
    if (stream.match(/^\d+(?:\.\d+)?(?:pt|mm|cm|in|em|fr|%|deg|rad)?\b/)) return "number";
    if (stream.match(/^\*[^*\n]+\*/)) return "strong";
    if (stream.match(/^_[^_\n]+_/)) return "emphasis";
    if (stream.match(/^\\./)) return null;
    const c = stream.next();
    if (c === "(" || c === "[" || c === "{") estado.profundidad++;
    else if ((c === ")" || c === "]" || c === "}") && estado.profundidad > 0) estado.profundidad--;
    return null;
  },
  indent(estado, despues, cx) {
    const cierra = /^[)\]}]/.test(despues) ? 1 : 0;
    return Math.max(0, estado.profundidad - cierra) * cx.unit;
  },
  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
    indentOnInput: /^\s*[)\]}]$/,
  },
});
