# verify-front

Gates R1–R10 del front nuevo (`docs/plans/2026-11-20-front-rebuild/03-structure.md`).
Node puro, sin dependencias: `node scripts/verify-front.mjs` (o `pnpm front:verify`).
`pnpm front:build` lo ejecuta primero. Cada violación se imprime como
`archivo:línea: motivo`; cualquier violación sale con código 1.

Alcance: `apps/{workspace,auth,desk}` y `packages/{ui,platform-client,engine-client,session,host,shell,features/*}`.
No mira `apps/desktop`, `apps/mobile` ni los paquetes viejos. Los comentarios se
ignoran en R1–R5, R8 y R10 (no en R6 ni R9).

| Regla | Qué falla | Módulo |
|---|---|---|
| R1 | `fetch(`, `new WebSocket`, `EventSource`, `@tauri-apps/api`, `invoke` fuera de platform-client, engine-client, session y host | `r1.mjs` |
| R2 | `type/interface Machine\|Workspace\|Organization\|Profile\|Ticket\|Operation` en features fuera de `model.ts` | `r2-r5.mjs` |
| R3 | una feature importa `@danil/feature-*` o `../` hacia otra feature | `r2-r5.mjs` |
| R4 | `packages/ui` importa `@danil/*` | `r2-r5.mjs` |
| R5 | `isLocal`, `is_local`, `kind === "personal"`, `local ?` fuera de engine-client (permitido en `components/` si la línea dice `icon`) | `r2-r5.mjs` |
| R6 | archivo `.ts/.tsx` > 400 líneas (también en `generated/`) | `r6.mjs` |
| R7 | `CONTRACT_HASH` ≠ sha256 de `commands.json` (engine-client) o del `openapi.json` de su comentario `source:` (platform-client); solo si existe `generated/contract.ts` | `r7-r8.mjs` |
| R8 | lista negra: supabase, appv2, messaging, mensajeria, `/v1/compute`, `/v1/computers` | `r7-r8.mjs` |
| R9 | 12+ líneas consecutivas idénticas (normalizadas) en dos archivos; ignora `generated/` y bloques de puro ruido | `r9.mjs` |
| R10 | `404` o `501` en features | `r2-r5.mjs` |
- **R2 (cliente único):** `createPlatformClient(` solo en `packages/shell`, `packages/platform-client` y `apps/*`; las features usan `usePlatform()`.
- **R11:** ninguna feature acepta `client?:`/`session?:` como opción: cliente de `usePlatform()`, sesión de `useSession()`.
- **R12:** `components/` no importa `queries` ni `@danil/{platform-client,engine-client,host,session}` (solo `import type`): datos y callbacks por props.
- **R14:** sin `__TAURI__` ni `navigator.userAgent` fuera de `packages/host` y `apps/*`: la plataforma la dice `host.kind`.
- **R2** cubre también `packages/shell` y `packages/session`.

## Peticiones por recurso (`requests.mjs`)

Plan front-move 3.2: una carga de la web pide cada recurso del borde una vez. Sirve la build web de
`apps/desktop` (base `/`) con el borde simulado de `scripts/verify-parity/edge-fixtures.mjs`, abre la
página como persona con sesión, espera `networkidle` + 3 s y cuenta los GET de `/v1/machines`,
`/v1/identity/sessions`, `/v1/identity/sessions/catalog` y `/v1/identity/me`.

```bash
cd scripts/verify-parity && npm ci            # una vez (Playwright)
node scripts/verify-front/requests.mjs        # machines=1 sessions=1 catalog=1 me=1
REQUESTS_BUILD=1 node scripts/verify-front/requests.mjs   # recompila antes
REQUESTS_VERBOSE=1 node scripts/verify-front/requests.mjs # lista cada petición con su contexto y tiempo
```

Sale 1 si alguno pasa de 1. Un recurso con contexto (`X-Danil-Session`) se cuenta por contexto: la lista
de máquinas de dos organizaciones son dos recursos, y el número impreso es el máximo entre contextos.
Si `dist-web` se compiló con otra base (move-gate usa `/terminus/`), recompila solo. El borde simulado
repite `X-Danil-Session-Applied[-Org]` como el real: sin ese eco la web descarta cada respuesta con
contexto y reintenta, y la cuenta no sería la de beta.

Las lecturas se comparten con `sharedRead` (`packages/platform-client/src/shared-read.ts`): la misma
lectura en curso, o la de hace menos de 3 s, para todos; un fallo no se guarda y una escritura la olvida.
Máquinas: `features/machines/src/queries/machines-query.ts`. Sesión, catálogo y `me` en la web:
`webSessionCommands` (`apps/desktop/src/web/web-session-contexts.ts`).
