# @danil/feature-threads

## Qué hace
Store reactivo de hilos de conversación y proyección de actividad del asistente.
Calcula el tiempo transcurrido en actividad de turnos, anclaje de mensajes y reconstrucción del historial de ejecución.

## Qué expone
Exporta desde `src/index.ts`:
- Store de hilos: `createThreadsStore`.
- Proyección de actividad: `createActivityProjection`, `activityElapsed`, `TurnActivity`.

## Qué consume
- `@danil/engine-client`, `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: `load_history`, `load_session`.

## Qué falta según la fase 2 del plan
- Fase 2.2: funciones utilitarias de tiempo y cálculo a `packages/ui/lib`.
- Fase 2.4: eliminar dependencias cruzadas con modelos de mensajes de `features/chat` (R3).
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
