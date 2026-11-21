/**
 * Sangría del modo terminal: en la caja, cada línea de un `!` empieza con un
 * tabulador para que los comandos queden alineados detrás del `!`. Es solo
 * presentación: [`comandoDeTerminal`] la quita antes de correr el comando.
 */

export const SANGRIA = "\t";

export type Sangrado = { text: string; caret: number };

/**
 * Lo que debe quedar en la caja después de una edición de la persona.
 * Borrar hacia atrás la sangría se lleva también lo que la abre: tras el `!`
 * sale del modo terminal, tras un salto de línea une las dos líneas.
 */
export function sangrarTerminal(antes: string, despues: string, caret: number, inputType?: string): Sangrado {
  let text = despues;
  let cursor = caret;
  if (
    inputType === "deleteContentBackward" && antes.startsWith("!") &&
    antes.length === text.length + 1 && antes[cursor] === SANGRIA &&
    antes.slice(0, cursor) + antes.slice(cursor + 1) === text
  ) {
    if (cursor === 1) {
      text = text.slice(1);
      cursor = 0;
    } else if (text[cursor - 1] === "\n") {
      text = text.slice(0, cursor - 1) + text.slice(cursor);
      cursor -= 1;
    }
  }
  if (text.startsWith("!")) return sangrar(text, cursor);
  if (antes.startsWith("!")) return quitarSangria(text, cursor);
  return { text, caret: cursor };
}

/** El comando tal como se corre: sin el `!` ni la sangría de la caja. */
export function comandoDeTerminal(texto: string): string {
  const resto = texto.startsWith("!") ? texto.slice(1) : texto;
  return quitarSangria(resto, 0).text;
}

function sangrar(text: string, caret: number): Sangrado {
  let out = "";
  let cursor = caret;
  for (let i = 0; i < text.length; i++) {
    out += text[i];
    const abreLinea = (i === 0 && text[0] === "!") || text[i] === "\n";
    if (abreLinea && text[i + 1] !== SANGRIA) {
      out += SANGRIA;
      if (i + 1 <= caret) cursor += 1;
    }
  }
  return { text: out, caret: cursor };
}

function quitarSangria(text: string, caret: number): Sangrado {
  let out = "";
  let cursor = caret;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === SANGRIA && (i === 0 || text[i - 1] === "\n")) {
      if (i < caret) cursor -= 1;
      continue;
    }
    out += text[i];
  }
  return { text: out, caret: cursor };
}
