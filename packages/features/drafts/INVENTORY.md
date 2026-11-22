# Inventario: drafts

Borrador de la tarea (texto, menciones, destinatarios, fuentes y adjuntos) que sobrevive al cambio de vista y no al de workspace. No mueve código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/index.ts | createDraftsStore, Draft, DraftConfiguration | propio | se queda | Entrada que usa shell: `packages/shell/src/app/App.tsx:158`. No llama red. |
| src/model.ts | DraftConfiguration, Draft | propio | se queda | `export type *` de `queries/store.ts`. Ningún archivo importa `src/model.ts`; `index.ts` salta al store. Entrada de model de la feature. Sin red. |
| src/queries.ts | DraftConfiguration, Draft, createDraftsStore | propio | se queda | `export *` de `queries/store.ts`. Tampoco lo importa el index. Entrada de queries. Sin red. |
| src/queries/store.ts | DraftConfiguration, Draft, createDraftsStore | propio | se queda | Store local del borrador. Lo crea `App.tsx:1115` vía el index. No llama `invoke`, `engine-client` ni `platform-client`: `prepareAttachments` llega por `deps`. Cruza a `chat` por el tipo `HandoverPending` (línea 7). El test `apps/desktop/tests/unit/drafts-store.test.ts:4` apunta a `src/features/drafts/index.ts`, ruta que ya no existe. |

## Imports cruzados

- `src/queries/store.ts:7` → `chat` (tipo `HandoverPending`, de `features/chat/src/model/handover.ts`). En su lugar: el campo `provider` entra ya tipado por props o por el `deps` que arma shell; esta feature no importa `chat`.

Nadie en otra feature importa `drafts`. Shell la compone en `App.tsx:158`.
