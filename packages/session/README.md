# @danil/session

## Qué hace
Gestión unificada de identidad y sesión para web y escritorio.
Administra cookies de sesión HttpOnly en web, tokens de sesión del motor en Desk, actualización de credenciales y contexto del usuario.

## Qué expone
Exporta desde sus módulos en `src/`:
- Identidad y sesión: `PlatformProfile`, `bridgePersonSession`, `canListWorkspaces`, `clearWebCaches`, `completeSignIn` en `platform-session.ts` y `person-session.ts`.
- Sesión de ventana y organizaciones: `window-session.tsx`, `organization-session.ts`.
- Configuración y almacenamiento: `session-config.ts`, `session-storage.ts`, `session-wait.ts`, `sessionRefresh.ts`.

## Qué consume
- `@danil/platform-client`, `@danil/engine-client`, `@danil/host`.
- `apps/desktop/src/lib/prefs.ts` y referencias temporales a `features/machines` y `features/settings`.

## Qué contratos toca
- Rutas `/v1` del borde: `/v1/identity/me`.
- Comandos RPC1 del motor: `danil_sign_in_complete`, `danil_sessions`, `danil_account_refresh`.

## Qué falta según la fase 2 del plan
- Fase 2.2: absorber el manejo de sesión de cuenta que reside en `features/settings/src/components/danil-session.tsx` y nombres conocidos en `features/machines/src/model/known-names.ts`.
- Fase 2.4: eliminar imports hacia features para respetar el orden de dependencias de la arquitectura (R3).
