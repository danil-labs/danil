# The window and the engine

Danil has two processes:

- **The window** (this repository): a Tauri app with a SolidJS front. It draws
  the interface, hosts native site views, local images, dialogs, clipboard and
  the client updater.
- **The engine** (`seldon-runtime`): a proprietary binary by Danil. It owns the
  domain: workspaces, projects, tasks, agent turns, accounts, credentials and
  plugins. Its source is not in this repository. Development builds download it
  pinned by version and SHA-256 (`seldon-runtime.lock`, `scripts/engine.mjs`).

The window never runs the domain itself. Every `invoke` that is not a window
function travels to the engine over RPC1.

Las [visualizaciones del chat](chat-visuals.md) usan el selector reservado
`terminus-chat-visuals` de `tree_show`, sin agregar un comando al contrato.
La ventana captura el workspace de esa lectura mediante un header IPC local
y el proxy lo coloca en el sobre RPC1 existente. La lectura segura de archivos
y las instrucciones nativas del agente pertenecen al motor.

La [integración de GitHub](github.md) usa los comandos existentes de proveedores,
`check_environment` e `install_gh`. El motor añade `githubCli` al reporte de
entorno; la ventana anterior ignora ese inventario opcional. Su distribución
requiere actualizar el motor fijado en `seldon-runtime.lock`.

`list_providers` puede incluir `external_install_url` para proveedores cuya app
oficial se instala por separado. Onboarding y Configuración abren ese enlace,
omiten `install_provider` y vuelven a consultar la disponibilidad después de
`check_environment`. La ventana acepta respuestas sin ese campo. ZCode requiere
un motor que lo anuncie en `list_providers`; estos cambios de interfaz no actualizan
el motor fijado en `seldon-runtime.lock`.

