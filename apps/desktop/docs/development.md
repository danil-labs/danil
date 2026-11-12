# Development

La marca visible es Danil. La instalación y compatibilidad de `danil` y `dn`
están en [danil-cli.md](danil-cli.md). El empaquetado conserva `Terminus` y
el binario `terminus` para actualizar las instalaciones existentes.

## Daily loop

```sh
pnpm install
pnpm dev                 # Vite only: the front in a browser, without Tauri or engine
pnpm window:build        # debug window with the front embedded
pnpm engine:start        # engine with throwaway data + window
```

The window embeds `dist/` (feature `extracted-client`, on by default), so after
changing the front run `pnpm window:build` again, then `node scripts/engine.mjs
window` to open another window against the running engine.

`scripts/engine.mjs` commands:

| Command | What it does |
|---|---|
| `download [--from <path>]` | Downloads the engine pinned in `seldon-runtime.lock` and checks its SHA-256, or copies a local binary |
| `sidecar` | Places the pinned engine in `src-tauri/binaries/` for `bundle.externalBin` (on macOS both architectures and their `lipo`); Rust builds need it, and `beforeDevCommand`, `beforeBuildCommand` and `pnpm verify` run it |
| `engine` | Starts the engine with data under `.engine/lab/` and identity `ai.danil.seldon.dev` |
| `select` | Asks the engine for `status` and writes a private `selection.json` |
| `window [--window <path>]` | Opens the window against that selection |
| `start` | `engine`, `select` and `window` |
| `status`, `stop` | Engine status; stop the engine when it has no work |

All commands accept `--lab <dir>` to use another lab folder. The engine's log is
`engine.log` in the lab, the window's stderr is `window.err`.

The lab drops every `SELDON_*`, `TERMINUS_*` and `DANIL_*` variable of the calling
shell, so it never signs in with the machine's real Danil credential. The one
exception is a `DANIL_COMPUTERS_URL` pointing at `localhost`, `127.0.0.1` or `[::1]`,
for a local fake control plane.

On a machine with little memory, limit Rust parallelism:
`CARGO_BUILD_JOBS=2 pnpm window:build`.

After `pnpm build`, `node tests/helpers/zcode-provider-ui.mjs` checks external
provider installation, account gating and retry recovery in the compiled front
with simulated IPC. It runs manually, outside `pnpm verify`, and does not check
the native window or a real ZCode account.

## Remote verify

`pnpm verify --remote` runs the Linux chain on the team machine `vm-verify`
and needs access to Danil's tailnet (`ssh verify@vm-verify` must work). Without
it the command says so; use `pnpm verify`. It never counts for macOS or Windows.

Access: `alberto`, `alejandro`, `mauricio`, `roberto`, `cit`, and the machines
`tag:vm-alberto`, `tag:vm-alejandro` and `tag:vm-mauricio`.

`vm-verify` is also registered as a shared service machine in the Danil
organization. An active organization member can list and start it through a
Danil session; access to the queue still requires the Tailscale SSH rule above.
Being able to start the machine does not grant SSH access by itself. The
registration does not make it a destination for agent tasks.

The client needs only Node, git, `ssh` on the PATH and Tailscale, so it runs the
same from PowerShell or cmd on Windows (`ssh.exe` is the OpenSSH Client optional
feature). What runs is still Linux: a run launched from Windows verifies Linux.

```sh
pnpm verify --remote                   # HEAD; refuses uncommitted changes
pnpm verify --remote --wip             # HEAD plus a snapshot of uncommitted work
pnpm verify --remote --no-cargo        # the chain without Rust
pnpm verify --remote --commit <sha>    # any local commit
pnpm verify --remote --detach          # queue and return; prints the run id
pnpm verify --remote --attach <id>     # follow a run, replaying the full log
pnpm verify --remote --cancel <id>     # stop a queued or running run
pnpm verify --remote --status          # what is queued and running
pnpm verify --remote --windows         # the same on the Windows queue
```

The exit code is the run's. The run lives on the machine: if the client dies,
it goes on and `--attach` gets its log and exit code. The commit travels as a
`git bundle`, incremental against what the machine already has, because the
machine holds no secrets and clones nothing. Running a commit executes it, so
an outside pull request goes there only after someone reads it.

