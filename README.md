# Danil

Danil is a desktop agentic development environment. It runs terminal agents
(Claude Code, Codex and others) against your organization's repositories and
answers in plain language — for people who need those answers but don't write
code.

**[terminus.danil.ai](https://terminus.danil.ai)**

This repository holds the **Danil window**: the desktop app (Tauri + SolidJS)
and its release tooling. The **engine** that runs projects, tasks and agents,
`seldon-runtime`, is a proprietary binary by Danil; it is not in this
repository and is downloaded pinned by version and SHA-256.

## Install

Download the latest installer. The files keep the `Terminus-*` names because
installed copies and the updater expect them:

- **[Terminus-Windows-Setup.exe](https://github.com/danil-labs/terminus/releases/latest/download/Terminus-Windows-Setup.exe)** — Windows 10 or 11, 64-bit
- **[Terminus-macOS.dmg](https://github.com/danil-labs/terminus/releases/latest/download/Terminus-macOS.dmg)** — macOS, Apple Silicon and Intel
- **[Terminus-Linux-x86_64.AppImage](https://github.com/danil-labs/terminus/releases/latest/download/Terminus-Linux-x86_64.AppImage)** — Linux x86_64 (Ubuntu 22.04 or later)

The macOS DMG is universal. `Terminus-macOS-Intel.dmg` is an alias with the
same file.

On Linux there is nothing to install: the AppImage is a portable executable.

```sh
chmod +x Terminus-Linux-x86_64.AppImage
./Terminus-Linux-x86_64.AppImage
```

It needs `libfuse2` (Ubuntu: `sudo apt install libfuse2`). Without it, run it
with `--appimage-extract-and-run`.

The app updates itself from this repository's releases; you install it once.

Or, with Node:

```sh
npx @danil-labs/terminus
```

The Windows installer is signed by Software y Servicios Danil, S.A.P.I. de C.V.
While the certificate builds reputation, SmartScreen may warn the first time:
**More info → Run anyway**. The macOS app is signed and notarized with the same
company's Developer ID. The `npx` path also verifies the minisign signature the
app uses to update itself. Its code is in [`apps/desktop/npx/`](apps/desktop/npx).

## Operational CLI

`danil` is the primary command; `dn` is its official abbreviation. These are
the only operational command names. The physical desktop executable keeps its
distribution identity and forwards CLI calls internally. The npm command above
installs the desktop app; it is not the operational CLI.
See [CLI installation and compatibility](apps/desktop/docs/danil-cli.md)
for explicit launcher installation, collision checks and engine dependencies.

## Build from source

### Requirements

- Node.js 22 or later and pnpm 10 (`corepack enable`).
- Rust 1.89 or later (`rustup update`).
- The [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for
  your platform (WebView2 and the MSVC build tools on Windows, Xcode command
  line tools on macOS, WebKitGTK 4.1 on Linux).

### Build and run

```sh
pnpm install
pnpm window:build            # debug build of the window, frontend embedded
pnpm engine:download         # seldon-runtime pinned in apps/desktop/seldon-runtime.lock
pnpm engine:start            # starts the engine with throwaway data and opens the window
```

`pnpm engine:start` keeps everything under `apps/desktop/.engine/lab/`: its own data
directory, HOME and temp folder, and the engine identity `ai.danil.seldon.dev`.
It never touches the data, keychain or accounts of an installed Danil. Stop
the engine with `pnpm engine:stop` (it also stops by itself five minutes after
the last window closes). `node scripts/engine.mjs help` lists every command.

The engine is published as a prerelease of this repository
([`seldon-runtime-v0.2.73-4b8714c`](https://github.com/danil-labs/terminus/releases/tag/seldon-runtime-v0.2.73-4b8714c)).
By downloading it you accept its [terms](https://github.com/danil-labs/terminus/releases/download/seldon-runtime-v0.2.73-4b8714c/TERMS.md).
The lock pins builds for Windows x86_64, macOS arm64/x86_64 and Linux x86_64.
To use a local engine build instead, run
`node scripts/engine.mjs download --from <path>`.

The window build uses the Cargo feature `extracted-client`, which is the
default. Release installers are built by
[`publish.yml`](.github/workflows/publish.yml); see
[docs/development.md](apps/desktop/docs/development.md) for the details.

### Verify

```sh
pnpm verify              # every guard, the front build and Rust
pnpm verify --no-cargo  # the same chain without Rust
```

What each guard checks is in [docs/guards.md](apps/desktop/docs/guards.md).

La [conexión de GitHub por workspace](apps/desktop/docs/github.md) distingue la selección
local de las instalaciones de la App en GitHub y describe la coordinación con
el motor.

## How it fits together

The window talks to the engine over a local authenticated socket using a
frozen contract (`apps/desktop/src-tauri/crates/engine-protocol/commands.json`). See
[docs/engine-client.md](apps/desktop/docs/engine-client.md).

```
apps/desktop/             the window (this is what the installers ship)
  src/                    SolidJS front (features/, ui/, lib/, locales/)
  src-tauri/              Tauri window (Rust)
    crates/engine-client    RPC client for the engine, no Tauri dependency
    crates/engine-protocol  contract: commands, events, phrase keys
  plugins/languages/      bundled language packs
  scripts/                guards, tests and dev tooling (pnpm verify)
  npx/                    the npx installer
apps/mobile/              the iOS and Android app (Expo) and its dev bridge
packages/design           task states, marks, words, colors and the type scale both apps share
packages/tasks            the task list both apps derive: flat list, filter, two-line card, agents dock
packages/chat             how every client reads an agent message: links, visuals, next steps, tool steps
packages/attention        Inbox, channels, customization and support access from any client
packages/computers        Danil Machines client: control-plane API, relay session, wake rules
packages/fleet            several machines behind one panel: envelope, per-machine slices, merge
packages/carry            carrying work between machines: what travels, parts, base of the new task
packages/protocol         the commands the mobile app may send to a machine, and their answers
```

`pnpm <script>` at the root runs the desktop's script (`apps/desktop/package.json`).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) (commits
need a DCO `Signed-off-by`) and the [Code of Conduct](CODE_OF_CONDUCT.md).
Report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

The code in this repository is licensed under the [Apache License 2.0](LICENSE).
See [NOTICE](NOTICE) and [CREDITS.md](CREDITS.md) for third-party code, fonts
and generated dependency notices.

The `seldon-runtime` engine is proprietary software by Danil and is not covered
by this license. Its terms and third-party notices are published with each
engine release: [TERMS.md](https://github.com/danil-labs/terminus/releases/download/seldon-runtime-v0.2.73-4b8714c/TERMS.md) and
[third-party notices by platform](https://github.com/danil-labs/terminus/releases/tag/seldon-runtime-v0.2.73-4b8714c)
for the version pinned in `apps/desktop/seldon-runtime.lock`.

"Danil" and its logo are trademarks of Danil. Some installers and installed
identifiers still carry the Terminus name, also a trademark of Danil; the
license does not grant permission to use either. Forks must use their own
name, icons and update endpoint.

---

Made by [Danil](https://danil.ai).
