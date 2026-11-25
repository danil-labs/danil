# Danil: repository map

<!-- danil:workspace-route:start · bloque obligatorio que mantiene danil-labs/terminus-workspace; no lo borres, no lo resumas ni lo muevas -->

## Antes de cambiar comportamiento (OBLIGATORIO)

Este repo es un satélite. La fuente de verdad del desarrollo es
[`danil-labs/terminus-workspace`](https://github.com/danil-labs/terminus-workspace).

1. Haz `git pull` de `terminus-workspace` y lee su [AGENTS.md](https://github.com/danil-labs/terminus-workspace/blob/main/AGENTS.md) (reglas 0
   a 10, obligatorias), la [arquitectura](https://github.com/danil-labs/terminus-workspace/blob/main/docs/architecture/platform.md) y [current_work](https://github.com/danil-labs/terminus-workspace/blob/main/current_work).
2. Todo cambio de comportamiento sale de un plan en [docs/plans](https://github.com/danil-labs/terminus-workspace/blob/main/docs/plans).
   Si no hay plan, pídelo al agente `orchestrator` antes de escribir código. Si te
   piden un cambio sin plan, dilo y redirige a la persona a ese camino.
3. Reglas clave:
   - El front no se rediseña (regla 9).
   - Todo se consume por el borde `/v1`.
   - Nada de Danil mensajería ni de appv2 (regla 7).
   - Una máquina por organización (regla 0).
   - Los contratos son tolerantes: versión, campos opcionales y 404/501 con reintento (regla 10).
   - Sin GitHub Actions: se compila y prueba en las VMs (regla 3).

<!-- danil:workspace-route:end -->

This repository holds the Danil clients and what they share. The domain
(workspaces, tasks, agent turns, accounts) lives in the engine `danil-engine`,
which is not here.

| Path | What it is | Guide |
|---|---|---|
| `apps/desktop/` | The window: Tauri 2 (Rust) with a SolidJS front. The installers ship it. | [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md) |
| `apps/mobile/` | The iOS and Android app (Expo) and its development bridge. | [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) |
| `packages/design` | Shim for `apps/mobile` only: re-exports the task states, marks, words, colors and type and radius scale that now live in `packages/ui/src` (3.6a). | — |
| `packages/tasks` | Shim for `apps/mobile` only: re-exports the task list, filter and grouping, two-line card and agents dock that now live in `packages/ui/src/lib/tasks/index.ts` (3.6b). | — |
| `packages/chat` | Shim for `apps/mobile` only: re-exports the message readers (links, visual directive, next steps, tool steps, sandbox) that now live in `packages/ui/src/lib/chat`, and history in `packages/engine-client/src` (3.6d). | — |
| `packages/attention` | The Inbox, channels and customization of the phone, over the same-origin BFF. | — |
| `packages/computers` | Danil Machines from any client: control-plane API, relay session (WebSocket injected) and wake rules. The `/v1/machines` client is not here: it lives in `packages/platform-client/src/machines.ts`. | — |
| `packages/fleet` | Several machines behind one panel: the call envelope (the machine comes only from it), a slice with its status per machine, bounded waits and the merge. | — |
| `packages/carry` | Shim for `apps/mobile` only: re-exports carry (what travels, the copy in parts, the base of the new task), which now lives in `packages/features/machines/src` (`model/carryTypes.ts`, `model/carryPlan.ts`, `queries/carryRun.ts`) (3.6c). | — |
| `packages/protocol` | Shim for `apps/mobile` only: re-exports the closed list of commands and their answers, which now live in `packages/engine-client/src` (3.6c). | — |

Read the guide of the area before editing it.

## Front nuevo (rebuild)

Cómo está el front en `dev` hoy, después de que se fusionara `rebuild/move` (merge 09e6ca7b, plan
[front-move](https://github.com/danil-labs/terminus-workspace/blob/main/docs/plans/2026-11-21-front-move/README.md)).
Las reglas R1–R16 están en
[03-structure.md](https://github.com/danil-labs/terminus-workspace/blob/main/docs/plans/2026-11-20-front-rebuild/03-structure.md).
Las rutas `/v1` y los comandos RPC1, con archivo y línea, están en [docs/API.md](docs/API.md).
Cada paquete tiene su `README.md`, y los que inventarió la fase 1 tienen además un `INVENTORY.md`
con cada archivo y cada export clasificado.

**Entradas.** Hay un solo front, `packages/shell` + `packages/features/*`, y se compila desde
`apps/desktop`:
- La ventana Tauri carga `packages/shell/src/app/main.tsx` (`apps/desktop/index.html:81`).
- La web carga `apps/desktop/src/web/bootstrap.ts` (`apps/desktop/web.html:467`) y se construye con
  `pnpm -C apps/desktop web:build`.

Las carpetas `workspace`, `auth` y `desk` de `apps/` **no existen**, aunque `pnpm-workspace.yaml` y el script
`front:build` todavía los nombran.

**«Consume»** sale de contar imports por paquete (sin tests). `apps/desktop (N)` cuenta los imports
hacia `apps/desktop/src/lib` y `src/web`: el front todavía depende de ellos. Las features que importan
a otra feature rompen R3 (fase 2.4 en curso).

### Paquetes base

| Paquete | Qué hace | Qué consume | Contrato |
|---|---|---|---|
| `packages/platform-client` (`@danil/platform-client`) | Las rutas `/v1` por dominio: `identity.ts`, `workspaces.ts`, `machines.ts` (el único cliente de máquinas: lista, start, wake y ticket), `treasury.ts` (créditos y facturación) y `credentials.ts` (adaptador web). `client.ts` tiene `edgeUntil`, que reintenta 404/429/501/503 con idempotencia, y pone `X-Danil-Session` en la web. `shared-read.ts` hace que cada recurso se pida una vez por carga. | `engine-client` (`danil_edge_fetch` en Desk), `packages/computers` (tipos y `requestId`), `zod` | Borde `/v1`, con tipos escritos a mano. El cliente generado del OpenAPI es **propuesta** (4.2). |
| `packages/engine-client` (`@danil/engine-client`) | `invoke(command, args)`: el `invoke` de Tauri o la ruta por máquina (`setMachineRoute`), con `untilConnected` y `retrying` (`retries.ts`), y `urlDeAvatar` (`previewFile.ts`). | `@tauri-apps/api`, `apps/desktop (6)`, `host (1)` | RPC1 sin tipar. El manifiesto está en `apps/desktop/src-tauri/crates/engine-protocol/commands.json` (550 comandos), pero no se genera nada de él: **propuesta** (4.2). |
| `packages/session` (`@danil/session`) | Sesión e identidad: `platform-session.ts`, `person-session.ts`, `window-session.tsx`, `organization-session.ts`, `session-*.ts` y `sessionRefresh.ts`. | `apps/desktop (24)`, `platform-client (5)`, `@terminus/computers (3)`, `ui (2)`, `packages/features/settings (2)`, `engine-client`, `shell`, `packages/features/machines` | `/v1/identity/me`, `credits/balance`; RPC1 `danil_sign_in_complete` |
| `packages/host` (`@danil/host`) | Lo que solo sabe hacer la plataforma: `platform.ts` (`setHost`, `host`, `LocalHost`, `DeskAuthHost`), portapapeles, descargas, ventana y `pick-image.ts`. | `apps/desktop (5)`, `packages/features/settings (3)`, `@terminus/computers (2)`, `@terminus/protocol`, `ui`, `packages/features/chat`, `packages/features/machines` | Ningún `invoke` literal; escribe una ruta `/v1/workspaces/…` (`packages/host/src/platform.ts`) |
| `packages/ui` (`@danil/ui`) | Primitivas y componentes visuales (SolidJS, Tailwind, Kobalte, Lucide) y `packages/ui/src/styles/global.css`. | `apps/desktop (63)`, `@terminus/design (5)`, `engine-client (3)`, `features/viewers (3)`, `host (2)` | Invoca 5 comandos (`preview_file`, `office_preview`, `file_size`, `open_external`, `open_file_external`). Es deuda de R4: el gate R4 solo mira `@danil/*`. |
| `packages/shell` (`@danil/shell`) | Arranque (`packages/shell/src/app/main.tsx`), `App.tsx` (3.105 líneas; el gate 2.5 pide menos de 300), los slots (`featureSlots.tsx`, `chatSlots.tsx`, `settingsSlots.tsx`) y el riel y los diálogos de `packages/shell/src/shell/`. Es el único que compone features. | `apps/desktop (203)`, `ui (155)`, todas las features (las de más imports: projects 40, machines 30, settings 23, chat 15), `host (34)`, `engine-client (28)`, `platform-client (18)`, `session (5)`, `@terminus/*` | 63 comandos RPC1 (launcher, tray, ventana, adopción, almacenamiento…) y `/v1/identity/me` en `account-move.ts` |

### Features (`packages/features/*`)

| Feature | Qué hace | Qué consume | Contrato |
|---|---|---|---|
| `chat` | La pantalla de una tarea: la conversación con el agente y el compositor «¿Qué resolvemos?» (el nombre `chat` se queda, 4.3). | `apps/desktop (235)`, `ui (133)`, `engine-client (20)`, `host (19)`, `@terminus/protocol`, `features/projects (8)` y otras 11 features | 59 comandos RPC1 (`send_message`, `respond_permission`, `answer_question`…) |
| `projects` | Proyectos, espacios, tareas por máquina, agentes, memoria, fuentes y ciclo de vida de una tarea. | `apps/desktop (135)`, `ui (111)`, `engine-client (22)`, `host`, `features/{chat,machines,settings,code}` | 69 comandos (`list_projects`, `list_live_sessions`, `task_lifecycle_*`…); `/v1/workspaces/{id}/memory` |
| `code` | El árbol de archivos con su estado git, el visor y el editor, Typst, Office y el control de código (`kn_*`). | `apps/desktop (43)`, `ui (43)`, `host (21)`, `engine-client (6)`, `@terminus/protocol` | 44 comandos (`tree_*`, `kn_*`, `typst_live_*`…) |
| `machines` | Las máquinas: la lista compartida (`queries/machines-query.ts`), el reparto por máquina (`router.ts`, `context-*.ts`), el relay, la flota, carry, WSL e invitados. | `ui (35)`, `apps/desktop (34)`, `host (14)`, `@terminus/fleet (13)`, `@terminus/computers (12)`, `platform-client (6)`, `engine-client (5)`, `@terminus/carry` | `/v1/machines` (por `platform-client`, más rutas escritas en `queries/`); 42 comandos (`guest_*`, `wsl_*`, `work_*`…) |
| `settings` | Configuración: cuenta, cuentas de IA, integraciones, MCP, skills, idioma, harness y free-router. | `ui (255)`, `apps/desktop (176)`, `host (25)`, `engine-client (25)`, `@terminus/computers (9)`, `shell (6)`, `platform-client (6)` | 155 comandos (`radiant_*`, `account_credential*`, `github_account_*`…); `/v1/credentials/*` y `/v1/workspaces` |
| `onboarding` | El alta: `Setup`, `ConnectAI` y `ConnectAccount`. | `apps/desktop (38)`, `ui (33)`, `features/settings (9)`, `host (6)`, `shell (3)`, `engine-client (3)` | 60 comandos (instalación, login de proveedores, Google Drive, Zotero…) |
| `workspaces` | `createContextSource` (`queries/context-source.ts`), el contexto de la tarea que antes estaba en `App.tsx` (2.5c). El riel sigue en `packages/shell/src/shell`. | `apps/desktop (7)`, `packages/ui/src/lib/tasks (2)`, `engine-client`, `ui` | `list_mentions`, `list_workspaces`, `load_session`, `session_usage`, `set_workspace_source` |
| `workspace` | `createWorkspaceStore`: el contexto de trabajo del motor. | nada | ninguno |
| `artifacts` | Visor, versiones, descargas y publicaciones de artefactos. | `ui (15)`, `apps/desktop (6)`, `features/{viewers,machines}`, `engine-client` | 10 comandos (`artifact_*`, `read_version`, `restore_version`…) |
| `viewers` | Visores de CSV, imagen, multimedia y PDF. | `ui (9)`, `apps/desktop (6)`, `host (2)`, `@terminus/protocol` | ninguno |
| `sites` | Los sitios web dentro del workspace. | `apps/desktop (3)`, `ui (2)`, `engine-client` | `site_*` (8) |
| `composer` | El estado de la caja del compositor: modos, modelos, superficies y slash. | `apps/desktop (4)`, `packages/ui/src/lib/tasks` | `list_models`, `list_permission_modes`, `list_providers`, `list_slash_menu`, `list_surfaces` |
| `task-queues` | Las colas de turnos de una tarea. | `ui`, `apps/desktop` | `get_turn`, `queue_resume`, `stop_turn`, `stop_turn_if` |
| `threads` | Los hilos y la proyección de actividad del turno. | `apps/desktop (7)`, `features/chat (6)`, `session` | `load_history`, `load_session` |
| `screen` | La pantalla remota (noVNC). | `@terminus/computers (2)`, `apps/desktop`, `ui` | ninguno |
| `drafts` · `service-stream` · `tabs` · `conversation-handoff` | Borradores por tarea · lotes de eventos de servicio · arrastre de pestañas y cierre sin guardar · traspaso de conversación. | `apps/desktop`; `tabs` y `conversation-handoff` también `ui` | ninguno |

`files`, `ai-credentials`, `terminal` y `account` **no existen** como features (03-structure.md las
propone). El código de archivos está en `code`, el de cuentas de IA y de cuenta en `settings`, y el de
terminal en `chat` (`run_shell_command`, `write_shell_input`).

**Paquetes viejos** (la tabla de arriba): `attention`, `carry`, `chat`, `computers`, `design`, `fleet`,
`protocol` y `tasks`. Dicen `@terminus/*` y su `INVENTORY.md` dice qué se mueve y qué se borra
(fases 2 y 3). `attention` no se borra mientras lo use `apps/mobile`.

### Reglas y gates

`node scripts/verify-front.mjs` (`pnpm front:verify`) corre R1–R12 y R14 (detalle en
`scripts/verify-front/README.md`). Su alcance nombra `apps/{workspace,auth,desk}`, que no existen.
En `dev` 4c22f04b falla con **894 violaciones en 703 archivos**. Pasan R4 y R7; R7 pasa porque no hay `generated/contract.ts`.
No es todavía un gate de merge.

Los gates del plan front-move son los que deciden si algo se integra:

| Gate | Dónde | Qué exige |
|---|---|---|
| `move-gate` | `~/work/move/move-gate.sh <worktree> <dominio\|all>` (devbox, fuera del repo) | Compila (`tsc` + vite web). No quedan rutas `/v1/<dominio>` fuera del cliente. El diff no cambia JSX ni clases. El CSS es idéntico a la línea base. |
| Paridad de 9 pantallas | Recetas en `scripts/verify-parity/screens/*.mjs`: `inicio`, `entrada`, `nueva-tarea`, `tarea`, `configuracion-{cuenta,maquinas,cuentas-ia,control-codigo,proyectos}`. Se corren con `~/work/f/gates/parity.sh <worktree>`. El corredor `run.f2.mjs` está en el checkout principal, no en git. | Captura la build web de la rama y la de su base con el borde simulado (`scripts/verify-parity/edge-fixtures.mjs`), en es-MX, tema oscuro y 1280×800. Tolera hasta un 2 % de píxeles distintos por pantalla. |
| `requests.mjs` | `node scripts/verify-front/requests.mjs` (Playwright: `npm ci` en `scripts/verify-parity`) | En una carga web con sesión, `machines`, `sessions`, `catalog` y `me` se piden **una vez** cada uno (por contexto). Sale 1 si alguno pasa de 1. Al fusionar en dev dio `machines=2` (front-req-1). |
| `f2-metrics` / `f2-gate` | `~/work/f/gates/f2-metrics.py <worktree> [--json]`; `~/work/f/gates/f2-gate.sh <worktree> <r12\|r3\|app\|r6\|raw> [unidad]` | Mide `raw` (botones, inputs y spinners crudos fuera de `ui`), `r12`, `r3` (imports entre features), `app` (líneas de `App.tsx`), `r6` (más de 400 líneas), `qjsx` (`.tsx` en `queries/`), `dup` (ventanas de 10 líneas repetidas) y `anyb` (`any` y `_bridge`). El gate pide que compile, que el CSS sea idéntico, que la métrica de la tarea baje y que ningún otro total suba; en `app` y `r6`, además, que ≥85 % de lo añadido sea código movido tal cual. |

Medición de `f2-metrics` sobre `dev` 4c22f04b: R3 entre features 56, R6 55, `App.tsx` 3.105 líneas,
crudos 65, R12 0, qjsx 0, dup 56, anyb 2.

### Red y despliegue

- La red solo vive en `platform-client`, `engine-client`, `session` y `host` (R1). Hoy hay rutas `/v1`
  escritas en features, en `shell` y en `apps/desktop/src/web`: la lista está en
  [docs/API.md](docs/API.md#rutas-v1-escritas-fuera-de-platform-client-deuda-de-r11).
- No hay `createPlatformClient` ni `usePlatform()`: las features importan las funciones de dominio
  de `platform-client` desde sus `queries/`. Un cliente único por app es **propuesta** (R2 y R11).
- Beta (`beta.danil.ai`) es el Worker `danil-web-beta` (`apps/desktop/alpha-entry/wrangler.beta.toml`).
  Se despliega con `~/work/move/deploy-beta.sh`, que se niega si falta el último `dev`, y anota el
  rollback en el registro del plan.

## Product names

Danil is one product: one account, and the same app in the window, the web and
the phone, plus the CLI `danil` / `dn`. "Terminus", "Danil Agents" and "Radiant"
were product names and are retired; there are no aliases. What changes with the
account type is the feature, not the product:

| Name | Who has it | What it is |
|---|---|---|
| **Machine** | every account | Your own VMs, or machines connected through `connect.danil.ai` (relay) and registered in `machine-provisioning`. CLI `danil machines` / `dn machines`. |
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

The engine binary is `danil-engine`. These keep `seldon` on purpose, because they are saved
data, signing trust, the engine updater or the VM layout. Renaming any of them needs an
architect-reviewed transition (`terminus-workspace` decision 2026-11-18, engine rename):
- the data-root files `seldon-runtime.lock`, `seldon-endpoint.json` and `seldon-authority.json`;
- the macOS code-signing identifier `seldon-runtime` of the bundled engine;
- the bundled alias `seldon-runtime` beside the window, until the alias removal conditions are met;
- the repo file `apps/desktop/seldon-runtime.lock` and its `name`;
- engine releases `seldon-runtime-v*`, `seldon-runtime.json(.sig)` and `seldon-runtime-<triple>` assets;
- identities `ai.danil.seldon.dev` (lab) and `ai.danil.seldon.vm`;
- VM names `seldon-host@`, `/opt/seldon`, `/Users/Shared/seldon` and `SELDON_*` variables.

Internal crate names (`seldon-existing-runtime`, `seldon_engine_manifest`) are not product
names and may change freely.

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
- The source of the look is `packages/ui/src/styles/global.css` (it moved
  there from apps/desktop/src/styles/ in the front move) and its catalogs. `packages/ui/src/index.ts` (tokens, marks and words) repeats what other clients need, and the
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
- `dev` es la única rama de trabajo (orden de Alejandro, 2026-11-22 03:15): cada
  rama sale de `origin/dev` y se integra por PR a `dev`. `rebuild/move` está
  congelada; no se toca. Commits are signed off (DCO, `git commit -s`) and follow
  Conventional Commits; see [CONTRIBUTING.md](CONTRIBUTING.md).
- File names and identifiers are in English; internal docs and comments are
  mostly in Spanish.
- Only `AGENTS.md` files guide agents here; there is no `CLAUDE.md`.
