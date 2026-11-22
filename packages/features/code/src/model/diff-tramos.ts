import type { Linea } from "./diff-parse";

/** `[inicio, fin)` en caracteres del texto de una línea: lo que cambió dentro de ella. */
export type Tramo = [number, number];

const TOKEN = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;

/** Por debajo, marcar los tramos pinta casi toda la línea y no dice nada que no diga ya su fondo. */
export const PARECIDO_MINIMO = 0.4;

/** Tope de la tabla de comparación por par, para que una línea minificada no congele la ventana. */
const CELDAS_MAXIMAS = 10_000;

const SIN_TRAMOS: Tramo[] = [];

/**
 * Los tramos que difieren entre una línea borrada y la añadida que la sustituye,
 * por palabras. `null` si se parecen demasiado poco para que marcar sirva.
 */
export function tramosCambiados(
  antes: string,
  despues: string,
): { antes: Tramo[]; despues: Tramo[]; parecido: number } | null {
  const a = antes.match(TOKEN) ?? [];
  const b = despues.match(TOKEN) ?? [];
  if (a.length === 0 || b.length === 0) return null;

  let prefijo = 0;
  while (prefijo < a.length && prefijo < b.length && a[prefijo] === b[prefijo]) prefijo += 1;
  let sufijo = 0;
  while (
    sufijo < a.length - prefijo &&
    sufijo < b.length - prefijo &&
    a[a.length - 1 - sufijo] === b[b.length - 1 - sufijo]
  ) {
    sufijo += 1;
  }

  const n = a.length - prefijo - sufijo;
  const m = b.length - prefijo - sufijo;
  if (n * m > CELDAS_MAXIMAS) return null;

  const comunA = new Array<boolean>(a.length).fill(true);
  const comunB = new Array<boolean>(b.length).fill(true);
  for (let i = 0; i < n; i++) comunA[prefijo + i] = false;
  for (let j = 0; j < m; j++) comunB[prefijo + j] = false;

  if (n > 0 && m > 0) {
    const ancho = m + 1;
    const lcs = new Uint16Array((n + 1) * ancho);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * ancho + j] =
          a[prefijo + i] === b[prefijo + j]
            ? lcs[(i + 1) * ancho + j + 1] + 1
            : Math.max(lcs[(i + 1) * ancho + j], lcs[i * ancho + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[prefijo + i] === b[prefijo + j]) {
        comunA[prefijo + i] = true;
        comunB[prefijo + j] = true;
        i += 1;
        j += 1;
      } else if (lcs[(i + 1) * ancho + j] >= lcs[i * ancho + j + 1]) {
        i += 1;
      } else {
        j += 1;
      }
    }
  }

  let compartido = 0;
  for (let i = 0; i < a.length; i++) if (comunA[i]) compartido += a[i].length;
  const parecido = (2 * compartido) / (antes.length + despues.length);
  if (parecido < PARECIDO_MINIMO) return null;

  return { antes: tramosDe(a, comunA, antes), despues: tramosDe(b, comunB, despues), parecido };
}

function tramosDe(tokens: string[], comun: boolean[], texto: string): Tramo[] {
  const tramos: Tramo[] = [];
  let desde = 0;
  for (let k = 0; k < tokens.length; k++) {
    const hasta = desde + tokens[k].length;
    if (!comun[k]) {
      const ultimo = tramos.at(-1);
      // Dos tramos separados solo por espacio se leen como uno: se pintan como uno.
      if (ultimo && /^\s*$/.test(texto.slice(ultimo[1], desde))) ultimo[1] = hasta;
      else tramos.push([desde, hasta]);
    }
    desde = hasta;
  }
  return tramos;
}

/** Por encima de este producto el bloque se empareja por posición: la tabla cuesta D×A comparaciones. */
const PARES_MAXIMOS = 400;

type Par = { antes: number | null; despues: number | null; tramos?: { antes: Tramo[]; despues: Tramo[] } };

/**
 * Las filas de un bloque de cambio, en orden. Cada borrada va con la añadida
 * que más se le parece sin cruzar el orden: por posición, una línea añadida
 * delante la separaría de la que la sustituye. Lo que queda sin pareja se junta
 * por posición entre dos parejas, sin tramos.
 */
