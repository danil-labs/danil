# @terminus/chat

## Qué hace
Paquete legado de renderizado y lectura de mensajes de agentes en los clientes.
Maneja la directiva visual `::terminus-visual`, el sandbox HTML para artefactos, enlaces clicables y pasos de herramientas.

## Qué expone
Exporta desde `src/index.ts`:
- Historia y detalle de mensajes: reexporta `history.ts` y `historyDetail.ts`.
- Enlaces y parseo de texto: reexporta `links.ts` (`linkify`, `parseLinks`).
- Pasos de herramientas: reexporta `steps.ts` y `tools.ts` (`formatToolCall`, etc.).
- Módulos adicionales por ruta profunda: `inlineVisual.ts`, `sandbox.ts`, `table.ts`, `visual.ts`.

## Qué consume
- No consume clientes de red directamente; consumido por `apps/desktop`, `apps/mobile` y `packages/features/chat`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna directa.
- Comandos RPC1 del motor: ninguno directo; formatea y procesa datos de respuestas y eventos push del motor.

## Qué falta según la fase 2 del plan
- Fase 2.1: componentes visuales de herramientas y pasos suben a `packages/ui`.
- Fase 2.2: utilidades de comandos y texto pasan a `packages/ui/lib/chat`, y modelos de historia a `packages/engine-client/src/history.ts`.
- Fase 3: borrado del paquete una vez que `packages/features/chat` y `packages/ui` asuman sus responsabilidades.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
