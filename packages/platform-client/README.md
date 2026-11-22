# @danil/platform-client

## Qué hace
Cliente HTTP tipado y único para el borde `/v1` de Danil.
Implementa reintentos automáticos para 404, 501 y 503 (regla R10), gestión de sesión, lectura compartida (`shared-read.ts`) y el cliente oficial de máquinas (`machines.ts`).

## Qué expone
Exporta desde `src/client.ts` y módulos de dominio:
- Cliente principal y hooks: `createPlatformClient`, `usePlatform`, `cancelEdgeWrites`, `nextDelay`, `EdgeMethod`, `EdgeRefusal`, `EdgeReply`, `GroupReply`.
- Constantes y eventos: `ORGANIZATION_CHANGED`, `Admission`.
- Clientes de dominio: `machines.ts` (`getMachines`, `startMachine`, `wakeMachine`, `createMachineTicket`), `identity.ts`, `workspaces.ts`, `treasury.ts`, `credentials.ts`.

## Qué consume
- Fetch HTTP nativo hacia el borde `/v1`.
- `@danil/engine-client` (para ejecutar peticiones vía comando RPC1 `danil_edge_fetch` en Desk).

## Qué contratos toca
- Rutas del borde `/v1`:
  - `/v1/capabilities`
  - `/v1/credits/balance`
  - Dominio identidad: `/v1/identity/contexts`, `/v1/identity/login`, `/v1/identity/me`, `/v1/identity/organizations`, `/v1/identity/organizations/select`, `/v1/identity/sessions`, `/v1/identity/sessions/catalog`
  - Dominio workspaces: `/v1/workspaces`, `/v1/workspaces/adopt`, `/v1/workspaces/adopt/challenge`, `/v1/workspaces/promo/redeem`, `/v1/workspaces/select`
  - Dominio máquinas: `/v1/machines`, `/v1/machines/start`, `/v1/machines/ticket`, `/v1/machines/wake`
- Comandos RPC1 del motor: `danil_edge_fetch`.

## Qué falta según la fase 2 del plan
- Fase 2.3: consumirse únicamente desde los archivos `queries.ts` de las features (R12).
- Fase 4.2: generación automática de contratos y tipos desde el OpenAPI vendorizado de `danil-contracts` (R2, R7).
