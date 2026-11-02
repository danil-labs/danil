# Danil: working guide

`apps/desktop/` is the Danil window: a Tauri 2 desktop app (Rust) with a
SolidJS front. The domain (workspaces, projects, tasks, agent turns, accounts)
lives in the engine `seldon-runtime`, a proprietary binary that is not in this
repository. The window reaches it over RPC1 through a frozen contract; see
[docs/engine-client.md](docs/engine-client.md).

This file is for people and coding agents contributing from outside. Read the
area guide before editing an area: [front](src/AGENTS.md),
[scripts and guards](scripts/AGENTS.md), [tests](tests/AGENTS.md),
[mobile app](../mobile/AGENTS.md).

## Commands

```bash
pnpm install
pnpm verify              # guards, front build and Rust on this platform
pnpm verify --no-cargo  # the same chain without Rust
pnpm verify --quick     # guards, linter, tsc and the tests of this diff; not a merge gate
pnpm window:build           # debug window with the front embedded
pnpm engine:download        # engine pinned in seldon-runtime.lock
pnpm engine:start           # engine with throwaway data + window
```

The chain stops at the first failure. `SKIPPED` means a check did not run; it
is not a pass. What each guard checks is in [docs/guards.md](docs/guards.md);
`scripts/verify.mjs` requires a row there for every guard and runs every
`tests/unit/*.test.*`. Details are in [docs/development.md](docs/development.md).

## Do not change

- The installed identity: `identifier` (`ai.danil.terminus`), `productName`,
  updater `pubkey` and endpoint in `src-tauri/tauri.conf.json`, and their copies
  in `.github/workflows/publish.yml`. Installed copies depend on them; changing
  one needs an architect-reviewed installed-update transition. `productName`
  went from `Terminus` to `Danil` in 0.3.0. The Windows installer adopts the
  old copy (`src-tauri/windows/hooks.nsh`, kept in every release), and
  `scripts/guards/product-name.mjs` ties the AppImage paths and that
  migration to `productName`.
- `src-tauri/crates/engine-protocol/commands.json`: the frozen contract, kept
  byte-exact with LF. A command or event name the front uses must exist there.
- Saved field names, command names and event names. An internal rename does
  not change the serialized name.
- Local development never uses the data of an installed Danil: the engine
  lab uses the identity `ai.danil.seldon.dev` and its own folders.

## Working rules

- Match the file you edit: naming, structure, comment density and language.
  Existing comments and internal docs are mostly in Spanish; English is welcome
  for new files. File names and identifiers are in English.
- A comment keeps only a constraint the code does not show, in one to three
  lines. No history, no argument, no Markdown in comments. The `comments`
  guard limits the existing debt.
- Every text a person reads in the app comes from the catalogs through `t()`
  ([docs/localization.md](docs/localization.md)); add the key to `es` and `en`.
  Command names in `invoke()` and event names in `listen()` stay literal so the
  guards can read them.
- Colors are theme tokens from `@theme` in `src/styles/global.css` and text sizes
  come from the shared scale (`text-caption`, `text-ui`…); shared controls live
  in `src/ui/` ([docs/visual-system.md](docs/visual-system.md)).
- Commits are signed off (DCO, `git commit -s`) and follow Conventional
  Commits. See [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Testing

The main test walks the real window to an observable effect: build it, start
the engine lab and do the thing. Say in the pull request what you checked, on
which platform, and what you could not check.

A test runs production code, not a copy of its logic, and does not assert on
source text or incidental call order; static constraints belong to the guards.
Mounting `dist/` in jsdom with a simulated IPC is integration, not a native
check. A fix reproduces its defect first; if it could not be reproduced, say so.

## Pull requests

Open them against `dev` from a branch of your fork; `dev` goes to `main` after
QA. Run `pnpm verify` locally before asking for a merge: GitHub Actions is not
the gate. Don't touch signing or publishing steps unless a
maintainer asked for it.
