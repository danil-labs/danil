# @danil/feature-workspaces

## Qué hace
Riel vertical de navegación de workspaces (DS1 v2) y gestión de tenancy.
Administra la selección atómica de organizaciones/workspaces, agrupación de sesiones y fuente de contexto de la tarea (`context-source.ts`).

## Qué expone
Exporta desde `src/index.ts`:
- Fuente de contexto: `createContextSource`.

## Qué consume
- `@danil/engine-client`, `@danil/ui`, `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: integración prevista para `/v1/workspaces` y `/v1/identity/organizations` vía `platform-client`.
- Comandos RPC1 del motor: `list_mentions`, `list_workspaces`, `load_session`, `session_usage`, `set_workspace_source`.

## Qué falta según la fase 2 del plan
- Fase 2.4 y 2.5: recibir los componentes del riel vertical desde `shell` (`OrganizationStack`, `AddWorkspaceMenu`, `OrganizationRailGroup`, etc.) y desacoplar dependencias de `apps/desktop/src/lib/`.
- Referencia de plan: `docs/plans/2026-11-21-front-move/README.md`.
