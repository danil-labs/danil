import { machineOf } from "../../../machines/src/queries/store";
import { createMemo, createResource, createSignal } from "solid-js";
import { invoke } from "../../../../engine-client/src/client.ts";
import { pooled, TASK_HISTORY_AT_ONCE } from "../../../../../apps/desktop/src/lib/pool";

type Row = { id: string; updated_at: unknown };
const shared = new Map<string, Promise<unknown>>();
const [generation, setGeneration] = createSignal(0);
if (typeof window !== "undefined") window.addEventListener("harness:workspace", () => {
  shared.clear();
  setGeneration(value => value + 1);
});

/**
 * El `task_history` de cada tarea de la lista, pedido una vez por tarea y `updated_at`.
 * Ese campo solo se mueve al guardar un turno, que es cuando el árbol pudo cambiar. La lista
 * llega nueva con cada delta del streaming y no cuenta: cuenta la clave. Un fallo también queda
 * apuntado, igual que lo que está en vuelo; sin eso una tarea sin árbol se pedía en cada delta.
 */
export function createTaskHistories<T>(project: () => string, sessions: () => readonly Row[]) {
  const keys = createMemo(
    () => sessions().map((s) => JSON.stringify([generation(), project(), s.id, String(s.updated_at)])),
    [],
    { equals: (a, b) => a.length === b.length && a.every((key, i) => key === b[i]) },
  );
  let known = new Map<string, Promise<T | undefined>>();
  return createResource(keys, async (current) => {
    const missing = current.filter((key) => !known.has(key) && !shared.has(key));
    const asked = pooled(missing, TASK_HISTORY_AT_ONCE, (key) => {
      const [, p, id] = JSON.parse(key) as [number, string, string, string];
      return invoke<T>("task_history", { project: p, id }, machineOf(id));
    });
    const next = new Map<string, Promise<T | undefined>>();
    for (const key of current) {
      const value = known.get(key) ?? shared.get(key) as Promise<T | undefined> | undefined
        ?? asked.then((results) => {
          const result = results[missing.indexOf(key)];
          return result.status === "fulfilled" ? result.value : undefined;
        });
      if (shared.size >= 1024 && !shared.has(key)) shared.delete(shared.keys().next().value!);
      shared.set(key, value);
      next.set(key, value);
    }
    known = next;
    const values = await Promise.all(current.map((key) => next.get(key)));
    return new Map(current.flatMap((key, i) => {
      const value = values[i];
      return value === undefined ? [] : [[(JSON.parse(key) as [number, string, string, string])[2], value] as const];
    }));
  });
}
