# Inventario: conversation-handoff

Barreras locales de cancelación y el pase de un mensaje encolado al runtime. La ejecución sigue en el runtime. No mueve código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/index.ts | createConversationHandoff, ConversationScope, HandoffFact, HandoffView, HandoffPresentation | propio | se queda | Entrada que usa shell: `packages/shell/src/app/App.tsx:157` importa `ConversationScope` y `createConversationHandoff`. No llama red. |
| src/model.ts | ConversationScope, HandoffView, HandoffPresentation, HandoffFact | propio | se queda | `export type *` de `queries/store.ts`. Nadie importa `src/model.ts`; el index salta al store. Entrada de model. Sin red. |
| src/queries.ts | ConversationScope, HandoffView, HandoffPresentation, HandoffFact, createConversationHandoff | propio | se queda | `export *` de `queries/store.ts`. El index no lo usa. Entrada de queries. |
| src/queries/store.ts | ConversationScope, HandoffView, HandoffPresentation, HandoffFact, createConversationHandoff | propio | se queda | Máquina local de handoff. La crea `App.tsx:1336` vía el index. No llama red: `runtime.stop` y la cola (`message`, `select`, `release`, `failed`) llegan por `deps`. No importa otra feature ni `engine-client`. El test `apps/desktop/tests/unit/conversation-handoff.test.ts:4` y el helper `apps/desktop/tests/helpers/activity-header.tsx:8` apuntan a `src/features/conversation-handoff`, ruta que ya no existe. |

## Imports cruzados

Ningún import desde o hacia otra feature.

`task-queues` no se importa: la cola entra por `deps`. Shell compone el store en `App.tsx:157` (permitido).
