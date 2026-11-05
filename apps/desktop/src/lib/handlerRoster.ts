import { type Accessor, createResource, createSignal, onCleanup } from "solid-js";
import type { HandlerDefinition } from "./model";

const known = new Map<string, HandlerDefinition[]>();

export function lastRoster(project: string): HandlerDefinition[] | undefined {
  return known.get(project);
}

export function rememberRoster(project: string, handlers: HandlerDefinition[]): void {
  known.set(project, handlers);
}

export function forgetRosters(): void {
  known.clear();
}

/** Esperas entre intentos cuando la lista de una carpeta falla; después se queda con lo último. */
export const ROSTER_RETRY_WAITS = [1000, 3000, 10000, 30000];

/**
 * Los agentes de una carpeta, dentro de un dueño reactivo. Un fallo devuelve lo
 * último que se supo y vuelve a pedir la lista; `refresh` la pide de nuevo y
 * reinicia los intentos.
 */
export function watchRoster(
  project: string,
  load: () => Promise<HandlerDefinition[]>,
  refresh: Accessor<unknown> = () => 0,
  waits: readonly number[] = ROSTER_RETRY_WAITS,
): Accessor<HandlerDefinition[]> {
  const [intento, setIntento] = createSignal(0);
  let fallos = 0;
  let pedido: unknown;
  let espera: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(espera));
  const [roster] = createResource(
    () => [refresh(), intento()] as const,
    async ([pedidoAhora]) => {
      clearTimeout(espera);
      if (pedidoAhora !== pedido) {
        pedido = pedidoAhora;
        fallos = 0;
      }
      try {
        const listado = await load();
        fallos = 0;
        rememberRoster(project, listado);
        return listado;
      } catch {
        if (fallos < waits.length) espera = setTimeout(() => setIntento((n) => n + 1), waits[fallos++]);
        return lastRoster(project) ?? [];
      }
    },
  );
  return () => roster() ?? lastRoster(project) ?? [];
}