`VERIFY_REMOTE_HOST=<machine>` reaches the queue through an SSH tunnel;
`VERIFY_REMOTE_HOST=<host>:<port>` uses a port already open, such as an SSM
port forward to 8787. The machine stops itself after 15 idle minutes. A run, a
bundle upload, and sessions and builds younger than 2 hours count as use, so a
forgotten shell stops counting at 2 hours and the machine stops 15 minutes later.

### Windows queue

`pnpm verify --remote --windows` runs the chain on Windows, on `vm-windows-shared`
(8 cores, two lanes). It takes the same options and its receipt says
`windows-x64`; it never counts for Linux or macOS. There is no SSH on this path:
the client talks HTTP to `vm-windows-shared:8787`, and a gate on the machine lets
the connection through only when `tailscale whois` names a person or tag in
`scripts/verify-queue/windows/gate.json`. The tailnet ACL must also let the
caller reach that port. Check access with `curl http://vm-windows-shared:8787/health`.

`vm-windows-shared` is shared with people and QA: anyone on the team can stop it by hand, and a run in progress is then reported `interrupted`. The idle stop is off while other work uses the machine.

The machine side lives in `scripts/verify-queue/windows/`; everything is on `D:\ci`.
`tools.ps1` installs Node, pnpm and rustup there, and `install.ps1` installs the
rest, run as administrator. `uninstall.ps1` removes all of it.

| Part | Windows | Linux equivalent |
|---|---|---|
| Queue | `server.mjs` as user `verify`, task `verify-queue`, on the pipe `\\.\pipe\verify-queue` (the firewall does not filter loopback) | `verify-queue.service`, loopback 8787 |
| Run users | `verify-run`, `verify-run-1`… (group `verify-runners`), reached through a private `sshd` on `127.0.0.1:8722` with the queue's key; `lane.mjs` sets the environment and kills leftovers | `sudo -u … env -i`, `kill -9 -1` |
| Lanes | `D:\ci\lanes\<n>\terminus` (checkout, target, pnpm store) | `/var/lib/verify-queue/lanes/<n>` |
| Network | firewall rule `verify-queue`: no 10/8, 100.64/10, 169.254/16, 172.16/12, 192.168/16 for those users | `egress.nft` |
| Entry | `gate.mjs` on the Tailscale IP, task `verify-queue-gate` | Tailscale SSH tunnel |
| Profile | `HKCU\...\Command Processor` and `HKCU\Environment` read-only for run users: `cmd /c` from sshd would run an AutoRun a branch left | `HOME` is new each run |
| COM | `CLSID`, `Interface`, `TypeLib` and `AppID` (and their `Wow6432Node` copies) in the run user's `HKCU\Software\Classes` are emptied and read-only: a COM server a branch registers there would answer the next run. The rest of Classes stays writable because WMI and COM write to it | `HOME` is new each run |
| Leftovers | `sweep.exe`, built by `install.ps1` from `sweep.cs` with the .NET Framework `csc` into `D:\ci\queue` (read-only for the branch). WMI is denied in an ssh session, so it lists with Toolhelp32 and reads each owner from the process token. It fails (exit 1) when the list does not hold itself and its caller, or the caller's owner cannot be read: an empty or blind list never reports clean | `kill -9 -1` |
| Idle stop | task `verify-queue-idle`, 20 minutes; also counts other people's scheduled tasks, RDP and SSM | `verify-idle-stop`, 15 minutes |

Known limit (OWNER RIGHTS): a run-user process that sets its own DACL with an
OWNER RIGHTS entry that grants nothing loses the owner's implicit `WRITE_DAC`.
`sweep.exe` runs as the same user, so it can neither see nor reopen it, and the
process outlives the run. The fix is a final sweep as SYSTEM and an entry that
checks that the pipe server is a `verify` process; the same fix covers
`HKCU\Software\Microsoft\.NETFramework`, which was not measured.

If the queue does not answer and SSH did not refuse, the client starts the
machine and asks again every 15 seconds, up to four minutes, while the queue
stays silent; a machine that is still stopping refuses the first attempts.

1. `danil machines machine start vm-verify --json`, with the caller's Danil
   session (`DANIL_CLI` for the binary).
2. `terminus machine start vm-verify --json`, the same with the installed client
   (`TERMINUS_CLI` for the binary), only when `danil` is missing, does not know
   the command, or refuses the environment because it holds `TERMINUS_*` context.
   `VERIFY_REMOTE_TERMINUS` replaces steps 1 and 2 with one binary, called with
   `machine start vm-verify --json`.
