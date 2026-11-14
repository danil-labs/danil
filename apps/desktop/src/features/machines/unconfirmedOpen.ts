/**
 * Las pestañas de `list_live_sessions` que su máquina no confirmó
 * (`features/machines/router.ts`): la ventana no las cuenta como pedidas.
 * Va aparte del router para que `App.tsx` no lo arrastre a la carga inicial.
 */
const UNCONFIRMED = Symbol("unconfirmedOpen");

/** Marca `rows` con las pestañas sin confirmar, sin cambiar lo que enumera. */
export function markUnconfirmedOpen(rows: unknown[], ids: string[]): void {
  Object.defineProperty(rows, UNCONFIRMED, { value: ids });
}

export function unconfirmedOpen(rows: unknown): readonly string[] {
  const marked = rows && typeof rows === "object" ? (rows as { [UNCONFIRMED]?: string[] })[UNCONFIRMED] : undefined;
  return marked ?? [];
}
