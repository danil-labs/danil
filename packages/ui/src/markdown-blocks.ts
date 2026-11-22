/**
 * Parte una respuesta en bloques de primer nivel para el streaming: solo el
 * último bloque cambia mientras se escribe, los anteriores son la misma cadena,
 * `Index` no los toca y su DOM y su alto quedan estables. Pasar el mensaje
 * entero a `SolidMarkdown` reconstruye todo el árbol en cada token y las
 * alturas brincan bajo el hilo que sigue al fondo.
 *
 * Se corta con reglas y no con el AST: `remark-parse` solo está como
 * dependencia transitiva de `solid-markdown`, no declarada, y pnpm no
 * garantiza esa resolución. Las reglas son conservadoras — ante la duda NO se
 * corta: un corte de más parte una lista y reinicia su numeración; uno de
 * menos solo deja un bloque más grande.
 */

/** Abre o cierra un bloque de código: ``` o ~~~, con lo que sea detrás. */
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
/** Abre o cierra un bloque de fórmula: `$$` sin otro `$` en la línea. */
const FORMULA = /^\s{0,3}(\${2,})[^$]*$/;
/** Lo único que cierra una fórmula: los `$` y espacios. */
const CIERRE_DE_FORMULA = /^\s{0,3}\${2,}\s*$/;
/** Empieza un elemento de lista: `-`, `*`, `+`, `1.`, `1)`. */
const LISTA = /^\s{0,3}([-*+]|\d{1,9}[.)])\s/;
/** Empieza una cita. */
const CITA = /^\s{0,3}>/;
/** Sigue algo que ya venía: indentado con dos espacios o con un tabulador. */
const SANGRADO = /^(\s{2,}|\t)\S/;

/** Si un trozo contiene alguna línea que abra lista. */
const esLista = (t: string) => t.split("\n").some((l) => LISTA.test(l));
const esCita = (t: string) => t.split("\n").some((l) => CITA.test(l));

/**
 * Los bloques de `texto`, en orden y sin perder nada: **volver a unirlos con
 * `"\n\n"` devuelve el original**, salvo por los saltos de más que separaban
 * unos de otros.
 *
 * Un texto vacío da una lista vacía, y uno sin líneas en blanco da un solo
 * bloque — que es lo que pasa al principio de cada respuesta.
 */
export function bloquesDeMarkdown(texto: string): string[] {
  if (texto === "") return [];
  const lineas = texto.split("\n");
  /** Los trozos crudos: lo que separa una línea en blanco fuera de un fence. */
  const trozos: string[] = [];
  let actual: string[] = [];
  let dentroDeFence = false;
  let cierre = "";

  for (const linea of lineas) {
    const fence = FENCE.exec(linea) ?? FORMULA.exec(linea);
    if (fence) {
      if (!dentroDeFence) {
        dentroDeFence = true;
        cierre = fence[1][0];
      } else if (linea.trimStart().startsWith(cierre) && (cierre !== "$" || CIERRE_DE_FORMULA.test(linea))) {
        // **El cierre se compara por el carácter y no por el largo.** Markdown
        // deja cerrar con al menos tantas marcas como abrió, y un ``` dentro de
        // un ~~~~ es contenido y no un cierre.
        dentroDeFence = false;
      }
      actual.push(linea);
      continue;
    }
    // Una línea en blanco **dentro** de un bloque de código es contenido suyo.
    if (linea.trim() === "" && !dentroDeFence) {
      if (actual.length > 0) trozos.push(actual.join("\n"));
      actual = [];
      continue;
    }
    actual.push(linea);
  }
  if (actual.length > 0) trozos.push(actual.join("\n"));

  // **Y se vuelven a unir los que no debían separarse.** Una lista con
  // línea en blanco entre sus elementos —una lista «suelta»— son varios trozos
  // de una sola lista: dejarlos partidos reinicia la numeración de una lista
  // ordenada y separa las viñetas con el margen de dos bloques.
  const bloques: string[] = [];
  for (const trozo of trozos) {
    const previo = bloques[bloques.length - 1];
    const primera = trozo.split("\n")[0] ?? "";
    const sigue =
      previo !== undefined &&
      (SANGRADO.test(primera) ||
        (LISTA.test(primera) && esLista(previo)) ||
        (CITA.test(primera) && esCita(previo)));
    if (sigue) bloques[bloques.length - 1] = `${previo}\n\n${trozo}`;
    else bloques.push(trozo);
  }
  return bloques;
}

