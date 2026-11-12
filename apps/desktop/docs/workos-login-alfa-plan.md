# Plan: login con WorkOS en alfa-app.danil.ai (piloto)

Tarea z4yp8ckz (tech-lead) para la coordinadora 0emvaj92. Brief:
`sessions/0emvaj92/exchange/brief-workos-login-alfa.md`. Estado: **implementado
en el cliente** (la entrada de WorkOS ya está en la rama de alfa). Se conserva por
sus decisiones; lo pendiente de producción se confirma contra el despliegue.

## 1. Lo que hay hoy (medido el 2026-10-30)

El front de alfa (`apps/desktop/src/web/`, terminus `feat/new-danil`) tiene una
sesión de Supabase (`session.ts`). Su access token viaja a **cuatro
verificadores**:

| Verificador | Cómo valida | Cómo resuelve a la persona |
|---|---|---|
| BFF de appv2 (`worker/src/jwt.ts`, vía `/alpha-api`) | ES256 contra el JWKS de Supabase; acepta cualquier `kid` publicado | `claims.sub` = `auth.users.id`, en decenas de sitios; reenvía el JWT a PostgREST (inbox) |
| machines (`auth.ts` del repo `danil-labs/machines`, `computers.danil.ai` y relay) | El mismo `jwt.ts` copiado de appv2 | `users?uuid=eq.<sub>` |
| PostgREST directo (`audit-log.ts`) | Supabase: solo la llave **current** (y la anterior en rotación) | RLS: `current_user_id()` y `user_account_ids()` hacen `sub::uuid`; `auth.uid()` en 7 sitios del baseline |
| Hook `custom_access_token_hook` | — | Estampa `active_account_id` con `user_can_enter_account` |

El JWKS de producción publica hoy una sola llave: ES256, `kid ffc80eab-…`.

Lo que ya existe en la base y sirve: `public.resolve_login(provider, subject,
email, verified, …)` (service_role, devuelve a la persona de un login de
WorkOS), `user_logins` y `user_can_enter_account()` (su comentario ya dice que
«con WorkOS, el emisor del claim `active_account_id`» la llama).

## 2. Camino propuesto: el worker de alfa canjea la sesión de WorkOS por un token de Danil

**Ni el camino 1 ni el camino 2 del brief tal cual.** Propongo un tercer camino.
El worker `terminus-entry-alfa` es el único que habla con WorkOS: recibe a la
persona de AuthKit, la resuelve en la base y le entrega al navegador un access
token **con la misma forma del de Supabase** (ES256, `iss`
`https://sqonjbpvairwfksotadj.supabase.co/auth/v1`, `aud`/`role`
`authenticated`, `sub` = `users.uuid`, `email`, `active_account_id`, `exp`
de 10 min). Lo firma con una llave **importada en Supabase** como llave de
firma del proyecto.

Por qué este camino:

- **app.danil.ai, appv2, computers y RLS no cambian.** Los cuatro
  verificadores aceptan el token porque viene firmado por una llave del JWKS
  del proyecto, y `sub` es el uuid que ya conocen. Con el camino 1 (third-party
  auth) habría que cambiar:
  - el BFF de appv2, que es el mismo Worker que sirve a los clientes, y todos
    sus usos de `claims.sub`;
  - computers;
  - `current_user_id()`, `user_account_ids()` y los 7 usos de `auth.uid()`;
  - además, faltaría quién estampe `active_account_id`.
- **RLS sigue protegiendo.** No hay service role en el camino de datos. El
  service role solo se usa en el canje, para llamar `resolve_login` y
  `user_can_enter_account`. Así descarto la objeción del camino 2.
- **La bitácora queda igual.** El token es de la persona, así que
  `actor_type = person` sale como hoy. Una IA (`x-danil-actor: ai`) sigue
  recibiendo el 403 del proxy.
- **Encaja con lo que ya se decidió.** `support-access.md` dice: «con WorkOS no
  hay hook: quien emita el claim (el BFF) llama `user_can_enter_account`». El
  día que app.danil.ai pase a WorkOS, este emisor es el que se queda.
- **Riesgo de la llave.** El Worker guarda una llave que firma tokens de
  cualquiera. Es el mismo poder que ya tiene `SUPABASE_SERVICE_ROLE_KEY`, que
  guardan appv2 y computers, y es menor que él: el service role se salta RLS;
  un token firmado no se la salta.

**La condición que lo hace caro:** Supabase solo acepta en PostgREST, Storage
y Realtime la llave *current*. Una llave en standby aparece en el JWKS, pero
Supabase no la acepta. Por eso hay que **importar la llave y rotar a ella**.
Desde entonces Supabase Auth firma también los tokens de app.danil.ai con esa
llave, y la llave actual pasa a «usada antes» y sigue aceptada hasta que se
revoque. appv2 y computers vuelven a leer el JWKS cuando ven un `kid`
desconocido (como mucho una vez por minuto), así que no hay corte. Es un
**cambio de configuración en producción de Supabase: lo hace o lo autoriza la
persona.**

