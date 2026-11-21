# @danil/session

Quién soy y con qué sesión se habla con el borde, tras una sola interfaz (`SessionSource`, `src/types.ts`).

- **Web** (`createWebSession`, `src/web.ts`): una sesión, la cookie HttpOnly `__Host-danil_session` del borde. JS nunca ve el token. Perfil con `getMe` y CSRF con `getCsrf` del cliente generado (`@danil/platform-client`); cada mutación lleva `X-CSRF-Token` y un 403 `csrf_failed` rota el CSRF y repite una vez (B-027). Sin sesión, `webLoginUrl()` → `GET /v1/identity/login?return_to=…` (WorkOS por identity). Cerrar sesión: `logout`.
- **Desk** (`createDeskSession(host)`, `src/desk.ts`, P1): varias sesiones, una por (correo, organización) = un contexto del motor. Todo con la extensión RPC1 `person_session_v1` del motor:
  - `person_session_status`: sesiones (familias y contextos), contexto por omisión y estado del login;
  - `person_session_login {mode?: "add"}` → `{url}`: Desk abre la liga en el navegador (`open_external`); vuelve sola por el loopback `127.0.0.1` o con `person_session_login_complete {pasted}` (la dirección o el código pegado, en un equipo sin navegador);
  - `person_session_logout {context}`: cierra solo esa sesión (las otras siguen);
  - `person_session_fetch`: **todas** las llamadas al borde de Desk van por aquí (`createEngineTransport`); el motor pone la sesión del contexto activo y la ventana nunca ve un token.
  - Evento `person-session`: el motor avisa cuando cambia el estado.
- `refresh()` devuelve `signed_in`, `signed_out` o `error` (un borde o un motor caído no es «sin sesión», M8).
- `transport()` da el transporte del borde para `createPlatformClient` (uno por app, lo crea el shell).
- `@danil/session/solid`: `SessionProvider` y `useSession()`.
- Sin reglas de permisos: la plataforma dice qué ve cada persona.
- **Pendiente:** gracia offline de 7 días en Desk (11 §1); hoy, sin motor que responda, `refresh()` da `error` con reintento.
- Consume: `@danil/platform-client` (OpenAPI `/v1`: `getMe`, `getCsrf`, `logout`) y los tipos `PersonSession*Params` de `@danil/engine-client`.
