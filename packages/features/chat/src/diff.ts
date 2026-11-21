/** Calcula el antes y el después de un archivo sin depender de la interfaz. */

/** Una línea del resultado, con el número que le toca en cada lado. */
export type Linea = {
  tipo: "igual" | "quita" | "pone";
  texto: string;
  /** Número de línea en el antes, o `null` si es una línea añadida. */
  a: number | null;
  /** Número de línea en el después, o `null` si es una línea quitada. */
  b: number | null;
};

/** Un tramo sin cambios que se dobló porque no aportaba nada. */
export type Salto = { tipo: "salto"; lineas: number };

export type Trozo = Linea | Salto;

/**
 * Cuántas líneas iguales se conservan a cada lado de un cambio.
 *
 * Sin contexto un diff dice qué cambió y no dónde; con el archivo entero, un
 * cambio de dos líneas en un archivo de mil son mil líneas para encontrar dos.
 */
const CONTEXTO = 3;

/**
 * Tope del producto de líneas que se compara de verdad.
 *
 * La tabla de subsecuencia común es cuadrática, y esto corre en el hilo de la
 * interfaz: un par de archivos de 2.000 líneas serían cuatro millones de celdas
 * y la ventana se congela. Por encima del tope no se miente con un resultado
 * aproximado — se reporta el bloque entero como reemplazado, que es exacto
 * aunque sea grueso.
 */
const TOPE = 1_000_000;

function lineas(s: string): string[] {
  // Un archivo vacío no tiene una línea vacía: no tiene ninguna. `split` daría
  // `[""]`, y eso pintaba un renglón fantasma quitado al crear un archivo.
  if (s === "") return [];
  // Y uno que termina en salto tampoco tiene una última línea vacía: la tendría
  // el `split`, y saldría pintada como una línea más.
  const l = s.split("\n");
  if (l.length > 1 && l[l.length - 1] === "") l.pop();
  return l;
}

/**
 * Las dos versiones, alineadas.
 *
 * `antes === null` es el caso de un archivo escrito entero: el agente dijo qué
 * puso y no qué había, así que todo es alta. No se asume que el archivo estuviera
 * vacío — eso pintaría un archivo nuevo donde pudo haber uno pisado.
 */
export function comparar(antes: string | null, despues: string): Linea[] {
  const b = lineas(despues);
  if (antes === null)
    return b.map((texto, i) => ({ tipo: "pone", texto, a: null, b: i + 1 }));
  return alinear(lineas(antes), b, 0, 0, 0);
}

/**
 * **El diff se ancla antes de compararse, y esa es la diferencia entre servir y
 * no servir.**
 *
 * La tabla de subsecuencia común es cuadrática, así que sobre dos versiones
 * enteras de un artefacto no cabe: 2.000 líneas son cuatro millones de celdas.
 * Reportar el bloque entero como reemplazado es exacto y **no sirve para
 * revisar** —un cambio de veinte líneas en un documento de dos mil se lee como
 * dos mil líneas cambiadas, y el panel del gate existe para revisar eso—, y
 * sacar el cálculo a un worker no lo arregla: mover a otro hilo un resultado
 * inútil sigue siendo inútil.
 *
 * Anclar parte el problema en trozos que sí caben:
 *
 * 1. Se recortan el principio y el final comunes, que en una revisión son casi
 *    todo el documento.
 * 2. Se buscan las líneas que aparecen **una sola vez en cada lado**: si están
 *    en las dos, son el mismo sitio sin ambigüedad. La subsecuencia creciente
 *    más larga de esas posiciones da los puntos fijos.
 * 3. Entre punto y punto quedan huecos pequeños, y ahí sí se hace la tabla.
 *
 * Es la idea de *patience diff*. **Dónde falla, y está medido:** si un lado casi
 * no tiene líneas únicas —una tabla con filas que se repiten— no hay anclas, y
 * el hueco vuelve a ser el documento entero. Por eso el tope sigue existiendo
 * debajo: es el suelo, no el camino.
 */
