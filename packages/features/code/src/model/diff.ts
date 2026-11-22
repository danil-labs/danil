/**
 * Parsea un diff unificado de git en algo que se pueda pintar línea a línea.
 *
 * **El backend manda el patch como texto y aquí se convierte en estructura**,
 * en vez de pedirle al backend que mande JSON. El texto es lo que git produce y
 * lo que `publications.jsonl` registra; convertirlo dos veces —una para pintar,
 * otra para publicar— es tener dos verdades sobre el mismo cambio.
 *
 * Lo que este parser NO hace, y es a propósito: no adivina el lenguaje ni
 * colorea sintaxis. Lo que hay que distinguir en una revisión es qué se añadió
 * y qué se quitó, y eso lo dice la línea entera, no la palabra clave.
 */

/** Una línea del diff, con su número **real** en cada lado. */
export type Linea = {
  tipo: "ctx" | "add" | "del";
  /** El número en el archivo de antes; `null` en las añadidas. */
  vieja: number | null;
  /** El número en el archivo de ahora; `null` en las borradas. */
  nueva: number | null;
  texto: string;
};

/** Un trozo contiguo del archivo, con el número de línea donde empieza. */
export type Hunk = {
  desdeVieja: number;
  desdeNueva: number;
  lineas: Linea[];
};

export type ArchivoDiff = {
  /** La ruta de ahora; en un borrado, la que tenía. */
  ruta: string;
  /** La ruta anterior, solo si el archivo se movió. */
  desde: string | null;
  estado: "nuevo" | "borrado" | "renombrado" | "cambiado";
  /** Git no diffea binarios: lo dice y no manda contenido. */
  binario: boolean;
  hunks: Hunk[];
  added: number;
  removed: number;
};

/** `@@ -12,7 +12,9 @@ lo que sea` → los dos números de arranque. */
const CABECERA = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * **La ruta preferida sale de `+++`/`---`, no de la línea `diff --git`.** Esa
 * línea trae las dos rutas pegadas y sin comillas, así que un archivo con un
 * espacio en el nombre la vuelve ambigua: `a/mi archivo b/mi archivo` no se
 * puede partir sin adivinar dónde. Las de `+++`/`---` vienen una por línea.
 */
