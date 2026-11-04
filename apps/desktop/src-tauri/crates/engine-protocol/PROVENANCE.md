# Contract provenance

RPC1 and `commands.json` were derived from the Terminus engine source
(`danil-labs/harness-app`, commit `96dba061f0db4af915f6d035c8413fbd0fb430fb`,
Apache-2.0); the manifest was regenerated on
`b40d34999d140d30a0e1192ba752b2fdb860dc90`. The generator reads the engine
source and is not part of this repository.

`commands.json`: 553 entries: 370 invocations, 146 CLI routes, 12 RPC routes,
three channels and twenty-two window/bridge functions; 37 events. Names, camelCase parameters, reference Rust
types and literal events are kept.

On 2026-10-19 the contract renamed its two concepts (317 commands, 27 events):
the CLI that runs a turn goes from `agent` to `provider` and the user agent from
`encargado` to `agent`, in command names, parameters, fields and events.
`list_agents` became `list_providers`. The code-hosting family that held that
name is now `git_host`: `list_git_hosts`, `connect_git_host`, `git_host_projects`
and the rest, the `gitHost` parameter, the `git_host` field of sources and
repositories, and `GitHostInfo`. Files on disk keep their keys; the types that
are stored and also travel cross the contract wrapped in `Wire`, which renames
their keys. There are no aliases. This copy is byte-identical to the engine's.
SHA-256:
`5f59d6031b76b0248f09d7e19d184a542259d773c62080a30cb9298e7b5033ca`.

