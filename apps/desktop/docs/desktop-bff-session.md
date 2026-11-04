# Atención en el escritorio: sesión de persona y ruta por Computers

Decisión de la persona (2026-11-01) y revisión de arquitectura
`desktop-bff-route-via-computers-review.md` (memoria del proyecto). La ventana
de escritorio monta Atención, Difusiones y canales con un solo inicio de
sesión. Guarda la sesión de la persona en el llavero del sistema y llama al
BFF de Danil por Computers. El BFF nunca recibe el token de cliente ni el de
máquina.

Tres piezas, un contrato. Cambiar algo de aquí cambia las tres.

## Piezas

| Pieza | Repositorio | Qué hace |
|---|---|---|
| Ventana (Rust) | terminus `apps/desktop/src-tauri/src/extracted/agents_session.rs` | PKCE con loopback, llavero, renovación, llamadas al BFF por Computers. El token nunca llega al JavaScript. |
| Worker de entrada | terminus `apps/desktop/alpha-entry/session.mjs` | Consentimiento en el navegador y la sesión de escritorio sellada. |
| Computers | danil-labs/computers | Registro de concesiones de escritorio y `/v1/bff/*`. |

## 1. Inicio de sesión (Worker de entrada)

La base es la del Worker de entrada (`https://alfa-app.danil.ai`; en desarrollo
`DANIL_ENTRY_URL`).

1. La ventana genera `verifier` (32 bytes al azar, base64url) y
   `challenge = base64url(SHA-256(verifier))`, y un `state` al azar. Abre un
   puerto en `127.0.0.1` y abre en el navegador:
   `GET /auth/desktop?challenge=<43 chars>&state=<16-128 [A-Za-z0-9_-]>&port=<1024-65535>`.
2. Sin sesión de WorkOS en la cookie, el Worker manda a
   `/auth/workos/start?next=<esta URL>`. Con sesión, pinta una página de
   consentimiento («Conectar Danil en esta computadora») con un formulario
   `POST /auth/desktop/approve` (mismos tres campos). No hay aprobación sin ese
   clic: un agente que abre la URL no obtiene nada sin la persona.
3. `POST /auth/desktop/approve` exige `Origin` del Worker y rechaza
   `X-Danil-Actor: ai`. Revisa la sesión de WorkOS y el login de la persona y
   sella un código de un solo uso (nombre de sello `desktop_code`, 120 s) con
   `{user, sid, uuid, challenge}`. El código no lleva ningún token: queda en el
   historial del navegador, y una aprobación sin canje no deja sesiones. Responde 303 a `http://127.0.0.1:<port>/callback?code=<código>&state=<state>`.
4. La ventana canjea: `POST /auth/desktop/exchange`, JSON `{"code","verifier"}`.
   El Worker comprueba el sello, el vencimiento y
   `base64url(SHA-256(verifier)) == challenge` y la sesión de WorkOS, abre una
   sesión de GoTrue NUEVA para la persona (no la del navegador) y responde 200
   con la respuesta de sesión (abajo).

### Respuesta de sesión

```json
{ "session": "<blob sellado, opaco>", "access_token": "<JWT de Supabase>", "expires_at": 1793550000,
  "user": { "user_id": "<uuid>", "email": "a@b.c", "name": "Nombre" } }
```

La sesión de la ventana sigue a la de WorkOS del navegador: cerrar sesión en
el navegador la termina en la siguiente renovación (401), con un tope de 30
días. La ventana vuelve a pedir conectar, sin mostrar error.

`session` se sella con el nombre `desktop_session`, vale 30 días y lleva
`{user, sid, uuid, refresh, exp}`. Cada renovación devuelve uno nuevo: la
ventana sustituye el del llavero. `expires_at` sigue el tope `RECHECK_SECONDS`.

### Renovar y cerrar

- `POST /auth/desktop/session`, JSON `{"session"}` → 200 respuesta de sesión.
  Comprueba la sesión de WorkOS (`sid`) y renueva en GoTrue. 401
  `session_ended` o `no_session`: la ventana borra el llavero.
- `POST /auth/desktop/logout`, JSON `{"session"}` → 204. Revoca esa sesión de
  GoTrue (`/auth/v1/logout?scope=local`). No toca la del navegador.

Estas tres rutas JSON no exigen `Origin` (llama Rust, no una página) y
rechazan una petición con `Origin` presente, para que ninguna página las use
con la cookie de otra persona. Rechazan `X-Danil-Actor: ai`. Errores:
`{"error":"<código>"}` con 400 `invalid_body`, 401 `no_session`,
`session_ended`, `invalid_code`, 403 los de `resolvePerson`, 503
`identity_unavailable`, `sign_in_unavailable`.

