/**
 * El separador de un archivo tabular y sus filas, sin dependencias.
 *
 * `csv` y `tsv` se leen como tabla; el resto de textos, no. El tope de filas
 * existe porque cada celda es un nodo: una hoja de 200 000 líneas congelaría la
 * ventana al montarla.
 */

export type Table = { rows: string[][]; truncated: boolean };

/** Filas que se pintan antes de decir que hay más. */
export const MAX_ROWS = 1000;

/** El separador por extensión, o `null` si el archivo no es tabular. */
export function delimiterFor(path: string): string | null {
  const name = path.split(/[/\\]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (ext === "csv") return ",";
  if (ext === "tsv") return "\t";
  return null;
}

/**
 * Las filas de un texto delimitado, con comillas y saltos de línea dentro de
 * comillas. Devuelve `truncated` cuando el tope dejó texto fuera: sin ese dato
 * una tabla a medias se lee como la hoja entera.
 */
export function parseTable(text: string, delim: string, max = MAX_ROWS): Table {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let truncated = false;

  const closeField = () => {
    row.push(field);
    field = "";
  };
  const closeRow = () => {
    closeField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      closeField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      closeRow();
      if (rows.length >= max) {
        truncated = i < text.length - 1;
        break;
      }
    } else {
      field += ch;
    }
  }

  // Un salto final no deja una fila vacía: el archivo terminó, no hay más datos.
  if (!truncated && (field !== "" || row.length > 0)) closeRow();
  return { rows, truncated };
}
