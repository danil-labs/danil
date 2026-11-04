# Scripts and guards

Applies [AGENTS.md](../AGENTS.md). Node programs in two groups: `guards/`
holds the static contract checks that `verify.mjs` runs (each with a row in
the catalog); the rest are development tools run by hand (`engine.mjs`,
`version.mjs`, `notices.mjs`, `icons.mjs`, `phrases.mjs`), and `web-mobile.mjs`, the last step of `pnpm web:build`. Tests live in
[tests/](../tests/AGENTS.md).

- `verify.mjs` lists every step and stops at the first failure. Its catalog is
  [docs/guards.md](../docs/guards.md). Steps run side by side within a budget
  from the machine's cores and free memory (`VERIFY_JOBS=1` runs them one at a
  time), so a new step cannot depend on another step of its stage. Stages:
  before the build, the vite builds, after the build with cargo beside it, and
  `tests/perf` alone.
- `verify.mjs --quick` picks the tests of a change with `verify-scope.mjs`, which
  follows imports from each test; what it cannot place runs the full chain.
  The rules are in [docs/guards.md](../docs/guards.md). It never replaces the
  full chain before a merge.
- Every `.mjs` guard has a row in the catalog, and every `tests/unit/*.test.*`
  is a step of the chain.
- A skip keeps its own exit code and is never reported as a pass.
- Baselines (`*-baseline.json`) only go down after a cleanup; they never absorb
  a regression.
- Guards that need what the engine registers read
  `src-tauri/crates/engine-protocol/commands.json` and `phrase-keys.json`.
- Resolve URL paths with `fileURLToPath`. On Windows run shims through their
  runtime: `pnpm.cmd` is not a native binary.
- `engine.mjs` downloads and runs the engine lab
  ([development](../docs/development.md)).
- `verify --remote` (`verify-remote.mjs`) sends one commit to the queue in
  `verify-queue/`, which knows no repo: what it may run comes from
  `verify-queue/repos.json`. Use and setup are in
  [development](../docs/development.md#remote-verify). After changing that
  folder, run its `install.sh` on the machine.
- `sweep-targets.mjs` lists the `target/` folders of unused worktrees; it
  deletes only with `--apply`.