## 2. Concesión de escritorio (Computers)

El `session_id` de un JWT de GoTrue no cambia al renovar. La concesión dice
«esta sesión de persona es la de la ventana de la computadora C».

- `POST /v1/bff/grants`, `Authorization: Bearer <token de cliente>`, JSON
  `{"access_token":"<JWT de persona>"}`. Computers verifica el token de
  cliente (persona `P1`, computadora `cid`) Y el JWT (persona `P2`,
  `session_id`). Exige `P1 == P2`. Inserta o reactiva
  `{session_id, user_id, computer_id, created_at, revoked_at null}`.
  201 `{"session_id","computer_id"}`; repetirla viva desde la misma
  computadora es idempotente. Errores: 401 `invalid_token`,
  403 `person_mismatch`, 409 `grant_revoked` (una revocación es final),
  400 `invalid_body`.
- `DELETE /v1/bff/grants/self`, `Authorization: Bearer <JWT de persona>` →
  204. Marca revocada la concesión de ese `session_id`.
- Borrar una computadora o revocar su credencial de máquina revoca sus
  concesiones.

El token de cliente solo sirve aquí. Ninguna otra ruta `/v1/bff/*` lo acepta.

## 3. `/v1/bff/<ruta del BFF>` (Computers)

- Solo `Authorization: Bearer <JWT de persona>`. Un token con forma de token
  de cliente, o sin JWT: 401 `person_session_required`.
- El `session_id` del JWT tiene una concesión viva de esa persona; si no,
  403 `window_session_unknown` (la ventana repite la concesión una vez).
- `X-Danil-Actor: ai` → 403 `identity_requires_person`.
- Lista cerrada de método y ruta (lo que usa `packages/attention`):
  `/api/marketing/**`, `/api/contacts[/**]`, `/api/funnels/**`,
  `/api/channels`, `/api/inbox/**`, `/api/messaging/reply`, `/api/media`,
  `/api/agents/**`, `/api/calendar/connections`, `/api/http_tools`,
  `/api/account_variables`, `/auth/profile`, `/auth/emails[/**]`,
  `/auth/account/support-access`, `/auth/account/my-permissions`. Otra:
  404 `route_not_allowed`, sin reenviar.
- Cabeceras de entrada que pasan: `Authorization`, `X-Danil-Workspace`
  (validada `^[aw]:[0-9a-f-]{36}$`), `Content-Type`, `Accept`. La query pasa
  completa. Nada más; un `caller` del cliente se descarta.
- Salida: sin `Set-Cookie` ni cabeceras de salto; no sigue redirecciones
  (3xx → 502 `unexpected_redirect`).
- Las respuestas del BFF pasan tal cual. Los errores propios llevan
  `X-Danil-Proxy: computers` y `{"error":"<código>"}`: 401
  `person_session_required`, 403 `window_session_unknown`,
  `identity_requires_person`, 404 `route_not_allowed`, 413 `body_too_large`,
  429 `rate_limited`, 502 `bff_unavailable`, `unexpected_redirect`, 504
  `bff_timeout`.
- Destino: la lista cerrada del Worker de entrada (`<entrada>/alpha-api<ruta>`,
  variable `BFF_UPSTREAM` de Computers), no el BFF directo. Así la validación
  fina de cada ruta, los interruptores `BROADCAST_WRITES` y
  `BROADCAST_DELIVERY` y la comprobación de `campaigns.manage` siguen en un
  solo lugar (`alpha-entry/worker.mjs`, `broadcasts.mjs`). Computers manda
  `Origin: <origen de la entrada>`: el Bearer es explícito, así que no hay
  riesgo de CSRF. La lista de Computers es solo de prefijos.
- Sin reintentos de POST, PATCH ni DELETE. Cuerpo JSON ≤ 1 MiB; `/api/media`
  por partes con el tope del BFF. Plazo al BFF de 30 s.
- Auditoría: `caller {kind:"person", user_id, via:"window", computer_id}`.
  No se reenvía al BFF.

Un 404 sin `X-Danil-Proxy` quiere decir que Computers no tiene la ruta: la
ventana oculta Atención y no reintenta.

## 4. Ventana

- Comandos propios de la ventana (no del motor; `desktop_command` en
  `proxy.rs`): `agents_session_status`, `agents_session_connect`,
  `agents_session_sign_out`, `agents_session_directory` y `agents_bff_fetch`.
  Todos con `account` opcional: la cuenta de Danil del workspace (sin ella, la principal).
  `agents_session_directory` llama `GET /v1/me/workspaces` con el JWT de la persona
  y devuelve solo el arreglo `workspaces`. El token no sale de Rust.
