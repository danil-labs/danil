/**
 * Decide qué lista de árboles queda en pantalla tras pedir `list_task_trees`.
 * Una lectura buena manda, aunque venga vacía: un árbol que el agente borró
 * debe desaparecer. Una lectura fallida conserva la última buena: vaciar por
 * un fallo pintaría «esta tarea no escribe nada» donde hubo un error
 * (`App.tsx` · `conCodigo` reparte Contexto/Código según esta lista), y sin
 * refresco periódico se quedaría así hasta el siguiente turno.
 *
 * «La última buena» es de esta tarea, nunca de otra: quien cambia de tarea
 * vacía antes de leer y descarta lo que llegue tarde (`Code.tsx`, `App.tsx`).
 * El fallo lo reporta el panel con el `Failure` que atrapó (`Code.tsx` ·
 * `FailureNote`); aquí solo se decide la lista.
 */

/** Lo que contestó `list_task_trees`. `ok: false` es que no contestó. */
export type Lectura<T> = { ok: true; lista: T[] } | { ok: false };

export function siguienteLista<T>(anterior: T[], r: Lectura<T>): T[] {
  if (!r.ok) return anterior;
  return r.lista;
}
