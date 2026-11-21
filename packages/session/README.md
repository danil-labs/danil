# @danil/session

Quién soy: cookie (web) o token del motor (Desk), tras una sola interfaz.

- Consume: platform-client.
- Contrato: el OpenAPI del borde.
- Entrada pública: `src/index.ts`.
- Reglas: R1 (red solo aquí y en session, host, clients), R3 y R4 de `03-structure.md`.
- Estado: esqueleto F1.1, sin lógica.

## Uso

- `createWebSession()` (`src/web.ts`): cookie HttpOnly, `tokenFor` devuelve null, `csrf()` con rotación (B-027), `onUnauthorized` redirige a `/login` (B-032).
- `createDeskSession(host)` (`src/desk.ts`): lista de sesiones (correo, organización) en el motor vía `auth.list/add/remove/token`; el host se inyecta, sin `@tauri-apps`.
- `@danil/session/solid`: `SessionProvider` y `useSession()`.
- Sin reglas de permisos: la plataforma dice qué ve cada persona.
