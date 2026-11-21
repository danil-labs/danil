# Feature: AI Credentials (`@danil/feature-ai-credentials`)

Gestiona la conexión, custodia y propagación de credenciales de inteligencia artificial (modelos Claude, Codex, Antigravity y OpenCode) para las máquinas asociadas a un workspace.

## Qué hace

- Consulta y muestra los proveedores de IA soportados.
- Realiza una consulta única y cacheada por workspace de las cuentas configuradas y las máquinas destinatarias con llave pública (`recipients`), resolviendo ráfagas redundantes (B-023).
- Permite conectar nuevas credenciales sellando el secreto en el cliente con WebCrypto (`X25519 + HKDF-SHA256 + AES-256-GCM`, formato `TERMINUS-SECRET/1`) para cada máquina receptora. El secreto nunca viaja en texto claro.
- Refleja el estado de la credencial por máquina (`active`, `pending`, `removed`), resolviendo la falta de propagación automática (B-022).
- Detecta máquinas del workspace que no han publicado llave o están apagadas, ofreciendo un botón para encender la máquina mediante `connectMachine` exclusivamente por acción de la persona usuaria (B-021).
- Proporciona acciones para eliminar credenciales y quitar o restaurar el acceso en máquinas específicas.

## Qué consume y de qué contrato

### Métodos RPC1 (Motor)

| Comando RPC1 | Cliente | Estado | Propósito |
|---|---|---|---|
| `list_providers` | `@danil/engine-client` | Implementado | Lista proveedores y agentes disponibles en el motor. |
| `connectMachine` | `@danil/engine-client` | Implementado | Conexión y encendido explícito de la máquina (B-021). |

### Rutas HTTP OpenAPI (`/v1`)

| Método y Ruta | OperationId / Contrato | Estado | Detalle |
|---|---|---|---|
| `GET /v1/credentials/workspaces/{workspace_id}/accounts` | `getWorkspaceAiAccounts` | Pendiente de contrato | Pendiente en `@danil/platform-client`; el hook devuelve error tipado `unavailable`. |
| `PUT /v1/credentials/workspaces/{workspace_id}/accounts` | `putWorkspaceAiAccount` | Pendiente de contrato | Pendiente en `@danil/platform-client`; el hook devuelve error tipado `unavailable`. |
| `DELETE /v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}` | `deleteWorkspaceAiAccount` | Pendiente de contrato | Pendiente en `@danil/platform-client`; el hook devuelve error tipado `unavailable`. |
| `DELETE /v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}/machines/{machine_id}` | `removeMachineFromAiAccount` | Pendiente de contrato | Pendiente en `@danil/platform-client`; el hook devuelve error tipado `unavailable`. |
| `POST /v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}/machines/{machine_id}/restore` | `restoreMachineToAiAccount` | Pendiente de contrato | Pendiente en `@danil/platform-client`; el hook devuelve error tipado `unavailable`. |

### Antigravity (Gemini)

- Antigravity se autentica por suscripción (`kind=subscription`), a diferencia de los esquemas basados en API key o CLI anteriores.
- Pendiente de especificación en el contrato del borde sobre el payload y metadatos que se transmiten al conectar.

## Estructura

- `src/index.ts`: Punto de entrada público que exporta la pantalla principal y componentes.
- `src/queries.ts`: Único punto de interacción con `@danil/platform-client` y `@danil/engine-client`.
- `src/model.ts`: Tipos derivados de los clientes generados.
- `src/seal.ts`: Sellado WebCrypto (`TERMINUS-SECRET/1`).
- `src/components/`: Componentes modulares (`ProviderCard`, `MachineWakeNotice`, `CredentialErrorNotice`).
- `src/screens/`: Pantalla completa `AiCredentialsScreen`.