function rutaDe(linea: string): string | null {
  const cruda = linea.slice(4).trim();
  if (cruda === "/dev/null") return null;
  // git antepone `a/` y `b/` salvo que se configure lo contrario.
  return cruda.replace(/^[ab]\//, "");
}

/**
 * El respaldo para lo que no trae `+++`: **los binarios**.
 *
 * Git no los diffea, así que su bloque no tiene ni `---` ni `+++` ni trozos —
 * solo `diff --git` y una línea que dice que diferían—. Sin este respaldo el
 * archivo se quedaba sin ruta y el filtro final lo tiraba: un PNG que el agente
 * añadió **desaparecía de la revisión**, que es peor que enseñarlo sin
 * contenido.
 *
 * Parte por el último ` b/`, que es lo único que se puede hacer con las dos
 * rutas en una línea. Con un nombre que contenga ` b/` da mal — y aun así da
 * algo, que es lo que hay que preferir a perder el archivo.
 */
function rutaDeCabecera(linea: string): string | null {
  const cruda = linea.slice("diff --git ".length);
  const corte = cruda.lastIndexOf(" b/");
  if (corte < 0) return null;
  return cruda.slice(corte + 3);
}

/**
 * El contenido de un archivo **sin cambios**, con la forma de un diff.
 *
 * **Para que haya un solo renderizador.** Un archivo que el agente no tocó se
 * abre desde el árbol y hay que pintarlo con sus números de línea; escribir un
 * segundo visor sería el mismo dato dibujado dos veces, y dos dibujantes del
 * mismo dato divergen —uno gana un color, el otro un número—. Aquí es un trozo
 * único de líneas de contexto, que es literalmente lo que es: un archivo sin
 * nada añadido ni quitado.
 */
export function comoDiff(ruta: string, contenido: string): ArchivoDiff {
  const lineas = lineasDe(contenido);
  return {
    ruta,
    desde: null,
    estado: "cambiado",
    binario: false,
    added: 0,
    removed: 0,
    hunks: [
      {
        desdeVieja: 1,
        desdeNueva: 1,
        lineas: lineas.map((texto, i) => ({
          tipo: "ctx" as const,
          vieja: i + 1,
          nueva: i + 1,
          texto,
        })),
      },
    ],
  };
}

function lineasDe(contenido: string): string[] {
  // Un archivo que acaba en salto de línea deja una última línea vacía que no
  // es una línea del archivo.
  const crudas = contenido.split("\n");
  return crudas.at(-1) === "" ? crudas.slice(0, -1) : crudas;
}

export function parsearDiff(patch: string): ArchivoDiff[] {
  const archivos: ArchivoDiff[] = [];
  let actual: ArchivoDiff | null = null;
  let hunk: Hunk | null = null;
  let vieja = 0;
  let nueva = 0;

  const cerrarHunk = () => {
    if (actual && hunk) actual.hunks.push(hunk);
    hunk = null;
  };

  for (const linea of patch.split("\n")) {
    if (linea.startsWith("diff --git ")) {
      cerrarHunk();
      actual = {
        ruta: rutaDeCabecera(linea) ?? "",
        desde: null,
        estado: "cambiado",
        binario: false,
        hunks: [],
        added: 0,
        removed: 0,
      };
      archivos.push(actual);
      continue;
    }
    if (!actual) continue;

    if (linea.startsWith("new file mode")) {
      actual.estado = "nuevo";
      continue;
    }
    if (linea.startsWith("deleted file mode")) {
      actual.estado = "borrado";
      continue;
    }
    if (linea.startsWith("rename from ")) {
      actual.desde = linea.slice("rename from ".length);
      actual.estado = "renombrado";
      continue;
    }
    if (linea.startsWith("Binary files ") || linea.startsWith("GIT binary patch")) {
      actual.binario = true;
      continue;
    }
    if (linea.startsWith("--- ")) {
      // En un borrado, `+++` es /dev/null y el nombre de verdad solo está aquí.
      const r = rutaDe(linea);
      if (r) actual.ruta = r;
      continue;
    }
    if (linea.startsWith("+++ ")) {
      const r = rutaDe(linea);
      if (r) actual.ruta = r;
      continue;
    }

    const cab = CABECERA.exec(linea);
    if (cab) {
      cerrarHunk();
      vieja = Number(cab[1]);
      nueva = Number(cab[2]);
      hunk = { desdeVieja: vieja, desdeNueva: nueva, lineas: [] };
      continue;
    }
    if (!hunk) continue;

    // **`\ No newline at end of file` no es una línea del archivo.** Contarla
    // desplazaría toda la numeración de ahí abajo.
    if (linea.startsWith("\\")) continue;

    const marca = linea[0];
    // **El retorno de carro se va, y no es cosmética.** Un repositorio con finales
    // CRLF —lo normal en uno que se trabaja desde Windows— deja un `\r` al final
    // de cada línea del patch. Pintado, es un carácter de control invisible dentro
    // del bloque de código: no se ve, se copia, y aparece en cualquier sitio donde
    // alguien pegue lo que leyó aquí.
    const texto = linea.slice(1).replace(/\r$/, "");
    if (marca === "+") {
      hunk.lineas.push({ tipo: "add", vieja: null, nueva, texto });
      nueva += 1;
      actual.added += 1;
    } else if (marca === "-") {
      hunk.lineas.push({ tipo: "del", vieja, nueva: null, texto });
      vieja += 1;
      actual.removed += 1;
    } else if (marca === " ") {
      // **Una línea vacía del archivo llega como `" "`, no como `""`.** Git
      // siempre prefija con un carácter, así que la cadena vacía es el residuo
      // del `split` sobre el salto final del patch — contarla como contexto
      // corría un número toda la numeración de ahí abajo.
      hunk.lineas.push({ tipo: "ctx", vieja, nueva, texto });
      vieja += 1;
      nueva += 1;
    }
  }
  cerrarHunk();
  return archivos.filter((a) => a.ruta);
}

/**
 * Cuántas líneas se saltó git entre dos trozos.
 *
 * Es el número que va en «N líneas sin cambios»: sin él, dos trozos separados
 * por medio archivo se leen como si fueran contiguos.
 */
export function saltoEntre(anterior: Hunk, siguiente: Hunk): number {
  const finAnterior = anterior.lineas.reduce(
    (max, l) => (l.nueva !== null && l.nueva > max ? l.nueva : max),
    anterior.desdeNueva - 1,
  );
  return Math.max(0, siguiente.desdeNueva - finAnterior - 1);
}

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