Hallazgo aparte: `jwt.ts` de appv2 y de computers acepta cualquier `kid` del
JWKS, también una llave en standby. Hoy no expone nada, porque no hay ninguna
en standby, pero conviene saberlo.

## 3. Flujo

1. `/terminus/auth` (alfa): un botón «Entrar», además de Google y Microsoft.
   Lleva a `GET /terminus/auth/workos/start?provider=authkit|GoogleOAuth|MicrosoftOAuth&next=…`.
   El worker crea `state` y el verificador PKCE en una cookie `__Host-`
   firmada (HMAC, 10 min) y redirige a
   `https://api.workos.com/user_management/authorize`.
2. `GET /terminus/auth/workos/callback?code&state`: el worker valida el
   `state` y llama `POST /user_management/authenticate` (con `client_id`,
   `client_secret` = API key y `code_verifier`). Recibe `user`,
   `access_token` y `refresh_token`. Después:
   - exige `email_verified`, y en Microsoft también `xms_edov`, como en la
     revisión de correos;
   - llama `resolve_login('workos', user.id, email, true, …)` → `users.id`;
   - lee `users.uuid`, `banned` y `active_account_id` y `user_can_enter_account`;
   - guarda el refresh token de WorkOS **cifrado** (AES-GCM con un secreto del
     Worker) en una cookie `__Host-danil_alfa`, HttpOnly, Secure,
     SameSite=Lax, con `Path=/terminus/`;
   - redirige a `next`.
3. `POST /terminus/auth/session` (mismo origen; se comprueba `Origin`): el
   worker descifra la cookie y renueva con WorkOS
   (`grant_type=refresh_token`). WorkOS rota el refresh token y la cookie se
   reescribe. Vuelve a resolver a la persona y devuelve `{ access_token,
   expires_at, user: { user_id, email, name } }`. El front lo pide al cargar y
   antes de que venza: el `getToken` y el `unauthorized` de `Session`.
4. `POST /terminus/auth/logout`: revoca la sesión de WorkOS
   (`/user_management/sessions/revoke`), borra la cookie y redirige al logout
   de AuthKit si hace falta.
5. **Cuenta activa:** con WorkOS no se llama `set_active_account` + refresh de
   Supabase. Basta con `POST /terminus/auth/session` y `{ account_id }`: el
   worker comprueba `user_can_enter_account`, guarda
   `users.active_account_id` y emite el token nuevo. Hay que revisar cuántos
   sitios del front llaman hoy `set_active_account`.

**Expiración:**

- El token de Danil dura 10 min.
- La sesión de WorkOS se rige por su propia política. Si WorkOS revoca la
  sesión o banea al usuario, el siguiente canje falla en un máximo de 10 min.
- Un `users.uuid` NULL, una persona unida o una sin cuenta viva dan 403 con
  un código propio, y el front lo muestra en la pantalla de entrada.

**Modo de respaldo:** si WorkOS o la base fallan, el canje responde 503 y la
pantalla dice «no se puede entrar ahora». **No hay vuelta a Supabase ni token
sin verificar.** En alfa el login de Supabase se retira de la pantalla (ver
decisión D2).

## 4. Cambios

**terminus, rama `feat/workos-login-alfa` sobre `feat/new-danil`:**

- `apps/desktop/alpha-entry/worker.mjs` crece:
  - las rutas `/terminus/auth/workos/*` y `/terminus/auth/session|logout`;
  - la firma ES256 con WebCrypto (`importKey` del JWK privado);
  - el cifrado de la cookie;
  - las llamadas a WorkOS y a PostgREST con service role, solo `rpc/resolve_login`
    y `rpc/user_can_enter_account`, más un select de `users`.
  - Conviene separarlo en módulos: `alpha-entry/session.mjs` y
    `alpha-entry/workos.mjs`.
- `wrangler.toml`: vars `WORKOS_CLIENT_ID` y `SUPABASE_URL`; secrets
  `WORKOS_API_KEY`, `DANIL_SIGNING_JWK`, `SESSION_COOKIE_KEY` y
  `SUPABASE_SERVICE_ROLE_KEY`.
- `worker.test.mjs`: pruebas del flujo, con WorkOS y PostgREST simulados.
  Cubren `state` inválido, correo sin verificar, persona sin `uuid`, cookie
  alterada, WorkOS caído (503 y ningún token), `Origin` ajeno, logout y el
  token, que debe verificar contra el JWK público y llevar los claims
  esperados.
- Front:
  - `src/web/session.ts` agrega `workosSession()` con la misma interfaz
    `Session`/`AuthClient`, sin supabase-js;
  - `src/web/main.tsx` la elige con `TERMINUS_WEB_WORKOS=1`, solo en la
    compilación de alfa;
  - `src/web/auth/main.tsx` tiene una variante WorkOS;
  - `audit-log.ts` usa `createClient` con la opción `accessToken` para pasar
    el token de Danil;
  - las cuentas extra («Agregar cuenta», `accounts.ts`) quedan fuera en el
    piloto; ver D4;
  - los textos van en el catálogo `es` y `en`.

