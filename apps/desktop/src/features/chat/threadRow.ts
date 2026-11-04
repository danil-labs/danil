import { createContext, createEffect, createSignal, onCleanup, useContext, type Accessor } from "solid-js";

/** Lo que una fila del hilo guarda fuera de sí misma: al desmontarse sale de la vista, no de la conversación. */
export type ThreadRowScope = {
  state: Map<string, unknown>;
  nextSlot: () => number;
  retain: () => () => void;
};

export const ThreadRowContext = createContext<ThreadRowScope>();

/** Como `createSignal`, y el valor vuelve con la fila si el hilo la desmontó. */
export function createRowSignal<T>(name: string, initial: T): [Accessor<T>, (value: T) => void] {
  const row = useContext(ThreadRowContext);
  const key = row ? `${name}:${row.nextSlot()}` : "";
  const [value, setValue] = createSignal<T>(row?.state.has(key) ? row.state.get(key) as T : initial);
  return [value, (next: T) => {
    setValue(() => next);
    row?.state.set(key, next);
  }];
}

/** Mientras `active` diga que sí, la fila no se desmonta aunque salga de la vista. */
export function retainRowWhile(active: Accessor<boolean>) {
  const row = useContext(ThreadRowContext);
  if (!row) return;
  createEffect(() => {
    if (active()) onCleanup(row.retain());
  });
}