seldon-host `4e21caf` (#66) added the Danil account (321 commands, 28 events):
`danil_connect_start`, `danil_connect_status`, `danil_connect_options`,
`danil_disconnect` and the `danil-connect` event.

seldon-host dev `cb4ae57` merged three additions (328 commands, 28 events).
#69 added `danil_client_token` (no parameters) → `ClientToken`
`{token, expires_at, endpoint, computer_id}`, a ten-minute client token of the
owner account the window uses to reach the other computers. #70 added the person
of the Danil account: `danil_account_refresh`, `danil_account_set_photo`
(`{image}`) and `danil_account_remove_photo`. The `Status` of
`danil_connect_status` gains `account_name`, `avatar` and `avatar_source`, and
`get_profile` gains `display_name`, `account_name` and `avatar`; the manifest
keeps only type names, so those fields do not move the hash. #71 added the chat
background the engine remembers: `chat_background`, `choose_chat_background`
and `import_chat_background_data`, plus the
`settings.appearance.background.not_imported` key.

seldon-host `feat/workspace-danil-link` adds workspaces synced with the
computer's own Danil account and the chat background per workspace (332
commands, 28 events): `danil_workspace_link_status`, `danil_workspace_link`
(`{mode?: "owner"}`: always the machine's account) and
`danil_workspace_unlink` (each with an optional `workspace`), and
`set_chat_background` (`{preset, path, dataUrl, veil}`); `chat_background`,
`import_chat_background` and `import_chat_background_data` act on the
workspace of the envelope. There are no other accounts: no device code per
workspace and no `danil-workspace-link` event. This copy is the engine's
manifest byte for byte (seldon-host `1687dbf`).

seldon-host dev `09b5dfd` (#74) makes the workspace the account's, with the
same id on every machine (335 commands, 28 events): `materialize_workspace`,
`ensure_project` and `sync_workspace`; `add_workspace`, `create_project` and
`clone_project` take an optional `id`, and `chat_background` answers `null`
when the workspace has no background of its own. This copy is the engine's
manifest byte for byte (seldon-host dev `09b5dfd`).

seldon-host dev `7569120` (#75) clones from the relay (337 commands, 29
events): `start_project_clone` (the parameters of `clone_project` without its
channel) answers `{operation}` and clones in the background,
`project_clone_status` (`{operation}`) gives the last event of that clone or
`null`, and the `project_clone` event carries `{workspace, operation, phase,
percent, done}` plus `project` or `error` at the end. This copy is the
engine's manifest byte for byte (seldon-host dev `7569120`).

seldon-host dev `9bd80c1` (#76, #77, #79) keeps the same manifest: the engine of
a VM uses the connector's credential, removing an account waits for the CLI that
holds its home, and while the computer is signed in to Danil every workspace is
linked to the account. Pinned in `seldon-runtime.lock` as
`seldon-runtime-v0.2.73-9bd80c1`.

seldon-host `feat/danil-session-per-account` (`658cad2`) keeps one Danil
session per account on a computer, and each workspace belongs to one account
(341 commands, 30 events): `danil_sessions` → `[SessionInfo]`,
`danil_set_default_account` (`{account}`), `danil_workspace_account`
(`{workspace?}`) → `{account, email, signed_in, linked}` and
`danil_workspace_set_account` (`{workspace?, account}`, plus `error?`), and the
`danil-sessions` event. `danil_connect_start` gains `accountHint` and `add`;
`danil_disconnect`, `danil_client_token`, `danil_account_refresh` and
`danil_account_remove_photo` take an optional `account`, and
`danil_account_set_photo` `{image, account?}`. This copy is the engine's
manifest byte for byte; no `seldon-runtime` with it is published yet.

seldon-host `feat/carry-work-1-export-import` (#84, `4870085`) carries work between
machines (347 commands, 30 events): `work_status` (`{project, task?}`),
`work_export` (`{project, task?, operation, includeWork, exclude, files,
full}`; the transfer id is the client's `operation`), `work_read_part`
(`{transfer, offset, size}`), `work_write_part` (`{transfer, offset, data}`),
`work_import` (`{transfer, project, sha256, bytes, probe?, branchAs?}`) and
`work_cancel` (`{transfer}`); `send_message` and `run_shell_command` take
`unwrapSnapshot`. The `work.error.*` keys come from the same branch
(seldon-host docs/carry-work.md).

seldon-host `feat/carry-work-3-no-remote` (#86, `43f9787`) creates a project without
remote from a full bundle (347 commands, 30 events): `work_import` takes
`create` (`{name, id}`).

seldon-host `feat/carry-work-4-sealed` (#87, `c30e399`) seals transfers for the
destination engine (348 commands, 30 events): `work_key` (no parameters) →
`{publicKey}` and `work_export` takes `recipientKey`; `work.error.bad_key` and
`work.error.sealed_open_failed`.

The source is `crates/engine-protocol/commands.json` in `danil-labs/danil-engine`
(here, seldon-host `c30e399` on `feat/carry-work-4-sealed`). The engine pinned in `seldon-runtime.lock` must
announce this same hash as its `contract`; the `contract` guard
(`scripts/guards/contract.mjs`) compares the three.

`phrase-keys.json`: the catalog keys the engine sends as `Frase` values, taken
from the engine source at `fdf4dd9863a80363a0dd7b15ea21fd6b69e1f4bd`. The 24
`providers.*` keys for GitLab, `providers.error.other_host`, and each host's
`summary` and `vocabulary` come from seldon-host `34ebefa`
(`feat/gitlab-git-host`). The eleven `danil.error.*` keys come from seldon-host
`4e21caf`; `danil.error.not_connected`, `image_too_large`,
`unsupported_image`, `unauthorized` and `unsupported` from `cb4ae57` ([connector.md](https://github.com/danil-labs/danil-engine/blob/dev/docs/connector.md)).
`settings.appearance.background.workspace_missing` comes from `1687dbf`, where
`settings.appearance.background.too_big` also became 700 KB.
`danil.error.account_not_found` comes from `658cad2`.
`chat.steer.delivered` comes from `d2266ae` (`fix/mandar-ahora-sin-atoros`).
`mcp.known.notion.requires` and `mcp.known.notion.after` come from `31774ed`
(`feat/notion-mcp-conocido`).

seldon-host `feat/onboarding-engine` (`8f32a29`, `21f5687`) and
`feat/google-drive-integration` (`b831eeb`, rebased on them) add what the
onboarding needs (354 commands, 32 events). Installs: `cancel_install`
(`{operation}`) and `install_size` (`{operation}`), with `operation` one of
`provider:<id>`, `plugin:<id>`, `tool:<id>` or `google-drive`, and the `install`
event `{operation, kind, done, bytes, failure}`; `prepare_runtime` takes an
optional `skip`, uv and Python become optional stages and `remove_tool` accepts
pnpm, bun, agent-browser, uv and python. Accounts: `list_system_sessions`,
`adopt_system_session` (`{provider}`) and `connect_api_key`
(`{provider, key}`). Google Drive through the engine's own rclone:
`google_drive_status`, `install_google_drive`, `start_google_drive_login`,
`finish_google_drive_login`, `cancel_google_drive_login`, `check_google_drive`,
`disconnect_google_drive` and `remove_google_drive`, plus the `google-drive`
event and the `settings.google_drive.*` keys. This copy is
`git show b831eeb:crates/engine-protocol/commands.json` byte for byte.

seldon-host `feat/google-drive-desktop` (`0774f28`, #95) adds Google Drive
through Google's own desktop app on Windows and macOS (357 commands, 32
events): `google_drive_desktop_status` (no parameters) → `{supported,
installed, running, mounts: [{email, path}], installer_bytes}`,
`install_google_drive_desktop` and `open_google_drive_desktop` (no
parameters), the `google-drive-desktop` operation for `cancel_install`,
`install_size` and the `install` event, and the
`settings.google_drive_desktop.*` keys. Linux keeps the rclone commands. This
copy is `git show 0774f28:crates/engine-protocol/commands.json` byte for byte.

seldon-host `feat/modelos-locales` (on dev `41b51c3`, which adds
`google_drive_desktop_status`, `install_google_drive_desktop` and
`open_google_drive_desktop`) adds the local model the tasks use: `set_active_local_model` (`{id}`). The `ModelState` items of
`list_local_models` gain `kind`, `memory`, `machine_memory`, `fits`,
`recommended` and `active`; `install_local_runtime` reports through the
`install` event and is cancelled with `cancel_install`, operation
`local-runtime`; the manifest keeps only type names, so those do not move the
hash.

seldon-host `feat/install-disk-space-check` refuses an install that does not
fit on disk without changing `commands.json`: `common.install.no_space` with
`needed` and `free` in bytes, in the rejection or the `install` event's
`failure`, and as the `no_space` note of `prepare_runtime`.

seldon-host #100 (`ecc364d`, on dev `666f4ac`, which leaves the contract as
`55c729b` had it) adds "Use this computer's GitHub" per workspace (366
commands, 32 events): `set_workspace_host_github` (`{id, enabled}`) →
`Wire<Workspace>`, the `host_github` field of `Workspace` (off by default and
kept on this computer only) and the `providers.github.host_mode.*` keys. Open
sessions pick up the change on their next turn. This copy is
`git show ecc364d:crates/engine-protocol/commands.json` byte for byte.

seldon-host `feat/tarea-vacia` (`3274de5`) lets a task be born empty, without a
turn, to create a file or a folder from the preview before writing to the agent
(367 commands, 32 events): `create_empty_session` (`{provider, project, title,
baseRef?, agent?, space?}`) → `{session, folder}` does what the first
`send_message` does to prepare the task and its working copy (a worktree from
`baseRef` with git, the task's kn copy without git), without a turn. `title` is
provisional: the person's first `send_message` on that task replaces it. This
copy is `git show 3274de5:crates/engine-protocol/commands.json` byte for byte.

seldon-host `integration/plan-multi-machine` (`5b8f29a`: dev with #106, #110,
#108 and #113) is the contract of the multi-machine plan (367 commands, 32
events). #106 and #110 annotate every command without changing any name or
signature: `ids` says which arguments are workspace or account ids, which the
engine checks against the relay envelope and the session's account
(`workspace_mismatch`); `relay: false` refuses a command through the relay
(`set_active_workspace`: the open workspace belongs to each window); and
`scope: "machine"` lets 41 commands run through the relay only for the default
session (else `command_not_allowed` with `{command, scope: "machine"}`). A
relayed call without a workspace answers `command_failed`. #108 adds
`sync_workspace_memory` and removes `retire_memory_entry`.
`create_empty_session` is unchanged apart from `scope: "workspace"`. This copy
is `git show 5b8f29a:crates/engine-protocol/commands.json` byte for byte; no
`seldon-runtime` with it is published yet.

seldon-host `fix/carpetas-nuevas-en-documentos` (`8cb37ac`) adds an optional
`directory` to `create_project` (`{name, workingDirectory?, space?, id?,
directory?}`): where a folder created from scratch is born when the person picks
a location other than the workspace default. Without it nothing changes. The
same commit makes that default the person's Documents folder
(`<Documents>/Terminus`) instead of one inside the engine's data.

seldon-host dev `340fe91` (#119) folds heavy and ignored folders in the task
tree (369 commands). `tree_folder` (`{project, session, tree, path, offset}`)
and `preview_tree_folder` (`{project, path, offset}`) → `PaginaDeCarpeta`
`{paths, folders, next, total}` give one level of a folded folder, 300 entries
per page. `CarpetaDelArbol` gains `lazy` and `ignored`; the manifest keeps only
type names, so those fields do not move the hash. This copy is
`git show 340fe91:crates/engine-protocol/commands.json` byte for byte.

Endpoint, selection and StreamPage extend the transport; they do not convert
domain data. The token travels in RPC1 only between authenticated local
processes, read from a protected file; it is never handed to the webview.

seldon-host `feat/mcp-oauth-terminus` moves the «don't use» choice for Google
Drive for desktop from the window to the engine, which tells agents which
drives they can use: new `set_google_drive_desktop_use` (`{used}`) and
`DesktopStatus.unused`. 368 commands, 32 events.

seldon-host `feat/referencias-zotero-mendeley` (`3fbe495`, merged with dev `3464f3d`, #120) connects the person's reference libraries (377 commands, 33 events). Zotero, on this machine: `zotero_status` → `{installed, running, version, local_api, installer_bytes}` (`local_api`: `ready`, `disabled` when Zotero's local API is off, `unsupported` for Zotero 6, `unavailable` when Zotero does not answer), and `install_zotero` and `open_zotero` with `scope: "machine"`; `install_size` and `cancel_install` take `"zotero"` and progress goes through the `install` event. Mendeley, in the cloud with the workspace's account: `mendeley_status` → `{app_installed, configured, connected, account, signing_in}`, `mendeley_login` → `{url}`, `cancel_mendeley_login` and `disconnect_mendeley`, all with `{workspace?}`. New event `references` (`{workspace, library, ok, failure}`). This copy is `git show 3fbe495:crates/engine-protocol/commands.json` byte for byte; no `seldon-runtime` with it is published yet.

seldon-host `fix/referencias-solo-zotero` (`66321d9`, on dev `c693504`) removes Mendeley: References keeps only Zotero (373 commands, 32 events). `mendeley_status`, `mendeley_login`, `cancel_mendeley_login`, `disconnect_mendeley` and the `references` event (only the Mendeley login published it) are gone. This copy is `git show 66321d9:crates/engine-protocol/commands.json` byte for byte; no `seldon-runtime` with it is published yet.

seldon-host `fix/zotero-busqueda-y-bib-vinculado` (`83d6d51`, on dev `15d08e7`) lets a project `.bib` follow Zotero (376 commands, 32 events): `zotero_bib_links` and `sync_zotero_bibs` (no parameters) → `Vec<VinculoBib>` (`{archivo, coleccion?, ids?, sincronizado?, fallo?}`) and `unlink_zotero_bib` (`{path}`), all with `scope: "workspace"` on the current workspace. This copy is `git show 83d6d51:crates/engine-protocol/commands.json` byte for byte; no `seldon-runtime` with it is published yet.

seldon-host `feat/account-spaces` shares spaces through the Danil account (377 commands, 32 events, on dev with the Zotero `.bib` links): new `share_space` (`{id}`) → `Space`, which publishes an existing space to the workspace's account so every machine keeps it with the same id; `Space` gains `account` (shared). Spaces created in a workspace linked to its account are shared from birth; spaces that existed before stay on their machine. This copy is that branch's `commands.json` byte for byte; no `seldon-runtime` with it is published yet.

seldon-host `feat/deferred-actions` (`0c867e2`, on dev with `feat/account-spaces`) marks the five light task actions the Danil Machines relay may queue while the machine is off with `deferrable: true`: `set_task_archived`, `delete_session`, `rename_session`, `set_session_pinned` and `move_task_to_space` (377 commands, 32 events; no signature changes). They must match `DEFERRED_COMMANDS` in `packages/computers` and in the danil-labs/computers relay.

seldon-host dev `e567260` merges the Danil account's credentials (#145) and GitHub in the account (#144), on top of the chat visuals by parts (391 commands, 32 events). Credentials, all with `scope: "workspace"` on the request's workspace: `account_credentials_list` → `{credentials, recipients, local_only: [{slot, kind, provider, label, hint, upload_error?}]}`, `account_credentials_upload` (`{slots}`) → `{uploaded, failed: [{slot, error}]}`, `account_credential_delete` (`{credential}`), and `account_credential_remove_machine` / `account_credential_restore_machine` (`{credential, computer}`) → the credential; `sync_account_credentials` and `reseal_account_credential` are for the connector. GitHub: `github_account_status`, `github_account_authorize`, `github_account_installations`, `github_account_set_areas`, `github_account_disconnect` and `github_account_changed`. Errors are `credentials.error.<code>`. This copy is `git show e567260:crates/engine-protocol/commands.json` byte for byte; no `seldon-runtime` with it is published yet.

The `feat/activity-logs` engine (`3e7748f`) extends dev `714e4c1` with four workspace-scoped invocations (`run_activity_command`, `list_activity`, `read_activity`, `read_activity_log`) and the `activity` event (395 commands, 33 events). All earlier command descriptors are unchanged. This copy matches the engine manifest byte for byte. Maintenance output is persisted outside task sessions and is read in bounded pages.

The window snapshot is byte-identical to seldon-host dev `437a280`,
`crates/engine-manifest/commands.json`. It includes durable pending revisions,
handler approvals and quarantine routes. The public projection in
engine-protocol `e3199a5` is for the CLI and is not the window manifest.
A compatible published engine remains required before a desktop release.

seldon-host `release/train-2026-10-30` (`b8e7fcd`) adds the four admin CLI routes
`executor release status|stage|activate|rollback` (553 entries; invocations,
events and the other routes unchanged). The window invokes none of them. This
copy is `git show b8e7fcd:crates/engine-manifest/commands.json` byte for byte; no
`seldon-runtime` with it is published yet.

Handler and peer error keys come from the CLI catalogs at seldon-host
`437a280` (`crates/terminus-cli/src/messages.{es,en}.json`); the window completes
the Spanish translations. Pending error codes come from that engine
(`runtime/chat/durable_pending.rs`) and use window-authored ES/EN phrases.

## Extensions (outside the hash)

`extensions/*.json` are byte copies of seldon-host
`crates/engine-manifest/extensions/`. They hold additive engine commands that
do not enter the compatibility hash (decision of 2026-10-29 on additive
commands). `commands.json` and its SHA-256 do not change when an extension does.
The window dispatches extension commands like contract ones; an engine without
them answers that the command is unknown, and only that feature turns off.

- `orchestrators.json`: external orchestrators (remote connections, `task result`)
  and orchestrators on this machine (`local_orchestrator_connect`,
  `list_local_orchestrators`, `local_orchestrator_disconnect`), from
  seldon-host PR #239.
- `engine_update_v1.json`: remote engine update (`engine_update_status`,
  `engine_update`), feature `engine_update_v1`, from seldon-host PR #252
  (`feat/engine-update` 7318646).
- `machine_usage_v1.json`: usage per task (`stop_task_processes`, the
  `machine-usage` event and the additive `machine_resources` fields), feature
  `machine_usage_v1`, from seldon-host PR #255 (`feat/machine-usage` 8c2ad2b).
- `secrets_v1.json`: generic secrets (`env_secret_set`, `env_secret_remove`,
  `env_secrets_list`, `secret run`), from seldon-host PR #240 at
  `30b22f9c` (unchanged at `5a1b1d8e`), SHA-256
  `2ae19484093d481df8ded327eff1a2504bee138bca4a5109a0ec7baae3239c11`.
- `artifact_parts_v1.json`: `artifact_read_part`, the bytes of a sealed artifact
  version in parts, so a window downloads a document from a task on another
  machine (seldon-host `feat/artifact-read-part`).