**danil-workspace:** no hace falta una migración para el piloto, porque
`resolve_login` y `user_can_enter_account` ya existen. Puede hacer falta una
función `service_role` que junte la resolución y la lectura de cuenta activa en
una sola llamada. Si se agrega, va con base `staging`, con guardia de soporte
si crea tabla (no la crea) y con permiso de push.

**Pruebas de RLS en PGlite (`check.mjs`):** se agrega un caso en el que se
inyectan en `request.jwt.claims` los claims del token de Danil (los mismos que
emite el worker) y se comprueba que dan exactamente las mismas filas que un
JWT de Supabase de esa persona. Además, se prueba un `sub` de WorkOS
(`user_01…`), que debe quedar sin acceso: `current_user_id()` → NULL, cero
filas. Esto va en danil-workspace (permiso de push) o queda como script local
que se adjunta a la entrega.

## 5. Convivencia con app.danil.ai (Supabase)

- **Sync Supabase → WorkOS:** propongo volver a correr
  `~/migration-workos/bin/sync_all.py`, que es aditivo e idempotente, como un
  job periódico (cron cada hora en vm-alberto) durante el piloto. Faltan dos
  cosas:
  - **Bajas:** `sync_all` nunca quita nada. Para un ban o una baja en Supabase
    no hace falta tocar WorkOS, porque el canje revisa en cada renovación
    `users.status`, `merged_into` y las membresías vivas en la base, y esa es
    la autoridad. **La autoridad de acceso sigue siendo la base, no WorkOS.**
  - **Cambio de correo en app.danil.ai:** la persona entra con su nuevo correo
    por Google o Microsoft, que `resolve_login` resuelve por `user_emails`, o
    el sync crea al usuario de WorkOS del correo nuevo.
  - Un hook (trigger → cola) es mejor a la larga, pero es más alcance. Lo dejo
    para después del piloto.
- **Contraseñas:** no se sincronizan.
  - Propongo **código por correo (Magic Auth de AuthKit) y Google/Microsoft**
    como métodos en alfa.
  - La contraseña de AuthKit queda activa para quien tenga hash importado
    (54 bcrypt). Quien cambió la contraseña en app.danil.ai después de la
    importación entra con código o con «olvidé mi contraseña» de AuthKit.
  - La pantalla de alfa explica: «Si tu contraseña no funciona, entra con un
    código por correo».

## 6. Decisiones de la persona

- **D1.** Aprobar el camino (canje en el worker de alfa) en lugar de
  third-party auth.
- **D2.** Rotar la llave de firma de Supabase de producción a una llave
  importada. Es el único cambio en producción de Supabase. Lo hace la persona
  en el dashboard (Settings → JWT Keys → Import → Rotate) o autoriza que se
  haga por la Management API. **Primero** se ensaya con la llave en standby:
  los tokens que firme el worker valen en appv2 y en computers, pero no en
  PostgREST.
- **D3.** En alfa se quita el login de Supabase (no hay modo mixto).
- **D4.** En el piloto se dejan fuera las cuentas extra («Agregar cuenta»).
- **D5.** Métodos de AuthKit: código por correo y contraseña, Google y
  Microsoft.

## 7. Lo que necesito de la persona

1. **WorkOS Production** (`environment_01M2HETZ3VSG6QAR42NYWK4CAK`):
   - el **Client ID**;
   - permiso para que yo configure por API, o que configure en el dashboard:
     - Redirect URIs: `https://alfa-app.danil.ai/terminus/auth/workos/callback`
       y `http://localhost:5173/terminus/auth/workos/callback`;
     - Sign-out redirect `https://alfa-app.danil.ai/terminus/auth`;
     - Allowed origins (CORS) `https://alfa-app.danil.ai` y
       `http://localhost:5173`;
   - métodos de AuthKit: Magic Auth, contraseña, Google y Microsoft.
2. **Google OAuth** (Google Cloud de Danil):
   - Client ID y Client Secret;
   - redirect URI autorizada: la que muestra WorkOS
     (`https://api.workos.com/sso/oauth/google/callback` o la de su dominio de
     AuthKit).
3. **Microsoft OAuth** (Entra ID, app multi-tenant y cuentas personales):
   - Application (client) ID y Client Secret, con la redirect URI que muestra
     WorkOS;
   - claim opcional `xms_edov` en el token.
4. **Supabase producción:** la autorización de D2.
5. **Cloudflare:** subir los secretos del Worker `terminus-entry-alfa` y
   desplegarlo. Es deploy: hace falta permiso.
6. **Usuario de prueba de Danil:** un correo `@danil.ai` (o el de soporte) que
   pueda usar, para no tocar cuentas de clientes.

## 8. Fuera de alcance

- appv2 y app.danil.ai.
- Third-party auth.
- Modo dual de RLS con un `sub` de WorkOS.
- Personas sin `users.uuid`: las 49 sin login. En el piloto reciben 403
  `no_login_yet`; después se les crea `auth.users` o se pasa al modo dual.
- La app de escritorio y la del teléfono.
