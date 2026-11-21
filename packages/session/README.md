# @danil/session

Quién soy: cookie (web) o token del motor (Desk), tras una sola interfaz.

- Consume: platform-client.
- Contrato: el OpenAPI del borde.
- Entrada pública: `src/index.ts`.
- Reglas: R1 (red solo aquí y en session, host, clients), R3 y R4 de `03-structure.md`.
- Estado: web y Desk implementados (F1.5; Desk corregido a los comandos reales del motor).

## Uso

- `createWebSession()` (`src/web.ts`): cookie HttpOnly, `tokenFor` devuelve null, `csrf()` con rotación (B-027), `onUnauthorized` redirige a `/login` (B-032).
- `createDeskSession(host)` (`src/desk.ts`): sesiones del motor (P1) con los comandos RPC1 reales `danil_sessions`, `danil_connect_start` (login de dispositivo en el navegador, se abre con `open_external` y se sondea `danil_sessions` cada 2 s, 10 min máx.), `danil_client_token` (token corto en caché hasta 30 s antes de vencer) y `danil_disconnect`. La llave es `account` (o `computer_id`) del motor. El host se inyecta, sin `@tauri-apps`.
- `@danil/session/solid`: `SessionProvider` y `useSession()`.
- Sin reglas de permisos: la plataforma dice qué ve cada persona.