3. `aws ec2 start-instances` with the caller's credentials (`AWS_PROFILE`,
   `VERIFY_REMOTE_AWS` for the binary), only when no CLI knows the command, or
   one answers `machine_account`, `machine_unreachable` or
   `identity_unavailable`. It needs the instance ID in `VERIFY_REMOTE_INSTANCE`
   (and `VERIFY_REMOTE_REGION`, default `us-east-1`); this public repo does not
   carry it. `IncorrectInstanceState` retries; any other failure ends the run.
   Windows builds without these CLIs always land here.

`computer_stopping` retries. `access_denied`, `license_required`, `not_found`
and any other refusal from a CLI end the run with the reason.

The queue is `scripts/verify-queue/server.mjs`: one per machine, first come
first served, listening on loopback only. It runs one job per lane; `lanes` in
`repos.json` sets how many. A profile may cap its own runs with `lanes` and
fix its cores with `cpus` (its `{jobs}`); without `cpus` a run gets an equal
share of the machine. The first queued run whose repo is under its cap takes
the free lane where its repo is already warm. On vm-verify: 4 lanes, up to 3
app chains (wait-bound) and up to 2 engine runs with 4 cores each. It takes repo, commit
and a command from `repos.json`, and knows nothing else about a repo. A profile
lists either exact `commands`, run with `bash -lc` after `prepare` (the app), or
typed `jobs`: a fixed `argv`, `options` with an anchored pattern per value and
an optional positional, run without a shell (the engine: `verify`, `e2e <name>`,
`build`, `clippy`, `test [filter]`). `POST /runs` also takes `base`, the fork
point the client computes with `git merge-base HEAD origin/dev`, and `wip=1`
when the commit is a snapshot of uncommitted work on top of `HEAD`.

