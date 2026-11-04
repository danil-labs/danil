/**
 * Menciones: el nombre de una tarea no es una cadena, es estructura.
 *
 * Un `@harness-app/SYSTEM.md` escrito en la caja no es texto que casualmente empieza
 * por arroba: es una **referencia a una entidad real del proyecto**. Por eso
 * este archivo existe aparte — el título de la sesión, el historial del
 * sidebar, la transcripción y la paleta de comandos tienen que leer la misma
 * gramática, o cada uno inventaría la suya y «buscar por referencia» volvería a
 * ser buscar por subcadena.
 *
 * **La autoridad vive en Rust** (`src-tauri/src/workspace/mentions.rs`): lo que se
 * persiste y se audita se deriva del prompt que de verdad corrió, no de lo que
 * la interfaz dijo haber escrito. Esta copia es lo que hace falta para escribir
 * y pintar sin ir al backend por cada tecla. Las dos son cortas a propósito.
 */
import { replaceSlash, slashAt } from "@terminus/chat/slash";

/** Algo que la tarea alcanza y por tanto se puede mencionar. */
export type MentionSource = {
  /**
   * Lo que se escribe detrás de la arroba, y **tiene que ser único entre todas
   * las fuentes adjuntas**: es lo que Rust vuelve a resolver al mandar el turno.
   *
   * En la carpeta de trabajo es `/CREDITS.md`. En una fuente extra, el nombre
   * de esa fuente va delante: `notas/README.md`. Quien lo hace único es Rust;
   * aquí solo se escribe y se pinta.
   */
  ruta: string;
  tipo: "archivo" | "carpeta" | string;
  /**
   * De qué fuente extra sale, para leerlo en el menú.
   *
   * Vacío en la carpeta de trabajo: el árbol y el repo ya están implícitos.
   * El puente no está tipado: un campo que el backend todavía no manda deja
   * la fila sin ese dato, no la app rota.
   */
  fuente?: string;
};

/** Lo que devuelve `list_mentions`. */
export type MentionSources = {
  fuentes: MentionSource[];
  /** Se llegó al tope: hay fuentes adjuntas que no están en la lista. */
  truncado: boolean;
};

/** Signos que cierran una frase. El punto NO: `@docs/X.md` termina en uno. */
const CLOSING_PUNCTUATION = /[,;:!?)\]]+$/;

/** Un pedazo de texto, con la referencia a la que apunta si es una mención. */
export type MentionChunk = { text: string; reference: string | null };

/**
 * Parte un texto en trozos planos y menciones.
 *
 * La gramática, entera: la `@` va al principio o después de un espacio —así un
 * correo no se lee como referencia— y detrás va una ruta sin espacios, o una
 * entrecomillada si los tiene.
 */
export function splitMentions(text: string): MentionChunk[] {
  const chunks: MentionChunk[] = [];
  let plain = "";
  let i = 0;

  while (i < text.length) {
    const isMention = text[i] === "@" && (i === 0 || /\s/.test(text[i - 1]));
    if (!isMention) {
      plain += text[i++];
      continue;
    }
    const rest = text.slice(i + 1);
    let reference: string;
    let size: number;
    if (rest.startsWith('"')) {
      const end = rest.indexOf('"', 1);
      if (end < 0) {
        plain += text[i++]; // comilla sin cerrar: todavía se está escribiendo
        continue;
      }
      reference = rest.slice(1, end);
      size = end + 1;
    } else {
      const cut = rest.search(/[\s@"]/);
      const raw = (cut < 0 ? rest : rest.slice(0, cut)).replace(CLOSING_PUNCTUATION, "");
      reference = raw;
      size = raw.length;
    }
    if (!reference) {
      plain += text[i++];
      continue;
    }
    if (plain) chunks.push({ text: plain, reference: null });
    plain = "";
    chunks.push({ text: text.slice(i, i + 1 + size), reference });
    i += 1 + size;
  }

  if (plain) chunks.push({ text: plain, reference: null });
  return chunks;
}

/** Cómo se escribe una referencia: entrecomillada solo si lo necesita. */
export function mentionText(path: string): string {
  return /[\s"@]/.test(path) ? `@"${path}"` : `@${path}`;
}

/** El disparador que se está escribiendo ahora mismo, si hay alguno. */
export type Trigger = {
  kind: "@" | "/";
  /** Rango que reemplaza al elegir. */
  from: number;
  to: number;
  /** Lo tecleado detrás del disparador, en minúsculas. */
  query: string;
  /** Una barra en medio del texto: solo ofrece skills. */
  inline?: boolean;
};

/**
 * Qué menú corresponde a lo que hay escrito y dónde está el cursor. La barra
 * sigue `@terminus/chat/slash`: al principio o tras un espacio, nunca dentro
 * de una mención, una ruta o una URL.
 */
export function activeTrigger(text: string, caret: number): Trigger | null {
  const slash = slashAt(text, caret);
  if (slash) {
    return { kind: "/", from: slash.from, to: slash.to, query: slash.name.toLowerCase(), inline: slash.inline };
  }

  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  let from = -1;
  let query = "";
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== "@") continue;
    if (i > 0 && !/\s/.test(before[i - 1])) continue;
    const body = before.slice(i + 1);
    if (body.startsWith('"')) {
      // Entrecomillada y todavía sin cerrar: la consulta puede llevar espacios.
      if (body.indexOf('"', 1) < 0) {
        from = i;
        query = body.slice(1);
      }
    } else if (!/[\s"@]/.test(body)) {
      from = i;
      query = body;
    }
  }
  if (from < 0) return null;
  return { kind: "@", from, to: before.length, query: query.toLowerCase() };
}

/** Reemplaza lo que se estaba tecleando por la referencia elegida. */
export function applySuggestion(
  text: string,
  d: Trigger,
  value: string,
): { text: string; caret: number } {
  if (d.kind === "/") return replaceSlash(text, d, value);
  const inserted = `${mentionText(value)} `;
  return {
    text: text.slice(0, d.from) + inserted + text.slice(d.to),
    caret: d.from + inserted.length,
  };
}
