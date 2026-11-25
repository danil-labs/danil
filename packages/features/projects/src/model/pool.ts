/**
 * Corre `run` sobre cada elemento con un tope de llamadas a la vez, y devuelve
 * los resultados en el orden de entrada, como `Promise.allSettled`.
 *
 * Cada `invoke` abre un socket en la ventana y, en el servicio, los procesos que
 * el comando lance. Una por tarea y todas a la vez agotó los 256 descriptores
 * que macOS da a un proceso, y con ellos agotados ninguna orden abre su socket.
 */
export async function pooled<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await run(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

/** Cuántos `task_history` van a la vez: cada uno corre git en el servicio. */
export const TASK_HISTORY_AT_ONCE = 4;