- El llavero guarda `{"version":1,"user_id","session"}`, uno por cuenta: servicio
  `ai.danil.terminus.agents-session`, usuario la cuenta (`default` sin ella).
  Sin llavero disponible la sesión vive solo en memoria; nunca en un archivo.
- La base de Computers es `endpoint` de `danil_client_token {account}`, y solo
  si es `https://computers.danil.ai` o `https://computers-dev.danil.ai`: el
  motor lo responde y un agente con el mismo usuario podría cambiarlo.
  `DANIL_ENTRY_URL` y `http://127.0.0.1:*` solo valen en builds de depuración.
- Una vez por proceso, y con cada evento `danil-connect` conectado, la ventana
  repite la concesión: si la cuenta del motor ya es de otra persona
  (`person_mismatch`) o la concesión fue revocada (409), borra la sesión. Un
  `danil-connect` `disconnected` cierra la sesión de la ventana solo si la cuenta
  principal (`danil_connect_status`) quedó desconectada; `pending`, `error` o una
  cuenta secundaria no la tocan: la siguiente llamada vuelve a comprobar.
- Las vistas eligen la cuenta por el claim `active_account_id`, que Rust
  decodifica; no mandan `X-Danil-Workspace`, porque el Worker de entrada aún
  no la reenvía al BFF.
- Una respuesta que no se puede leer (más de 16 MiB o no UTF-8) es un error
  `invalid_response`, nunca un cuerpo vacío.
- Cerrar sesión: `DELETE /v1/bff/grants/self`, después `/auth/desktop/logout`,
  después borra el llavero. Lo mismo al cerrar la cuenta en el motor.

## Límites

- En macOS solo la app firmada lee el elemento del llavero. En Windows y Linux
  cualquier proceso del mismo usuario puede leerlo. El riesgo es del JWT, que
  también sirve directo contra el BFF; la ruta por Computers no lo amplía.
- El Worker de entrada solo existe en alfa (`terminus-entry-alfa`).
- Atención en la ventana sale solo en builds con `DANIL_DESKTOP_ATTENTION=1`
  (`vite.config.ts`). Sin la bandera, la ventana no cambia. Se enciende cuando
  la entrada (`/auth/desktop*`), Computers (`/v1/bff/*`) y la migración
  `bff_window_grants` estén desplegados.
- El regreso del navegador usa un puerto de `127.0.0.1` (RFC 8252), no un
  sondeo: el Worker de entrada no guarda estado. El código no sirve sin el
  verificador, que solo tiene el Rust de la ventana. Lo que impide que un agente
  abra su propio flujo es el clic de la persona en la página de consentimiento.
- Por ahora la ventana usa la cuenta principal de Danil (`account` vacío). Elegir
  la cuenta del workspace abierto queda pendiente: las vistas reciben el nombre
  del workspace, no su id.

## 5. Un solo inicio de sesión (motor y ventana)

Revisión `desktop-single-sign-in-auto-approve-contract.md` (memoria del
proyecto). Va siempre, con o sin `DANIL_DESKTOP_ATTENTION`.

- «Iniciar sesión» (Configuración › Cuenta y primera ejecución) llama
  `danil_sign_in` de la ventana. `signInWithBrowser` lo lanza y sigue: el estado
  pendiente llega por `danil-connect`. Si falla al empezar, cae al flujo de antes.
- Motor sin conectar y sin sesión de ventana: la ventana pide
  `danil_connect_start` y abre UNA página que compone ella misma:
  `<entrada>/connect?code=<user_code>&challenge=&state=&port=`. Solo si el
  `user_code` tiene la forma `XXXX-XXXX` y el origen de `verification_uri` es
  exactamente el de la entrada; si no, abre `verification_uri_complete` como
  antes. La persona aprueba el código y el nombre con un clic. Solo con el
  dispositivo aprobado, la página pide `POST /auth/desktop/approve` en JSON
  (`{challenge, state, port}`) y navega al `location` que responde (el puerto
  de `127.0.0.1`). La ventana canjea, espera `connected` del motor y crea la
  concesión.
- Si el motor queda conectado y el código de la ventana no llega en 20 s, la
  ventana se queda sin sesión y Atención la pide después. Si el motor no se
  conecta, el estado queda como esté (`pending`), sin éxito a medias.
- Motor ya conectado (VM, CLI): solo el PKCE `/auth/desktop` si falta sesión.
- Ninguna llamada de Rust a `/v1/devices/*`. «Cerrar sesión» llama
  `danil_sign_out`: revoca la concesión, cierra la sesión de la ventana y
  después desconecta la cuenta principal del motor. «Agregar otra cuenta»
  sigue igual.
- Pendiente: el motor no expone su endpoint de Computers; cuando lo haga
  (campo opcional en `Status`), la ventana rechazará un motor que apunte a otro.
