# Inventario: threads

Estado pintado de la conversación (hilo, actividad, historia optimista). La pantalla sigue en `features/chat`. No mueve código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/index.ts | createThreadsStore, createActivityProjection, activityElapsed, TurnActivity | propio | se queda | Entrada que usa shell: `packages/shell/src/app/App.tsx:65` importa `createThreadsStore`. No llama red. |
| src/model.ts | TurnActivity, activityElapsed, createActivityProjection, savedActivityTurn, ActivityAnchor, idsDeTurnos, createAssistantHistory, OptimisticHistoryState, hasUnsettledPrefix, createOptimisticHistory, TranscriptMetadata, transcriptEvent | propio | se queda | Barrel de `model/`. `index.ts` no lo reexporta (entra directo a `model/activity.ts`). Es la entrada de model que pide la estructura. Sin red. |
| src/queries.ts | MachineWait, createThreadsStore, createThreadsCore | propio | se queda | Barrel de `queries/store.ts` y `queries/store-core.ts`. `index.ts` no lo reexporta; salta a `queries/store.ts`. Sin red propia. |
| src/model/activity.ts | TurnActivity, createActivityProjection, activityElapsed | propio | se queda | Proyección de actividad del turno. La usa `queries/store-core.ts:3`. `TurnActivity` y `activityElapsed` se reexportan de `apps/desktop/src/lib/turnActivity.ts` (líneas 4 y 109); `createActivityProjection` está aquí. Cruza a `chat` por el tipo `Msg` (línea 2). Los tests de `apps/desktop/tests/unit/thread-activity.test.ts` apuntan a `src/features/threads/index.ts`, ruta que ya no existe. Sin `invoke`. |
| src/model/activityAnchor.ts | savedActivityTurn, ActivityAnchor | propio | se queda | Ancla del turno guardado. Solo lo usa `model/activity.ts`. Cruza a `chat` por el tipo `Msg` (línea 1). Sin red. |
| src/model/assistant-history.ts | idsDeTurnos, createAssistantHistory | propio | se queda | Historia del asistente por workspace. Lo usa `queries/store-core.ts:4`. Cruza a `chat` (`hasRecentGap`, `transcripcion`, `Msg`, `Session`, `Turn`, línea 1). Sin red. |
| src/model/optimistic-history.ts | OptimisticHistoryState, hasUnsettledPrefix, createOptimisticHistory | propio | se queda | Prefijo optimista del hilo. Lo usa `queries/store-core.ts:5`. Cruza a `chat` (línea 1, tipos `HistoryPager`, `Msg`, `Session`) y usa `session/src/sessionRefresh.ts` (`conservarEnOrden`, `conservarPorClave`), que sí puede. Sin red. |
| src/model/transcript-events.ts | TranscriptMetadata, transcriptEvent | propio | se queda | Aplica un `ChatEvent` sobre los mensajes. Lo usa `queries/store-core.ts:6` y `:275`. Cruza a `chat` (línea 1: `anexarImagen`, `anexarRazonamiento`, `mcpCallFromName`, `tramoGuardado`, `ChatEvent`, `Msg`). Sin red. |
| src/queries/store-core.ts | MachineWait, createThreadsCore | propio | se queda | Estado pintado del hilo. Lo envuelve `queries/store.ts`. El `invoke` lo inyecta shell; aquí llama `load_history` y `load_session` (líneas 160-161). No importa `engine-client` ni `platform-client`. Cruza a `chat` (línea 2). El test `apps/desktop/tests/unit/question-card-r0.test.ts:20` apunta a `src/features/threads/store-core.ts`, ruta que ya no existe. |
| src/queries/store.ts | MachineWait, createThreadsStore | propio | se queda | Vista por contexto de workspace encima de `createThreadsCore`. Lo importa `App.tsx:65` vía `src/index.ts`. No llama red: añade el header `x-danil-context` con `apps/desktop/src/lib/workspace-context.ts`. Sin import de otra feature. |

## Imports cruzados

Salen de esta feature, todas hacia `chat`:

- `src/model/activity.ts:2` → `chat` (tipo `Msg`). En su lugar: shell no pinta esto; el tipo de mensaje deja de vivir en `features/chat/src/screens/Chat.tsx` y entra como tipo compartido que esta feature no importa de otra feature (lo inyecta shell, o sube con el modelo de transcripción fuera de `features/chat`).
- `src/model/activityAnchor.ts:1` → `chat` (tipo `Msg`). En su lugar: el mismo tipo, sin importar `features/chat`.
- `src/model/assistant-history.ts:1` → `chat` (`hasRecentGap`, `transcripcion`, `Msg`, `Session`, `Turn`). En su lugar: shell inyecta la lectura de historia, o esas funciones puras salen de `features/chat` hacia el modelo que esta feature ya posee.
- `src/model/optimistic-history.ts:1` → `chat` (`HistoryPager`, `Msg`, `Session`). En su lugar: tipos y pager inyectados por shell, no importados de `features/chat`.
- `src/model/transcript-events.ts:1` → `chat` (`anexarImagen`, `anexarRazonamiento`, `mcpCallFromName`, `tramoGuardado`, `ChatEvent`, `Msg`). En su lugar: los reductores de transcripción entran por deps desde shell, o suben fuera de la feature `chat`.
- `src/queries/store-core.ts:2` → `chat` (`anexarDeltas`, `ChatEvent`, `HandoverState`, `HistoryPager`, `hasOlder`, `hasRecentGap`, `lotesDeDeltas`, `Msg`, `mensajesDelHilo`, `OlderState`, `Session`, `TranscriptOrigin`, `transcripcion`, `vivoTrasLeer`). En su lugar: shell inyecta esos reductores en el `deps` que ya recibe `invoke`. Hoy salen de `features/chat/src/index.ts`.

Nadie más en `packages/features` importa esta feature. Shell la compone en `App.tsx:65` (permitido). `session/src/sessionRefresh.ts` no es un cruce de features.
