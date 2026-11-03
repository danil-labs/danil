# Unir dos personas de Danil (y el correo que ya es de otra)

**Pedido:** task `41js54c5` (padre `cwpsh8he`), 2026-11-03. Rama
`feat/merge-emails`, base `dev` `a24706da`.

**Estado:** síntoma explicado con la base real (solo lectura) y la parte de
ventana implementada. La migración de `danil-workspace`, las rutas del BFF de
`appv2` y el paso de WorkOS quedan diseñados aquí y **no** se aplicaron: esta
tarea no escribe en la base compartida ni en las fuentes adjuntas.

## 1. El síntoma, medido

Producción (`sqonjbpvairwfksotadj`), 2026-11-03 04:19–04:26 UTC, consultas
`select` por la API de administración. No se escribió nada.

| Dato | Valor |
|---|---|
| Persona `alberto@danil.ai` | `users.id = 4`, `uuid = f9c278e9…`, `merged_into_user_id = null`, `active_account_id = 476` |
| Persona `aceballos.ext@bancodonde.com` | `users.id = 2403`, `uuid = c3f9f01a…`, `merged_into_user_id = null`, `active_account_id = null` |
| Correo en `user_emails` | `id = 20`, persona 4, `@danil.ai`, principal, verificado (`supabase_login`) |
| Correo en `user_emails` | `id = 473`, persona 2403, principal, **verificado** (`workos`, 2026-11-02 18:52) |
| Logins de 4 | `supabase` (uuid) y `workos` `user_01M62…` |
| Logins de 2403 | `supabase` (uuid) y `workos` `user_01M6E…` |
| Membresías de 4 | 72 IYEM (admin), 82 Danil Demo (owner), 244 Tu Gobierno (owner), 262 Enrique Zapata (owner), 476 Danil Workspace (owner), 484 Test account (owner) |
| Membresías de 2403 | 542 PRN (admin), 543 BCO (admin) |

Comprobaciones de unión, también en solo lectura: ninguno de los dos tiene
cliente de Stripe ni credenciales de workspace, así que no hay cobros vivos ni
choque de `workspace_id`/`slot`; 2403 es dueña de 1 workspace y 1 computadora,
y 4 de 29 y 3. `private.unclassified_user_columns()` no se pudo consultar con
el rol de lectura (permiso denegado); por eso la vista previa de la §3.2 lo
vuelve a comprobar antes de ofrecer la unión.

Retos de código de la persona 4:

| Reto | Correo | Intentos | Terminó |
|---|---|---|---|
| `17f04bd2…` | `aceballos.ext@bancodonde.com` | 0 | consumido al pedir el siguiente, 04:20:42 |
| `8fe89175…` | `aceballos.ext@bancodonde.com` | 3 | consumido 04:21:49 |
| `5ceee149…` | `beto210391@gmail.com` | 1 | consumido 04:25:45 |

`public.user_identity_log` no tiene ninguna fila de esas dos personas, y
`user_emails` de la persona 4 solo tiene `alberto@danil.ai`. Es decir: **el
código se escribió bien y la base no guardó el correo**, que es justo lo que
hace `confirm_email_challenge` cuando el correo es de otra persona viva con
login:

```
v_owner := private.live_user_id(v_row.user_id)      -- 2403
v_login := existe user_logins o users.uuid           -- true
v_row.verified_at is not null                        -- true
→ jsonb { status: 'email_in_use' }
```

El BFF lo traduce a `409 { "error": "email_in_use" }`
(`worker/src/user-emails.ts`, `CONFIRM_ERRORS`) y la ventana pinta
`danil.emails.error.email_in_use`, que ya dice «pertenece a otra cuenta de
Danil». **No es un fallo de recarga ni de la lista**: no hay nada que listar.
El segundo intento con `beto210391@gmail.com` (persona 17, también con login)
terminó igual.

La causa de fondo está en el modelo: `user_emails` es único por correo y una
persona con login no puede reclamar el correo verificado de otra; la única vía
es `private.merge_users`, que hoy solo corre un SQL revisado a mano y no tiene
RPC ni ruta.

## 2. La ventana, lo que ya quedó

`apps/desktop/src/features/settings/EmailsSection.tsx` y su cliente
`src/web/account-emails.ts`:

- El correo rechazado **se queda en la lista** con su estado («En otra cuenta»
  o «Con datos») y su explicación, en vez de desaparecer con un aviso suelto.
  Si el BFF manda `blocked` en `GET /auth/emails`, sobrevive a la recarga.
- Si el motivo es `email_in_use`, la fila ofrece **«Unir cuentas»**. Abre una
  vista previa (`GET /auth/emails/merge?email=`) con correos, accesos,
  membresías y bloqueos; sin bloqueos, confirma con
  `POST /auth/emails/merge { email }`.
- Si el BFF todavía no tiene la ruta (404/405/501) o la persona es un lead
  (`email_needs_support`), no se inventa nada: se dice que soporte lo hace.
- Al unir, la ventana relee la lista, avisa a la identidad y emite
  `harness:account-merged` para que la web relea el directorio.

`Settings.tsx` manda el workspace activo al botón del Harness
(`adminHref(base, workspace)`); `/admin` ya sabía resolver la cuenta de
`?workspace=` (`resolveWorkspaceAccount`) y su organización, pero el enlace
siempre abría `/admin` a secas. Con el cambio, el Harness es el de la
organización del workspace abierto (Danil, PRN o BCO). El directorio de la
izquierda ya lista los workspaces de todas las cuentas de la sesión
(`docs/web-multi-account.md`); tras una unión, la sesión de la persona
superviviente los recibe todos de `/v1/workspaces` sin tocar ese código.

## 3. La unión, de punta a punta

Orden: **migración en `danil-workspace` → rutas en `appv2` → script de WorkOS →
ventana**. La ventana de este repositorio ya está lista para las rutas.

### 3.1. Reto pendiente de unión

En `confirm_email_challenge`, cuando el código es correcto y el correo es de
**otra persona viva con login** y está **verificado o es principal** (no un
alias pendiente de reclamar), en vez de solo devolver `email_in_use`, guardar
un reto de unión. Un correo solo `claimable` de otra persona sigue contestando
`email_in_use` sin ofrecer la unión: su dueño todavía no ha probado el buzón y
la arquitectura de correos ya lo trata como ajeno.

```sql
create table private.user_merge_requests (
    id           uuid primary key,
    user_id      bigint not null references public.users (id) on delete cascade,
    other_user_id bigint not null references public.users (id) on delete cascade,
    email        text not null,
    challenge_id uuid not null,
    created_at   timestamptz not null default now(),
    expires_at   timestamptz not null,
    confirmed_at timestamptz,
    cancelled_at timestamptz,
    check (user_id <> other_user_id)
);
create unique index user_merge_requests_live
    on private.user_merge_requests (user_id, email)
    where confirmed_at is null and cancelled_at is null;
```

El mismo reto de 15 minutos del código; un intento nuevo reemplaza el anterior.
No se crea para `email_needs_support` (persona sin login: sigue siendo soporte,
como ya dice el documento `user-emails.md` de `danil-workspace`). `list_user_emails` añade:

```json
"blocked": [{ "email": "…", "reason": "in_use", "expires_at": "…" }]
```

y `remove_user_email` cancela el reto de unión de ese correo.

### 3.2. Vista previa (solo lectura)

```sql
-- privada; no concede nada
private.person_merge_preview(p_survivor bigint, p_merged bigint) returns jsonb

-- servicio (BFF), nunca authenticated
public.person_merge_preview(p_user_id bigint, p_email text) returns jsonb
```

`public.` exige un reto vivo de `(p_user_id, p_email)`, resuelve
`p_merged = private.live_user_id(user_emails.user_id)` y llama a la privada.
Devuelve:

```json
{
  "survivor": 4,
  "merged": 2403,
  "emails": ["alberto@danil.ai", "aceballos.ext@bancodonde.com"],
  "logins": ["supabase", "workos"],
  "memberships": [
    { "account_id": 542, "account": "PRN", "role": "admin" },
    { "account_id": 543, "account": "BCO", "role": "admin" }
  ],
  "ownership": { "workspaces": 0, "computers": 0, "module_subscriptions": 0 },
  "blockers": [],
  "warnings": ["El correo principal de la otra persona es de una organización (WorkOS)."]
}
```

