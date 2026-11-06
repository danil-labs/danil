import { type Accessor, createResource, createSignal, onCleanup } from "solid-js";
import type { HandlerDefinition } from "./model";

const known = new Map<string, HandlerDefinition[]>();

/**
 * La última lista de cada carpeta también se guarda en el navegador: al
 * recargar, el dock enseña los agentes antes de que el motor conteste. Sin las
 * instrucciones, que pesan y no hacen falta para pintar.
 */
const STORED = "harness:roster:";

function readStored(project: string): HandlerDefinition[] | undefined {
  try {
    const raw = localStorage.getItem(STORED + project);
    const value = raw === null ? undefined : (JSON.parse(raw) as unknown);
    return Array.isArray(value) ? (value as HandlerDefinition[]) : undefined;
  } catch {
    return undefined;
  }
}

export function lastRoster(project: string): HandlerDefinition[] | undefined {
  const inMemory = known.get(project);
  if (inMemory) return inMemory;
  const stored = readStored(project);
  if (stored) known.set(project, stored);
  return stored;
}

export function rememberRoster(project: string, handlers: HandlerDefinition[]): void {
  known.set(project, handlers);
  try {
    localStorage.setItem(STORED + project, JSON.stringify(handlers.map((h) => ({ ...h, instructions: "" }))));
  } catch {
    // Sin almacenamiento, la lista vive solo en esta ventana.
  }
}

export function forgetRosters(): void {
  known.clear();
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(STORED)) localStorage.removeItem(key);
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
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
): Accessor<HandlerDefinition[]> & { ready: Accessor<boolean> } {
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
  // `latest` y no `roster()`: una relectura no suspende el dock ni lo vacía.
  const list = () => roster.latest ?? lastRoster(project) ?? [];
  // Contestó (con su lista, o con lo último tras un fallo) y la lista ya está a la vista.
  return Object.assign(list, { ready: () => roster.state === "ready" || roster.state === "refreshing" });
}
