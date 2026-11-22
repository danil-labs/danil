/**
 * Dónde empieza un `/comando` o una `/skill` en lo que se escribe.
 *
 * La barra abre el menú al principio del mensaje o después de un espacio o un
 * salto de línea. Pegada a otra cosa es una ruta (`@src/App.tsx`, `a/b`) o una
 * URL (`https://x/y`), y dentro de una mención entrecomillada sin cerrar es
 * parte del nombre. Al principio valen los comandos del CLI y las skills; en
 * medio del texto solo las skills: el CLI no corre un comando a mitad de frase.
 */

/** Lo que puede ir detrás de la barra. */
const NAME = /[\w:-]/;

/** Un `/nombre` en el texto. `inline` es que no abre el mensaje. */
export type SlashToken = {
  from: number;
  to: number;
  /** Lo escrito detrás de la barra, tal cual. */
  name: string;
  inline: boolean;
};

/** Si `at` cae dentro de una mención `@"…"` todavía abierta antes de él. */
function insideQuotedMention(text: string, at: number): boolean {
  let open = false;
  for (let i = 0; i < at; i++) {
    if (open) {
      if (text[i] === '"') open = false;
      continue;
    }
    if (text[i] === "@" && text[i + 1] === '"' && (i === 0 || /\s/.test(text[i - 1]!))) {
      open = true;
      i++;
    }
  }
  return open;
}

/** El token que empieza en la barra de `slash`, o nada si ahí no dispara. */
function tokenAt(text: string, slash: number): SlashToken | null {
  if (text[slash] !== "/") return null;
  if (slash > 0 && !/\s/.test(text[slash - 1]!)) return null;
  let to = slash + 1;
  while (to < text.length && NAME.test(text[to]!)) to++;
  // `/usr/bin` después de un espacio es una ruta, no una skill.
  if (to < text.length && text[to] === "/") return null;
  if (insideQuotedMention(text, slash)) return null;
  return {
    from: slash,
    to,
    name: text.slice(slash + 1, to),
    inline: text.slice(0, slash).trim() !== "",
  };
}

/** El `/nombre` que se está escribiendo donde está el cursor, si hay uno. */
export function slashAt(text: string, caret: number): SlashToken | null {
  let i = Math.max(0, Math.min(caret, text.length));
  while (i > 0 && NAME.test(text[i - 1]!)) i--;
  if (i === 0 || text[i - 1] !== "/") return null;
  return tokenAt(text, i - 1);
}

/** Todos los `/nombre` completos del texto, para pintarlos. */
export function slashTokens(text: string): SlashToken[] {
  const tokens: SlashToken[] = [];
  for (let i = text.indexOf("/"); i >= 0; i = text.indexOf("/", i + 1)) {
    const token = tokenAt(text, i);
    if (!token || !token.name) continue;
    // Termina en espacio, fin o signo de cierre: `/code-review.` cuenta.
    if (token.to < text.length && !/[\s,;:!?).\]]/.test(text[token.to]!)) continue;
    tokens.push(token);
    i = token.to - 1;
  }
  return tokens;
}

/**
 * Pone `/value` en lugar del token y deja el resto. Si ya sigue un espacio no
 * se agrega otro; el cursor queda detrás de él.
 */
export function replaceSlash(text: string, token: Pick<SlashToken, "from" | "to">, value: string): { text: string; caret: number } {
  const rest = text.slice(token.to);
  const spaced = /^\s/.test(rest);
  const inserted = `/${value}${spaced ? "" : " "}`;
  return {
    text: text.slice(0, token.from) + inserted + rest,
    caret: token.from + inserted.length + (spaced ? 1 : 0),
  };
}