Bundles land in a bare mirror per repo owned by `verify`. Branch code never runs
as `verify`: each profile names its run user (`verify-run` for the app,
`verify-run-engine` for the engine; lane `n` above 0 adds `-<n>`), and its lane
(`/var/lib/vl/<n>/<repo>/`, `VERIFY_QUEUE_LANES`) holds the checkout, the target,
the cargo registry and caches, all owned by that user. `/var/lib/vl` and each
`<n>` belong to root: the engine runs an executor only when every folder of its
path belongs to root or to the running user and nobody else can write it. Every git command, delete and
kill in a lane goes through `sudo -n -u <user>`; `verify` only reads artifacts
from it. Each run gets a fresh `HOME` and `TMPDIR` (short, for Unix
socket paths), and `refs/remotes/origin/dev` points at the run's `base`, since
the chains compare against it; git runs without hooks or global config;
at the end the queue kills every process of the run user, also on restart. A
profile without a run user is refused with 503. The checkout is reused, so
`git checkout` only rewrites the files that differ from the previous commit and
the target stays warm; `"target": "checkout"` keeps it in `<checkout>/target`
(where the engine's verify script looks for its binaries), otherwise it goes in
`CARGO_TARGET_DIR`. Above 80 % disk it deletes the target, before a run or after
a failed one, and rebuilds once.

`artifacts` are copied into the run folder before cleaning: regular files of the
run user under the checkout, without links, up to 16 MiB each. When the run
ends, `GET /runs/<id>/receipt` returns `receipt.json`: repo, commit, tree,
parents, `head` and `wip`, base, command, queue, lane and the commit the lane
held before, toolchain (`rustc -V`), times, state, exit code, `checks` from
exactly one `summary.json` of that run (or `null`), `known_failures` and
SHA-256 digests of `receipt.digests`. The header `x-receipt-sha256` and
`receiptSha256` in `GET /runs/<id>` hash its exact bytes. `checks` is what the
run reported; the exit code is the authority. The receipt is not signed and is
not an attestation: the target, registry and lane objects are shared between
runs.

`egress.nft` denies `verify` and the run users IMDS, the tailnet and private
networks, and the `tailscaled` socket is closed to them; they keep internet
access for packages. `/var/lib/verify-queue` is 0711, `runs/` and `incoming/`
are 0700; `verify-runners` is the run users' primary group, which `egress.nft`
matches and which reads the mirrors, so one repo's branch can read the other
repo's mirror. Toolchains live in `/opt/rust`, owned by root, with no
auto-install (`RUSTUP_AUTO_INSTALL=0`): the engine's `rust-toolchain.toml` picks
the version, and one that `install.sh` did not install fails with "toolchain '…'
is not installed". Provider CLIs (binaries only) and the work-tools tree for
`bundled-work-tools` live in `/opt/verify-agents`, also read-only. To install or update the queue, copy `scripts/verify-queue/` to
the machine and run `install.sh` as root.

## Sweeping `target/`

`node scripts/sweep-targets.mjs --root <worktrees>` lists the `target/` folders
that nothing touched in 24 hours and no `cargo` or `rustc` is using. `--apply`
deletes them.

## The browser build

The browser uses the platform edge for its session, workspace selection and
inbox. The session is the edge's HttpOnly `__Host-danil_session` cookie. No
WorkOS token, database token or database key reaches JavaScript.

`DANIL_WEB_API_ORIGIN=https://api-beta.danil.ai corepack pnpm web:build` builds
the responsive SPA. It no longer embeds the mobile app's legacy browser bundle.
`TERMINUS_WEB_BASE=/` serves the root;
`DANIL_WEB_API_ORIGIN` is required: the build fails if it is absent or is not
a valid HTTPS origin without credentials, path, query or fragment. HTTP is
rejected, including localhost. There is no default.
`DANIL_WEB_API_TIMEOUT_MS` is the browser request budget (15000 ms by default,
1–60000 ms). The CSP allows only this API origin
and same-origin connections. `alpha-entry` preserves the CSP from the built
assets; it has no separate API origin setting. Session and inbox have no legacy
selector.

| Deployment | `DANIL_WEB_API_ORIGIN` | Status |
|---|---|---|
| Beta | `https://api-beta.danil.ai` | Explicit build input. |
| Production | Pending | `api.danil.ai` still points to Supabase (CNAME to `supabase.co`); the edge origin remains pending until Supabase leaves this domain. |

Tests may explicitly inject `https://api.danil.ai` as a fictional origin; this
does not configure a deployment. For the local front verification chain, run
`DANIL_WEB_API_ORIGIN=https://api.danil.ai corepack pnpm verify --no-cargo`.

`tests/integration/platform-page.test.mjs` mounts the built page and checks
workspace reconciliation and pending replies. The real-service E2E is
`tests/integration/platform-session.test.mjs`: `DANIL_PLATFORM_REPOS` points
to the directory with edge, identity and workspaces; `DANIL_WORKERS_REPO`,
`DANIL_MESSAGING_SCHEMA_REPO` and `DANIL_WORKERS_PYTHON` select the messaging
service, SQL migrations and its environment. `PG_BIN` selects PostgreSQL 16
with pgvector. It creates and destroys its own cluster. Chromium checks also
use `DANIL_INBOX_BROWSER_URL` and `DANIL_INBOX_BROWSER_PYTHON`.

The private asset Worker serves `dist-web/`; `alpha-entry/` fronts it and keeps
only the appv2 routes still needed by W5. The web audit transport has been
removed: there is no platform audit service. Desk's legacy login is isolated
in `legacy-desktop-auth/`; see [desktop sessions](desktop-bff-session.md).

## The engine pin

`seldon-runtime.lock` pins the engine release for each platform, keyed by Rust
target triple, as published in the release manifest `seldon-runtime.json`:

```json
"x86_64-pc-windows-msvc": { "url": "https://github.com/danil-labs/danil/releases/download/seldon-runtime-v…/seldon-runtime-x86_64-pc-windows-msvc.exe", "sha256": "…" }
```

A platform with an empty `url` has no published engine yet; `engine.mjs
download` stops with an error that says so.

`url` may point to a bare executable or to a `.zip`/`.tar.gz` that contains
`seldon-runtime` (or `seldon-runtime.exe`). The SHA-256 is of the downloaded
file. `contract` must match the hash in
[PROVENANCE](../src-tauri/crates/engine-protocol/PROVENANCE.md); the window
refuses an engine that speaks another contract.

The contract comes from seldon-host (`crates/engine-protocol/commands.json`),
copied byte for byte. Copying a newer one is not enough: the window computes
its contract from those bytes, so it refuses the pinned engine until a
`seldon-runtime` release with the same contract is published
([runtime-binary-release.md](https://github.com/danil-labs/danil-engine/blob/dev/docs/runtime-binary-release.md)) and pinned here. Until then
the `contract` guard requires the pending contract to be named in
`MOTOR_PENDIENTE`, and `publish.yml` refuses to publish.

## Bundled work tools

Git, Python with the document libraries, uv, ripgrep, agent-browser and Cua
ship prepared inside the app; nothing is extracted or installed at first
launch. The pins are `resources/work-tools/<target>/pins.json` and
`documents-requirements.txt` (every wheel with its hash). draw.io is a plugin,
not part of this base.

```sh
python3 scripts/work-tools.py prepare --target x86_64-unknown-linux-gnu --download
python3 scripts/work-tools-smoke.py build/work-tools/x86_64-unknown-linux-gnu
python3 tests/release/work-tools.test.py
```

`prepare` downloads into `build/work-tools/.payloads/`, extracts every archive
into one tree, installs the wheels with the pinned uv (`--target`
`--python-platform`, so the x86_64 macOS tree builds on Apple silicon without
Rosetta), drops the packages' `tests/`, precompiles bytecode with
`--invalidation-mode unchecked-hash`, adds `EXTERNALLY-MANAGED` and the
`python` alias, and writes `inventory.json` and `manifest.json`. Building a
macOS tree off macOS needs `--cross` and skips Cua's signature check; it is
never used for packaging. `--tauri-config` writes the overlay `publish.yml`
passes to `tauri build`: Tauri's `resources` copy the target of every symlink,
so macOS and the AppImage use `bundle.macOS.files` and
`bundle.linux.appimage.files`, which keep them. The AppImage carries them in
`usr/share/Danil/`: linuxdeploy walks `usr/lib` and would copy every
library the tools link into the image. Windows trees have no symlinks
and use `resources`.

`work-tools-smoke.py` runs the tree in place with a `PATH` without node, npm,
pnpm, bun, python or git and without `PYTHONPYCACHEPREFIX`, then checks the
tree still matches its inventory. `work-tools-runtime-smoke.py` does the same
through a packaged engine; it needs an engine that reads schema 2.

WebView2 on Windows comes from `bundle.windows.webviewInstallMode` in
`src-tauri/tauri.windows.conf.json` (`embedBootstrapper`: about 2 MB, still
needs a network on a Windows 10 without WebView2).

## Releases

Maintainers publish with a version tag:

1. Bump the version in `package.json`, `src-tauri/Cargo.toml` and
   `src-tauri/tauri.conf.json` (`pnpm version:bump`), and update
   `release-notes/en.md` and `release-notes/es.md`.
2. Merge to `main`, tag `v<version>` and push the tag.

[`publish.yml`](../../../.github/workflows/publish.yml) builds, signs and publishes.
It refuses to publish while `seldon-runtime.lock` is not pinned for every
platform or the engine is not bundled (`bundle.externalBin`): an installed copy
updated to a window without its engine would not open. To test a change to the
workflow without publishing:

```sh
gh workflow run publish.yml -R danil-labs/danil --ref <branch> -f dry_run=true
```

A dry run spends no eSigner signatures: Windows builds without
`signCommand` and its installed files are checked for presence, not for
Authenticode. eSigner itself is only exercised by a real release.

`node tests/release/publish.test.mjs` (macOS or Linux, needs Ruby and jq)
runs the packaging steps of the workflow with fixtures and temporary signing
keys.

The identity of the installed app — updater public key, bundle identifier
`ai.danil.terminus` and product name — is duplicated in `publish.yml` on
purpose. Changing any of them strands installed copies; read the comments
there first.

Las descargas estables viven en `danil.ai/download`. La tarea del renombre es
dueña de las URLs, las redirecciones y los nombres de artefactos
(`docs/download-urls.md`): los de 0.3.0 serán `Danil_0.3.0_*`, `latest.json`
apuntará a ellos y las copias `Terminus-*` se conservan por compatibilidad. Una
*pre-release* no reemplaza los archivos estables hasta que se promueve.

La prueba de upgrade 0.2.x → 0.3.0 tiene que cubrir `/download`, las
redirecciones viejas y que la *pre-release* no reemplaza lo estable.

## Line endings

`.gitattributes` checks out every text file with LF on all platforms. Generated
files and the contract hash depend on it.
