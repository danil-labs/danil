/** Lo que el agrupado mira de un bloque del hilo (`Chat.tsx`). */
type ConPasos<P> = { tipo: string; pasos?: P[] };

/**
 * Pone un «Tareas creadas» al final de `out` junto a los de antes. El agente
 * lanza cada subtarea con una herramienta, y el paso de esa herramienta queda
 * entre dos lanzamientos: sin moverlo, tres subtareas son tres bloques.
 * Los pasos de en medio pasan al rastro de delante del grupo.
 */
export function ponerLanzamiento<P, B extends ConPasos<P>>(
  out: B[],
  lanzamiento: B,
  esLanzamiento: (bloque: B) => boolean,
): void {
  const medio = out.at(-1);
  if (medio?.tipo === "pasos" && out.length >= 2 && esLanzamiento(out[out.length - 2])) {
    out.pop();
    let inicio = out.length - 1;
    while (inicio > 0 && esLanzamiento(out[inicio - 1])) inicio--;
    const antes = out[inicio - 1];
    if (antes && (antes.tipo === "pasos" || antes.tipo === "trabajo")) {
      out[inicio - 1] = { ...antes, pasos: [...(antes.pasos ?? []), ...(medio.pasos ?? [])] };
    } else {
      out.splice(inicio, 0, medio);
    }
  }
  out.push(lanzamiento);
}
