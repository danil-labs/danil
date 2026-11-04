/**
 * Prioridad baja para los chequeos locales, para no quitarle CPU al motor.
 *
 * Falla abierto: si el sistema no deja cambiarla, el proceso sigue igual.
 */
import { getPriority, setPriority } from "node:os";

export const LOW_PRIORITY = 10;

/** Baja el proceso `pid` a niceness 10; nunca la sube si ya es menor. */
export function lowerPriority(pid, os = { getPriority, setPriority }) {
  if (!pid) return;
  try {
    if (os.getPriority(pid) < LOW_PRIORITY) os.setPriority(pid, LOW_PRIORITY);
  } catch {
    // Sin permiso o el proceso ya salió: sigue con la prioridad que tenga.
  }
}