type Corte = {
  /** El texto ya leído hasta `desde`; lo que sigue tiene que extenderlo. */
  texto: string;
  /** Dónde empieza la primera línea sin leer. */
  desde: number;
  /** El trozo en curso, como tramo de `texto`; `-1` si no hay. */
  actualDesde: number;
  actualHasta: number;
  dentroDeFence: boolean;
  cierre: string;
  /** Los bloques que ningún trozo futuro puede alargar. */
  cerrados: string[];
  /** El último bloque: el siguiente trozo puede unírsele. */
  abierto: { texto: string; lista: boolean; cita: boolean } | null;
};

const cortePara = (texto: string): Corte => ({
  texto,
  desde: 0,
  actualDesde: -1,
  actualHasta: -1,
  dentroDeFence: false,
  cierre: "",
  cerrados: [],
  abierto: null,
});

/** Une un trozo terminado al último bloque o lo empieza nuevo, como `bloquesDeMarkdown`. */
function cerrarTrozo(c: Corte, trozo: string) {
  const salto = trozo.indexOf("\n");
  const primera = salto === -1 ? trozo : trozo.slice(0, salto);
  const previo = c.abierto;
  const sigue =
    previo !== null &&
    (SANGRADO.test(primera) || (LISTA.test(primera) && previo.lista) || (CITA.test(primera) && previo.cita));
  if (sigue) {
    c.abierto = {
      texto: `${previo.texto}\n\n${trozo}`,
      lista: previo.lista || esLista(trozo),
      cita: previo.cita || esCita(trozo),
    };
    return;
  }
  if (previo) c.cerrados.push(previo.texto);
  c.abierto = { texto: trozo, lista: esLista(trozo), cita: esCita(trozo) };
}

/** Lee la línea `[inicio, fin)` de `c.texto` con las mismas reglas que `bloquesDeMarkdown`. */
function leerLinea(c: Corte, inicio: number, fin: number) {
  const linea = c.texto.slice(inicio, fin);
  const fence = FENCE.exec(linea);
  if (fence) {
    if (!c.dentroDeFence) {
      c.dentroDeFence = true;
      c.cierre = fence[1][0];
    } else if (linea.trimStart().startsWith(c.cierre)) {
      c.dentroDeFence = false;
    }
  } else if (linea.trim() === "" && !c.dentroDeFence) {
    if (c.actualDesde >= 0) cerrarTrozo(c, c.texto.slice(c.actualDesde, c.actualHasta));
    c.actualDesde = -1;
    return;
  }
  if (c.actualDesde < 0) c.actualDesde = inicio;
  c.actualHasta = fin;
}

/**
 * `bloquesDeMarkdown` para un texto que crece por el final, como una respuesta
 * en streaming: recuerda hasta la última línea completa y solo lee lo que
 * llegó después. Da exactamente lo mismo que `bloquesDeMarkdown`; un texto que
 * no extiende al anterior se lee desde el principio.
 */
export function partidorDeBloques(): (texto: string) => string[] {
  let c = cortePara("");
  return (texto) => {
    if (texto === "") return [];
    if (!texto.startsWith(c.texto)) c = cortePara(texto);
    c.texto = texto;
    // Solo las líneas que ya tienen su salto: la última todavía puede cambiar.
    for (let fin = texto.indexOf("\n", c.desde); fin !== -1; fin = texto.indexOf("\n", c.desde)) {
      leerLinea(c, c.desde, fin);
      c.desde = fin + 1;
    }
    c.texto = texto.slice(0, c.desde);
    const resto: Corte = { ...c, texto, cerrados: [], abierto: c.abierto };
    leerLinea(resto, c.desde, texto.length);
    if (resto.actualDesde >= 0) cerrarTrozo(resto, texto.slice(resto.actualDesde, resto.actualHasta));
    return resto.abierto ? [...c.cerrados, ...resto.cerrados, resto.abierto.texto] : [...c.cerrados, ...resto.cerrados];
  };
}
