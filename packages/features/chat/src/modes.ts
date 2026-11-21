import type { ModoDePermiso } from "../../../../apps/desktop/src/lib/model";
import { escribirPref, leerPref } from "../../../../apps/desktop/src/lib/prefs.ts";

/**
 * El modo siguiente del ciclo de `shift+tab`, saltándose los que este agente no
 * sostiene. Sale de la misma lista que pinta el desplegable: un ciclo aparte
 * pasaría por un modo que el menú enseña apagado y el turno fallaría al
 * mandarse (`chat::send_message`).
 *
 * Devuelve `null` cuando no hay a dónde ir —un agente con un solo modo, como
 * Codex y Antigravity—: el atajo se queda quieto en vez de fingir un cambio.
 */
export function siguienteModo(
  modos: ModoDePermiso[],
  actual: string,
): string | null {
  const puede = modos.filter((m) => !m.falta);
  if (puede.length < 2) return null;
  const i = puede.findIndex((m) => m.id === actual);
  // Un `actual` que ya no está en la lista da `-1`, y de ahí sale el primero
  // utilizable. Pasa al cambiar de agente: el modo elegido puede quedarse sin
  // sostén un instante antes de que llegue la lista nueva.
  return puede[(i + 1) % puede.length].id;
}

/** El id de `agents::Modo::Auto`, el mismo para todo agente. */
export const MODO_AUTOMATICO = "auto";

/** Dónde se recuerda el último modo elegido a mano (`lib/prefs.ts`). */
const CLAVE = "chat.mode";

/**
 * Se guarda al elegir en la caja y no al cargar una tarea: reanudar restaura
 * con qué corrió esa tarea, y tomarlo de ahí dejaría que abrir una vieja
 * cambiara el arranque de todas las demás.
 */
export function recordarModo(id: string) {
  escribirPref(CLAVE, id);
}

/** `""` cuando nadie ha elegido todavía en esta máquina. */
export function modoRecordado(): string {
  return leerPref(CLAVE, "");
}

/**
 * Con cuál arranca una tarea que no dice cuál: el último elegido a mano si
 * este agente lo sostiene, y si no, el que resolvió el backend
 * (`agents::Permisos::resolver`). El primero de la lista es «manual», que
 * arrancaría pidiendo aprobación por todo.
 */
export function modoInicial(modos: ModoDePermiso[], recordado: string): string {
  const puede = modos.filter((m) => !m.falta);
  const recuerdo = puede.find((m) => m.id === recordado);
  return (recuerdo ?? puede.find((m) => m.por_omision) ?? puede[0])?.id ?? "";
}
