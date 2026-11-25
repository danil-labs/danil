# @danil/feature-settings

## Qué hace
Marco general de Configuración y preferencias de la aplicación.
Agrupa preferencias generales (idioma, comportamiento de cierre, notificaciones), atajos y contenedores de configuración de servicios.

## Qué expone
Exporta desde `src/index.ts`:
- Identidad de cuenta: `AccountAvatar`, `createAccountIdentity`, `engineAccountProfile`, `profileFromStatus`, `AccountProfile`, `AccountProfileSource`, `PROFILE_CHANGED`.
- Sesión Danil: `createDanilAccounts`, `DanilAccounts`, `createDanilSession`, `said`.

## Qué consume
- `@danil/engine-client`, `@danil/platform-client`, `@danil/ui`.
- `@terminus/computers`, `@danil/ui` (`src/lib/tasks/index.ts`), `@terminus/protocol`, `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: `/v1/credentials/*` y `/v1/identity/*` vía `platform-client`.
- Comandos RPC1 del motor: `list_workspaces`, `set_workspace_language`, `list_language_packs`, `get_profile`, `set_profile`, `list_integrations`, `set_integration_enabled`, `list_skill_sources`, `add_skill_source`, etc.

## Qué falta según la fase 2 del plan
- Fase 2.1: `SettingsLayout` y avisos de gobernanza (`Governed`) suben a `packages/ui`.
- Fase 2.4: redistribuir secciones hacia sus features dueñas (`account`, `ai-credentials`, `machines`, `projects`, `workspace`); eliminar 327 imports cruzados hacia 12 módulos (R3).
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