function alinear(lineas: Linea[], borradas: number[], anadidas: number[]): Par[] {
  const D = borradas.length;
  const A = anadidas.length;
  const posicional = (): Par[] =>
    Array.from({ length: Math.max(D, A) }, (_, k) => {
      const antes = borradas[k] ?? null;
      const despues = anadidas[k] ?? null;
      const t =
        antes !== null && despues !== null
          ? tramosCambiados(lineas[antes].texto, lineas[despues].texto)
          : null;
      return t ? { antes, despues, tramos: t } : { antes, despues };
    });
  if (D === 0 || A === 0 || D * A > PARES_MAXIMOS) return posicional();

  const parecidos = borradas.map((b) =>
    anadidas.map((a) => tramosCambiados(lineas[b].texto, lineas[a].texto)),
  );
  const mejor = Array.from({ length: D + 1 }, () => new Float64Array(A + 1));
  for (let i = D - 1; i >= 0; i--) {
    for (let j = A - 1; j >= 0; j--) {
      const p = parecidos[i][j];
      mejor[i][j] = Math.max(
        mejor[i + 1][j],
        mejor[i][j + 1],
        p ? mejor[i + 1][j + 1] + p.parecido : 0,
      );
    }
  }

  const filas: Par[] = [];
  let sueltasAntes: number[] = [];
  let sueltasDespues: number[] = [];
  const vaciar = () => {
    const alto = Math.max(sueltasAntes.length, sueltasDespues.length);
    for (let k = 0; k < alto; k++) {
      filas.push({ antes: sueltasAntes[k] ?? null, despues: sueltasDespues[k] ?? null });
    }
    sueltasAntes = [];
    sueltasDespues = [];
  };
  let i = 0;
  let j = 0;
  while (i < D && j < A) {
    const p = parecidos[i][j];
    if (p && mejor[i][j] === mejor[i + 1][j + 1] + p.parecido) {
      vaciar();
      filas.push({ antes: borradas[i], despues: anadidas[j], tramos: p });
      i += 1;
      j += 1;
    } else if (mejor[i + 1][j] >= mejor[i][j + 1]) {
      sueltasAntes.push(borradas[i]);
      i += 1;
    } else {
      sueltasDespues.push(anadidas[j]);
      j += 1;
    }
  }
  sueltasAntes.push(...borradas.slice(i));
  sueltasDespues.push(...anadidas.slice(j));
  vaciar();
  return filas;
}

/** Los tramos de cada línea de un trozo, en el mismo orden. */
export function marcarLineas(lineas: Linea[]): Tramo[][] {
  const salida: Tramo[][] = lineas.map(() => SIN_TRAMOS);
  for (const { borradas, anadidas } of bloquesDeCambio(lineas)) {
    for (const par of alinear(lineas, borradas, anadidas)) {
      if (!par.tramos || par.antes === null || par.despues === null) continue;
      salida[par.antes] = par.tramos.antes;
      salida[par.despues] = par.tramos.despues;
    }
  }
  return salida;
}

/** Una fila de la vista en dos paneles: índices en `Hunk.lineas`, `null` donde un lado lleva hueco. */
export type Fila = { antes: number | null; despues: number | null };

export function filasDosPaneles(lineas: Linea[]): Fila[] {
  const filas: Fila[] = [];
  let i = 0;
  for (const bloque of bloquesDeCambio(lineas)) {
    for (; i < bloque.desde; i++) filas.push({ antes: i, despues: i });
    for (const par of alinear(lineas, bloque.borradas, bloque.anadidas)) {
      filas.push({ antes: par.antes, despues: par.despues });
    }
    i = bloque.hasta;
  }
  for (; i < lineas.length; i++) filas.push({ antes: i, despues: i });
  return filas;
}

type Bloque = { desde: number; hasta: number; borradas: number[]; anadidas: number[] };

/** Las rachas de líneas que no son contexto, con los índices de cada lado. */
function bloquesDeCambio(lineas: Linea[]): Bloque[] {
  const bloques: Bloque[] = [];
  let actual: Bloque | null = null;
  lineas.forEach((l, i) => {
    if (l.tipo === "ctx") {
      actual = null;
      return;
    }
    if (!actual) {
      actual = { desde: i, hasta: i, borradas: [], anadidas: [] };
      bloques.push(actual);
    }
    (l.tipo === "del" ? actual.borradas : actual.anadidas).push(i);
    actual.hasta = i + 1;
  });
  return bloques;
}