La privada repite las comprobaciones de `private.merge_users` para no ofrecer
una unión que después falle: `private.unclassified_user_columns()` vacío, dos
clientes de Stripe con cobros vivos, choque de credenciales en workspace y slot,
personas vivas y no unidas. Los `blockers` son frases para la persona; las
membresías salen de `account_users` + `accounts.name` + `role`. El actor se
niega si `p_user_id` ya está unido.

### 3.3. Confirmación y ejecución

```sql
public.confirm_person_merge(p_user_id bigint, p_email text, p_confirmed boolean)
    returns jsonb
```

- `p_confirmed` tiene que ser `true`; el BFF solo lo manda tras el botón de la
  vista previa, nunca lo deduce.
- Exige reto vivo y no vencido; `p_user_id` es siempre el superviviente (la
  persona que tiene la sesión y que ya probó el buzón del otro con el código).
  Así la sesión que confirma sigue siendo válida. La regla del `@danil.ai` y del
  login más reciente se mantiene igual porque `merge_users` pone como principal
  el `@danil.ai` verificado de cualquiera de las dos (`private.danil_primary_email`).
- Vuelve a correr la vista previa; si hay `blockers`, contesta
  `{ status: 'blocked', blockers }` sin escribir.
- Llama `private.merge_users(p_user_id, p_merged, 'self_service: ' || email,
  'user:' || p_user_id, true)` y marca el reto como confirmado.
- Límites: 3 vistas previas por hora y 1 unión por hora por persona.
- Respuesta: `{ status: 'merged', survivor, merged, memberships }`.
- Grants: `revoke all from public, anon, authenticated; grant execute to service_role`.
  Las dos funciones llevan `COMMENT ON` y se prueban en una rama.

`private.merge_users` ya hace el trabajo pesado y está en producción
(`private.merge_users(bigint, bigint, text, text, boolean)`): membresías (una
viva por cuenta, rol que cubre a los dos o concesión de lo que falta),
propiedad, correos, logins de WorkOS, `merged_into_user_id` y rastro en
`user_identity_log`. No hay que reescribirlo; hay que llamarlo.

### 3.4. Rutas del BFF (`appv2`, `worker/src`)

En `user-emails.ts`, con la persona resuelta **solo** del `sub` verificado
(`personId`, la misma que ya usa todo el archivo):

```ts
// GET /auth/emails/merge?email=…
previewPersonMerge(env, sub, email)   // rpc person_merge_preview
// POST /auth/emails/merge { email, confirm: true }
mergePerson(env, sub, email, confirm) // rpc confirm_person_merge
```

En `index.ts`, detrás de `requirePerson` (que ya bloquea `x-danil-actor: ai`):

```ts
app.get("/auth/emails/merge", …)   // 200 preview | 409 no_request | 409 blocked
app.post("/auth/emails/merge", …)  // 200 merged | 409 blocked | 409 no_request
```

`confirmEmailCode` puede añadir `merge_pending: true` al 409 `email_in_use`
para que la ventana no dependa de la lista. `listUserEmails` no cambia: el
`blocked` pasa tal cual.

Nada de esto acepta un `users.id` del cliente; la identidad sale del `sub` y de
`users.uuid`, como el resto de `/auth/emails`.

### 3.5. WorkOS (paso aparte, con credenciales de administración)

`account_users` se mueve en SQL, pero el asiento de la organización en WorkOS
vive en el usuario de WorkOS del correo principal
(el documento `user-emails.md` de `danil-workspace`, «WorkOS»). Para 4 y 2403:

1. Leer `user_logins` de las dos personas y sus usuarios de WorkOS
   (`user_01M62…` de 4, `user_01M6E…` de 2403).
2. Para cada organización de 2403 (FRD, con PRN y BCO): crear o reactivar la
   membresía del usuario primario de 4 con el mismo rol (admin), o el mayor si
   ya tenía una.
3. Dar de baja la membresía de 2403 y dejar su usuario de WorkOS sin
   organizaciones, con `metadata.danil_user_id = 4` y
   `metadata.danil_merged = 2403`.
4. Repetir la operación inversa si se revierte.

Sin este paso la persona ve los workspaces en el directorio (salen de
`account_users`) pero el SSO de la organización puede aterrizar en un usuario
sin asiento. El script no va en este repositorio y no se ejecutó.

### 3.6. Rastro y sesiones

- `user_identity_log` ya guarda `kind = 'merge'` con `other_user_id`, `actor`,
  `actor_type = 'member'`, `actor_user_id` y el `snapshot` de la persona
  absorbida. Es la auditoría de la unión.
