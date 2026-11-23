# API que consume el front

Qué pide el front de Danil al borde `/v1` y al motor (RPC1), tal como está **hoy** en `dev`
(después del merge 09e6ca7b de `rebuild/move`). Cada afirmación cita su archivo; lo que no está
construido dice **propuesta**. Regla R16 de
[03-structure.md](https://github.com/danil-labs/terminus-workspace/blob/main/docs/plans/2026-11-20-front-rebuild/03-structure.md).

El front es uno: `packages/shell` + `packages/features/*`, compilado desde `apps/desktop`.
- Desk (ventana Tauri): `apps/desktop/index.html:81` carga `packages/shell/src/app/main.tsx`.
- Web: `apps/desktop/web.html:467` carga `apps/desktop/src/web/bootstrap.ts` (`pnpm -C apps/desktop web:build`).

No existen `apps/workspace`, `apps/auth` ni `apps/desk`, aunque `pnpm-workspace.yaml` y el script
`front:build` del `package.json` raíz los nombran.

## 1. Borde `/v1` (`packages/platform-client`)

### Transporte

| Qué | Dónde |
|---|---|
| Desk llama al borde con el comando RPC1 `danil_edge_fetch`: el token lo pone Rust, nunca JS. | `src/client.ts:1-6`, `:81-86` |
| `edgeUntil` reintenta **404, 429, 501 y 503** con backoff (×2, tope 60 s, respeta `retry_after_ms`) y repite la misma `Idempotency-Key` en las escrituras. Un 404 con `code` `not_found` o `*_not_found` no se reintenta. | `src/client.ts:31-34`, `:45`, `:92-122`; la llave sale de `newIdempotencyKey` (`:95`) |
| `cancelEdgeWrites()` aborta las escrituras en curso al cambiar de organización o workspace. | `src/client.ts:25-28`; lo llaman `selectOrganization` (`src/identity.ts:28-29`) y `selectWorkspace` (`src/workspaces.ts:68-69`) |
| Web: `platformFetch` añade `X-Danil-Session` (el grupo activo, `setEdgeContext`) a toda ruta `/v1/` con organización. | `src/client.ts:142-164` |
| Rutas sin organización (no llevan `X-Danil-Session`). | `contextFree`, `src/client.ts:131-140` |
| Lectura compartida: una lectura en curso, o de hace menos de 3 s, sirve a todos; un fallo no se guarda; `invalidate()` tras escribir. | `src/shared-read.ts` (`SHARED_READ_FRESH_MS`, `sharedRead`, `sharedReads`) |

**No hay** `createPlatformClient`, `usePlatform()`, `src/http.ts`, `contract/openapi.json` ni `src/generated/`.
Los tipos de respuesta están escritos a mano en cada dominio (`Me`, `Workspace`, `Machine`…).
Generar el cliente del OpenAPI de `danil-contracts` es **propuesta** (plan front-move 4.2, R2 y R7).

### Rutas por dominio

#### identity (`src/identity.ts`)

| Método y ruta | Función | Línea |
|---|---|---|
| `GET /v1/identity/me` | `me`, `fetchIdentityMe`, `sendIdentityMe`, `probeIdentityMe` | 26, 39-43, 46-51, 65-70 |
| `GET /v1/identity/organizations` | `fetchEdgeOrganizations` | 81-83 |
| `POST /v1/identity/organizations/select` | `selectOrganization`, `selectOrganizationWithContext`, `selectEdgeOrganization` | 28-36, 54-62, 86-92 |
| `GET /v1/identity/sessions/catalog` | `fetchSessionsCatalog` (por `danil_edge_fetch`) | 95-102 |

`identity.ts` ya no escribe `GET /v1/identity/sessions`, `POST /v1/identity/contexts` ni
`GET /v1/identity/login`: la web los pide desde `apps/desktop/src/web/` y `packages/computers/src/edge.ts:100`
(ver la deuda de R11 más abajo). `SESSION_ROUTES` (105-110) y `SHARED_SESSION_READS` (113: `me` y
`sessions/catalog`) marcan qué rutas no son de una organización y cuáles se comparten en una carga.

#### workspaces (`src/workspaces.ts`)

| Método y ruta | Función o constante | Línea |
|---|---|---|
| `GET /v1/workspaces[?cursor=]` | `workspaces`, `getWorkspaces`, `workspacesPagePath` | 21, 33, 40-41 |
| `POST /v1/workspaces/select` | `selectWorkspace` (`{ workspace }`) | 12, 34-37 |
| `/v1/workspaces` (alta), `/v1/workspaces/adopt`, `/v1/workspaces/adopt/challenge`, `/v1/workspaces/promo/redeem` | constantes `WORKSPACES_*_PATH`; el método lo pone quien llama | 11-15 |
| `/v1/workspaces/{account}/transfers`, `/v1/workspaces/transfers/{id}/accept` | `workspaceTransfersPath`, `workspaceTransferAcceptPath` | 23, 25 |
| `/v1/workspaces/{account}/free-router` | `workspaceFreeRouterPath` | 27 |
| `/v1/workspaces/{workspace}/{kind}` (logo, fondo) | `workspaceAssetPath` | 29 |

#### machines (`src/machines.ts`)

Es el único cliente de máquinas (plan front-move 3.2). `machinesClient(config)` (149) usa el
`transport` de la web (cookie y CSRF), `getToken` (Bearer) o `fetch` inyectado.

| Método y ruta | Función | Línea | Respuestas que entiende |
|---|---|---|---|
| `GET /v1/machines[?cursor=]` | `list` (sigue `next_cursor`, corta si se repite) | 213-232 | 200; 404/501 de la colección = `unavailable` |
| `GET /v1/machines/{id}` | `get` | 234 | 404 = `missing` |
| `POST /v1/machines/{id}/start` | `start`: 202 con `operation` y `Location`, sondea hasta `succeeded`, `failed` o `cancelled` (tope 330 s) | 241-269 | `409 not_remotely_startable` conserva su código |
| `GET /v1/operations/{id}` | sondeo de `start` (solo ids `[A-Za-z0-9_-]`) | 204, 256-260 | |
| `POST /v1/machines/{id}/tickets` `{"wake":true}` | `wake`: solo por una acción de la persona; reintenta `503 machine_starting` con la misma clave | 277-287 | sin `wake`, una VM apagada contesta `409 machine_stopped` |
| `POST /v1/machines/{id}/tickets` | `admission`: ticket de un solo uso; la URL tiene que ser `wss://<origen permitido>/v1/machines/{id}/session` | 290-309, 126-144 | |
| `GET /v1/capabilities` | `CAPABILITIES_PATH`, `capabilitiesUrl` | 18-21 | |

Otros códigos: 401 = `unauthorized`, `403 license_required` = `license` (157-165). Los relays
permitidos son `DEFAULT_RELAY_ORIGINS` (75). `retryUnavailable` (313-323) reintenta `unavailable`
desde 5 s hasta 5 min. **No hay ruta de apagado** (`/stop`) en el cliente.

La lista compartida por contexto vive en `packages/features/machines/src/queries/machines-query.ts`
(`machinesQuery`, `contextMachinesQuery`). La regresión `machines=2` medida al fusionar en dev está en
el registro del plan (front-req-1).

#### treasury: créditos y facturación (`src/treasury.ts`)

| Método y ruta | Función | Línea |
|---|---|---|
| `GET /v1/credits/balance` | `readCreditsBalance` (Desk), `billingV2().balance`, `scopedCreditsRead` (web, por contexto, 30 s, exige el eco `X-Danil-Session-Applied[-Org]`) | 6, 12, 54-58, 94-111 |
| `GET /v1/billing/catalog` | `billingV2().catalog` | 48 |
| `GET /v1/billing/organization` | `billingV2().organization` | 49-53 |
| `GET /v1/credits/transactions[?cursor=]` | `billingV2().transactions` | 59 |
| `POST /v1/billing/checkout-sessions` | `checkout` (`intent: "upgrade"`), `createOrganization` (`intent: "new_organization"`) | 60-66 |
| `GET /v1/billing/checkout-sessions/{id}` | `checkoutStatus` | 67-71 |
| `POST /v1/credits/purchases` · `GET /v1/credits/purchases/{id}` | `purchase`, `purchaseStatus` | 72-77 |
| `POST /v1/billing/portal-sessions` | `portal` | 78 |

Las respuestas se validan con `zod` (15-28). `billingV2` recibe el transporte de la web y añade el `/v1/`.

#### idempotency (`src/idempotency.ts`)

| Qué | Línea |
|---|---|
| `newIdempotencyKey()`: una llave nueva (`crypto.randomUUID()`) por operación lógica. La usan `edgeUntil` (`src/client.ts:95`) y `wake` de `src/machines.ts`, que la guarda para todo su bucle. | 7 |
| `withIdempotencyKey(headers, key?)`: añade `Idempotency-Key` (la de `key` o una nueva) salvo que ya venga en las cabeceras, sin distinguir mayúsculas. La usan `src/credentials.ts:30`, `src/machines.ts` y `src/treasury.ts`. | 10-12 |

Quien reintenta una escritura guarda la llave y la vuelve a pasar; no hay reintento que estrene otra.

#### credentials (`src/credentials.ts`)

`webCredentialSource` (18-39) adapta el transporte de la web (cookie y CSRF) a la `CredentialSource`
de `@terminus/computers`. **Las rutas no están aquí**: las escribe `packages/computers/src/credentials.ts`.

| Método y ruta | Dónde |
|---|---|
| `GET` · `PUT /v1/credentials/workspaces/{ws}/accounts` | `packages/computers/src/credentials.ts:203`, `:211-212`, `:221-225` (sellar con `PUT` es solo de Desk, `src/credentials.ts:4`) |
| `DELETE …/accounts/{credential}` | `packages/computers/src/credentials.ts:228-229` |
| `DELETE …/accounts/{credential}/machines/{machine}` · `POST …/restore` | `packages/computers/src/credentials.ts:233-234`, `:238-239` |

Las cuatro escrituras (`PUT`, los dos `DELETE` y `POST …/restore`) mandan la cabecera `Idempotency-Key`:
`putCredential`, `deleteCredential`, `removeCredentialMachine` y `restoreCredentialMachine` aceptan `key`
(el llamador que reintenta pasa la misma) y, si no viene, estrenan una por operación
(`packages/computers/src/credentials.ts:221-239`); `call` la pone en `init.headers` (`:109-110`) y
`webCredentialSource` la respeta con `withIdempotencyKey` (`src/credentials.ts:30`). Prueba:
`test/idempotency.test.ts`.

### Rutas `/v1` escritas fuera de `platform-client` (deuda de R11)

Salen de `grep` sobre `packages/` y `apps/desktop/src` (sin tests). Pasarlas a su dominio es
**propuesta** (plan front-move 3.4).

| Rutas | Archivos |
|---|---|
| `/v1/computers*`, `/v1/connections*` (lista negra R8) | `packages/computers/src/api.ts`, `connections.ts`, `machine.ts`; `packages/features/machines/src/screens/account.tsx` |
| `/v1/workspaces/{id}/github*`, credenciales por máquina | `packages/computers/src/github.ts:162-208` |
| `/v1/workspaces/{id}/memory` | `packages/computers/src/memory.ts`, `packages/features/projects/src/queries/memory-account.ts` |
| `identity/csrf`, `identity/logout`, `identity/me` | `packages/computers/src/edge.ts` |
| `/v1/machines` | `packages/fleet/src/fleet.ts`, `packages/features/machines/src/queries/{cloud-machines,danil-source}.ts`, `src/model/machine-info.ts`, `packages/features/settings/src/components/DanilAccount.tsx` |
| `/v1/workspaces…` | `packages/host/src/platform.ts`, `packages/features/settings/src/queries/free-router-session.ts`, `packages/shell/src/shell/workspace-added-transport.ts` (`workspaces/preferences`) |
| `/v1/identity/me`, `credits/balance` | `packages/shell/src/shell/account-move.ts`, `packages/session/src/platform-session.ts` |
| `identity/*`, `workspaces/promo/redeem` | `apps/desktop/src/web/` (`account.ts`, `organizations.ts`, `organization-context.ts`, `web-session-contexts.ts`, `workspace-picker.ts`, `group-account.ts`, `group-promo.ts`, `BillingPage.tsx`, `auth/workos.tsx`) |

## 2. Motor RPC1 (`packages/engine-client`)

### Transporte

| Qué | Dónde |
|---|---|
| `invoke(command, args, options)` es el único `invoke` de la ventana: el de Tauri (`@tauri-apps/api/core`), o la ruta por máquina si `setMachineRoute` la puso. | `src/client.ts:1`, `:42-60` |
| Con ruta por máquina, toda orden salvo `list_workspaces`, `workspaces_startup`, `list_workspace_attention` y `service_poll` captura el contexto del workspace. | `src/client.ts:40`, `:58` |
| `untilConnected`: un `engine_down` antes de que haya motor espera la conexión y repite una vez. | `src/client.ts:26-38` |
| `retrying`: 5 esperas (150 a 2.400 ms) si la orden no corrió (`app_unavailable`, `invalid_token`, `service_busy`) o si es una lectura (`list_`, `load_`, `read_`, `get_`, `*_status`) que falló con `io`, salvo `list_storage`. | `src/retries.ts:8-53` |
| `urlDeAvatar`: `preview_file` cacheado por ruta, se vacía con `harness:profiles`. | `src/previewFile.ts` |

La ruta por máquina (relay WebSocket y ticket) **no está en `engine-client`**: la arman
`packages/features/machines/src/queries/router.ts` (con `context-router.ts` y `context-relay*.ts`) y `apps/desktop/src/web/window.tsx` con
`RelaySession` (`@terminus/computers`) y `Fleet` (`@terminus/fleet`).

`engine-client` importa `apps/desktop/src/lib/{engineConnection,taskMentions,workspace-context,errorCode}.ts`
(`src/client.ts:2-8`, `src/retries.ts:1`).

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
