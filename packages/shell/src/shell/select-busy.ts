/**
 * `busy` (danil-engine#507): el motor está ligando workspaces y no tuvo el turno para cambiar de
 * organización. No se ejecutó nada: repetir la misma petición con la misma clave es seguro.
 */
const BUSY = "busy";
const WAITS = [500, 1000];
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Un rechazo lanzado (`{detail}`, `{code}` o la cadena sola) o una respuesta con `body.code`. */
export function isBusy(value: unknown): boolean {
  if (value === BUSY) return true;
  const v = value as { detail?: unknown; code?: unknown; body?: { code?: unknown } | null } | null;
  return v?.detail === BUSY || v?.code === BUSY || v?.body?.code === BUSY;
}

export type BusyOptions = { wait?: (ms: number) => Promise<void> };

/** Dos reintentos cortos. Si sigue ocupado, rechaza con `busy`; lo demás pasa tal cual. */
export async function retryBusy<T>(run: () => Promise<T>, { wait = pause }: BusyOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let result: T;
    try {
      result = await run();
    } catch (e) {
      if (!isBusy(e) || attempt >= WAITS.length) throw isBusy(e) ? { code: BUSY, detail: BUSY } : e;
      await wait(WAITS[attempt]);
      continue;
    }
    if (!isBusy(result)) return result;
    if (attempt >= WAITS.length) throw { code: BUSY, detail: BUSY };
    await wait(WAITS[attempt]);
  }
}
