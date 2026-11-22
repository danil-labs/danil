/** El muelle de las bajadas y las medidas con las que se sigue el fondo. Ver `paste.ts`. */

/** Los tres números del muelle. Ver [`MUELLE`]. */
type Muelle = {
  /** De 0 a 1: cuánto se frena la oscilación. */
  amortiguacion: number;
  /** Con qué prisa toma velocidad. */
  rigidez: number;
  /** La inercia. Más masa, más lento. */
  masa: number;
};

/**
 * El muelle de las bajadas pedidas; para seguir al contenido no se usa (ver
 * [`pegar`]).
 *
 * Distinto de `use-stick-to-bottom` (`0.7 / 0.05 / 1.25`): con esos valores el
 * retraso `d = crecimiento · (masa − amortiguación) / rigidez` da 66 px a
 * 6 px/cuadro, tres líneas por debajo del borde y un tirón en cada pausa del
 * streaming. Con estos valores cae por debajo de una línea.
 *
 * `scrollTop` satura en el fondo: no hay sobrepaso aunque la última iteración
 * se pase. Más rigidez tiembla con el reflow de un bloque de markdown a medio
 * cerrar.
 *
 * Objeto congelado y compartido: la animación en curso se compara por
 * identidad (`animacion.comportamiento === comportamiento`) para sumarse a la
 * bajada que ya corre; un objeto nuevo por llamada reiniciaría la velocidad.
 */
const MUELLE: Readonly<Muelle> = Object.freeze({
  amortiguacion: 0.55,
  rigidez: 0.18,
  masa: 1,
});

/** Cómo baja: con el muelle, o de un corte. */
export type Animacion = "muelle" | "instantanea";
type Comportamiento = Readonly<Muelle> | "instantanea";
const comportamientoDe = (a: Animacion = "muelle"): Comportamiento =>
  a === "instantanea" ? "instantanea" : MUELLE;

/**
 * Cuánto se puede quedar a mano antes de que el hilo se dé por reenganchado.
 * No es la tolerancia del `scrollTo` (eso lo resuelve el `- 1` de [`fondo`]).
 * Setenta píxeles es menos de una línea de párrafo.
 */
const MARGEN_DE_FONDO = 70;

/**
 * Cuánto se deja sin recorrer por debajo del texto mientras el hilo sigue.
 *
 * El último bloque se re-parsea con cada token y su alto no es monótono: una
 * línea que se des-envuelve encoge el bloque 22 px. Pegado al máximo eso se ve
 * como un salto hacia arriba; con 26 px de margen, el encogimiento cabe en el
 * hueco y no mueve nada. Medido: sin holgura, +608 px de más; con 26 px, 0 px
 * y 0 de retraso.
 *
 * El hueco de `Chat.tsx` suma esta holgura al alto de la caja para que
 * el último renglón siga visible al detenerse antes del fondo.
 * Veintiséis y no diez: una línea de párrafo mide 22 px.
 */
export const HOLGURA = 26;

/** Un cuadro a 60 Hz, que es la unidad en la que está calibrado el muelle. */
const MS_POR_CUADRO = 1000 / 60;

export { comportamientoDe, MARGEN_DE_FONDO, MS_POR_CUADRO, type Comportamiento };
