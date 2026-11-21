# Inventario: task-queues

Cola de mensajes de una tarea, en la ventana y frente al motor (`get_turn`, `stop_turn`, `queue_resume`). No mueve código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/index.ts | createTaskQueues, QueueScope, createEngineQueue | propio | se queda | Entrada que usa shell: `packages/shell/src/app/App.tsx:182` importa `createEngineQueue` y `createTaskQueues`. No llama red. |
| src/model.ts | EngineScope, QueueScope, QUEUE_FEATURE, QUEUE_DISPATCH_FEATURE | propio | se queda | Reexporta tipos y las dos constantes de features del motor. Nadie importa `src/model.ts`; `index.ts` salta a `queries/`. Entrada de model. Sin red. |
| src/queries.ts | QUEUE_FEATURE, QUEUE_DISPATCH_FEATURE, EngineScope, createEngineQueue, QueueScope, createTaskQueues | propio | se queda | `export *` de `queries/engine.ts` y `queries/store.ts`. El index no lo usa. Entrada de queries. |
| src/queries/engine.ts | QUEUE_FEATURE, QUEUE_DISPATCH_FEATURE, EngineScope, createEngineQueue | propio | se queda | Cola y Stop contra el motor de la tarea. Lo usa `App.tsx:182` y `:1323`. El `invoke` lo inyecta shell; aquí llama `get_turn` (50), `stop_turn` (68), `stop_turn_if` (80) y `queue_resume` (99). No importa `engine-client` ni `platform-client`. `QUEUE_FEATURE` es `chat_queue_v1` y `QUEUE_DISPATCH_FEATURE` es `chat_queue_dispatch_v1`, anunciados en `status.service_features`. Sin import de otra feature. |
| src/queries/store.ts | QueueScope, createTaskQueues | propio | se queda | Cola en mano y copias por tarea. Lo crea `App.tsx:1324` vía el index. No llama red: `readQueue` y `writeQueue` llegan por `deps`. Cruza a `chat` (línea 2, `guardable` y tipo `Encolado`). Los tests `apps/desktop/tests/unit/task-queues-store.test.ts:4` y `conversation-handoff.test.ts:5` apuntan a `src/features/task-queues/index.ts`, ruta que ya no existe. |

## Imports cruzados

- `src/queries/store.ts:2` → `chat` (`guardable` de `features/chat/src/model/queue.ts`, tipo `Encolado` de `features/chat/src/components/MessageQueue.tsx`). En su lugar: el ítem de la cola y `guardable` pasan a `model` de esta feature (es la dueña de la cola) y `chat` los recibe por props desde shell. Esta query no importa `features/chat`.

Nadie en otra feature importa `task-queues`. Shell la compone en `App.tsx:182`. `conversation-handoff` no la importa: recibe la cola por `deps`.