La cuenta de Danil (Configuración → Cuenta de Danil) usa `danil_connect_start`,
`danil_connect_status`, `danil_connect_options`, `danil_disconnect` y el evento
`danil-connect` (seldon-host#66, [connector.md](https://github.com/danil-labs/seldon-host/blob/dev/docs/connector.md)). Iniciar sesión registra
esta computadora en la cuenta: con un workspace de Harness entra sin navegador;
sin él, la ventana abre `verification_uri_complete` y la persona aprueba en
`alfa-app.danil.ai/connect` (antes `app.danil.ai/terminus/connect`, que
ahora redirige allí). Un motor sin estos comandos recibe `command` del
proxy y la sección lo dice. El campo editable del alta y de la página de
aprobación es el nombre de **esta computadora**, no el de la cuenta.

La web (`alfa-app.danil.ai`) no ofrece Harness: ni la sección de
Configuración, ni su gobierno en las pantallas, ni la elección «De mi
organización» al crear el espacio (`capabilities().radiant`, solo en el
escritorio). Harness se conectará con Danil Machines, no con cada ventana;
el escritorio lo conserva por ahora (2026-10-21).

La persona de la cuenta (nombre, correo, foto) sale del motor:
`danil_connect_status` trae `account_name`, `avatar` (ruta de la foto guardada
en la máquina, pintada con `preview_file`) y `avatar_source`;
`danil_account_refresh`, `danil_account_set_photo` y `danil_account_remove_photo`
la vuelven a pedir o cambian la foto **en la cuenta** (seldon-host#70). El pie
de la barra lateral y la sección la muestran. La web no tiene la sesión de
máquina (`danilAccount`); con `accountProfile` (`src/web/account.ts`) lee y
cambia la misma persona en el plano de control con la sesión de Supabase.

Una sesión de Danil por cuenta (decisión del 2026-10-21, seldon-host
`feat/danil-session-per-account`): la computadora tiene una sesión por cuenta
y cada workspace es de una sola cuenta, con la que se sincroniza y en ninguna
otra. Configuración → Cuentas de Danil (`DanilAccount.tsx`) lista
`danil_sessions` (foto, nombre, correo, esta computadora en esa cuenta, en
línea, cuántos workspaces, «Principal») y sigue el evento `danil-sessions`;
«Agregar otra cuenta» es `danil_connect_start {add: true}` con el mismo código
del navegador, «Usar como principal» `danil_set_default_account` y «Cerrar
sesión» `danil_disconnect {account}`. En Workspaces, la tarjeta del abierto
tiene «Cuenta de este workspace» (`WorkspaceAccount.tsx`, chunk aparte):
`danil_workspace_account` y `danil_workspace_set_account`, con
`workspace_id_taken` y `danil.error.account_not_found` en castellano. El pie
de la barra lateral muestra la cuenta del workspace abierto. El escritorio con
cuenta (`features/machines/account.tsx`) pide el token de cliente de esa
cuenta (`account_relay_token {account}` → `danil_client_token {account}`) y
solo ve sus computadoras y su registro; cambiar a un workspace de otra cuenta
reinstala el abanico. La lógica sin Solid vive en
`features/settings/danil-sessions.ts`. Con un motor sin `danil_sessions`
todo vuelve a la cuenta única: la tarjeta de siempre, sin sección por
workspace, y el abanico con `danil_connect_status`. `danil_workspace_link`,
`danil_workspace_unlink` y `danil_workspace_link_status` siguen sin interfaz
(`SIN_INTERFAZ` en `scripts/guards/commands.mjs`). La web, el teléfono y
las otras computadoras vistas desde aquí solo muestran los workspaces de
`workspaces` en cada fila de `GET /v1/computers` (`@terminus/computers`,
`linkedWorkspaces`); sin el campo (un plano de control anterior) no se filtra.
El relay ya rechaza el resto con `workspace_not_linked`. La web vuelve a listar
las computadoras cada diez minutos y al volver a la pestaña, así que un
vínculo nuevo aparece sin recargar.

Para probarlo contra el motor nuevo antes de su release: compila
`seldon-runtime` en seldon-host (`cargo build --release -p seldon-runtime`),
cópialo con `node scripts/engine.mjs download --from <ruta>` y abre el
laboratorio con `node scripts/engine.mjs start`. Las pruebas de `pnpm verify`
usan motores simulados y no lo necesitan.

El fondo de los chats también es del workspace: `chat_background` se lee al
abrirlo (`lib/chat-background-engine.ts`) y Estilo lo guarda con
`set_chat_background` (patrón y velos siempre; la imagen por su copia importada,
y se quita con `choose_chat_background` sin ruta). Solo viaja la ruta de la
copia recién importada en el workspace abierto; la de otro workspace se olvida
al cambiar, y un workspace sin nada elegido vuelve al patrón por defecto. Un
motor que no conoce `set_chat_background` (`command`) recibe
`choose_chat_background` solo con esa copia, o sin ruta si la persona quitó la
imagen. La web no tiene rutas: la imagen va como `dataUrl` en
`set_chat_background` (el relay no deja pasar `import_chat_background`), con el
tope del motor, 700 KB.

Cada llamada por el relay va con el workspace que nombran sus argumentos
(`workspace`, o un `scope` de texto distinto de `pending`; `callWorkspace` en
`@terminus/computers`): el relay rechaza con `workspace_mismatch` una llamada
cuyos argumentos nombran otro workspace que el suyo.

## Contract

`src-tauri/crates/engine-protocol/commands.json` is the frozen contract: 354
commands and the 32 events the engine emits. Its SHA-256 is recorded in
[PROVENANCE](../src-tauri/crates/engine-protocol/PROVENANCE.md); the engine
announces the same hash and the window refuses to connect to a different one
(`version_mismatch`). `phrase-keys.json` lists the catalog keys the engine sends
so the window can translate them.

Keep `commands.json` byte-exact: `.gitattributes` checks it out with LF on every
platform, and a CRLF copy has a different hash.

### Extensión `provider_handoff_v1`

Cambiar de CLI (Claude, Codex, OpenCode) dentro de una tarea normal
(seldon-host#304, [provider-handoff.md](https://github.com/danil-labs/seldon-host/blob/dev/docs/provider-handoff.md)).
La extensión
`crates/engine-manifest/extensions/provider_handoff_v1.json` se copia byte a
byte en `src-tauri/crates/engine-protocol/extensions/` y se registra en
`EXTENSIONS`; queda fuera de la huella de compatibilidad (`status.contract`).
El motor la anuncia en `status.service_features`; el cliente la reconoce con
`PROVIDER_HANDOFF_FEATURE` (`@terminus/protocol`).

- `set_session_provider {project, session, provider}` es una función de ventana
  con autoridad `admin`. `provider` es el CLI de la tarea (`Session.agent`), no
  el proveedor del modelo: en un turno, ese otro eje viaja como
  `model_vendor` (`provider` de disco renombrado por el motor). No confundirlo
  con `set_agent_model`.
- El comando no cambia el turno en marcha: deja un consentimiento de un solo
  uso para el siguiente turno, que abre una sesión nueva con la conversación
  como texto o retoma la sesión aparcada con lo que pasó desde entonces.
- `load_session` suma `can_hand_over` y `hand_over_blocked`. El segundo solo
  aparece cuando hay rechazo y trae la clave del catálogo que lo explica
  (`chat.handover.busy`, `.handler`, `.adopted`, `.fork`, `.subagent`,
  `.unsupported`, `.child`, `.stale`, `.unknown_provider`). `can_hand_over` no
  mira si hay un turno corriendo —eso cambia mientras se mira—, así que el
  rechazo por ocupada lo decide el comando. Un motor anterior no manda
  `can_hand_over`: `canHandOver()` lo normaliza con `=== true`, así que
  ausente es que la tarea no puede cambiar.
- `chat.handover.child` solo aplica a una tarea con `parent` real, creada por
  otra tarea. En este `dev`, `create_parallel` y `build_handoff` ponen
  `parent: None`, así que sus hijas no entran por esa clave; una tarea cuyo
  único vínculo es `launched_by` sigue pudiendo cambiar de CLI.
- `chat.handover.stale` es un consentimiento que ya no aplica y hay que volver
  a elegir; `chat.handover.unknown_provider`, un CLI que esta tarea no ofrece.
- `chat.continuation.provider_locked` sigue siendo el aviso de los casos que no
  cambian en esta versión: encargados, subagentes, forks, tareas adoptadas y
  clientes anteriores.

## Starting the engine

Opened without arguments (a double click), the window uses the engine that
ships with it: `seldon-runtime` next to the window executable, packaged as
`bundle.externalBin` on every platform. Its `--resource-dir` is the
installation's resource folder, the one Tauri's `resource_dir()` names (the
executable's folder on Windows, `Contents/Resources` on macOS), where the
bundled language packs (`lenguas/`) and the bundled work tools (`work-tools/`)
live. Inside an AppImage those resources are copied out of the mount first,
because the engine outlives the window (see below).

### Bundled work tools

`work-tools/<target>/` holds the prepared tree the engine runs in place:
`manifest.json` (schema 2, `layout: "tree"`), `inventory.json`,
`browser-navigation.json` (Chrome metadata only), `licenses/` and
`<tree>/{git,python,uv,ripgrep,agent-browser,computer-use}`. `inventory.json`
is `{schema, files, symlinks}`; `inventory_sha256` is the sha256 of its exact
bytes and `<tree>` is the first 12 hex of that digest. The tree is never rewritten: a new version
is a new folder name. `scripts/work-tools.py` builds it from the pins in
`resources/work-tools/<target>/pins.json`; see
[development](development.md#bundled-work-tools).

- **macOS:** two trees in the universal app, one per architecture, under
  `Contents/Resources/work-tools/`. Their Mach-O files are signed in place
  before the app is signed and notarized.
- **Windows:** NSIS installs the tree per user in
  `%LOCALAPPDATA%\Terminus\work-tools\<target>\<tree>\`. The build fails if a
  path would pass `MAX_PATH` under a 32-character profile name. The engine
  removes older sibling trees once nothing uses them; a real uninstall runs
  `RMDir /r` on `work-tools`.
- **Linux AppImage:** the resources travel in `usr/share/Terminus/` (with a
  copy of `lenguas/`), where linuxdeploy neither deploys dependencies nor
  patches an ELF. The mount changes on every start, so the window copies
  every resource (`lenguas/` and `work-tools/`) to
  `<root>/resource-versions/<key>/` and passes that as `--resource-dir`. `<key>`
  is the sha256 of `resources-inventory.json`, the build-time inventory of all
  resources. The copy checks every byte once, keeps relative symlinks and
  executable bits, and ends by writing `ready` (its content is the key). Later
  starts only read that marker. `selection.json` there keeps the current and
  the previous key; any other copy is removed only when no engine holds a
  shared lock on its `ready` file. Copies from 0.2.89 and earlier have no
  `ready` and are left alone.

A release build uses the identity `ai.danil.terminus` and passes
`--production-identity`. Its data root is the one 0.2.74 used,
`<local data>/ai.danil.terminus`; what belongs to the window lives beside it,
in `<local data>/ai.danil.terminus-window/` (`window/`,
`selection.json`, `engine-launch.log`, `launch.lock`), never inside the data
root.

The lab uses `ai.danil.seldon.dev`: a debug build, or any build with
`TERMINUS_LAB_ROOT` (an absolute folder) or `TERMINUS_LAB_IDENTITY` (any
identity except `ai.danil.terminus`). Then everything lives under one root:

| Path under `<local data>/ai.danil.seldon.dev/` (or `TERMINUS_LAB_ROOT`) | What it is |
|---|---|
| `engine/` | the engine's `--data-dir` (its log is `engine/host.log`) |
| `resource-versions/` | inside an AppImage, one verified copy of the bundled resources per build (`resources/` for builds without `resources-inventory.json`) |
| `window/` | the window's `window_data` (log and webview storage) |
| `selection.json` | the selection the window builds |
| `engine-launch.log` | the engine's stdout and stderr when the window starts it, plus one line per launch: on Windows, whether the window and the engine are in a Job Object and whether breakaway was accepted |
| `launch.lock` | held while a window looks for or starts the engine |
| `engine-mark.json` | size and times of the engine binary when its SHA-256 for `engine.json` was computed |

`<local data>` is `%LOCALAPPDATA%` on Windows, `~/Library/Application Support`
on macOS and `$XDG_DATA_HOME` (or `~/.local/share`) on Linux. The engine always
gets that lab identity: it never reads the data or the keychain entries of
`ai.danil.terminus`. Its keychain names derive from that identity.

With `launch.lock` held, the window also takes the start lock it shares with
the `terminus` CLI (below), so a window and a terminal never start two engines
on one root. Then it asks the engine named by `engine/seldon-endpoint.json` for
its `status`, whatever its contract (`request_any_contract`). If its
`data_directory` is this root (both canonical) and it speaks the contract of
the engine that travels with this window, the window connects to it, whoever
started it: another window, the CLI or a previous session; two windows share
one engine. That contract may differ from the window's own: contract changes
are additive, so, as with remote machines, a different hash is not a reason to
refuse an engine; only a real `version_mismatch` from a command is. The window
learns the bundled engine's contract the first time it starts it and keeps it
in `bundled-contract.json` beside the window data, with the size and times of
the binary; when the binary changes it learns it again, and until then it
compares with its own contract, as before. An engine that does not speak the
bundled contract is from the previous version, and one whose binary was
replaced is handled as in [Updating on Windows](#updating-on-windows): the
window reopens the previous window or waits for its tasks; it never uses the
engine's own handoff. The engine the window has just started is always taken,
even if its contract differs from the window's.

If nothing answers, the window does not trust a probe: the engine holds
`seldon-runtime.lock` in the data root exclusively for as long as it lives, so
the window opens it without creating it and tries to lock it, as the engine's
`running()` does. Held means an engine is starting, closing or saturated: the
window keeps probing every half second for up to 5 minutes and does not start
another one; then it fails with `service_busy` (`reason: root_locked`). A
descriptor that is not private (`invalid_token`) with the root held fails at
once. Free means no engine: the window starts the packaged engine, waits up to
5 minutes for a descriptor written by that process while it stays alive (a
rejection or crash ends the wait at once; a startup that checks many account
files can take more than 30 seconds on a loaded machine), ten minutes with
`--adopt-existing`: adopting a real 0.2.74 root took about 25 s, and the
handoff screen shows that step meanwhile), and writes `selection.json`. If the
binary is missing, the error is `engine_missing`; if it exits or does not
answer, `engine_start_failed`. The startup notice then names the folder with
the logs and links the 0.2.74 release, whose data the engine never touched.

### `engine.json` for the CLI

Each time it selects an engine, the window writes its profile into the
person's `engine.json`, so `terminus` in a terminal knows which binary and
which root to use without a window:

- Windows: `%APPDATA%\terminus\engine.json`; macOS and Linux:
  `$XDG_CONFIG_HOME/terminus/engine.json` or `~/.config/terminus/engine.json`.
- A release writes the profile `desktop`; the lab writes `desktop-lab`.
- Other profiles (`host` from `install.sh`, `vm` from `remote-host`) and
  unknown fields are kept. Only `desktop` takes `default`, and only when it is
  missing or names a profile that does not exist.
- A file of another `version` or that is not JSON is left as it is. Connecting
  fails closed while its service authority cannot be resolved.
- Any profile with `managed: true` or a service command string and the same canonical data root gives
  process ownership to its supervisor, even when it is not `default`. The
  window preserves that profile and does not overwrite an alias of its root.
  Missing/null/false means unmanaged, as in the CLI; malformed profiles block
  connection and publication while their authority cannot be resolved.
- The write is atomic (temporary file and rename) under
  `locks/engine.json.lock`, and only when the profile changed.

```json
{
  "version": 1,
  "default": "desktop",
  "profiles": {
    "desktop": {
      "engine": "C:\\Users\\<user>\\AppData\\Local\\Terminus\\seldon-runtime.exe",
      "sha256": "<SHA-256 of that binary>",
      "data_dir": "C:\\Users\\<user>\\AppData\\Local\\ai.danil.terminus",
      "resource_dir": "C:\\Users\\<user>\\AppData\\Local\\Terminus",
      "identity": "ai.danil.terminus",
      "production": true,
      "managed": null
    }
  }
}
```

`engine` is the binary the window starts (the stable copy inside an AppImage).
Paths are canonical, without `\\?\` on Windows. The SHA-256 is computed again
only when the binary's size or times change (`engine-mark.json`). The start
lock is `<same folder>/locks/<sha256>.lock`, where `<sha256>` is the lowercase
hex SHA-256 of the canonical data root in UTF-8; a root that does not exist
yet is its deepest existing ancestor, canonical, plus the rest, as the CLI
computes it. Both take it with the same primitive (`LockFileEx` over the whole
range on Windows, `flock` on Unix). It is best effort: the window
waits up to 5 minutes for it and, without it, the root lock still stops a
second engine.

## Handoff from 0.2.74

On macOS, each new engine launch can hand the vault master to a signed engine
through an inherited pipe, after a noninteractive keychain read. This is gated
by the engine's `--help` advertising `--master-fd`; an older engine keeps its
existing behavior. See [the macOS QA scenarios](master-fd-qa.md) for the gates
and native validation that remains required.

Before starting the engine, the window looks at the data root. If it holds
0.2.74 data and no `seldon-authority.json`, or a 0.2.74 service answers on it,
the window opens on the handoff screen instead of the app
(`src-tauri/src/extracted/launcher.rs`, `src/features/shell/Launcher.tsx`). It
does the same when the engine refuses with `cli.error.adoption_required`
(0.2.74 opened the root again, or the app moved). After the person accepts:

1. While the 0.2.74 window is open (the parent of its service, with the same
   executable), it waits: with its window open, a stopped 0.2.74 service comes
   back. On macOS the window cannot see that parent and infers it when a
   stopped service reappears.
2. It asks each 0.2.74 service for `service stop` only when its `status` shows
   no turns; the service refuses with `task_busy` while any is live. Nothing
   is killed.
3. It waits for Git (`gc.pid`, `tmp_pack_*`), then starts the engine through
   the same search-or-start with `--adopt-existing`.

If the engine refuses, the screen shows the code, `engine-launch.log` and how
to go back to 0.2.74, which opens the same data root once the engine stops.
Inside an AppImage the engine is copied to `window/engine/` first, since the
AppImage mount disappears with the window.

With the engine running, a 0.2.74 window on the same root stays blank: it
writes `app_unavailable` to `logs/Terminus.log` every few seconds. The window
watches that file and shows a notice while it keeps growing.

## Selection

Labs and tests start the window with `--external-host <absolute path to selection.json>`.
The selection names the engine `endpoint` descriptor, the `credential` (token
file), `runtime`, `data_directory`, `contract`, `service_build` and
`window_data`, the window's own private folder (log and webview storage). The
window checks the engine's `status` against these values before opening.

Selection, credential and window folder must belong to the current user only:

- Unix: owned by the process user, mode `0600`/`0700`, a single link, opened
  without following symlinks.
- Windows: owned by the user's SID, a DACL that grants access only to that
  user, SYSTEM and Administrators, a single link and no reparse point (symlink
  or junction). A file created from an elevated session is owned by
  Administrators and is rejected.

The window's own folders (the root beside the data, `window/`) get a protected
DACL with the user alone when they inherit anything wider, as the engine does
with its private paths: `%LOCALAPPDATA%` can grant Modify to others (the Codex
sandbox gives it to `CodexSandboxUsers`). `selection.json` is created inside
and inherits only the user.

`window_data` must be separate from the engine's data directory. A startup
error is printed to stderr as a catalog key (for example
`cli.error.invalid_token`). When nobody reads stderr (a double-click launch:
no terminal, file or pipe), a native notice explains it with the `es`/`en`
catalog in the system language before the webview exists. The window title
shows the runtime, version and build that `status` reports, and changes when
the window restarts or adopts another engine.

## RPC, events and channels

`terminus-engine-client` (`src-tauri/crates/engine-client`) does not depend on
Tauri. It keeps RPC1, the 16 MiB frame limit, correlated `request_id`,
camelCase arguments and `{value}/{error}` replies. A `pending` operation is
polled with the same `request_id`; a failure after sending stays uncertain and
is not resent under another identity.

Each call captures the workspace selected by the window. `service_poll` reads
`service events` with cursor, gap and replay. An engine that refuses
connections answers `shell.service.engine_down` with detail `engine_down`,
which the front does not retry; the app shows it two seconds after the first
failed poll. `service stream start/read/cancel`
carries `clone_project`, `list_session_git` and `watch_task_tree`; the window
rebuilds only the Tauri `Channel`.

Closing the window hides it and keeps the client running in the background,
including before the front mounts. A persistent tray icon opens the window,
shows live tasks or an unknown status when the read fails, and offers explicit
exit. macOS also handles Dock/Reopen. Repeated close requests never stop tasks;
the saved `close.live_turns` preference is retained and ignored.

Explicit exit uses the connected client's native transport, independently of
the visible workspace or machine. With live turns it offers cancel, background,
or stop and quit. Failed listing or cancellation leaves the client open and
shows the error inside the dialog. Exit closes the client without stopping its
engine. Before the front is ready, explicit exit only detaches the client.

The engine retains its own lifecycle. A normal engine can stop after five
minutes without clients or work; that timeout never cancels active turns. The
resident mode implemented separately in seldon-host is opt-in and observable
as `status.resident`; an absent field does not establish residency. A hidden
window is not an installed or supervised service.

For a root declared `managed`, the window waits up to five minutes for a
compatible private descriptor. It never launches, stops, retires, force-updates
or adopts that engine. Incompatibility and invalid service configuration are
errors. After an external restart it validates the new descriptor, credential,
contract and runtime, rebuilds its client selection and returns `reset: true`
to resynchronize. It does not replay uncertain mutations. Reconnection does not
consume the launch retry budget.

For an unmanaged root, a window started without arguments uses the same
search-or-start after engine loss, at most three times in ten minutes. Reusing
an engine leaves `selection.json` untouched when its content is the same.
External selections reconnect only when their exact data root is explicitly
managed; otherwise their existing external lifecycle remains in charge.

## Preparación del servicio de macOS sin ventana

El mismo ejecutable firmado admite `--background-host` antes de inicializar
Tauri o reenviar comandos al CLI. Es un wrapper en primer plano para launchd:
lanza un solo hijo sin detach, entrega la maestra existente mediante un pipe
privado y permanece hasta recogerlo. No consulta ni crea otra identidad.

Este recorrido exige la instalación firmada en `/Applications` o
`~/Applications`, la identidad `ai.danil.terminus` y su raíz de datos ya
existente y privada. Resuelve el home por UID, sin usar `HOME`, `XDG_CONFIG_HOME`
ni variables de laboratorio heredadas para elegir la raíz. La configuración
activa `~/.config/terminus/engine.json` debe declarar `managed` para esa raíz y
coincidir en identidad, binario, SHA-256 y recursos. Un motor ya vivo conserva
su autoridad: el wrapper no lo detiene, adopta ni reemplaza.

Antes de leer la maestra del llavero, verifica su propia firma, la firma del
motor instalado, los metadatos estáticos de `agent-context --json` y la firma
dinámica del PID realmente lanzado con el requisito completo del motor. El
llavero se consulta sin interacción y solo para una maestra existente. El hijo
exige `--resident --require-master-fd --expected-contract <hash>` y rechaza
contratos distintos antes de leer el pipe o escribir datos. No hay fallback al
llavero ni adopción en ese modo. El descriptor y `status` deben acreditar al
hijo propio y la residencia dentro de cinco minutos; si no, el wrapper termina
y recoge únicamente ese hijo. Las señales se reenvían al hijo, con plazo de
cierre de treinta segundos antes de terminarlo.

`--prepare-background-host <directorio-absoluto-nuevo>` valida estos requisitos
y escribe **solo en ese directorio** un `engine.json` propuesto y
`ai.danil.terminus.background-host.plist`. Conserva los otros perfiles y campos
desconocidos; rechaza autoridades administradas en conflicto. No escribe la
configuración real, no copia nada a `Library/LaunchAgents`, no cambia bundles y
no ejecuta `launchctl`. Tampoco obtiene la maestra durante la preparación.

El plist propuesto es un LaunchAgent de la sesión Aqua del usuario:
`RunAtLoad=true`, `KeepAlive.SuccessfulExit=false`, `ThrottleInterval=30`,
`ExitTimeOut=45` y `AbandonProcessGroup=false`. Una parada normal conserva
salida cero; un fallo permite relanzamiento. El motor estricto anuncia
`safe_maintenance_restart_v1`; `service stop` con `restart:true` solo se acepta
sin trabajo activo y devuelve 75 después de la limpieza. El wrapper propaga ese
código. No solicita mantenimiento automáticamente ni modifica el updater.

La instalación y activación siguen fuera de este incremento. Requieren una
composición con contratos compatibles, QA firmado nativo de llavero, pipes,
launchd y continuidad sin ventana, y coordinación de actualización del bundle,
su huella y supervisor. Este LaunchAgent no promete servicio antes de iniciar
sesión ni después de cerrarla. La integración permanente mediante
[SMAppService](https://developer.apple.com/documentation/servicemanagement/smappservice)
queda pendiente; la semántica del plist sigue el
[manual de launchd](https://github.com/apple-oss-distributions/launchd/blob/main/man/launchd.plist.5).

This change does not install or activate services. Production macOS activation
still requires the same existing root, identity, authority and vault; a signed
launcher must deliver the master through a private pipe on every independent
restart, without a new master or interactive fallback. Native signatures,
keychain access, menu-bar status, CmdQ and reopen require macOS QA.

## Stream empujado

Con un motor que anuncia `push_stream_v1` en `status.service_features`
(seldon-host#52, contrato en
[push-stream-contract.md](https://github.com/danil-labs/seldon-host/blob/dev/docs/push-stream-contract.md)), el
cliente deja de abrir una conexión TCP por petición:

- Hasta cuatro conexiones persistentes para peticiones, con varias en vuelo por
  conexión, correlacionadas por `request_id`. Cada conexión nueva comprueba que
  la selección, el descriptor y la credencial no cambiaron antes de mandar el
  token, y pregunta `status` por ese mismo socket; el par de un socket abierto
  no cambia. La selección se vuelve a comprobar cada 5 s y, si cambió, se
  cierran todas las conexiones.
- Una conexión aparte para `service subscribe`, que reconecta con espera
  creciente (100 ms a 2 s) y reanuda desde su cursor. `resync_required` o un
  marco `resync` se entregan como `gap`, la misma relectura que el sondeo.
- `service_poll` espera en Rust hasta 20 s a lo empujado y devuelve `push: true`
  con los lotes en `batches`; el front los reparte en orden a los mismos oyentes
  (`src/lib/serviceEvents.ts`) y vuelve a llamar enseguida.
- `service_filter` fija las tareas cuyo flujo token a token interesa (pestañas,
  la abierta, las vivas y `liveThreads`); de las demás solo llegan inicio y fin.
  Un `catchup` reemplaza lo vivo de la tarea que pasa a verse.
- `load_history` abre una tarea con sus últimos 150 turnos (`service history`) y
  el hilo pide la página anterior al llegar arriba.

Sin la marca, la ventana sondea `service events` cada 250 ms y abre las tareas
con `load_session`, como antes; Configuración sondea así siempre.

## Live Typst view

The window serves the seven window functions of the contract: `site_open_local`,
`site_zoom` and the `typst_live_*` family (`src-tauri/src/extracted/typst_live.rs`).
For each task tree the window runs one `tinymist lsp` and shows its preview as a
native site limited to `127.0.0.1:<port>`. The engine resolves the folder, the
main file and the binary (`tree_typst_target`); the window never starts
Tinymist with a path from the webview. On Windows a Job Object kills the
Tinymist processes if the window dies.

## Updating on Windows

Windows does not overwrite a running `.exe`, but it renames one. The installer
(`src-tauri/windows/hooks.nsh`) renames `terminus.exe` and `seldon-runtime.exe`
to `old_*` and writes the new ones, so the open window and its engine keep
working. The template's step that closes Danil only runs on a real
uninstall; an installer replacing the copy runs the uninstaller in place
(`_?=$INSTDIR`), and that run also sets the files aside. The app does not use
`downloadAndInstall`, which exits on Windows: `update_install` downloads with
the plugin's signature check and runs the installer with `/S /UPDATE`.

`update_pending` reports when this window's image was set aside and the new
`terminus.exe` is already in its place, whether the app or a manual installer
did it, and the front asks for a restart. A manual installer that finds
Danil open shows the same notice and ends there, instead of running a second
window from its finish page. `restart_app` from a window running from `old_*`
opens the installed `terminus.exe`, not itself.

The installer sets the window and the engine aside with one prefix
(`old_`, or `old_<tick>_` when one of those names is still taken), and it
and the window delete `old_*.exe` only when no set-aside engine is left: a
window binary stays on disk while the engine of its contract runs.

The old version keeps working whole until its tasks finish, and the new one
comes in whole afterwards; a window and an engine of different versions are not
mixed. On the next start, an engine running from `old_seldon-runtime.exe` gets
`service stop`; one of this contract that refuses keeps working and the new
window uses it. An update usually changes the contract, and an engine that does not speak the
contract of the bundled engine is from the previous version: the window asks
it for `status` and `service stop` (`request_any_contract`) and stops it as
soon as it has no turns, downloads or operations. While it is working, the new window opens the window
set aside with the same prefix as that engine, with no arguments (an older
build rejects arguments it does not know), stops answering as the single
instance so the old one does not show it instead, and exits. The old window
connects to its own engine and shows its update notice. If that binary is
missing or exits within 2 s, and on macOS and Linux, where the update replaces
the bundle or the AppImage in place and nothing is set aside, the new window
mounts and shows a notice: how many tasks the previous version is finishing,
and «Detener y entrar ya», which says how many tasks will be cut off and, once
confirmed, asks the previous engine for `service stop` with `{"force": true}`:
an engine that knows it writes those tasks to `update-resume.json`, stops
their turns like Stop, and exits; the new engine resumes each one in its own
provider session with an `engine_updated` line. An engine older than that
ignores `force` and refuses with `task_busy`; the window then terminates its
process, as the uninstaller does, and those tasks do not resume on their own.
Without a click the window keeps asking and comes in when the engine is free.
Then the window deletes the `old_*` files no one holds, retrying for a few
seconds while the window it replaces exits.

A window that runs from `old_*` (Windows) keeps its engine: it does not stop
it when it has no work, does not take an engine of another version and does
not start the installed one (`window_replaced`); at startup that error opens
the installed window instead. Any other open window checks every 15 s whether
the live engine was replaced and, once that engine has no turns, downloads or
operations, asks it for `service stop`. The next `service_poll` starts the
installed engine. The update notice says how many tasks the old engine is
still running and offers to stop them and restart. A replaced engine is one
running from `old_*` on Windows, from a deleted binary or an AppImage copy
that differs from the bundled one on Linux, and from a path other than the
bundled engine on macOS. The Linux and macOS checks have not been tried on
those systems.

## Not done yet

- The engine is pinned for the four platforms and bundled on all of them. The
  published installers were tried on Windows 11, macOS 15.8 (Apple silicon)
  and Linux, updating from 0.2.74 with real data (#60). The macOS universal
  bundle carries a `lipo` of the two pinned macOS binaries.
- The engine still installs, updates and removes the Typst plugin, while the
  window runs its Tinymist. Settings stops every live view before touching the
  plugin (`typst_live_stop`); moving the plugin into the window is planned in
  seldon-host.

## Handler policy and durable decisions

The handler profile reads memory and requested access through the local
`handler_action` facade (`src-tauri/src/extracted/handler_policy.rs`). Its
closed request type permits only `handler list`, `handler requests`,
`handler approve`, `handler revoke` and `handler release`. The RPC envelope
captures workspace and folder, including an empty folder; the engine's
private native credential supplies authority. These routes are not relayed.
The machine router rejects web and other-machine destinations before calling
the facade. Approval hints and quarantine release require explicit input.

The facade checks the exact route in engine capabilities and follows a durable
mutation receipt until completion or a bounded timeout. Errors retain their
code and structured detail. A timeout retains the operation id when received;
an uncertain initial delivery is not automatically retried. A pending receipt locks
further mutations for the captured handler scope while the window remains open,
including closing and reopening its panel. The resume action only reads
`operation show`; it rejects receipts for other workspaces, folders or commands.

Permission events trigger a reread of `pending_requests`. The window restores
only the live permissions list, keeps durable id and revision, and sends both
when answering. Question answers also reread the matching request. A stale
permission response refreshes the pending state without automatically approving
it. If a failed decision disappears from the live list, its durable record and
transport error remain in the conversation diagnostic; absence is not delivery.
The native window still authenticates as the legacy administrative client;
this update does not register a new client principal.

The desktop CLI forwards `task create --as peer|worker` arguments unchanged to
the bundled engine executable. Rank semantics and negotiation of `peer_rank_v1`
belong to that CLI and engine; the window does not derive rank from parent ids.
The contract snapshot comes from seldon-host `b8e7fcd`. Its compatible engine
release is not pinned yet: `MOTOR_PENDIENTE` preserves the publication block.

`handler list` describes memory configuration, not effective turn availability.
External slots are shown as declarations; grants come separately from requests.
The window does not infer an effective memory store from either view.
