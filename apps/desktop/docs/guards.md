# Verification guards

`pnpm verify` runs `scripts/verify.mjs`, side by side within the budget of the machine, and stops at the first failure.
`SKIPPED` (skipped) marks a check that could not run. In CI a skip fails the
run; locally it is allowed and listed in the summary. `--no-cargo` skips the
Rust steps.

`pnpm verify --quick` is a working check, never a merge gate: run the full chain
before merging. It compares with `origin/dev` (`--base=<ref>` changes it) through
`git merge-base` and `git diff`, including uncommitted and untracked files, and
always runs the static guards, the linter and `tsc`. Of the tests, it runs those
that reach a changed file through their imports or a `src/`, `scripts/` or
`alpha-entry/` path they name. `src-tauri/` and `seldon-runtime.lock` add the
Rust steps and both vite builds, which cargo needs. A selected test that reads
`dist/` also adds the builds. A source
change does not select the tests that mount `dist/`, `mount-frontend`,
`missing-classes`, `theme-inversion`, `bundle-size` or the perf ceilings unless they also import the
changed file: they depend on the whole front and appear in the list of what was
skipped. Every run names that list
and says it is not a complete verification. It cannot narrow the change when
git cannot answer, when `package.json`, a lockfile, `verify.mjs`,
`verify-scope.mjs`, `git.mjs`, `tests/helpers/` or `packages/` changed, when a
file has no place in the map, or when a changed source file is not reached by
any test or guard. Then it runs nothing, says why, exits with 1 and names the
next command: `pnpm verify --remote --detach` on Linux, `pnpm verify` on macOS
and Windows, because the queue only checks Linux. It never runs the full chain
on the machine by itself and never reports a green that exercised nothing.

The steps of the local chain, and the checks of the `pre-push` hook, run at
niceness 10 (`scripts/priority.mjs`) so they do not take CPU from the engine. If
the system refuses the change, they run at the priority they have.

The chain and the `pre-push` hook check types with `tsgo` (TypeScript 7,
`@typescript/native-preview`). If `tsgo` does not start, they fall back to the
`tsc` of TypeScript 5 (`scripts/typescript.mjs`). Both give the same errors.
TypeScript 5 stays installed: `verify-scope.mjs` reads imports with its API, and
the `build` scripts call `tsc`.

The engine (`seldon-runtime`) is not in this repository. Guards that need to
know what the engine registers or emits read its frozen contract:
`src-tauri/crates/engine-protocol/commands.json` (commands and events) and
`src-tauri/crates/engine-protocol/phrase-keys.json` (catalog keys the engine
sends).

## What each guard checks

