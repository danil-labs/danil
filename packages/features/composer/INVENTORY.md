# Inventario: composer

Selección del compositor (agente, superficie, modelo, esfuerzo, modo) y los catálogos que la hacen ejecutable. No mueve código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/index.ts | createComposerStore, ComposerConfiguration | propio | se queda | Entrada que usa shell: `packages/shell/src/app/App.tsx:61`. No llama red. |
| src/model.ts | ComposerConfiguration | propio | se queda | Reexporta el tipo de `queries/store.ts`. Ningún archivo importa `src/model.ts` (`grep`); `index.ts` salta a `queries/store.ts`. Es la entrada de model de la feature. Sin red. |
| src/queries.ts | ComposerConfiguration, createComposerStore | propio | se queda | `export *` de `queries/store.ts`. Tampoco lo importa nadie fuera del propio archivo: `index.ts` apunta al store. Es la entrada de queries. |
| src/queries/store.ts | ComposerConfiguration, createComposerStore | propio | se queda | Store del compositor. Lo crea `App.tsx:1142` vía el index. El `invoke` lo inyecta shell; aquí llama `list_slash_menu` (66), `list_models` (77), `list_surfaces` (106), `list_providers` (179) y `list_permission_modes` (217). No importa `engine-client` ni `platform-client`. Cruza a `chat` (línea 6) y al paquete viejo `packages/tasks` (línea 7, `OPENCODE`). El test `apps/desktop/tests/unit/composer-store.test.ts:4` apunta a `src/features/composer/index.ts`, ruta que ya no existe. |

## Imports cruzados

- `src/queries/store.ts:6` → `chat` (`modoInicial`, `modoRecordado`, `recordarModo`, definidos en `features/chat/src/model/modes.ts`). En su lugar: shell inyecta el modo inicial y el recuerdo en `deps`, o esas tres funciones suben a `session` (preferencia de la sesión, no UI de chat).

Paquete viejo (no es feature):

- `src/queries/store.ts:7` → `packages/tasks` (`OPENCODE` en `packages/tasks/src/agents.ts`). En su lugar: la constante la decide la tarea 1.9; esta query la recibe por `deps`, no importa el paquete viejo.

Nadie en otra feature importa `composer`. Shell la compone en `App.tsx:61`.
