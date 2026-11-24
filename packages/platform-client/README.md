# @danil/platform-client

## Qué hace
Cliente HTTP tipado y único para el borde `/v1` de Danil.
Implementa reintentos automáticos para 404, 429, 501 y 503 (regla R10), gestión de sesión y contexto (`X-Danil-Session`), idempotencia (`idempotency.ts`), lectura compartida (`shared-read.ts`) y el cliente oficial de máquinas (`machines.ts`).

## Qué expone
Exporta desde `src/client.ts` y los módulos de dominio en `src/`:
- Transporte principal (`client.ts`): `edgeFetch`, `edgeUntil`, `platformFetch`, `setEdgeContext`, `edgePath`, `onEdgeProblem`, `cancelEdgeWrites`, `nextDelay`, `ORGANIZATION_CHANGED`, `Patience`, `EdgeMethod`, `EdgeRefusal`, `EdgeReply`.
- Lectura compartida (`shared-read.ts`): `SHARED_READ_FRESH_MS`, `sharedRead`, `sharedReads`.
- Idempotencia (`idempotency.ts`): `newIdempotencyKey` (una llave nueva por operación lógica con `crypto.randomUUID()`) y `withIdempotencyKey` (añade `Idempotency-Key` a las cabeceras salvo que ya venga, sin distinguir mayúsculas). Lo usan `edgeUntil`, `machines.ts`, `treasury.ts` y `credentials.ts`.
- Dominios generados del contrato OpenAPI (R2 y R7):
  - `machines.ts` (`machinesClient`, `machineToComputer`, `wokeOf`, `CAPABILITIES_PATH`, `capabilitiesUrl`, `DEFAULT_RELAY_ORIGINS`, `Machine`) y `machines-config.ts` (`Admission`, `MachinesAnswer`, `MachinesConfig`, `MachinesTransport`).
  - `identity.ts` (`me`, `selectOrganization`, `fetchIdentityMe`, `sendIdentityMe`, `selectOrganizationWithContext`, `probeIdentityMe`, `fetchEdgeOrganizations`, `selectEdgeOrganization`, `fetchSessionsCatalog`, `SESSION_ROUTES`, `SHARED_SESSION_READS`, `Me`).
  - `workspaces.ts` (`workspaces`, `getWorkspaces`, `selectWorkspace`, `workspaceCatalog`, `sessionWorkspaceCatalog`, constantes y constructores de rutas `/v1/workspaces*`, `Workspace`, `WorkspaceList`).
  - `treasury.ts` (`CREDITS_BALANCE_PATH`, `readCreditsBalance`, `billingV2`, `availableDanilCredits`, `scopedCreditsRead`, `PromotionCodeFormatError`) y `treasury-config.ts` (`GroupReply`, `PlanChoice`).
  - `credentials.ts` (`webCredentialSource`: adaptador web con cookie, CSRF e `Idempotency-Key` hacia `account-credentials.ts`).
- Módulos incorporados en F4.4 (retirando las dependencias hacia `@terminus/computers` y `apps/desktop/src/**`):
  - `edge.ts`: transporte HTTP web por cookie HttpOnly y CSRF (`edgeTransport`, `edgeIdentity`, `EdgeTransport`, `EdgeDeployment`, `EdgeError`, `EdgePerson`, `personOf`).
  - `organizations.ts`: selector tolerante de organización sobre `/v1/identity/organizations` y `select` (`createOrganizationSelection`, `announcesOrganizations`, `isOrganizationSelectionRequired`, tipos `Organization`, `OrganizationSource`, `OrganizationState`, `OrganizationSelection`).
  - `github.ts`: conexión de GitHub por workspace en `/v1/workspaces/{id}/github*` y revocación/restauración por máquina (`githubStatus`, `githubAuthorize`, `githubInstallations`, `setGithubAreas`, `disconnectGithub`, `removeGithubMachine`, `restoreGithubMachine` y lectores).
  - `capabilities.ts`: lectura tolerante de `GET /v1/capabilities` (`capabilityList`, `announces`, `mayCall`, `CapabilityList`).
  - `space-order.ts`: orden compartido de spaces del workspace vía `PATCH /v1/workspaces/{id}` (`spaceOrder`, `arrangeSpaces`, `createSpaceOrderSource`, `SpaceOrderSource`).
  - `workspace-assets.ts` (assets de workspace): contrato `WorkspaceAssetsSource`, `WorkspaceAssetKind` (`logo` | `background`) y `AccountChatBackground`.
  - `workspace-spaces.ts`: catálogo versionado de spaces por workspace en `/v1/workspaces/{id}/spaces` (`workspaceSpacesClient`, `workspaceSpacesForEngine`, `readContextSpaces`).
  - `connections.ts`: conexiones de orquestadores externos MCP en `/v1/connections*` (`listConnections`, `updateConnection`, `revokeConnection`, `connectionCapabilities` y cliente MCP N1 del borde: `listMcpConnections`, `getMcpConnection`, `patchMcpConnection`, `revokeMcpConnection`, `listMcpConnectionAudit`, `deskMcpConnectionsTransport`, `webMcpConnectionsTransport`).
  - `memory.ts`: memoria versionada del workspace en `/v1/workspaces/{id}/memory/*` (`memoryFiles`, `readMemoryFile`, `memoryHistory`, `memoryLog`, `writeMemoryFile`, `deleteMemoryFile`, `MemorySource`).
  - `seal.ts`: sellado `TERMINUS-SECRET/1` con WebCrypto X25519 + HKDF-SHA256 + AES-256-GCM (`canSeal`, `sealCredential`, `sealForRecipients`, `SEAL_MAX_BYTES`, `fromBase64`, `toBase64`).
  - `billing-route.ts`: rutas y estado de retorno en `sessionStorage` para `/billing` (`BILLING_LOGIN_KEY`, `BILLING_PAYMENT_KEY`, `billingHref`, `rememberBillingLogin`, `rememberBillingReturn`).
  - `audit-log.ts`: tipos y contrato de lectura de la bitácora de auditoría (`AuditActorType`, `AuditEntry`, `AuditLogSource`).
  - `api.ts`, `machine.ts` y `account-credentials.ts` (movidos de `packages/computers` en p4-4a): utilidades `bearerCall`/`apiUrl`/`errorCodeOf`, estados de máquina (`MachineState`) y cliente/normalización de `/v1/credentials/workspaces/{ws}/accounts` (`listCredentials`, `putCredential`, `deleteCredential`, `removeCredentialMachine`, `restoreCredentialMachine`). En `packages/computers` solo quedan shims de reexportación para `apps/mobile` y pruebas heredadas.

