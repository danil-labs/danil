# API que consume el front

Qué pide el front de Danil al borde `/v1` y al motor (RPC1), tal como está **hoy** en `dev`
(con F4.2 y F4.4 cerradas). Cada afirmación cita su archivo; lo que no está construido dice
**propuesta**. Regla R16 de
[03-structure.md](https://github.com/danil-labs/terminus-workspace/blob/main/docs/plans/2026-11-20-front-rebuild/03-structure.md).

El front es uno: `packages/shell` + `packages/features/*`, compilado desde `apps/desktop`.
- Desk (ventana Tauri): `apps/desktop/index.html:81` carga `packages/shell/src/app/main.tsx`.
- Web: `apps/desktop/web.html:467` carga `apps/desktop/src/web/bootstrap.ts` (`pnpm -C apps/desktop web:build`).

No existen `apps/workspace`, `apps/auth` ni `apps/desk`, aunque `pnpm-workspace.yaml` y el script
`front:build` del `package.json` raíz los nombran.

**Cierre de F4.4:** `packages/**` tiene **0 imports** hacia `apps/desktop/src/**`,
`@terminus/computers` y `@terminus/fleet` (salvo los `import.meta.glob` de archivos JSON de locales
en `packages/ui/src`). Los clientes de borde y utilidades que vivían ahí se consolidaron en
`packages/platform-client`, `packages/session`, `packages/host`, `packages/ui` y
`packages/features/machines`. `packages/computers` y `packages/fleet` quedan solo como shims de
reexportación para `apps/mobile` y pruebas heredadas.

## 1. Borde `/v1` (`packages/platform-client`)

### Transporte

| Qué | Dónde |
|---|---|
| Desk llama al borde con el comando RPC1 `danil_edge_fetch`: el token lo pone Rust, nunca JS. | `src/client.ts:1-6`, `:81-86` |
| `edgeUntil` reintenta **404, 429, 501 y 503** con backoff (×2, tope 60 s, respeta `retry_after_ms`) y repite la misma `Idempotency-Key` en las escrituras. Un 404 con `code` `not_found` o `*_not_found` no se reintenta. | `src/client.ts:31-34`, `:45`, `:92-122`; la llave sale de `newIdempotencyKey` (`:95`) |
| `cancelEdgeWrites()` aborta las escrituras en curso al cambiar de organización o workspace. | `src/client.ts:25-28`; lo llaman `selectOrganization` (`src/identity.ts:28-29`) y `selectWorkspace` (`src/workspaces.ts:68-69`) |
| Web: `platformFetch` añade `X-Danil-Session` (el grupo activo, `setEdgeContext`) a toda ruta `/v1/` con organización. | `src/client.ts:142-164` |
| Rutas sin organización (no llevan `X-Danil-Session`). | `contextFree`, `src/client.ts:131-139` |
| Web (cookie + CSRF): `edgeTransport` usa `credentials: "include"` y pide `X-CSRF-Token` a `identity/csrf` antes de cada escritura; `edgeIdentity` expone `loginUrl`, `me` y `logout`. | `src/edge.ts:35-69`, `:96-115` |
| Lectura compartida: una lectura en curso, o de hace menos de 3 s, sirve a todos; un fallo no se guarda; `invalidate()` tras escribir. | `src/shared-read.ts` (`SHARED_READ_FRESH_MS`, `sharedRead`, `sharedReads`) |
| Idempotencia: `newIdempotencyKey()` genera una llave (`crypto.randomUUID()`) por operación lógica y `withIdempotencyKey(headers, key?)` pone `Idempotency-Key` salvo que ya venga (sin distinguir mayúsculas). | `src/idempotency.ts:7`, `:10-12` |

Los tipos de respuesta de los cinco dominios principales salen de los OpenAPI vendorizados en
`packages/platform-client/contract/` (`openapi.json` y `billing-v2/`, fijados en `contract/PIN`)
mediante `packages/platform-client/scripts/generate.mjs` → `src/generated/{types,billing,contract}.ts`
(plan front-move 4.2, R2 y R7). **No hay** `createPlatformClient` ni `usePlatform()`: las features
importan los módulos de dominio desde `queries/` (R12 = 0).

### Rutas por dominio

#### identity (`src/identity.ts`, `src/edge.ts`, `src/organizations.ts`)

| Método y ruta | Función | Línea |
|---|---|---|
| `GET /v1/identity/me` | `me`, `fetchIdentityMe`, `sendIdentityMe`, `probeIdentityMe` | `src/identity.ts`: 26, 39-43, 46-51, 65-70 |
| `GET /v1/identity/organizations` | `fetchEdgeOrganizations` | `src/identity.ts`: 81-83 |
| `POST /v1/identity/organizations/select` | `selectOrganization`, `selectOrganizationWithContext`, `selectEdgeOrganization` | `src/identity.ts`: 28-36, 54-62, 86-92 |
| `GET /v1/identity/sessions/catalog` | `fetchSessionsCatalog` (por `danil_edge_fetch`) | `src/identity.ts`: 95-102 |
| `GET /v1/identity/csrf`, `GET /v1/identity/login`, `GET /v1/identity/me`, `POST /v1/identity/logout` | `edgeTransport` (`mutation`), `edgeIdentity` (`loginUrl`, `me`, `logout`) | `src/edge.ts`: 62-67, 96-115 |

`SESSION_ROUTES` (`src/identity.ts:105-110`) y `SHARED_SESSION_READS` (`src/identity.ts:113`: `me` y
`sessions/catalog`) marcan qué rutas no son de una organización y cuáles se comparten en una carga.
El selector tolerante de organización vive en `src/organizations.ts` (`createOrganizationSelection`,
`announcesOrganizations`, `isOrganizationSelectionRequired`).

#### workspaces (`src/workspaces.ts`, `src/workspace-spaces.ts`, `src/space-order.ts`, `src/workspace-assets.ts`)

| Método y ruta | Función o constante | Línea |
|---|---|---|
| `GET /v1/workspaces[?cursor=]` | `workspaces`, `getWorkspaces`, `workspacesPagePath`, `workspaceCatalog`, `sessionWorkspaceCatalog` | `src/workspaces.ts`: 23, 29-39, 67, 74-75 |
| `POST /v1/workspaces/select` | `selectWorkspace` (`{ workspace }`) | `src/workspaces.ts`: 17, 68-71 |
| `/v1/workspaces` (alta), `/v1/workspaces/adopt`, `/v1/workspaces/adopt/challenge`, `/v1/workspaces/promo/redeem` | constantes `WORKSPACES_*_PATH`; el método lo pone quien llama | `src/workspaces.ts`: 16-20 |
| `/v1/workspaces/{account}/transfers`, `/v1/workspaces/transfers/{id}/accept` | `workspaceTransfersPath`, `workspaceTransferAcceptPath` | `src/workspaces.ts`: 57, 59 |
| `/v1/workspaces/{account}/free-router` | `workspaceFreeRouterPath` | `src/workspaces.ts`: 61 |
| `/v1/workspaces/{workspace}/{kind}` (logo, fondo) | `workspaceAssetPath` (contrato `WorkspaceAssetsSource` en `src/workspace-assets.ts`) | `src/workspaces.ts`: 63 |
| `GET` · `POST /v1/workspaces/{workspace}/spaces` | `workspaceSpacesClient`, `workspaceSpacesForEngine`, `readContextSpaces` | `src/workspace-spaces.ts`: 38-54, 57-88 |
| `PATCH /v1/workspaces/{id}` (`settings.space_order`) | `createSpaceOrderSource` (`spaceOrder`, `arrangeSpaces`) | `src/space-order.ts`: 9-29, 32-63 |

#### machines (`src/machines.ts`, `src/capabilities.ts`)

Es el único cliente de máquinas (plan front-move 3.2). `machinesClient(config)` (`src/machines.ts:112`)
usa el `transport` de la web (cookie y CSRF), `getToken` (Bearer) o `fetch` inyectado.

| Método y ruta | Función | Línea | Respuestas que entiende |
|---|---|---|---|
| `GET /v1/machines[?cursor=]` | `list` (sigue `next_cursor`, corta si se repite) | `src/machines.ts`: 176-195 | 200; 404/501 de la colección = `unavailable` |
| `GET /v1/machines/{id}` | `get` | `src/machines.ts`: 197 | 404 = `missing` |
| `POST /v1/machines/{id}/start` | `start`: 202 con `operation` y `Location`, sondea hasta `succeeded`, `failed` o `cancelled` (tope 330 s) | `src/machines.ts`: 204-232 | `409 not_remotely_startable` conserva su código |
| `GET /v1/operations/{id}` | sondeo de `start` (solo ids `[A-Za-z0-9_-]`) | `src/machines.ts`: 167, 219-223 | |
| `POST /v1/machines/{id}/tickets` `{"wake":true}` | `wake`: solo por una acción de la persona; reintenta `503 machine_starting` con la misma `Idempotency-Key` | `src/machines.ts`: 240-250 | sin `wake`, una VM apagada contesta `409 machine_stopped` |
| `POST /v1/machines/{id}/tickets` | `admission`: ticket de un solo uso; la URL tiene que ser `wss://<origen permitido>/v1/machines/{id}/session` | `src/machines.ts`: 253-271, 89-107 | |
| `GET /v1/capabilities` | `CAPABILITIES_PATH`, `capabilitiesUrl`; lectura tolerante en `src/capabilities.ts` (`capabilityList`, `announces`, `mayCall`) | `src/machines.ts`: 20-23; `src/capabilities.ts`: 18-37 | |

Otros códigos: 401 = `unauthorized`, `403 license_required` = `license` (`src/machines.ts:120-128`).
Los relays permitidos son `DEFAULT_RELAY_ORIGINS` (`src/machines.ts:33`). **No hay ruta de apagado**
(`/stop`) en el cliente.

La lista compartida por contexto vive en `packages/features/machines/src/queries/machines-query.ts`
(`machinesQuery`, `contextMachinesQuery`), con 1 petición por carga (`requests.mjs`: `machines=1`).

#### treasury: créditos y facturación (`src/treasury.ts`, `src/billing-route.ts`)

| Método y ruta | Función | Línea |
|---|---|---|
| `GET /v1/credits/balance` | `readCreditsBalance` (Desk), `billingV2().balance`, `scopedCreditsRead` (web, por contexto, 30 s, exige el eco `X-Danil-Session-Applied[-Org]`) | `src/treasury.ts`: 18, 21, 70-74, 110-127 |
| `GET /v1/billing/catalog` | `billingV2().catalog` | `src/treasury.ts`: 64 |
| `GET /v1/billing/organization` | `billingV2().organization` | `src/treasury.ts`: 65-69 |
| `GET /v1/credits/transactions[?cursor=]` | `billingV2().transactions` | `src/treasury.ts`: 75 |
| `POST /v1/billing/checkout-sessions` | `checkout` (`intent: "upgrade"`), `createOrganization` (`intent: "new_organization"`) | `src/treasury.ts`: 76-82 |
| `GET /v1/billing/checkout-sessions/{id}` | `checkoutStatus` | `src/treasury.ts`: 83-87 |
| `POST /v1/credits/purchases` · `GET /v1/credits/purchases/{id}` | `purchase`, `purchaseStatus` | `src/treasury.ts`: 88-93 |
| `POST /v1/billing/portal-sessions` | `portal` | `src/treasury.ts`: 94 |

Las respuestas se validan con `zod` comprobado contra `src/generated/billing.ts` mediante `fits<C>()`
(`src/treasury.ts:30-44`). `billingV2` añade `/v1/` e `Idempotency-Key` en cada escritura (`:59-61`).
El estado de retorno web de `/billing` vive en `src/billing-route.ts`.

#### idempotency (`src/idempotency.ts`)

| Qué | Línea |
|---|---|
| `newIdempotencyKey()`: una llave nueva (`crypto.randomUUID()`) por operación lógica. La usan `edgeUntil` (`src/client.ts:95`) y `wake` de `src/machines.ts` (`:241`), que la guarda para todo su bucle. | `src/idempotency.ts`: 7 |
| `withIdempotencyKey(headers, key?)`: añade `Idempotency-Key` (la de `key` o una nueva) salvo que ya venga en las cabeceras, sin distinguir mayúsculas. La usan `src/credentials.ts:31`, `src/machines.ts:134` y `src/treasury.ts:60`. | `src/idempotency.ts`: 10-12 |

Quien reintenta una escritura guarda la llave y la vuelve a pasar; no hay reintento que estrene otra.

#### credentials (`src/credentials.ts`, `src/account-credentials.ts`, `src/seal.ts`)

`webCredentialSource` (`src/credentials.ts:19-40`) adapta el transporte de la web (cookie y CSRF) a
`CredentialSource` (`src/account-credentials.ts`, movido de `packages/computers` en F4.4). El sellado
WebCrypto (`TERMINUS-SECRET/1`) vive en `src/seal.ts`.

| Método y ruta | Cabecera | Dónde |
|---|---|---|
| `GET /v1/credentials/workspaces/{ws}/accounts` | — | `src/account-credentials.ts:201`, `:209-211` |
| `PUT /v1/credentials/workspaces/{ws}/accounts` | `Idempotency-Key` | `src/account-credentials.ts:219-223` (sellar con `PUT` es solo de Desk, `src/credentials.ts:4`) |
| `DELETE /v1/credentials/workspaces/{ws}/accounts/{credential}` | `Idempotency-Key` | `src/account-credentials.ts:226-228` |
| `DELETE /v1/credentials/workspaces/{ws}/accounts/{credential}/machines/{machine}` | `Idempotency-Key` | `src/account-credentials.ts:231-233` |
| `POST /v1/credentials/workspaces/{ws}/accounts/{credential}/machines/{machine}/restore` | `Idempotency-Key` | `src/account-credentials.ts:236-238` |

Las cuatro escrituras (`PUT`, los dos `DELETE` y `POST …/restore`) mandan la cabecera `Idempotency-Key`:
`putCredential`, `deleteCredential`, `removeCredentialMachine` y `restoreCredentialMachine` aceptan `key`
(el llamador que reintenta pasa la misma) y, si no viene, estrenan una por operación
(`src/account-credentials.ts:219-238`); `call` la pasa a `bearerCall` (`:107-108`) y
`webCredentialSource` la respeta con `withIdempotencyKey` (`src/credentials.ts:31`). Prueba:
`packages/platform-client/test/idempotency.test.ts`.

#### Otros dominios incorporados en F4.4 (`github.ts`, `memory.ts`, `connections.ts`, `audit-log.ts`)

| Módulo | Rutas o contrato |
|---|---|
| `src/github.ts` | `GET`/`DELETE /v1/workspaces/{ws}/github`, `POST …/authorize`, `GET …/installations`, `PUT …/areas`, y `DELETE`/`POST …/restore` sobre `/v1/credentials/workspaces/{ws}/accounts/{cred}/machines/{machine}` (`:162-209`). |
| `src/memory.ts` | `GET /v1/workspaces/{ws}/memory/{files,file,history,log}`, `PUT`/`DELETE …/file` (`:85-155`). |
| `src/connections.ts` | `GET /v1/connections`, `GET /v1/connections/capabilities`, `GET`/`PATCH`/`DELETE /v1/connections/{id}`, `GET /v1/connections/{id}/audit` (`:45-86`, cliente MCP N1 `:122-309`). |
| `src/audit-log.ts` | Contrato de lectura `AuditLogSource` (`AuditEntry`, `AuditActorType`) para `/admin`. |
| `src/api.ts`, `src/machine.ts` | Utilidades `bearerCall`/`apiUrl`/`errorCodeOf`, estados `MachineState` y rutas heredadas `/v1/computers*` aún usadas por Desk mientras se retiran (plan 3.4). |

### Rutas `/v1` escritas fuera de `platform-client` (deuda restante de R11 / 3.4)

Con F4.4 cerrada, `packages/**` ya no importa de `apps/desktop/src/**`, `@terminus/computers` ni
`@terminus/fleet`. Las rutas `/v1` literales que aún quedan fuera de `packages/platform-client` se
reducen a:

| Rutas | Archivos |
|---|---|
| `/v1/computers/{id}/session` (relay heredado, lista negra R8) | `packages/features/machines/src/model/relay-frames.ts:128` |
| `/v1/identity/me` (vía `danil_edge_fetch`) | `packages/session/src/window-session.tsx:151`, `packages/shell/src/shell/account-move.ts` |
| `/v1/identity/*`, `/v1/workspaces/*` en la capa de sesión web | `packages/session/src/` (`web-session-contexts.ts`, `workspace-picker.ts`, `group-account.ts`, `group-promo.ts`, `organizations.ts`, `platform-session.ts`) |
| `/v1/workspaces/preferences` | `packages/shell/src/shell/workspace-added-transport.ts` |

Pasar las rutas restantes a funciones de dominio de `platform-client` y retirar el relay `/v1/computers`
corresponde al plan front-move 3.4.

## 2. Motor RPC1 (`packages/engine-client`)

### «Tus agentes» en la barra lateral

`packages/shell/src/shell/AgentDock.tsx` presenta el catálogo existente sobre
«Tareas», con cinco agentes por página y filtros workspace, carpeta y archivos
del repositorio. Cada icono señala si alguno de sus agentes está `working`,
incluidos los de otras páginas; su etiqueta accesible enumera los nombres.
Seleccionar un origen vuelve a la primera página y conserva el orden por
presencia de `orderDockAgents`; seleccionarlo otra vez muestra todos.
`dockPagination.ts` acota la página cuando disminuye el catálogo.

La actividad corresponde al catálogo de la **carpeta activa**, que obtiene
`sidebar-dock.ts` con `list_agents` y `watchHandlerStatuses`. No agrega agentes
de carpetas o máquinas que no están en ese catálogo. La paginación y los filtros
no añaden RPC ni sondeos. Los AstroAvatar conservan su identidad por nombre
durante los refrescos; los indicadores de origen siguen montados al paginar.
No cambian el tema. El clic inicia la conversación existente; el menú contextual
conserva tareas, perfil y acceso a la administración de agentes.

El consumo del nuevo repositorio de agentes por workspace depende del motor y
del backend correspondientes; este componente no sustituye ni simula esa API.

### Transporte

| Qué | Dónde |
|---|---|
| `invoke(command, args, options)` es el único `invoke` de la ventana: el de Tauri (`@tauri-apps/api/core`), o la ruta por máquina si `setMachineRoute` la puso. | `src/client.ts:1`, `:42-60` |
| Con ruta por máquina, toda orden salvo `list_workspaces`, `workspaces_startup`, `list_workspace_attention` y `service_poll` captura el contexto del workspace. | `src/client.ts:40`, `:58` |
| `untilConnected`: un `engine_down` antes de que haya motor espera la conexión y repite una vez. | `src/client.ts:26-38` |
| `retrying`: 5 esperas (150 a 2.400 ms) si la orden no corrió (`app_unavailable`, `invalid_token`, `service_busy`) o si es una lectura (`list_`, `load_`, `read_`, `get_`, `*_status`) que falló con `io`, salvo `list_storage`. | `src/retries.ts:8-53` |
| `urlDeAvatar`: `preview_file` cacheado por ruta, se vacía con `harness:profiles`. | `src/previewFile.ts` |

La ruta por máquina (relay WebSocket y ticket) **no está en `engine-client`**: la arman
`packages/features/machines/src/queries/router.ts` (con `context-router.ts`, `context-relay*.ts` y
`relay.ts`) y `packages/session/src/window.tsx` sobre el núcleo de flota y relay en
`packages/features/machines/src/model/fleet/` y `packages/features/machines/src/queries/relay.ts`.

Tras F4.4, `engine-client` ya no importa de `apps/desktop/src/lib/`: consume
`packages/session/src/{engineConnection,workspace-context}.ts` y
`packages/ui/src/lib/{taskMentions,errorCode}.ts` (`src/client.ts:2-8`, `src/retries.ts:1`).

### Contrato

- El manifiesto del motor está en `apps/desktop/src-tauri/crates/engine-protocol/commands.json`
  (`rpc_version` 1, 553 comandos y 37 eventos, `source_commit` b40d3499).
- `engine-client` **no se genera de él**: `invoke` recibe el nombre como `string` y el resultado como
  genérico. No hay `contract/`, `src/generated/` ni `CONTRACT_HASH`, y el R7 de `verify-front` pasa
  porque no encuentra `generated/contract.ts` (`scripts/verify-front/r7-r8.mjs`).
- Cliente tipado y generado del manifiesto: **propuesta** (plan front-move 4.2).

### Comandos por paquete

Los nombres literales de `invoke("…")` en `src/` de cada paquete (sin tests), contados con
`grep -rhoE '\binvoke(<[^>]*>)?\(\s*"[a-z_0-9]+"'`. Quedan fuera las llamadas con nombre en variable.
En total son 409 nombres. 333 están en `commands.json` y 76 no aparecen ahí (por ejemplo `window_*`,
`tray_*`, `launcher_*`, `wsl_*`, `guest_*`, `danil_edge_fetch`, `danil_sign_in*`, `task_lifecycle_*`).
Clasificar esos 76 (comandos de la ventana Tauri o del motor sin manifiesto) está **pendiente**.

| Paquete | N | Comandos |
|---|---|---|
| `features/artifacts` | 10 | `artifact_history`, `artifact_read_part`, `download_artifact`, `open_external`, `prepare_print`, `preview_file`, `publications_of`, `read_version`, `record_export`, `restore_version` |
| `features/chat` | 59 | `account_limits`, `add_folder`, `add_repo_url`, `answer_question`, `answer_shell_output`, `ask_side_question`, `attach_repo`, `call_mcp_app_tool`, `cancel_question`, `chat_visual_part`, `close_mcp_app`, `git_host_areas`, `git_host_projects`, `guardar_adjunto`, `guardar_imagen_pegada`, `has_mcp_app`, `inject_message`, `list_accounts`, `list_active_turns`, `list_agents`, `list_integrations`, `list_live_turns`, `list_sources`, `list_spaces`, `list_task_mentions`, `list_workspaces`, `load_queue`, `mcp_login`, `open_external`, `pending_requests`, `prepare_attachments`, `preview_file`, `read_drawio_asset`, `read_mcp_app`, `read_mcp_app_resource`, `reintentar_reanudacion_por_entregas`, `repo_branches`, `respond_permission`, `run_shell_command`, `save_queue`, `send_message`, `service_filter`, `service_poll`, `session_folder`, `set_agent_model`, `set_effort`, `set_permission_mode`, `set_session_model`, `set_session_provider`, `site_sweep`, `sleep_session`, `stop_shell_command`, `tree_open_external`, `tree_show`, `turn_authors`, `window_ready`, `window_vitals`, `workspaces_startup`, `write_shell_input` |
| `features/code` | 44 | `kn_cloud_start`, `kn_cloud_state`, `kn_finish`, `kn_pending`, `kn_status`, `kn_update`, `list_integrations`, `list_task_trees`, `office_preview`, `open_external`, `open_file_external`, `preview_file`, `preview_tree_files`, `preview_tree_folder`, `preview_tree_show`, `site_close`, `site_hide`, `site_open_local`, `site_place`, `site_zoom`, `tree_changes`, `tree_create_file`, `tree_create_folder`, `tree_delete`, `tree_files`, `tree_folder`, `tree_git_status`, `tree_office_preview`, `tree_open_external`, `tree_patch`, `tree_read_part`, `tree_rename`, `tree_show`, `tree_summary`, `tree_typst_export`, `tree_write`, `typst_live_change`, `typst_live_close_doc`, `typst_live_complete`, `typst_live_open`, `typst_live_reveal`, `typst_live_stop`, `unwatch_task_tree`, `watch_task_tree` |
| `features/composer` | 5 | `list_models`, `list_permission_modes`, `list_providers`, `list_slash_menu`, `list_surfaces` |
| `features/machines` | 42 | `account_relay_token`, `danil_connect_status`, `danil_connected_status`, `danil_edge_fetch`, `danil_session_status`, `danil_sessions`, `danil_workspace_account`, `guest_call`, `guest_channels`, `guest_children`, `guest_copy_folder`, `guest_events`, `guest_remove`, `guest_start`, `guest_sync_spaces`, `list_activity`, `list_projects`, `list_spaces`, `list_workspaces`, `machine_list`, `open_external`, `read_activity`, `read_activity_log`, `remove_account`, `state_machines`, `work_cancel`, `work_export`, `work_import`, `work_key`, `work_read_part`, `work_status`, `work_write_part`, `wsl_catalog`, `wsl_connect`, `wsl_distro_user`, `wsl_enable`, `wsl_install`, `wsl_job_dismiss`, `wsl_job_pause`, `wsl_reboot`, `wsl_resume_forget`, `wsl_state` |
| `features/onboarding` | 60 | `account_status`, `add_account`, `add_workspace`, `adopt_system_session`, `cancel_browser_login`, `cancel_google_drive_login`, `cancel_install`, `cancel_login`, `check_google_drive`, `connect_api_key`, `connect_git_host`, `connect_known_mcp`, `discard_account`, `disconnect_git_host`, `disconnect_google_drive`, `disconnect_known_mcp`, `finish_browser_login`, `finish_google_drive_login`, `google_drive_desktop_status`, `google_drive_status`, `install_gh`, `install_google_drive`, `install_google_drive_desktop`, `install_integration`, `install_provider`, `install_size`, `install_zotero`, `list_accounts`, `list_git_hosts`, `list_integrations`, `list_known_mcp`, `list_mcp_providers`, `list_providers`, `list_surfaces`, `list_system_sessions`, `list_workspaces`, `login_account`, `mcp_login`, `open_external`, `open_google_drive_desktop`, `open_zotero`, `provider_download_size`, `remove_account`, `rename_workspace`, `set_active_account`, `set_active_workspace`, `set_google_drive_desktop_use`, `set_integration_enabled`, `set_provider_consent`, `set_workspace_language`, `start_browser_login`, `start_google_drive_login`, `submit_login_code`, `sync_zotero_bibs`, `typst_live_stop`, `uninstall_integration`, `unlink_zotero_bib`, `workspaces_startup`, `zotero_bib_links`, `zotero_status` |
| `features/projects` | 69 | `account_relay_token`, `add_repo_url`, `attach_known_source`, `attachment_preview`, `cancel_project_clone`, `create_agent`, `create_project`, `create_space`, `danil_workspace_account`, `delete_agent`, `delete_memory_entry`, `delete_project`, `detach_session_source`, `detach_source`, `discard_task_changes`, `export_chat`, `finish_task`, `get_project_directory`, `git_host_areas`, `git_host_projects`, `keep_awake_status`, `list_agent_status`, `list_agents`, `list_live_sessions`, `list_memory_entries`, `list_project_repositories`, `list_projects`, `list_source_branches`, `list_sources`, `list_spaces`, `list_task_trees`, `move_session`, `move_task_to_space`, `open_external`, `prepare_attachments`, `preview_file`, `project_base_branches`, `project_clone_status`, `project_setup_command`, `recreate_task_work`, `rename_project`, `rename_session`, `rename_space`, `reuse_project`, `save_agent_declaration`, `save_agent_profile`, `set_agent_avatar`, `set_agent_background`, `set_agent_hidden`, `set_agent_model`, `set_keep_awake`, `set_project_base_branch`, `set_project_setup_command`, `set_project_work_tree`, `set_session_pinned`, `set_session_stage`, `set_source_branch`, `set_space_folders`, `set_task_archived`, `start_project_clone`, `task_blockers`, `task_history`, `task_lifecycle_apply`, `task_lifecycle_preview`, `telegram_disable`, `telegram_set_token`, `telegram_start_pairing`, `telegram_status`, `write_memory_entry` |
| `features/settings` | 155 | `account_credential_delete`, `account_credential_remove_machine`, `account_credential_restore_machine`, `account_credentials_list`, `account_credentials_upload`, `account_limits`, `account_relay_token`, `account_status`, `add_account`, `add_folder`, `add_mcp_servers`, `add_repo_url`, `add_skill_source`, `attach_repo`, `cancel_browser_login`, `cancel_install`, `cancel_login`, `check_environment`, `check_git_host`, `check_integration`, `check_mcp`, `clear_free_router_grant`, `connect_git_host`, `connect_known_mcp`, `danil_account_refresh`, `danil_account_remove_photo`, `danil_account_set_photo`, `danil_connect_start`, `danil_disconnect`, `danil_session_status`, `danil_set_default_account`, `danil_sign_in`, `danil_sign_out`, `danil_workspace_account`, `delete_agent`, `delete_project`, `discard_account`, `disconnect_git_host`, `disconnect_known_mcp`, `env_secret_remove`, `env_secret_set`, `env_secrets_list`, `finish_browser_login`, `free_router_binding`, `get_profile`, `get_project_directory`, `get_radiant_identity`, `git_host_areas`, `git_host_available_areas`, `git_host_projects`, `github_account_authorize`, `github_account_disconnect`, `github_account_installations`, `github_account_status`, `handler_action`, `install_gh`, `install_integration`, `install_language_pack`, `install_provider`, `install_size`, `install_tool`, `list_accounts`, `list_dependencies`, `list_governed_mcp_logins`, `list_integrations`, `list_known_mcp`, `list_language_packs`, `list_local_orchestrators`, `list_machine_agents`, `list_mcp_providers`, `list_mcp_servers`, `list_models`, `list_projects`, `list_providers`, `list_radiant_connections`, `list_radiant_workspaces`, `list_skill_sources`, `list_source_skills`, `list_sources`, `list_surfaces`, `list_workspaces`, `local_orchestrator_connect`, `local_orchestrator_disconnect`, `login_account`, `mcp_login`, `mcp_logout`, `open_external`, `prepare_runtime`, `preview_file`, `prove_free_router_binding`, `radiant_cancel_login`, `radiant_connect_account`, `radiant_govern_disable`, `radiant_govern_enable`, `radiant_govern_refresh`, `radiant_login`, `radiant_logout`, `radiant_select_organization`, `radiant_select_workspace`, `radiant_set_server`, `radiant_status`, `radiant_usage_set_opt_in`, `radiant_usage_status`, `release_free_router_owner`, `remove_account`, `remove_language_pack`, `remove_mcp_server`, `remove_skill_source`, `remove_source`, `remove_workspace`, `rename_project`, `rename_workspace`, `repo_branches`, `restart_app`, `resume_awaiting_quota`, `select_git_host_area`, `service_cancel_update`, `service_poll`, `service_prepare_update`, `set_active_account`, `set_active_workspace`, `set_agent_avatar`, `set_api_key`, `set_free_router_grant`, `set_free_router_union`, `set_integration_enabled`, `set_memory_provider`, `set_profile`, `set_project_directory`, `set_provider_consent`, `set_root`, `set_skill_source_enabled`, `set_source_skill`, `set_workspace_host_github`, `set_workspace_language`, `set_workspace_logo`, `set_workspace_logo_png`, `set_workspace_output_language`, `set_workspace_permission_mode`, `set_workspace_worktrees_root`, `setup_required`, `skill_source_freshness`, `source_detail`, `source_freshness`, `start_browser_login`, `submit_login_code`, `tasks_awaiting_quota`, `typst_live_stop`, `uninstall_integration`, `uninstall_source_skill`, `update_install`, `update_integration`, `update_skill_source`, `update_source`, `workspaces_startup` |
| `features/sites` | 8 | `site_close`, `site_go`, `site_hide`, `site_navigate`, `site_open`, `site_open_external`, `site_place`, `site_reload` |
| `features/task-queues` | 4 | `get_turn`, `queue_resume`, `stop_turn`, `stop_turn_if` |
| `features/threads` | 2 | `load_history`, `load_session` |
| `features/workspaces` | 5 | `list_mentions`, `list_workspaces`, `load_session`, `session_usage`, `set_workspace_source` |
| `shell` | 62 | `account_limits`, `account_request_settle`, `account_request_take`, `account_status`, `adopt_account_workspace`, `adoption_candidates`, `adoption_proof`, `archived_tasks`, `cli_task_opened`, `close_port`, `close_process`, `collect_orphans`, `create_account_workspace`, `danil_edge_fetch`, `danil_session_status`, `danil_sign_in`, `danil_sign_out`, `delete_space`, `empty_build_cache`, `engine_adoption_retry`, `engine_adoption_status`, `engine_update`, `engine_update_status`, `keep_awake_status`, `kn_pending`, `kn_update`, `launcher_continue`, `launcher_state`, `list_accounts`, `list_agents`, `list_delegated_sessions`, `list_live_turns`, `list_ports`, `list_sources`, `list_storage`, `list_workspace_attention`, `list_workspaces`, `machine_list`, `mark_task_seen`, `open_external`, `preview_file`, `quit_completely`, `reclaim_storage`, `request_close`, `reseal_account_workspace`, `restart_app`, `set_active_workspace`, `set_free_router_union`, `set_keep_awake`, `site_open_external`, `source_freshness`, `space_delete_preview`, `stop_task_processes`, `task_coordinator`, `tray_notify`, `tray_update`, `update_install`, `update_pending`, `update_source`, `window_background`, `window_painted`, `window_to_background` |
| `session` | 1 | `danil_sign_in_complete` |
| `platform-client` | 1 | `danil_edge_fetch` |
| `ui` | 5 | `file_size`, `office_preview`, `open_external`, `open_file_external`, `preview_file` |

`features/composer` llama desde `queries/store.ts`; `features/task-queues` desde `queries/engine.ts`.
`conversation-handoff`, `drafts`, `screen`, `service-stream`, `tabs`, `viewers` y `workspace` no
invocan ningún comando. `packages/ui` todavía invoca cinco (deuda de R4).

### Eventos

El manifiesto trae 37 eventos (`events` en `commands.json`). Qué eventos escucha cada feature no está
inventariado aquí: **pendiente**.