- La persona absorbida queda con `users.uuid = null`: sus sesiones de Supabase
  dejan de resolver y su login se banea en `auth.users` (como hoy hace el SQL de
  unión). La sesión de la superviviente no cambia.
- Conviene avisar por correo a las dos direcciones («se unieron»), con el
  `user_identity_log` como fuente; no es requisito para el dato.

## 4. Reversa

`private.merge_users` guarda el `snapshot` de la persona absorbida y lo que se
movió de sus tablas de una fila (`account_users`, permisos, Stripe,
credenciales, waitlist, correos y logins). **No guarda** cada fila de propiedad
que reasigna (`workspaces`, `computers`, `module_subscriptions`, sesiones…), así
que hoy no se puede deshacer con exactitud. Para que la unión sea reversible:

1. `private.user_merge_moves` (`merge_log_id`, `table_name`, `column_name`,
   `row_pk`, `old_value`, `new_value`, `moved_at`). `merge_users` escribe una
   fila por cada `UPDATE`/`DELETE`/`INSERT` de propiedad, dentro de la misma
   transacción.
2. `private.unmerge_users(p_survivor, p_merged, p_reason, p_actor, p_confirmed)`:
   - solo dentro de 30 días desde `user_identity_log.created_at`;
   - recorre `user_merge_moves` al revés; si la fila ya no tiene `new_value`,
     la reporta como `changed_after_merge` y no la toca;
   - restaura la fila de `users` del snapshot (correo, uuid, estado,
     `active_account_id`, `merged_into_user_id = null`);
   - restaura membresías, permisos, Stripe, credenciales, waitlist, correos y
     logins del snapshot; si la PK ya existe (la superviviente creó datos), la
     reporta y no sobrescribe;
   - desbanea el `auth.users` de la absorbida y le devuelve el correo;
   - escribe `kind = 'merge_reversed'` (hay que añadirlo al CHECK) con el
     informe.
3. Lo que **no** se puede devolver exacto y el informe debe decir: filas
   borradas por deduplicación (push, sesiones compartidas, límites de cartera,
   clientes de Stripe duplicados), correos que un tercero reclamó después, y
   trabajo que la superviviente creó dentro de una cuenta de la absorbida.
   Para esos casos la reversa se niega o se hace con revisión manual; no se
   finge una restauración.

La reversa no se implementó: necesita su propia migración, pruebas en rama y el
paso inverso de WorkOS.

## 5. Qué quedó en este repositorio y qué depende de otra tarea

**Implementado aquí (ventana):**

- `apps/desktop/src/features/settings/account-emails.ts`: estado `blocked`,
  vista previa y las dos llamadas nuevas; errores `merge_*`.
- `apps/desktop/src/web/account-emails.ts`: `blocked` en la lista,
  `GET/POST /auth/emails/merge`, y 404/405/501 como «sin soporte».
- `apps/desktop/src/features/settings/EmailsSection.tsx`: fila con estado,
  vista previa, confirmación y aviso de soporte.
- `apps/desktop/src/features/settings/admin-href.ts` y `Settings.tsx`: el botón
  del Harness lleva `?workspace=`.
- `apps/desktop/src/web/main.tsx`: releer el directorio al unir.
- Catálogos `es`/`en` y pruebas de cliente, orden, rechazos y enlace.

**Depende de otra tarea (no hecho aquí):**

1. `danil-workspace`: migración con `user_merge_requests`,
   `private.user_merge_moves`, `private.person_merge_preview`,
   `public.person_merge_preview`, `public.confirm_person_merge`, el `blocked` de
   `list_user_emails`, el reto en `confirm_email_challenge`, la reversa y sus
   grants. Va en `supabase/migrations/` con base `staging`, como manda el README
   del repo.
2. `appv2`: las dos rutas y las dos funciones de `worker/src/user-emails.ts`,
   con sus pruebas.
3. WorkOS: el script de asientos (ida y vuelta).
4. QA: repetir con dos personas de prueba en una rama (nunca en producción):
   agregar el correo, ver el estado, previsualizar, unir, ver los dos
   workspaces en el directorio y el Harness de la organización correcta.

**No se modificó ningún dato de producción.** La reproducción fue solo lectura.
