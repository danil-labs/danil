# @danil/platform-client

## Qué hace
Cliente HTTP tipado y único para el borde `/v1` de Danil.
Implementa reintentos automáticos para 404, 501 y 503 (regla R10), gestión de sesión, lectura compartida (`shared-read.ts`) y el cliente oficial de máquinas (`machines.ts`).

## Qué expone
Exporta desde `src/client.ts` y módulos de dominio:
- Cliente principal y hooks: `createPlatformClient`, `usePlatform`, `cancelEdgeWrites`, `nextDelay`, `EdgeMethod`, `EdgeRefusal`, `EdgeReply`, `GroupReply`.
- Constantes y eventos: `ORGANIZATION_CHANGED`, `Admission`.
- Clientes de dominio: `machines.ts` (`getMachines`, `startMachine`, `wakeMachine`, `createMachineTicket`), `identity.ts`, `workspaces.ts`, `treasury.ts`, `credentials.ts`.
- `idempotency.ts`: `newIdempotencyKey` (una llave por operación lógica, `crypto.randomUUID()`) y `withIdempotencyKey` (pone `Idempotency-Key` salvo que ya venga). Lo usan `edgeUntil`, `machines.ts`, `treasury.ts` y `credentials.ts`.

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
- Cabecera `Idempotency-Key` en toda escritura: `edgeUntil`, `/v1/machines` (start y tickets), billing y las cuatro escrituras de `/v1/credentials/workspaces/{ws}/accounts` (`PUT`, `DELETE`, `DELETE …/machines/{machine}`, `POST …/restore`). Quien reintenta repite la misma llave.
- Comandos RPC1 del motor: `danil_edge_fetch`.

## Contrato vendorizado (R2 y R7)
- `contract/openapi.json`: copia literal de `platform/openapi.json` de `danil-labs/danil-contracts`; el commit está en `contract/PIN`.
- `node packages/platform-client/scripts/generate.mjs` regenera `src/generated/types.ts` (esquemas de las operaciones de cada dominio de `DOMAINS`) y `src/generated/contract.ts` (`CONTRACT_HASH`, `OPERATIONS`). Con `--check` falla si están desactualizados.
- Para subir el contrato: copia el archivo del nuevo commit, actualiza `PIN` y regenera. R7 (`verify-front`) falla si `CONTRACT_HASH` no es el sha256 del archivo.
- `contract/billing-v2/`: copia literal de `platform/billing-v2/openapi/public.openapi.json` y de `platform/billing-v2/schemas/common.v1.schema.json` (sus `$defs`), del mismo commit de `PIN`. Generan `src/generated/billing.ts` aparte porque sus nombres chocan con los de platform; su hash es `BILLING_CONTRACT_HASH`.
- Dominios generados: **machines** (`machines.ts` reexporta `Machine`, `MachineList`, `MachineTicket` y `Operation`). La configuración, el transporte y el sobre `MachinesAnswer` no son respuestas y viven en `machines-config.ts`.
- **treasury** (`treasury.ts` reexporta `Catalog`, `OrganizationBilling`, `Balance`, `Checkout`, `CheckoutStatus`, `Purchase`, `PortalSession`, `TransactionPage`…). Los esquemas zod siguen validando lo que se lee; `fits<C>()` hace que no compilen si leen algo que no cabe en el contrato. El sobre `GroupReply` y `PlanChoice` (de `CheckoutUpgradeCreate`) viven en `treasury-config.ts`.
- **credentials** (`credentials.ts` reexporta `WorkspaceAccounts`, `AccountCredential`, `CredentialMachine`, `CredentialRecipient`, `GithubConnection`…). La lectura normalizada está en `account-credentials.ts`.
- **Movidos de `packages/computers` (p4-4a), tal cual:** `api.ts`, `machine.ts`, `edge.ts` y `account-credentials.ts` (era `credentials.ts` de computers; el nombre ya lo tenía el adaptador web). En computers queda cada archivo como reexportación de una línea, para el front viejo y `apps/mobile`.

## Qué falta según la fase 2 del plan
- Fase 2.3: consumirse únicamente desde los archivos `queries.ts` de las features (R12).
- Fase 4.2: machines, identidad, workspaces, treasury y credenciales ya se generan.
