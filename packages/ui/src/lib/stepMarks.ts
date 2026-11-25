/**
 * La marca del comando de una fila, si es de un CLI conocido: `gh` es GitHub.
 *
 * Solo la lleva la fila de un comando terminado; la agrupada y la que corre se
 * quedan con su glifo o el spinner. No lleva rótulo escrito, a diferencia de un
 * MCP (`origenDeFila`): el programa ya nombra el servicio.
 */
import { commandSource, type CommandSource } from "./chat/tools.ts";
import type { Fila } from "./steps.ts";

export const comandoDeFila = (fila: Fila): CommandSource | null => {
  const [uno] = fila.pasos;
  return fila.clase === "ejecutar" && fila.pasos.length === 1 && !uno.corriendo ? commandSource(uno.objetivo) : null;
};
