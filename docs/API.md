# Contratos y consumo de API del Front Nuevo

Documento de referencia sobre qué consume la nueva arquitectura modular del front de Danil (`apps/workspace`, `packages/shell`, `packages/features/*`).

## 1. Borde HTTP (/v1)

El front nuevo consume exclusivamente el borde `/v1` a través de `@danil/platform-client`, que vendoriza el OpenAPI en `contract/openapi.json` y genera los tipos y operaciones correspondientes (`src/generated/{types,operations,contract}.ts`).

La red del borde está centralizada en `src/http.ts` con reintentos automáticos ante códigos `404`, `501` y `503` (R10) y URL base única (`API_BASE`).

### Operaciones por Feature

| Feature | `operationId` | Método y Ruta | Propósito |
|---|---|---|---|
| `@danil/feature-machines` | `getMachines` | `GET /v1/machines` | Listado completo de máquinas asociadas a la sesión actual. |
| `@danil/feature-machines` | `startMachine` | `POST /v1/machines/{id}/start` | Encendido de una máquina remota. |
| `@danil/feature-machines` | `stopMachine` | `POST /v1/machines/{id}/stop` | Apagado de una máquina remota. |
| `@danil/feature-machines` | `createMachineTicket` | `POST /v1/machines/{id}/tickets` | Emisión de ticket de conexión de un solo uso para el transporte relay. |
| `@danil/feature-machines` | `getOperation` | `GET /v1/operations/{id}` | Sondeo de estado y progreso de operaciones asíncronas. |
| `@danil/feature-workspaces` | `getOrganizations` | `GET /v1/identity/organizations` | Consulta de organizaciones / planes accesibles por el usuario. |
| `@danil/feature-workspaces` | `selectOrganization` | `POST /v1/identity/organizations/select` | Selección de organización activa. |
| `@danil/feature-workspaces` | `getWorkspaces` | `GET /v1/workspaces` | Consulta de la lista de workspaces de la organización. |
| `@danil/feature-workspaces` | `createWorkspace` | `POST /v1/workspaces` | Creación de un nuevo workspace. |
| `@danil/feature-workspaces` | `selectWorkspace` | `POST /v1/workspaces/select` | Selección del workspace activo. |
| `@danil/feature-projects` | (Modelo `Workspace`) | Contexto de workspace | Tipos derivados del modelo OpenAPI de workspace. |
| `@danil/feature-ai-credentials` | `getWorkspaceAccounts` | `GET /v1/credentials/workspaces/{workspace_id}/accounts` | Consulta unificada y cacheada de cuentas configuradas y máquinas destinatarias (`recipients`). |
| `@danil/feature-ai-credentials` | `putWorkspaceAccount` | `PUT /v1/credentials/workspaces/{workspace_id}/accounts` | Alta o actualización de credencial sellada con WebCrypto (`TERMINUS-SECRET/1`). |
| `@danil/feature-ai-credentials` | `deleteWorkspaceAccount` | `DELETE /v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}` | Eliminación de una credencial configurada. |
| `@danil/feature-ai-credentials` | `removeWorkspaceAccountMachine` | `DELETE /v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}/machines/{machine_id}` | Retiro de acceso de una credencial en una máquina específica. |
| `@danil/feature-ai-credentials` | `restoreWorkspaceAccountMachine` | `POST /v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}/machines/{machine_id}/restore` | Restauración de acceso de una credencial en una máquina específica. |
| `@danil/feature-account` | `getMe` | `GET /v1/identity/me` | Consulta de perfil de usuario y resumen del plan (solo lectura). |

---

## 2. Motor RPC1

El motor se consume a través de `@danil/engine-client`, generado a partir del manifiesto RPC1 (`commands.json`). Proporciona tipado estricto y transporte multiplexado (`connectMachine`).

### Grupos de comandos por Feature

### `@danil/feature-machines`
- `connectMachine`: Conexión RPC1 seleccionando transporte local o relay según el entorno, con reactivación automática de VMs suspendidas.

### `@danil/feature-workspaces`
- `set_active_workspace`: Notifica al motor local el workspace gobernante tras confirmarse la selección en la plataforma.

### `@danil/feature-projects`
- `list_projects`: Catálogo de carpetas y proyectos presentes en la máquina.
- `list_live_sessions`: Consulta de tareas activas de un proyecto.
- `delete_session`: Borrado de sesión/tarea en el motor.
- `finish_task`: Finalización y archivado de una tarea.

### `@danil/feature-chat`
- **Comandos de sesión y conversación:**
  - `load_session`: Carga del historial completo de turnos y metadatos de la sesión.
  - `send_message`: Envío de mensaje e inicio de turno con el agente.
  - `stop_turn`: Cancelación o interrupción del turno en ejecución.
  - `respond_permission`: Respuesta (autorizar o rechazar) a peticiones de herramientas restringidas.
  - `answer_question`: Respuesta a formularios estructurados emitidos por el agente.
