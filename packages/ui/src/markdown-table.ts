/** Lo más angosta que queda una columna, también al arrastrar su borde. */
export const ANCHO_MINIMO = 48;

/**
 * Reparte `disponible` entre columnas de las que se conoce su ancho mínimo (la
 * palabra más larga) y su ancho máximo (todo en una línea).
 *
 * Cada columna recibe una parte proporcional a la raíz de su ancho máximo, que
 * es el reparto que minimiza la suma de líneas; ninguna baja de su mínimo ni
 * pasa de su máximo. Si ni los mínimos caben, la tabla se desplaza de lado.
 */
export function anchosDeColumnas(minimos: number[], maximos: number[], disponible: number): number[] {
  const n = minimos.length;
  if (n === 0) return [];
  // Una ruta sin espacios no debe llevarse media tabla: se parte dentro de su celda.
  const tope = Math.max(120, disponible * 0.35);
  const piso = minimos.map((m) => Math.min(Math.max(m, ANCHO_MINIMO), tope));
  const techo = maximos.map((m, i) => Math.max(m, piso[i]));

  const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  if (suma(piso) >= disponible) return piso.map(Math.ceil);
  if (suma(techo) <= disponible) {
    const sobra = disponible - suma(techo);
    const total = suma(techo);
    return techo.map((w) => Math.floor(w + (sobra * w) / total));
  }

  const fijo: (number | null)[] = new Array(n).fill(null);
  for (let vuelta = 0; vuelta <= n; vuelta++) {
    const libres = fijo.flatMap((f, i) => (f === null ? [i] : []));
    if (libres.length === 0) break;
    const resto = disponible - suma(fijo.map((f) => f ?? 0));
    const peso = suma(libres.map((i) => Math.sqrt(techo[i])));
    const parte = (i: number) => (resto * Math.sqrt(techo[i])) / peso;
    const anchas = libres.filter((i) => parte(i) > techo[i]);
    const angostas = libres.filter((i) => parte(i) < piso[i]);
    if (anchas.length > 0) for (const i of anchas) fijo[i] = techo[i];
    else if (angostas.length > 0) for (const i of angostas) fijo[i] = piso[i];
    else for (const i of libres) fijo[i] = parte(i);
  }
  return fijo.map((f, i) => Math.floor(f ?? piso[i]));
}
