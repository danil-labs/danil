/**
 * Lo que el borde anuncia en `GET /v1/capabilities` (mvp-v1, `edge.openapi.yaml` § Capability),
 * leído igual por Desk y por la web. Sin APIs del DOM: cada cliente trae su transporte.
 *
 * - Una capacidad cuenta solo en versión mayor 1 y con `status` `available`; cualquier otra
 *   versión o estado (también `degraded` y los desconocidos) es «no disponible».
 * - Un nombre desconocido o un elemento mal formado se ignora; no invalida la lista.
 * - Un cuerpo que no es una lista es `null`: el borde no la sirve (o aún no), y quien llama
 *   decide si prueba la ruta (`mayCall`) o no supone nada (`announces`).
 */

/** La versión mayor de cada capacidad que este cliente entiende. */
const KNOWN_VERSION = 1;

export type CapabilityList = ReadonlySet<string>;

/** Los nombres anunciados en v1 y `available`; `null` si el cuerpo no es una lista de capacidades. */
export function capabilityList(body: unknown): CapabilityList | null {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  const names = new Set<string>();
  for (const raw of items) {
    const item = raw as { name?: unknown; version?: unknown; status?: unknown } | null;
    if (item && typeof item.name === "string" && item.name && item.version === KNOWN_VERSION && item.status === "available") names.add(item.name);
  }
  return names;
}

/** Anunciada y utilizable. Sin lista no se supone: para lo opcional (p. ej. `machines.session.renew`). */
export function announces(list: CapabilityList | null, name: string): boolean {
  return list?.has(name) ?? false;
}

/** Se puede llamar a la ruta: anunciada, o el borde no publica la lista y la propia ruta contesta (404/501 se toleran). */
export function mayCall(list: CapabilityList | null, name: string): boolean {
  return list === null || list.has(name);
}