- **Eventos push (canal `'chat'`):**
  - `started`: Notificación de inicio de turno y modelo asignado.
  - `reasoning`: Fragmentos de razonamiento (pensamiento) del agente.
  - `delta`: Tokens y fragmentos incrementales de texto.
  - `tool` / `tool_done`: Invocación y resultado de herramientas.
  - `shell_started` / `shell_output` / `shell_done`: Ejecución de comandos en la máquina.
  - `permission`: Solicitudes de aprobación de seguridad hacia el usuario.
  - `done`: Cierre y consolidación del turno activo.

### `@danil/feature-files`
- Comandos del árbol de trabajo (`packages/engine-client/src/generated/commands/tree.ts`):
  - `tree_files`: Lista archivos de la raíz del árbol de trabajo.
  - `tree_folder`: Lista de archivos y subcarpetas para una ruta específica bajo demanda.
  - `tree_git_status`: Estado git de archivos modificados, agregados o eliminados.
  - `tree_show`: Contenido textual o metadatos de un archivo en disco.
  - `tree_write`: Escritura o sobrescritura de archivo en disco.
  - `tree_patch`: Generación de diff unificado en formato patch.

### `@danil/feature-ai-credentials`
- `list_providers`: Consulta de proveedores y agentes disponibles en el motor.
- `connectMachine`: Conexión y encendido explícito de máquinas del workspace.

### `@danil/feature-terminal`
- Comandos RPC1 de gestión de terminales (esqueleto F1.1).

### `@danil/session` (Desk)
- Comandos RPC1 de autenticación y gestión de sesiones de motor:
  - `danil_sessions`: Consulta y sondeo de sesiones activas.
  - `danil_connect_start`: Inicio de login de dispositivo en navegador externo.
  - `danil_client_token`: Obtención y refresco de token de acceso.
  - `danil_disconnect`: Cierre de sesión.

---

## 3. Transporte Relay (`@danil/engine-client`)

El transporte `relay.ts` conecta con máquinas remotas vía WebSocket cuando no se ejecuta bajo el host nativo Desk:

1. **Obtención del ticket:** Solicita un ticket de conexión temporal y de un solo uso al borde (`createMachineTicket`).
2. **Conexión WebSocket:** Se conecta al relay inyectando el ticket (`requestTicket`).
3. **Reactivación automática (`waking`):** Si la máquina se encuentra suspendida, se reactiva automáticamente, exponiendo el estado `waking` («encendiendo…») y reintentando la conexión sin requerir acción manual.
4. **Trama de mensajes (JSON):**
   - **Petición:** `{ "id": string|number, "method": string, "params": any }`
   - **Respuesta:** `{ "id": string|number, "result": any }` o `{ "id": string|number, "error": { "code": number, "message": string } }` (con correlación por `id`).
   - **Eventos:** `{ "event": string, "payload": any, "cursor": any }`
5. **Reconexión con cursor:** Al reconectar, envía `{ "resume": { "cursor": ... } }` para recuperar eventos omitidos con backoff exponencial y jitter.
6. **Sin lista blanca:** El relay opera sin lista blanca estática de comandos.
7. **Caché de conexión:** `connectMachine` cachea la sesión activa por `(sessionKey, machine_id)`.

---

## 4. Estado de piezas pendientes (según los README)

Elementos documentados como pendientes en los README de los paquetes del front nuevo:

- **`packages/shell`:**
  - Montaje de pantallas completas de las features (`@danil/feature-machines`, `@danil/feature-workspaces`, `@danil/feature-account`, `@danil/feature-projects`, `@danil/feature-chat`, `@danil/feature-terminal`, `@danil/feature-files`, `@danil/feature-ai-credentials`), pendientes de implementación en sus respectivos paquetes.
- **`packages/host`:**
  - Esqueleto inicial F1.1, sin implementación de capacidades nativas.
- **`@danil/feature-machines`:**
  - Conexión del selector de máquinas a la persistencia del workspace activo: pendiente hasta que la shell conecte el compositor.
- **`@danil/feature-projects`:**
  - Método RPC1 batch `list_workspace_tasks` en `commands.json` para consulta atómica de todas las tareas del workspace en una sola petición.
  - Esquema formal en `commands.json` de `task_lifecycle_preview` con campo `integration` garantizado por miembro.
  - Esquema formal en `commands.json` de `task_lifecycle_apply` con parámetros `{ project, id, consent, discard }` y resultado `DeleteResult`.
- **`@danil/feature-chat`:**
  - `AgentDock`: Dock superior para visualización de subagentes pendiente de especificación de eventos multicomputer.
  - `ChatVisual`: Renderizador de visualizaciones interactivas mediante iframe seguro pendiente de adaptador web.
- **`@danil/feature-files`:**
  - Integración del editor interactivo CodeMirror 6 cuando se añada `@danil/ui/code-editor` o la dependencia directa al workspace.
  - Comando RPC1 tipado `tree_read_part` con paginación binaria formal (`offset`, `length`, `total_size`, `encoding`) una vez disponible en el motor.
- **`@danil/feature-ai-credentials`:**
  - Antigravity (Gemini): autenticación por suscripción (`kind=subscription`), pendiente de especificación en el contrato del borde sobre el payload y metadatos que se transmiten al conectar.
- **`@danil/feature-terminal`:**
  - Esqueleto F1.1 pendiente de desarrollo completo.
- **`@danil/feature-account`:**
  - Esqueleto F1.1 pendiente de desarrollo completo.