| Guard | File | Contract and limit |
|---|---|---|
| `engine` | `scripts/engine.mjs` | Before the Rust steps, places the engine pinned in `seldon-runtime.lock` (SHA-256 checked) as the `externalBin` sidecar of this platform (on macOS both architectures and their `lipo`); `tauri-build` refuses to compile without it. |
| `reviewable` | `scripts/guards/reviewable.mjs` | Rejects control bytes that turn a diff binary. Needs git metadata. |
| `bridge` | `scripts/guards/bridge.mjs` | Every event the front listens to is emitted by the window or declared in the engine contract, or listed in the list in `engine-pending.mjs` (scripts folder) until the contract brings it. The front listens through `src/lib/serviceEvents.ts`, never `listen` from `@tauri-apps/api/event` directly: with the pushed stream, engine events only reach that one. |
| `commands` | `scripts/guards/commands.mjs` | Every `invoke` name exists in the window registry, the engine contract or an engine extension (`engine-protocol/extensions/`, outside the hash), and every contract command has a caller or a written reason. Names in the list in `engine-pending.mjs` (scripts folder) pass until the contract has them, then the entry must go. |
| `contract` | `scripts/guards/contract.mjs` | `commands.json` hashes to the SHA-256 in PROVENANCE, and `seldon-runtime.lock` pins an engine with that `contract`. A lock behind the contract passes only while `MOTOR_PENDIENTE` in the guard names it with what is missing; `publish.yml` refuses to publish in that state. |
| `service-errors` | `scripts/guards/service-errors.mjs` | Errors rejected by `invoke` are not flattened with `String()`. The per-file quota only goes down. |
| `artifact` | `scripts/guards/artifact.mjs`, `tests/unit/artifact-viewer.test.ts` | Validates the artifact container and inline chat scripts, and the CSS classes shared with the viewer. |
| `window` | `scripts/guards/window.mjs` | Platform overrides keep the window structure (`label`, `create`). |
| `console-window` | `scripts/guards/console-window.mjs` | Production processes use `no_console_window` on Windows. |
| `product-name` | `scripts/guards/product-name.mjs` | The AppImage paths (`usr/lib`, `usr/share`, `.AppDir`) in the Rust code, the work-tools scripts and `publish.yml`, and `PRODUCT_NAME` in `publish.yml`, follow `productName` in `tauri.conf.json`. While it is not `Terminus`, `windows/hooks.nsh` must keep the migration of the 0.2.x Terminus copy. |
| `processes` | `scripts/guards/processes.mjs` | Finds processes awaited without a timeout. Unix `exec` replaces the caller without waiting for a child. The quota only goes down. |
| `shared-design` | `scripts/guards/shared-design.mjs` | `packages/design` matches the desktop: theme tokens, the type scale, radii and channel colors against `src/styles/global.css` (Violeta and Grafito), status phrases against `projects.status.*` in `es` and `en`, the shared task-list, dock and machine words (`WORDS`) against the same keys in the catalogs, and mark icons against `TaskStatus.tsx`. |
| `design-tokens` | `scripts/guards/design-tokens.mjs`, `tests/unit/cn-text-scale.test.ts` | Un tamaño de letra con escalón en `packages/design/src/scale.ts` usa el token, y `cn` lo reconoce como tamaño. Los valores sueltos tienen un techo que solo baja. |
| `doc-paths` | `scripts/guards/doc-paths.mjs` | Code paths and local links in the documentation exist. Generated files are excluded. |
| `missing-classes` | `scripts/guards/missing-classes.mjs` | Finds written classes that Tailwind does not generate. |
| `cli-path` | `tests/unit/cli-path.test.mjs` | Runs the production launcher installer against temporary directories: arguments, pipes, exit code, idempotence, owned removal and PATH collisions (including Windows name variants). Native Windows shell execution requires Windows. |
| `triggers` | `tests/unit/triggers.test.mjs` | A trigger keeps the handler that opens its panel. |
| `mount-frontend` | `scripts/guards/mount-frontend.mjs` | Runs `dist/` in jsdom with a simulated IPC and checks that it mounts, with the window's first gestures, panels and tabs. It does not open a native window. |
| `mount-task-notices` | `scripts/guards/mount-task-notices.mjs` | Same harness: a task's notices and when they repeat. |
| `mount-agents` | `scripts/guards/mount-agents.mjs` | Same harness: agent bubbles, drafts, mentions, threads and inbox. |
| `mount-task-composer` | `scripts/guards/mount-task-composer.mjs` | Same harness: an open task's composer, queue, fork, preview and attachments. |
| `mount-sidebar` | `scripts/guards/mount-sidebar.mjs` | Same harness: the rail's git rows, closing with live turns, selection, groups, recents and clone. |
| `mount-turns` | `scripts/guards/mount-turns.mjs` | Same harness: base branch, authoritative turn state, in-flight replies and task history. |
| `mount-settings` | `scripts/guards/mount-settings.mjs` | Same harness: Settings for providers, integrations, plugins, Harness, language, agents and workspaces. |
| `mount-workspaces` | `scripts/guards/mount-workspaces.mjs` | Same harness: workspace column, title bar, finishing a task, local links and first-run setup. |
| `mount-permissions` | `scripts/guards/mount-permissions.mjs` | Same harness: live questions, newborn tasks and permission choices. |
| `mount-content` | `scripts/guards/mount-content.mjs` | Same harness: chat prose and diagrams, background child tasks, a rejected first turn and updates. |
| `mount-spaces` | `scripts/guards/mount-spaces.mjs` | Same harness: the window's spaces with the rail grouped by folder. |
| `storage-refresh` | `tests/unit/storage-refresh.test.ts` | Refresh batching, stale responses and workspace switches. |
| `open-task-cost` | `tests/perf/open-task-cost.mjs` | Nodes, mutations, IPC calls and IPC bytes when opening a 480-turn thread. The ceiling only goes down. |
| `reread-thread` | `tests/perf/reread-thread.mjs` | Unmounts when re-reading an unchanged thread, with a new turn and during refreshes. The ceiling only goes down. |
| `long-session` | `tests/perf/long-session.mjs` | Retained nodes, computations, listeners, intervals and observers after usage cycles. The ceiling only goes down; heap is informative. |
| `task-history-calls` | `tests/perf/task-history-calls.mjs` | History and status calls during mutations and deltas. The ceiling only goes down. |
| `delta-cost` | `tests/perf/delta-cost.mjs` | DOM updates and mutations for a 400-delta answer arriving eight per frame. The ceiling only goes down; CPU is informative. |
| `bundle-size` | `tests/perf/bundle-size.mjs` | Gzip KiB of the script, preloads and CSS that `dist/index.html` loads before painting. Lazy chunks don't count. The ceiling only goes down. |
| `cold-start-sidebar` | `tests/perf/cold-start-sidebar.mjs` | Engine replies the sidebar waits for before painting its tasks on a warm start (cached shell); cold start and milliseconds are informative. The ceiling only goes down. |
| `drop` | `scripts/guards/drop.mjs` | Coordinate conversion per platform for file drops. |
| `animations` | `scripts/guards/animations.mjs` | Restricts continuous infinite animations and their per-file quota. |
| `csp` | `scripts/guards/csp.mjs` | The content policy is the same in the window, the lab and the Markdown filters. |
| `terminal-themes` | `scripts/guards/terminal-themes.mjs` | Terminal theme tokens, identifiers and contrast, without touching the chrome. |
| `locales` | `scripts/guards/locales.mjs` | Used keys exist, unused keys are reported, placeholders match across catalogs. Engine keys come from `phrase-keys.json`; the window's Rust keys from `Frase::new("…")` in `src-tauri/src`. |
| `literals` | `scripts/guards/literals.mjs` | Interface text outside the catalog in files already migrated. |
| `copy` | `scripts/guards/copy.mjs` | Help text in `src/locales/es` does not grow: keys ending in `description`, `hint`, `why`, `lede`, `intro`, `help`, `note`, `subtitle` or `tagline`, with a dot or an underscore. The baseline only goes down; `--list` audits them. The rule is in [copy.md](./copy.md). |
| `comments` | `scripts/guards/comments.mjs` | Limits long blocks, Markdown, argument and history in comments. The baseline only goes down. |
| `test-policy` | `scripts/guards/test-policy.mjs` | Counts direct source reads in tests. |
| `icons` | `scripts/icons.mjs` | File icons match the ones generated from the package. |
| `theme-inversion` | `scripts/guards/theme-inversion.mjs` | Rejects colors outside the theme tokens. |
| `permissions` | `scripts/guards/permissions.mjs` | Window permissions against the ACL manifest generated by the Rust build. Without that build it may be skipped. |
| `clippy` | `src-tauri/Cargo.toml` § lints | Rejects `dbg!`, `todo!`, unawaited futures and `unwrap` outside tests. |
| `rustfmt` | `src-tauri/rustfmt.toml` | Rust formatting. |
| `biome` | `biome.json` | Unsafe types, unused imports and variables, and debug logs in the front. |

## Maintenance

Every `.mjs` guard in the chain needs a row here, and every
`tests/unit/*.test.*` must be in the chain; `scripts/verify.mjs` checks both
lists. Quotas are lowered after a cleanup; they are never raised to accept a
regression.

jsdom and the static guards do not verify system permissions, native
windows, the keychain or behavior on another platform.
