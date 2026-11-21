# @danil/platform-client

Cliente del borde /v1 con reintento ante 404/501/503 (R10) y la URL base única.

- Consume: fetch del borde (`src/http.ts` es el único fetch hacia el borde).
- Contrato: `contract/openapi.json`, copia versionada del OpenAPI del borde (danil-contracts).
- Generado: `pnpm -C packages/platform-client generate` emite `src/generated/{types,operations,contract}.ts`
  (`CONTRACT_HASH` = sha256 del openapi.json). No editar lo generado.
- Entrada pública: `src/index.ts` → `createPlatformClient({getToken?, getWorkspaceId?, csrf?, onUnauthorized?, onUnavailable?, signal?})`.
- Errores (se lanzan tipados): `unauthorized` (401, llama a `onUnauthorized`), `forbidden`,
  `unavailable` y `error{status,code,message}`. 404/501/503 y fallos de red reintentan solos
  (1s, 2s, 4s… tope 30s, con jitter, sin límite hasta abortar `signal`); la UI recibe
  `{kind:"unavailable", retrying:true}` por `onUnavailable`, nunca como error final.
- Web usa cookie (`credentials: "include"`); Desk pasa `getToken` y va con Bearer.
- Reglas: R1 (red solo aquí y en session, host, engine-client), R3 y R4 de `03-structure.md`.

## Un solo cliente por app

- La app (el shell) crea **un** cliente: `createPlatformClient(session.transport())`, y lo provee con `<PlatformProvider client>`. Las features lo leen en su `queries.ts` con `usePlatform()` (gate R2).
- Transportes (`src/http.ts`), con un solo bucle de reintento (`withRetry`):
  - `createHttpTransport` (web): cookie `__Host-danil_session` (`credentials: "include"`), `X-CSRF-Token` en mutaciones y rotación ante `csrf_failed`.
  - `createEngineTransport` (Desk): `person_session_fetch` del motor con el contexto de la sesión activa; sin tokens en la ventana.
- R10: 404/501/503 y fallos de red se reintentan con backoff (`backoffDelay`, 1 s → 30 s con jitter) **solo** en lecturas y en mutaciones con `Idempotency-Key` (`idempotencyKey()`), hasta 10 intentos; después `{kind:"unavailable", retrying:false}` y la vista ofrece reintentar. Cada operación acepta `opts.signal` para cancelar al desmontar.
- `API_BASE`, `BILLING_URL` y `HARNESS_URL` (`src/config.ts`) son las únicas URLs del front.
