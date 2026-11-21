/**
 * Dominio machines del borde: `/v1/machines`, `/v1/capabilities` y `/v1/computers`.
 * Es el único lugar del front que escribe estas rutas (rebuild/move: la capa de datos vive en `src/platform/`).
 */

/** El catálogo de capacidades del borde: Desk compilado lo lee para no recompilarse cuando cambia el servidor. */
export const CAPABILITIES_PATH = "/v1/capabilities";

/** La URL de capacidades bajo un endpoint del borde que ya termina en `/v1`. */
export const capabilitiesUrl = (endpoint: string) => `${endpoint}/capabilities`;