## Qué consume
- Fetch HTTP nativo hacia el borde `/v1`.
- `@danil/engine-client` (para ejecutar peticiones vía comando RPC1 `danil_edge_fetch` en Desk).
- `zod` (validación en tiempo de ejecución de `treasury.ts`, comprobada contra el contrato generado con `fits<C>()`).

## Qué contratos toca
- Rutas del borde `/v1`:
  - `/v1/capabilities`
  - `/v1/credits/balance`, `/v1/credits/transactions`, `/v1/credits/purchases*`, `/v1/billing/*`
  - Dominio identidad: `/v1/identity/contexts`, `/v1/identity/csrf`, `/v1/identity/login`, `/v1/identity/logout`, `/v1/identity/me`, `/v1/identity/organizations`, `/v1/identity/organizations/select`, `/v1/identity/sessions`, `/v1/identity/sessions/catalog`
  - Dominio workspaces: `/v1/workspaces`, `/v1/workspaces/{id}`, `/v1/workspaces/{id}/spaces`, `/v1/workspaces/{id}/memory/*`, `/v1/workspaces/{id}/github*`, `/v1/workspaces/adopt`, `/v1/workspaces/adopt/challenge`, `/v1/workspaces/promo/redeem`, `/v1/workspaces/select`
  - Dominio máquinas: `/v1/machines`, `/v1/machines/{id}`, `/v1/machines/{id}/start`, `/v1/machines/{id}/tickets`, `/v1/operations/{id}`
  - Dominio credenciales y conexiones: `/v1/credentials/workspaces/{ws}/accounts*`, `/v1/connections*`
- Cabecera `Idempotency-Key` en toda escritura: `edgeUntil`, `/v1/machines` (start y tickets), billing y las cuatro escrituras de `/v1/credentials/workspaces/{ws}/accounts` (`PUT`, `DELETE`, `DELETE …/machines/{machine}`, `POST …/restore`). Quien reintenta repite la misma llave.
- Comandos RPC1 del motor: `danil_edge_fetch`.

## Contrato vendorizado (R2 y R7)
- `contract/openapi.json`: copia literal de `platform/openapi.json` de `danil-labs/danil-contracts`; el commit está en `contract/PIN`.
- `node packages/platform-client/scripts/generate.mjs` regenera `src/generated/types.ts` (esquemas de las operaciones de cada dominio de `DOMAINS`) y `src/generated/contract.ts` (`CONTRACT_HASH`, `OPERATIONS`). Con `--check` falla si están desactualizados.
- Para subir el contrato: copia el archivo del nuevo commit, actualiza `PIN` y regenera. R7 (`verify-front`) falla si `CONTRACT_HASH` no es el sha256 del archivo.
- `contract/billing-v2/`: copia literal de `platform/billing-v2/openapi/public.openapi.json` y de `platform/billing-v2/schemas/common.v1.schema.json` (sus `$defs`), del mismo commit de `PIN`. Generan `src/generated/billing.ts` aparte porque sus nombres chocan con los de platform; su hash es `BILLING_CONTRACT_HASH`.
- Dominios generados: **machines** (`machines.ts` reexporta `Machine`; la configuración, el transporte y `MachinesAnswer` viven en `machines-config.ts`), **identity** (`Me`, `SelectOrganizationResponse`), **workspaces** (`Workspace`, `WorkspaceList`, `SelectWorkspaceResponse`), **treasury** (`Catalog`, `OrganizationBilling`, `Balance`, `Checkout`, `CheckoutStatus*`, `Purchase`, `PortalSession`, `TransactionPage` con `fits<C>()` y `treasury-config.ts`) y **credentials** (`credentials.ts` + `account-credentials.ts`).

## Estado del plan
- Fase 2.3 (R12 = 0): cerrado; las features solo importan `platform-client` desde `queries/`.
- Fase 4.2 (R2 y R7): cerrado; machines, identidad, workspaces, treasury y credenciales salen del OpenAPI vendorizado.
- Fase 4.4: cerrado; 0 imports desde `packages/**` hacia `apps/desktop/src/**`, `@terminus/computers` y `@terminus/fleet`.
