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
| `packages/design` | Task states, marks, status and list words, folder colors, theme colors, and the type and radius scale both apps use. | — |
| `packages/tasks` | The task list both apps derive: flat list, filter and grouping, two-line card, agents dock. | — |
| `packages/chat` | How every client reads an agent message: links, the visual directive, next steps, tool steps and the HTML sandbox. | — |
| `packages/attention` | The Inbox, channels, customization and support access from any client, over the same-origin BFF. | — |
| `packages/computers` | Danil Machines from any client: control-plane API, relay session (WebSocket injected) and wake rules. | — |
| `packages/fleet` | Several machines behind one panel: the call envelope (the machine comes only from it), a slice with its status per machine, bounded waits and the merge. | — |
| `packages/carry` | Carrying work between machines: what travels, the copy in parts and the base the new task starts on. | — |
| `packages/protocol` | The closed list of commands the mobile app sends to a machine (relay or bridge) and their answers. | — |

Read the guide of the area before editing it.

## Front nuevo (rebuild)

Estructura modular del front rebuild (SolidJS):

| Paquete / App | Qué hace | Qué consume | Contrato |
|---|---|---|---|
| `apps/desk` | Danil Desk con el front nuevo: shell + sesiones del motor (`createDeskSession(createTauriHost())`). Envoltorio Tauri propio pendiente. | `@danil/shell`, `@danil/host`, `@danil/session` | Comandos RPC1 del motor |
| `apps/workspace` | Aplicación web de Danil (front rebuild); estático Vite servido por Worker en Cloudflare (`danil-front-preview`). | `@danil/shell`, `@danil/session`, `@danil/ui`, SolidJS | Despliegue en Cloudflare Workers (`preview-front.danil.ai`) |
| `packages/platform-client` | Cliente tipado del borde `/v1` con reintentos automáticos (404/501/503, R10) y URL base única. | Borde HTTP `/v1` (`src/http.ts` es el único fetch al borde) | OpenAPI vendorizado (`contract/openapi.json`), genera `types`, `operations`, `contract` |
| `packages/engine-client` | Cliente tipado de comandos RPC1 del motor y selección de transporte (`local` en Desk, `relay` vía WebSocket). | WebSocket al relay o IPC de Tauri inyectado vía `@danil/host` | Manifiesto RPC1 del motor vendorizado en `packages/engine-client/contract/` (base + extensiones, desde danil-engine `crates/engine-manifest`), genera `src/generated` |
| `packages/session` | Gestión unificada de identidad y sesión: cookie HttpOnly (web) o sesiones de motor (Desk). | `@danil/platform-client`, comandos RPC1 de sesión en Desk | OpenAPI del borde y comandos RPC1 (`danil_sessions`, `danil_connect_start`, etc.) |
| `packages/host` | Lo que solo la plataforma sabe hacer: IPC de Tauri hacia el motor local (Desk), abrir el navegador; `setHost`/`host` para las features. | `@tauri-apps/api` | Comandos RPC1 del motor; implementa `LocalHost` y `DeskAuthHost` |
| `packages/ui` | Primitivas y componentes visuales puros y reutilizables (SolidJS + Tailwind CSS + Kobalte). Sin dominio ni red. | Nada de dominio ni de red (sin dependencias de `@danil/*`) | Componentes y tokens exportados en `src/index.ts` |
| `packages/shell` | Router de estados mínimo, arranque lineal con sesión, riel vertical DS1 v2, layout y ErrorBoundaries. Único que compone features. | `@danil/session`, `@danil/ui`, componentes de `@danil/feature-*` | Rutas (`"machines"`, `"workspace/:id"`, `"account"`), props y slots |
| `packages/features/machines` | Lista de máquinas, selector de ejecución en compositor, sondeo de VMs nuevas, encendido/apagado remoto y conexión. | `@danil/platform-client`, `@danil/engine-client`, `@danil/session`, `@danil/host`, `@danil/ui` | OpenAPI (`getMachines`, `startMachine`, `stopMachine`, `createMachineTicket`, `getOperation`) y RPC1 (`connectMachine`) |
| `packages/features/workspaces` | Riel vertical DS1 v2 (`RailGroups`), selección atómica de workspaces, nombres de plan, gestión y creación de workspaces. | `@danil/platform-client`, `@danil/engine-client`, `@danil/session`, `@danil/ui` | OpenAPI (`getOrganizations`, `selectOrganization`, `getWorkspaces`, `createWorkspace`, `selectWorkspace`) y RPC1 (`set_active_workspace`) |
| `packages/features/projects` | Catálogo de proyectos y tareas por máquina, carga acotada en lote, borrado con ciclo de vida y debounce, store reactivo unificado. | `@danil/engine-client`, `@danil/platform-client`, `@danil/ui` | RPC1 (`list_projects`, `list_live_sessions`, `delete_session`, `finish_task`) y OpenAPI (`Workspace`) |
| `packages/features/chat` | Conversación con agentes, streaming reactivo con cursor, máquina de estados causal de turnos (razonamiento, deltas, herramientas) y aprobaciones de seguridad. | `@danil/engine-client`, `@danil/ui` | RPC1 (`load_session`, `send_message`, `stop_turn`, `respond_permission`, `answer_question`) y eventos push `"chat"` |
| `packages/features/files` | Árbol de archivos con estado git, visor de archivos con tope de 5 MB y breadcrumbs, mapeo compacto de iconos. | `@danil/engine-client`, `@danil/ui` | RPC1 (`tree_files`, `tree_folder`, `tree_git_status`, `tree_show`, `tree_write`, `tree_patch`) |
| `packages/features/ai-credentials` | Conexión, custodia y propagación de credenciales de IA selladas con WebCrypto (`TERMINUS-SECRET/1`), consulta única y cacheada por workspace, encendido explícito de máquinas apagadas. | `@danil/platform-client`, `@danil/engine-client`, `@danil/ui` | OpenAPI (`getWorkspaceAccounts`, `putWorkspaceAccount`, `deleteWorkspaceAccount`, `removeWorkspaceAccountMachine`, `restoreWorkspaceAccountMachine`) y RPC1 (`list_providers`, `connectMachine`) |
| `packages/features/terminal` | Consola interactiva con ANSI, streaming y stdin sin pérdidas (F2.5). | `@danil/engine-client`, `@danil/ui`, `@danil/session`, `@danil/host` | Tipos generados por los clientes |
| `packages/features/account` | Perfil, plan y enlaces a billing y harness por `host.openExternal` (F2.8). | `@danil/platform-client`, `@danil/ui`, `@danil/session`, `@danil/host` | OpenAPI del borde y tipos generados por los clientes |

