import type { PermissionModeOption } from "@terminus/protocol";

/**
 * Qué hace una tecla en el cuadro de la web del teléfono, con la regla del
 * escritorio (`Chat.tsx`): Enter manda; Shift+Enter hace salto de línea. Mientras
 * el teclado compone un carácter (IME), Enter lo confirma y no manda: el
 * navegador lo marca con `isComposing` o, en Safari, con `keyCode` 229.
 */
export function enterAction(e: { key: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number }): "send" | "newline" | null {
  if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return null;
  return e.shiftKey ? "newline" : "send";
}

/**
 * Si el cuadro tiene algo que mandar: texto o un adjunto ya subido. Un `!` solo
 * no es un comando.
 */
export function hasSomethingToSend(text: string, uploaded: number): boolean {
  const body = text.trim();
  if (body.startsWith("!")) return Boolean(body.slice(1).trim());
  return Boolean(body) || uploaded > 0;
}

/**
 * El modo con que arranca el cuadro, como `modoInicial` del escritorio:
 * `preferred` (el que guarda la tarea, o el del workspace) si este proveedor lo
 * sostiene; si no, el que resolvió el motor (`por_omision`), y si no, el primero
 * que se pueda usar. `null` mientras no llega la lista.
 */
export function initialMode(modes: readonly PermissionModeOption[], preferred: string | null): string | null {
  const usable = modes.filter((m) => !m.falta);
  return (
    usable.find((m) => m.id === preferred) ??
    usable.find((m) => m.por_omision) ??
    usable.find((m) => m.id === AUTO_MODE) ??
    usable[0]
  )?.id ?? null;
}

/** El id de `agents::Modo::Auto`: el motor lo sostiene con todo proveedor. */
export const AUTO_MODE = "auto";

/**
 * De dónde arranca el cuadro: `saved`, el modo que guarda la tarea abierta;
 * `workspace`, el que eligió el workspace para las tareas nuevas.
 */
export type ModeStart = { saved?: string | null; workspace?: string | null };

/**
 * El modo que se ve y se manda: el que eligió la persona si este proveedor lo
 * sostiene, y si no, el inicial (el de la tarea, el del workspace o el del
 * proveedor). Sin lista (la máquina apagada que nunca la dio) va el de la
 * tarea, que el motor baja si hace falta por ser heredado, o `auto`, que todo
 * proveedor sostiene: otro modo que el proveedor no sostenga el motor lo niega
 * (`agents::Permisos::for_turn`), y `null` corre el suyo por omisión.
 */
export function effectiveMode(modes: readonly PermissionModeOption[], chosen: string | null, start: ModeStart): string | null {
  if (!modes.length) return start.saved || (start.workspace === AUTO_MODE ? AUTO_MODE : null);
  if (chosen && modes.some((m) => m.id === chosen && !m.falta)) return chosen;
  const usable = modes.filter((m) => !m.falta);
  if (start.saved && usable.some((m) => m.id === start.saved)) return start.saved;
  return initialMode(modes, start.workspace ?? null);
}
