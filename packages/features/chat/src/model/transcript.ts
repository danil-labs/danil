/**
 * El modelo de eventos del turno y la transcripción que se pinta: Rust
 * normaliza claude y codex a estas formas, y `transcripcion()` convierte los
 * turnos guardados en los mensajes del hilo. Es cálculo sin JSX; vive con su
 * dominio y se prueba desde Node.
 */

import { mcpCallFromName } from "@terminus/chat/tools";

export * from "./transcript-chat-event.ts";
export * from "./transcript-live.ts";
export * from "./transcript-types.ts";
export * from "./transcript-render.ts";

/**
 * Partir `mcp__servidor__tool` es cosa de todos los clientes, no de esta
 * pantalla: vive en `@terminus/chat/tools`, junto con la marca del servicio.
 */
export { mcpCallFromName };

/** El modelo que se muestra al abrir una tarea; la misma regla en el teléfono (`packages/ui/src/lib/tasks.ts`). */
export { chipModel as modeloDeSubtarea } from "../../../../ui/src/lib/tasks/surfaces.ts";
