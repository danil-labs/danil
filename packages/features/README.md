# packages/features

## Qué hace
Directorio contenedor de los módulos funcionales del front rebuild de Danil.
Agrupa las features modulares del cliente, organizadas cada una con sus pantallas, componentes, modelos y queries según `03-structure.md`.

## Qué expone
No tiene punto de entrada propio. Cada subdirectorio expone su API pública en su respectivo `src/index.ts`:
- `artifacts`, `chat`, `code`, `composer`, `conversation-handoff`, `drafts`, `machines`, `onboarding`, `projects`, `screen`, `service-stream`, `settings`, `sites`, `tabs`, `task-queues`, `threads`, `viewers`, `workspace`, `workspaces`.

## Qué consume
Las features consumen los paquetes base del sistema:
- `@danil/ui`, `@danil/platform-client`, `@danil/engine-client`, `@danil/session`, `@danil/host`.

## Qué contratos toca
- Cada feature interactúa con sus respectivos endpoints `/v1` del borde mediante `platform-client` y comandos RPC1 mediante `engine-client`.

## Qué falta según la fase 2 del plan
- Fase 2.1: extracción de UI reutilizable a `packages/ui`.
- Fase 2.2: extracción de funciones utilitarias a `packages/ui/lib` y sesión a `packages/session`.
- Fase 2.3: llamadas de red confinadas a `queries.ts` por feature (R12).
- Fase 2.4: eliminación total de imports cruzados entre features (R3).
- Fase 2.6: reducción de archivos a un máximo de 400 líneas (R6).
