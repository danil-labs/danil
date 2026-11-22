# Inventario: service-stream

Cursor del journal del motor, el sondeo y la entrega de lotes (catchup, resync, replay). No mueve código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/index.ts | createServiceStream, PushedBatch, ServicePage, PollRequest, ServiceFailure, ConnectionMessage, createBatchDelivery | propio | se queda | Entrada que usa shell: `packages/shell/src/app/App.tsx:161` importa `createBatchDelivery`, `createServiceStream` y `ServicePage`. No llama red. |
| src/model.ts | createBatchDelivery, PushedBatch, ServicePage, PollRequest, ServiceFailure, ConnectionMessage | propio | se queda | `export *` de `model/delivery.ts` y `export type *` de `queries/store.ts`. Nadie importa `src/model.ts`; el index salta a los archivos de abajo. Entrada de model. |
| src/queries.ts | PushedBatch, ServicePage, PollRequest, ServiceFailure, ConnectionMessage, createServiceStream | propio | se queda | `export *` de `queries/store.ts`. El index no lo usa. Entrada de queries. |
| src/model/delivery.ts | createBatchDelivery | propio | se queda | Política de entrega de un lote (catchup, resync, replay). Lo usa `App.tsx:2237` vía el index. Sin red: `resync`, `replay` y `deliver` llegan por `deps`. Cruza a `chat` por el tipo `ChatEvent` (línea 1). |
| src/queries/store.ts | PushedBatch, ServicePage, PollRequest, ServiceFailure, ConnectionMessage, createServiceStream | propio | se queda | Cursor, sondeo y filtro de sesiones. Lo arranca `App.tsx:2257` vía el index. No importa un cliente: `read`, `filter` y `ready` llegan por `deps`. Tipos de `apps/desktop/src/lib/serviceEvents` (`JournalEvent`). Sin otra feature. Los tests `apps/desktop/tests/unit/service-stream.test.ts` y `service-delivery.test.ts` apuntan a `src/features/service-stream/index.ts`, ruta que ya no existe. |

## Imports cruzados

- `src/model/delivery.ts:1` → `chat` (tipo `ChatEvent`, de `features/chat/src/model/transcript.ts`). En su lugar: el lote ya trae el evento de journal (`JournalEvent`); el estrechamiento a `ChatEvent` lo hace quien entrega, o el tipo de evento sube al cliente del motor. Esta función no importa `features/chat`.

Nadie en otra feature importa `service-stream`. Shell la compone en `App.tsx:161`.
