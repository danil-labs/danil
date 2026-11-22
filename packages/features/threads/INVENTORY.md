# Inventario: threads

Fundida en `features/chat` (p2-4j), como pide `features/chat/INVENTORY.md` («el store de threads es el hilo partido: se funde en chat»). Esta carpeta ya no tiene código.

| Archivo de antes | Ahora |
|---|---|
| src/model/activity.ts | packages/features/chat/src/model/activity.ts |
| src/model/activityAnchor.ts | packages/features/chat/src/model/activityAnchor.ts |
| src/model/assistant-history.ts | packages/features/chat/src/model/assistant-history.ts |
| src/model/optimistic-history.ts | packages/features/chat/src/model/optimistic-history.ts |
| src/model/transcript-events.ts | packages/features/chat/src/model/transcript-events.ts |
| src/queries/store.ts | packages/features/chat/src/queries/threads-store.ts |
| src/queries/store-core.ts | packages/features/chat/src/queries/threads-store-core.ts |
| src/index.ts, src/model.ts, src/queries.ts | sus exports entran por `features/chat/src/index.ts`, `model.ts` y `queries.ts` |

Shell (`App.tsx`) importa `createThreadsStore` de `features/chat/src/index.ts`. Ya no hay imports cruzados.