function alinear(a: string[], b: string[], offA: number, offB: number, hondo: number): Linea[] {
  const linea = (tipo: Linea["tipo"], texto: string, i: number, j: number): Linea => ({
    tipo,
    texto,
    a: tipo === "pone" ? null : offA + i + 1,
    b: tipo === "quita" ? null : offB + j + 1,
  });

  // Principio y final comunes. En una revisión de un documento esto se lleva la
  // mayor parte, y lo que queda ya suele caber en la tabla.
  let ini = 0;
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++;
  let fin = 0;
  while (
    fin < a.length - ini &&
    fin < b.length - ini &&
    a[a.length - 1 - fin] === b[b.length - 1 - fin]
  )
    fin++;

  const cabeza = a.slice(0, ini).map((t, i) => linea("igual", t, i, i));
  const cola = a
    .slice(a.length - fin)
    .map((t, i) => linea("igual", t, a.length - fin + i, b.length - fin + i));
  const ma = a.slice(ini, a.length - fin);
  const mb = b.slice(ini, b.length - fin);
  const dA = offA + ini;
  const dB = offB + ini;

  if (ma.length === 0 || mb.length === 0)
    return [
      ...cabeza,
      ...ma.map((t, i): Linea => ({ tipo: "quita", texto: t, a: dA + i + 1, b: null })),
      ...mb.map((t, i): Linea => ({ tipo: "pone", texto: t, a: null, b: dB + i + 1 })),
      ...cola,
    ];

  // Un hueco que ya cabe en la tabla no necesita más anclas: la tabla da el
  // resultado óptimo y anclar solo lo aproximaría.
  const anclas = ma.length * mb.length > TOPE && hondo < HONDO ? puntosFijos(ma, mb) : [];

  if (anclas.length === 0)
    return [...cabeza, ...sinAnclas(ma, mb, dA, dB), ...cola];

  const medio: Linea[] = [];
  let i = 0;
  let j = 0;
  for (const [pa, pb] of anclas) {
    medio.push(...alinear(ma.slice(i, pa), mb.slice(j, pb), dA + i, dB + j, hondo + 1));
    medio.push({ tipo: "igual", texto: ma[pa], a: dA + pa + 1, b: dB + pb + 1 });
    i = pa + 1;
    j = pb + 1;
  }
  medio.push(...alinear(ma.slice(i), mb.slice(j), dA + i, dB + j, hondo + 1));
  return [...cabeza, ...medio, ...cola];
}

/**
 * Tope de anidamiento del anclado.
 *
 * Cada nivel trabaja sobre un trozo estrictamente menor, así que esto no evita
 * un bucle infinito: evita pagar el recorrido de buscar anclas en huecos cada
 * vez más pequeños cuando la tabla ya los resolvería de un golpe.
 */
const HONDO = 6;

/**
 * Las posiciones que son el mismo sitio en los dos lados, sin ambigüedad.
 *
 * Una línea que aparece **exactamente una vez en cada lado** solo puede
 * corresponderse consigo misma. De esas, la subsecuencia creciente más larga es
 * el mayor conjunto que respeta el orden — el resto son movimientos, y un
 * movimiento no es un ancla.
 */
function puntosFijos(a: string[], b: string[]): Array<[number, number]> {
  const cuenta = new Map<string, { a: number; b: number; ia: number; ib: number }>();
  a.forEach((t, i) => {
    const e = cuenta.get(t) ?? { a: 0, b: 0, ia: -1, ib: -1 };
    e.a++;
    e.ia = i;
    cuenta.set(t, e);
  });
  b.forEach((t, i) => {
    const e = cuenta.get(t);
    if (!e) return;
    e.b++;
    e.ib = i;
  });

  const pares: Array<[number, number]> = [];
  for (const e of cuenta.values()) if (e.a === 1 && e.b === 1) pares.push([e.ia, e.ib]);
  if (pares.length === 0) return [];
  pares.sort((x, y) => x[0] - y[0]);

  // Subsecuencia creciente más larga sobre la posición en `b`, en n log n.
  const colas: number[] = [];
  const previo = new Array<number>(pares.length).fill(-1);
  const indice: number[] = [];
  for (let k = 0; k < pares.length; k++) {
    let lo = 0;
    let hi = colas.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (colas[mid] < pares[k][1]) lo = mid + 1;
      else hi = mid;
    }
    colas[lo] = pares[k][1];
    indice[lo] = k;
    previo[k] = lo > 0 ? indice[lo - 1] : -1;
  }
  const out: Array<[number, number]> = [];
  for (let k = indice[colas.length - 1]; k >= 0; k = previo[k]) out.push(pares[k]);
  return out.reverse();
}

/**
 * Un hueco grande sin una sola línea única a la que agarrarse.
 *
 * Pasa cuando las filas se parecen entre sí —una tabla de «— · Pendiente · 3»
 * repetida— y ahí **no hay una alineación correcta que encontrar**: si dos filas
 * son indistinguibles, emparejar la tercera con la tercera o con la cuarta es
 * igual de válido. La pregunta no tiene respuesta única, así que el trabajo no
 * es adivinarla mejor: es no mentir.
 *
 * Cuando los dos lados miden **casi lo mismo**, se comparan posición contra
 * posición. Eso es una revisión en el sitio —se editaron celdas, no se
 * insertaron filas— y ahí el índice SÍ es la correspondencia buena. Si las
 * longitudes difieren, alguien insertó o borró, el índice deja de valer y se cae
 * a la tabla, que dentro del tope es exacta y por encima reporta el bloque
 * entero.
 */
