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

## R13 · textos de la app actual (2026-11-21)

Todo texto visible sale del catálogo único `@danil/ui/i18n` (`packages/ui/src/i18n`, port de `apps/desktop/src/lib/i18n.ts`), cuyos JSON son copia de `apps/desktop/src/locales`. Rompe la compilación:

1. una clave de `t("…")` que no está en el catálogo `es`;
2. texto escrito en el JSX o en `title`/`aria-label`/`placeholder`/`label`/`etiqueta`/`alt`;
3. un string con forma de frase fuera del catálogo (diccionarios locales incluidos);
4. una frase del catálogo nuevo que no es idéntica a la de `apps/desktop` (texto inventado).

**Trinquete:** `r13.allow` guarda las violaciones que existían al crear el gate (`ruta cuenta`). Un archivo nuevo con violaciones o una cuenta que sube rompe la compilación, y una cuenta que baja exige actualizar `r13.allow` en el mismo commit. La escuadra dueña de un archivo lo deja en 0 y borra su línea. `R13_RAW=1 node scripts/verify-front.mjs` muestra todas.
