# @danil/feature-task-queues

## Qué hace
Gestión de colas de turnos de tareas en el motor.
Controla la reanudación de colas pausadas, cancelación condicional de turnos (`stop_turn_if`) y consulta de turnos encolados.

## Qué expone
Exporta desde `src/index.ts`:
- Stores y consultas de cola: `createTaskQueues`, `QueueScope`, `createEngineQueue`.

## Qué consume
- `@danil/engine-client` (en `queries/engine.ts`), `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: `get_turn`, `queue_resume`, `stop_turn`, `stop_turn_if`.

## Qué falta según la fase 2 del plan
- Fase 2.3: asegurar que toda llamada al motor se confine a `queries.ts` (R12).
- Fase 2.4: conectarse con `features/chat` mediante props/slots orquestados por `shell`.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
