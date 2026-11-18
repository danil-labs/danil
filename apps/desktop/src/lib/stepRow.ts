/**
 * Qué enseña una fila de la línea de tiempo y qué guarda para quien no la ve.
 *
 * Una fila de comando es su marca más el comando, **sin verbo visible**: el
 * tramo ya dice «Ejecutó N comandos». Desplegada no repite el comando, solo
 * enseña salida y carpeta; el comando real entero va en el `title`.
 */
import { comando, type Fila, type Paso } from "./steps.ts";

const esComando = (fila: Fila) => fila.clase === "ejecutar";

/** La salida de un paso de comando, si trae algo que leer. */
export function salidaDe(paso: Paso) {
  const d = paso.detalle;
  return d?.kind === "output" && d.text.trim() !== "" ? d : null;
}

/** La carpeta desde la que corrió el comando, si viene. */
export function carpetaDe(paso: Paso) {
  const d = paso.detalle;
  return d?.kind === "output" && d.cwd ? d.cwd : null;
}

/**
 * Una fila con algo que enseñar debajo. Las demás son solo la línea, sin
 * flecha. Un comando se despliega **solo con salida o carpeta**: su texto ya
 * está en el renglón.
 */
export function desplegable(fila: Fila) {
  if (fila.clase === "aviso" || fila.clase === "gasto" || fila.clase === "fin")
    return false;
  if (esComando(fila))
    return fila.pasos.some((p) => salidaDe(p) !== null || carpetaDe(p) !== null);
  return fila.pasos.some((p) => p.objetivo || p.detalle);
}

/**
 * Si el verbo se pinta en el renglón. En un comando va en `sr-only`: el lector
 * de pantalla dice «Ejecutó gh pr list» y el `title` añade el comando real.
 */
export const verboVisible = (fila: Fila) => !esComando(fila);

/** El comando real de una fila de comando de un paso, sin el intérprete que lo envuelve. */
export function comandoReal(fila: Fila): string | null {
  const [uno] = fila.pasos;
  return esComando(fila) && fila.pasos.length === 1 && uno.objetivo ? comando(uno.objetivo) : null;
}

/** El `title` del renglón: el comando real, que el resumen recorta. */
export const tituloDeFila = (fila: Fila): string | undefined => comandoReal(fila) ?? undefined;
