# @danil/feature-service-stream

## Qué hace
Procesamiento de lotes en streaming de eventos del motor (`JournalEvent`).
Distribuye reactivamente eventos y páginas de servicio a las features interesadas sin bloquear la interfaz.

## Qué expone
Exporta desde `src/index.ts`:
- Modelos y entrega: `createServiceStreamStore`, `createBatchDelivery`, `PushedBatch`, `ServicePage`.

## Qué consume
- SolidJS y `apps/desktop/src/lib/serviceEvents.ts`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: ninguno directo; procesa eventos push de la conexión del motor.

## Qué falta según la fase 2 del plan
- Fase 2.2: reubicar las definiciones de tipos de eventos y páginas en `packages/engine-client` para evitar dependencias cruzadas desde `features/machines`.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
