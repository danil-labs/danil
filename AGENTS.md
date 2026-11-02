# Danil: repository map

This repository holds the Danil clients and what they share. The domain
(workspaces, tasks, agent turns, accounts) lives in the engine `seldon-runtime`,
which is not here.

| Path | What it is | Guide |
|---|---|---|
| `apps/desktop/` | The window: Tauri 2 (Rust) with a SolidJS front. The installers ship it. | [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md) |
| `apps/mobile/` | The iOS and Android app (Expo) and its development bridge. | [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) |
| `packages/design` | Task states, marks, status and list words, folder colors, theme colors, and the type and radius scale both apps use. | — |
| `packages/tasks` | The task list both apps derive: flat list, filter and grouping, two-line card, agents dock. | — |
| `packages/chat` | How every client reads an agent message: links, the visual directive, next steps, tool steps and the HTML sandbox. | — |
| `packages/attention` | The Inbox, channels, customization and support access from any client, over the same-origin BFF. | — |
| `packages/computers` | Danil Machines from any client: control-plane API, relay session (WebSocket injected) and wake rules. | — |
| `packages/fleet` | Several machines behind one panel: the call envelope (the machine comes only from it), a slice with its status per machine, bounded waits and the merge. | — |
| `packages/carry` | Carrying work between machines: what travels, the copy in parts and the base the new task starts on. | — |
| `packages/protocol` | The closed list of commands the mobile app sends to a machine (relay or bridge) and their answers. | — |

Read the guide of the area before editing it.

## Product names

Danil is one product: one account, and the same app in the window, the web and
the phone, plus the CLI `danil` / `dn`. "Terminus", "Danil Agents" and "Radiant"
were product names and are retired; there are no aliases. What changes with the
account type is the feature, not the product:

| Name | Who has it | What it is |
|---|---|---|
| **Machine** | every account | Your own VMs, or machines connected to the central relay `computers` (`computers.danil.ai`). CLI `danil machines` / `dn machines`. |
| **Harness** | organizations only (Teams, Enterprise); a personal account has none | Policy, usage, members and evaluation. It is what Radiant used to be. |

"Agents" survives only as a common noun (the agents dock, a task's agent, a
handler); it is not a product name. Copy that sends the person to another
surface says «Danil» or names the surface, never a second product.

Visible text follows this. These identifiers keep the old string on purpose,
because they are installed identity, the updater, saved data or the engine
contract: `ai.danil.terminus` and `ai.danil.terminus.mobile`, `terminus://task`, the
`/terminus` routes, `terminus.web.*` and `terminus-auth:*` storage keys,
`::terminus-visual`, the `terminal_theme` id `terminus`, and RPC names such as
`radiant_*`. Renaming any of them needs an architect-reviewed
installed-update transition, not a find and replace.

The desktop `productName` became `Danil` in 0.3.0 (artifacts `Danil_*`,
stable downloads `Danil-*` at `danil.ai/download/`, with `Terminus-*` copies
kept in each release). A 0.2.x copy installed as Terminus updates in place:
`Terminus.app` and `Terminus.AppImage` keep their path, and on Windows
`src-tauri/windows/hooks.nsh` adopts `%LOCALAPPDATA%\Terminus` and retires its
entry. That migration stays in every future release.

Everything else that is ours and not persisted is Danil: titles and catalogs,
the PWA manifest, the window and app label, the MCP bridge name, CLI inputs
`DANIL_*` (the installed CLI still emits `TERMINUS_*` until the host migrates;
read `DANIL_*` when present), build inputs `DANIL_WEB_*`, and `harness` for the
former `radiant` module, files and catalog keys.

## Commands

```bash
pnpm install            # desktop and packages (pnpm workspace)
pnpm verify             # the desktop chain: guards, front build and Rust
pnpm verify --no-cargo  # the same chain without Rust
pnpm verify --quick     # guards, linter, tsc and the tests of this diff; not a merge gate
```

`pnpm <script>` at the root runs the desktop's script. `apps/mobile/` is outside
the pnpm workspace: it installs with npm from its own folder.

## Shared code

- Code both apps need goes in `packages/`, not in a copy inside one app.
- The desktop stays the source of the look: `apps/desktop/src/styles/global.css`
  and its catalogs. `packages/design` repeats what other clients need, and the
  `shared-design` guard fails when the two drift.
- Packages are TypeScript sources without a build step; imports inside them
  carry the `.ts` extension so Node can load them directly.

## Working rules

- Desplegar Danil web es independiente de publicar desktop. Una petición de
  «desplegar» o «merge and deploy» se refiere a web; no autoriza publicar desktop.
- Toda publicación de desktop, tanto pre-release como release, requiere
  confirmación explícita del desarrollador para esa publicación antes de
  disparar builds de distribución o flujos de publicación. Preparar cambios,
  validarlos o hacer merge no concede esa autorización. Desktop consume más
  tiempo y dinero que el despliegue web; si falta la confirmación, solicítala
  indicando la versión y si será pre-release o release.
- Work goes to `dev` first, then to `main`. Commits are signed off (DCO,
  `git commit -s`) and follow Conventional Commits; see
  [CONTRIBUTING.md](CONTRIBUTING.md).
- File names and identifiers are in English; internal docs and comments are
  mostly in Spanish.
- Only `AGENTS.md` files guide agents here; there is no `CLAUDE.md`.
