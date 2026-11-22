# Tests

Applies [AGENTS.md](../AGENTS.md). Everything here runs with Node's test
runner or as a step of `pnpm verify`; the static guards live in
[scripts/](../scripts/AGENTS.md).

| Folder | What it holds |
|---|---|
| `unit/` | `*.test.ts` and `*.test.mjs` against the front's production code (`../src`). Every file is a step of the chain; `scripts/verify.mjs` fails if one is missing. |
| `helpers/` | Shared fixtures: `jsdom-app.mjs` mounts `dist/` in jsdom against a simulated IPC (or `dist-web/` with its own transport, against `fake-relay.mjs`), `catalog.ts` loads the locale catalogs from disk, `mount-guard.mjs` holds what the `mount-*` guards share, `mount-spaces.mjs` walks the window's spaces, `fake-engine.mjs` is the scripted chat queue engine (state, gates, the `chat_queue_v1` mock copied in `contracts/chat-queue-v1/`), `fake-engine-window.mjs` mounts the window against it with a simulated interval clock, and `chat-queue-coherence-lab.mjs` runs one row of `fixtures/chat-queue-coherence.json` against a lab engine over RPC1 (R0 runs it; the chain only runs the table against the fake). |
| `perf/` | Ceilings on nodes, mutations, IPC calls and bytes, retained memory, cost per streamed delta and initial bundle size, each with its `*-baseline.json`. A ceiling only goes down after a cleanup. |
| `e2e/` | Acceptance against beta with real accounts: `workspaces_como_slack.py` (Playwright, Python). Not part of the chain; it runs only with `WORKSPACES_SLACK_EXPECT` (`red` or `green`) and skips without it. |
| `release/` | `publish.test.mjs` tests the packaging steps of `publish.yml`; runs on macOS or Linux and is not part of the chain. |
| `security/` | The containment lab: hostile artifacts and a probe that logs anything that reaches the network. Manual, see its [README](security/README.md). |

- A test runs production code, not a copy of its logic. The `test-policy`
  guard counts direct source reads and only lets that number go down.
- Run one file with `node --test --experimental-strip-types tests/unit/<name>.test.ts`.