### Reglas de arquitectura (R1–R10)

Verificación con Node puro: `node scripts/verify-front.mjs` (o `pnpm front:verify`).

- **R1:** Ningún `fetch`, `WebSocket`, `EventSource`, `@tauri-apps/api` ni `invoke` fuera de `platform-client`, `engine-client`, `session` y `host`.
- **R2:** Ningún tipo de respuesta escrito a mano fuera de `model.ts` (derivados de los clientes generados); cliente único del borde por app (`usePlatform()` en features).
- **R3:** Una feature no importa a otra; solo `shell` (o un `apps/*`) las compone.
- **R4:** `packages/ui` no importa nada de dominio ni de red (no importa `@danil/*`).
- **R5:** La UI no distingue local de nube: sin `isLocal`, `is_local`, `kind === "personal"` ni comprobaciones locales fuera de `engine-client`.
- **R6:** Tope de 400 líneas por archivo `.ts/.tsx` (incluyendo `generated/`).
- **R7:** Si cambia el contrato RPC1 (`commands.json`) o OpenAPI (`openapi.json`), `CONTRACT_HASH` debe coincidir con su sha256 o se regeneran los clientes.
- **R8:** Lista negra: nada de appv2, mensajería, `/v1/compute` ni `/v1/computers`.
- **R9:** DRY: prohibidas 12+ líneas consecutivas idénticas normalizadas en dos archivos (salvo `generated/`).
- **R10:** Prohibido manejar `404` o `501` en features: se manejan y reintentan automáticamente en `platform-client`.

### Red, clientes y despliegue

- **Aislamiento de red:** La red solo vive en `packages/platform-client`, `packages/engine-client`, `packages/session` y `packages/host`.
- **Cliente único del borde:** Un solo cliente del borde por app instanciado en el shell (`createPlatformClient`); las features lo consumen únicamente con `usePlatform()`.
- **Despliegue web (`apps/workspace`):** Se despliega como Worker `danil-front-preview` en `preview-front.danil.ai` con `pnpm -C apps/workspace run deploy`.
- **Front viejo y migración:** `apps/desktop` y los paquetes viejos (`attention`, `computers`, `fleet`, `carry`, `chat`, `tasks`, `protocol`, `design`) son el front viejo y se borran en F4.4: el front nuevo no los importa.

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