function sinAnclas(a: string[], b: string[], offA: number, offB: number): Linea[] {
  const desvio = Math.abs(a.length - b.length);
  const cabeMesa = a.length * b.length <= TOPE;
  if (cabeMesa || desvio > Math.max(4, Math.min(a.length, b.length) * 0.01))
    return tabla(a, b, offA, offB);

  const out: Linea[] = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) {
      out.push({ tipo: "igual", texto: a[i], a: offA + i + 1, b: offB + i + 1 });
      continue;
    }
    out.push({ tipo: "quita", texto: a[i], a: offA + i + 1, b: null });
    out.push({ tipo: "pone", texto: b[i], a: null, b: offB + i + 1 });
  }
  for (let i = n; i < a.length; i++)
    out.push({ tipo: "quita", texto: a[i], a: offA + i + 1, b: null });
  for (let i = n; i < b.length; i++)
    out.push({ tipo: "pone", texto: b[i], a: null, b: offB + i + 1 });
  return out;
}

/** La subsecuencia común más larga, exacta. Es el suelo del anclado. */
function tabla(a: string[], b: string[], offA: number, offB: number): Linea[] {
  if (a.length * b.length > TOPE)
    return [
      ...a.map((texto, i): Linea => ({ tipo: "quita", texto, a: offA + i + 1, b: null })),
      ...b.map((texto, i): Linea => ({ tipo: "pone", texto, a: null, b: offB + i + 1 })),
    ];

  // `Uint32Array` y no una matriz de arreglos: el mismo algoritmo en un décimo
  // de memoria.
  const ancho = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * ancho);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i * ancho + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * ancho + j + 1] + 1
          : Math.max(lcs[(i + 1) * ancho + j], lcs[i * ancho + j + 1]);

  const out: Linea[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ tipo: "igual", texto: a[i], a: offA + i + 1, b: offB + j + 1 });
      i++;
      j++;
    } else if (lcs[(i + 1) * ancho + j] >= lcs[i * ancho + j + 1]) {
      out.push({ tipo: "quita", texto: a[i], a: offA + i + 1, b: null });
      i++;
    } else {
      out.push({ tipo: "pone", texto: b[j], a: null, b: offB + j + 1 });
      j++;
    }
  }
  while (i < a.length) {
    out.push({ tipo: "quita", texto: a[i], a: offA + i + 1, b: null });
    i++;
  }
  while (j < b.length) {
    out.push({ tipo: "pone", texto: b[j], a: null, b: offB + j + 1 });
    j++;
  }
  return out;
}

/**
 * El diff de una edición concreta, calculado **una vez y no una por render**.
 *
 * La cabecera de la fila enseña `+12 −3` sin desplegar nada, así que el diff se
 * calcula aunque la fila esté cerrada — y la transcripción entera se vuelve a
 * pintar en **cada delta** que llega mientras el agente escribe. Medido: una
 * edición de 900 líneas cuesta 13,6 ms, y tres filas así son 41 ms por pase de
 * render; a veinte deltas por segundo eso deja de caber en un fotograma y la
 * ventana se traba justo mientras llega la respuesta.
 *
 * La llave es **el objeto de la edición**, que se crea una vez con el evento y
 * no cambia nunca más: dos renders del mismo paso comparten identidad. Y es un
 * `WeakMap`, así que lo calculado se va con el mensaje en vez de acumularse.
 */
const memoria = new WeakMap<object, Linea[]>();

export function comparado(cambio: { before: string | null; after: string }): Linea[] {
  const ya = memoria.get(cambio);
  if (ya) return ya;
  const nuevo = comparar(cambio.before, cambio.after);
  memoria.set(cambio, nuevo);
  return nuevo;
}

/** Dobla los tramos iguales que quedan lejos de cualquier cambio. */
export function doblar(ls: Linea[]): Trozo[] {
  const cerca = ls.map(
    (_, i) =>
      ls
        .slice(Math.max(0, i - CONTEXTO), i + CONTEXTO + 1)
        .some((l) => l.tipo !== "igual"),
  );

  const out: Trozo[] = [];
  let saltadas = 0;
  ls.forEach((l, i) => {
    if (cerca[i]) {
      if (saltadas) out.push({ tipo: "salto", lineas: saltadas });
      saltadas = 0;
      out.push(l);
    } else {
      saltadas++;
    }
  });
  if (saltadas) out.push({ tipo: "salto", lineas: saltadas });
  return out;
}

/** Cuántas líneas entran y cuántas salen. Es el resumen de la cabecera. */
export function balance(ls: Linea[]) {
  return {
    pone: ls.filter((l) => l.tipo === "pone").length,
    quita: ls.filter((l) => l.tipo === "quita").length,
  };
}
