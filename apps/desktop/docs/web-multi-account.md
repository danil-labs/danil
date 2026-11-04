# Varias cuentas de Danil en la web

**Estado:** FASE 1 IMPLEMENTADA · 2026-10-23 · rama `feat/web-multi-account` (base `dev` e51ef02)

**Pedido (Alberto, 2026-10-22):** ver en una sola ventana de
app.danil.ai/terminus los workspaces de varias cuentas de Danil. Por ejemplo,
2 workspaces con alberto@danil.ai y 3 con otro correo: 5 en la misma columna,
y cambiar entre ellos sin cerrar sesión. Se eligió la opción A: varios correos
en una ventana. Que un workspace pertenezca a una organización de Danil (la
opción B) queda fuera.

**Parte de:** [`account-workspace.md`](account-workspace.md) (el workspace es
de la cuenta) y de las decisiones del 2026-10-21 al 23:

- Una sesión por cuenta, y cada workspace es de una cuenta.
- Ningún workspace entra solo a una cuenta.
- Iniciar sesión desde un workspace liga ese workspace.

## Lo que había

- **`src/web/session.ts`** leía **una** sesión de Supabase: la que guardó la
  app de Danil en este mismo origen, con la clave por omisión de supabase-js.
  Si esa sesión cerraba (`SIGNED_OUT`), la página se iba al login.
- **`src/web/main.tsx`** arma **una** `Fleet` y **un** router con **un**
  `getToken`. Siete capacidades de la página (perfil, logos, memoria,
  computadoras, pantalla…) cierran sobre ese mismo token.
- **El router contesta `list_workspaces`** con el registro de la cuenta más lo
  que lista cada máquina. Unos 15 lugares de la ventana leen esa lista:
  ajustes, proveedores, memoria, tema, alta, el aviso de tareas, la barra de
  título y otros.
- **La columna de workspaces** (`features/shell/WorkspaceColumn.tsx`) ya es la
  columna estilo Slack. Solo se veía con 2 workspaces o más.
- **El id de un workspace es único en todo el sistema.** Es la llave primaria
  de `workspaces` en computers (migración 006), y su dueña es
  `owner_id = users.id`. La misma Mac es una computadora distinta en cada
  cuenta. Con el id de un workspace se sabe su cuenta, sin ambigüedad.
- **La app de Danil** (Appv2) inicia sesión con Google, Microsoft,
  contraseña o enlace mágico, y escribe la clave por omisión.

## Modelo

```
 localStorage de app.danil.ai
 ├─ sb-…-auth-token            ← la sesión de la app de Danil (cuenta «principal»; Danil solo la lee)
 ├─ terminus.web.accounts      ← [{ slot, user_id, email, name }]  las cuentas extra
 ├─ terminus-auth:<slot>       ← la sesión de cada cuenta extra (un cliente de supabase-js por slot)
 ├─ terminus.web.listing:<uid> ← la última lista del registro de cada cuenta
 └─ terminus.web.account       ← user_id de la última cuenta abierta

 Página = UNA cuenta montada (flota, router, capacidades y licencia: como antes)
 Columna = workspaces de la cuenta montada  +  webAccounts.others()  (solo la columna y la puerta los leen)

   [A1][A2] │ alberto@fundacion: [F1][F2] │ alberto@ytw (caducada): [Y1] │ [Agregar cuenta]
              clic → ?w=F2 → recarga con la cuenta de F2
```

1. **Una sesión por cuenta.**
   - La principal es la de la app de Danil.
   - Cada cuenta extra tiene su propio cliente de supabase-js, con
     `storageKey: "terminus-auth:<slot>"`, `flowType: "pkce"` y
     `detectSessionInUrl: false`.
   - `slot` es un id al azar, fijo desde que se agrega la cuenta. Así no hay
     que mover un refresh token entre claves, lo que Supabase tomaría como
     reuso y revocaría.
   - Dos cuentas con el mismo `user_id` son una sola: gana la principal.
2. **Una flota montada.** La página monta la flota de **una** cuenta, como
   antes. Las otras cuentas solo aportan su registro (`GET /v1/workspaces`) y
   no abren sesiones de relay.
3. **Los workspaces de otras cuentas no entran a `list_workspaces`.** Llegan
   por la capacidad `webAccounts` (`lib/platform.ts`), y solo la leen la
   columna y la puerta (`Gate`). Así ningún panel de ajustes ofrece
   renombrar, borrar o cambiar el logo de un workspace ajeno. Si lo hiciera,
   esas órdenes irían a una máquina de la cuenta montada.
4. **Abrir un workspace de otra cuenta recarga la página** con `?w=<id>`,
   después de guardar su cuenta como la última. Al cargar, la página elige la
   cuenta así:
   1. la dueña de `?w=` según las listas **guardadas**; solo si no aparece
      ahí, consulta la red;
   2. si no, la última abierta;
   3. si no, la principal;
   4. si no, la primera extra.

   Luego monta el router con `set_active_workspace(?w)` y quita `?w` de la
   URL. Cambiar entre workspaces de la misma cuenta sigue siendo inmediato.
5. **Agregar una cuenta** abre una página propia de Danil,
   `?add-account` (`web/AddAccount.tsx`, un chunk aparte). Ofrece Google,
   Microsoft y correo con contraseña:
   - **Google y Microsoft** regresan a `?account-callback=<slot>`. Solo se
     acepta el slot que este navegador dejó pendiente y que cumple
     `^[a-z0-9]{8,32}$`. Ahí el código se cambia por la sesión una sola vez.
   - **Instalada como app** (`display-mode: standalone`) solo ofrece
     contraseña: el proveedor regresaría al navegador, que guarda sus datos
     aparte.
   - **No usa el login de la app de Danil,** porque ese login sobrescribe la
     sesión principal.
   - **Empieza como Google, con «Elige una cuenta»** (`chooserRows`):
     - Las cuentas con sesión en este navegador se abren con un clic: quedan
       como la última y la página recarga con ellas.
     - Una cuenta caducada va al formulario con su correo.
     - «Usar otra cuenta» lleva al formulario vacío.
     - Sin cuentas aquí, o al volver a entrar desde un mosaico caducado, va
       directo al formulario.
6. **Salir de una cuenta.**
   - **Una extra:** se cierra su sesión con `signOut({ scope: "local" })`.
     Por omisión supabase-js usa `global`, que cerraría también los otros
     dispositivos de la persona. Además se borran su slot, su lista guardada y
     las fotos del sidebar de sus workspaces.
   - **La cuenta montada:** si su sesión se acaba y quedan otras cuentas, la
     página recarga con otra; si no queda ninguna, se va al login, como antes.
   - **Otra cuenta:** si su sesión se acaba, solo se vuelve a leer su grupo.
   - **Una extra caducada:** sus mosaicos se ven atenuados y piden «Volver a
     entrar». Su lista guardada se sigue viendo.
7. **Si en otra pestaña entra otra persona** a la app de Danil, la clave de la
   principal cambia de dueña. `session.ts` lo detecta, porque recuerda el
   `user_id` que leyó, y lo trata como sesión terminada: recarga.
8. **Nada se liga solo.** Agregar una cuenta solo **muestra** los workspaces
   que esa cuenta ya tiene en su registro. Ligar un workspace sigue siendo
   desde su configuración, en la máquina.

## Decisiones

| # | Decisión | Elegido | Por qué | Tipo |
|---|----------|---------|---------|------|
| D1 | Cambiar a otra cuenta | Recargar con `?w=` | El token está cerrado en 7 capacidades, la flota y la licencia. Cambiar todo en la misma página arriesga que se mezclen datos entre cuentas (P5). | Gusto |
| D2 | Cómo inicia sesión una cuenta extra | Login propio de Danil con PKCE y `storageKey` por slot | El login de la app de Danil sobrescribe la sesión principal. | Mecánica |
| D3 | Clave de la sesión extra | Slot al azar, no `user_id` | Mover un refresh token entre claves dispara la detección de reuso de Supabase. | Mecánica |
| D4 | Atención (badges) de otras cuentas | No en v1; queda en TODO | Requiere relay de otra cuenta. | Alcance |
| D5 | Teléfono | Segundo PR | Ver «Fase 2». | Alcance |
| D6 | URL | `?w=<id>` (query) | No cambia el ruteo ni choca con el `?to=` del teléfono (P3). | Mecánica |
| D7 | Caché de rebanadas de la flota | Sin prefijo por cuenta | La flota solo olvida máquinas de su propia cuenta, así que una cuenta no borra la caché de otra. Un prefijo multiplicaría por N el tope de 2 MB y chocaría con la cuota de `localStorage`. | Mecánica (corregida en la revisión) |
| D8 | Logos de otras cuentas | Un lector por cuenta, con su token | Con el token de la cuenta montada, un logo ajeno no se encuentra. | Mecánica |
| D9 | Por dónde llegan los workspaces ajenos | Capacidad `webAccounts`, no `list_workspaces` | Unos 15 lectores de la lista; las escrituras de ajustes irían a la máquina equivocada. | Mecánica (revisión) |
| D10 | Columna en la web | Siempre visible | Es donde se agregan y se ven las otras cuentas, aunque haya un solo workspace. | Gusto |
| D11 | Foto del sidebar (`shellCache`) | Con varias cuentas, solo la de un workspace de la cuenta montada, y la de `?w=` primero | Si no, al cambiar de cuenta se pintaría el sidebar de la anterior. | Mecánica (revisión) |

## Archivos

| Archivo | Cambio |
|---|---|
| `src/web/accounts.ts` (nuevo) | Registro de cuentas: cargar, agregar, quitar, deduplicar, listas del registro (guardadas y de red) y elegir la cuenta. Sin Solid ni supabase-js: se prueba en Node. |
| `src/web/AddAccount.tsx` (nuevo, lazy) | Página «Agregar cuenta» y regreso del PKCE. |
| `src/web/session.ts` | `storageKey`, `flowType: "pkce"`, `user()`, `signOutLocal()`, `onGone` sin forzar el login y detección de cambio de persona. |
| `src/web/main.tsx` | Elige la cuenta, arma `webAccounts` y maneja `?add-account`, `?account-callback` y `?w`. `window.terminusWeb.webAccounts`, para las pruebas. |
| `src/web/Gate.tsx` | Con la cuenta bloqueada (licencia, sin computadoras), botones para abrir las otras. |
| `src/web/connect/main.tsx` | La nueva firma de `supabaseSession`. |
| `src/lib/platform.ts` | Capacidad `webAccounts`. |
| `src/lib/shellCache.ts` | `setShellCacheScope`, `forgetShellCache`. |
| `src/features/shell/WorkspaceColumn.tsx` | Encabezado por cuenta, mosaicos ajenos, «Agregar cuenta» y columna siempre visible en la web. |
| `src/locales/{es,en}/{shell,web}.json` | Textos. |
| `scripts/verify.mjs` | Las dos pruebas nuevas. |

## Modos de falla

| Camino | Falla realista | Manejo | ¿La persona lo ve? |
|---|---|---|---|
| Regreso de OAuth | Slot desconocido, sin `code` o con verificador perdido | Error en «Agregar cuenta» con reintento; se borra el slot | Sí |
| Lista de otra cuenta | Red caída o 5xx | Lista guardada; el menú de la cuenta dice «Lista guardada» | Sí, en el menú |
| Lista de otra cuenta | Token revocado | Mosaicos atenuados con «Vuelve a entrar» | Sí |
| `?w=` de un workspace traspasado o borrado | Ninguna cuenta lo tiene | Abre la cuenta por omisión | No (TODO: un aviso) |
| La misma cuenta agregada dos veces, o igual a la principal | Duplicado | Dedupe por `user_id`, con `signOut` local del slot nuevo | No |
| La principal cambia de persona en otra pestaña | Token de otra persona | `session.ts` lo detecta y recarga | Sí, la página recarga |
| Dos pestañas refrescan el mismo slot | Carrera de refresco | supabase-js 2.118 no usa locks por omisión. El servidor tolera el reuso dentro de su intervalo, y en la misma pestaña se comparte la promesa en curso. | No |
| Licencia de una cuenta extra | `listWorkspaces` responde `license` | Lista guardada; al abrirla, la puerta lo dice y ofrece las otras cuentas | Sí |

No queda ningún camino que sea a la vez sin prueba, sin manejo de error **y**
silencioso. El `?w=` desconocido sí es silencioso, pero tiene manejo (abre la
cuenta por omisión).

## Pruebas

```
web-accounts.test.ts (Node, 10)
  ├─ cargar: principal primero; dedupe; sin principal; caducada marcada; slot de otra persona
  ├─ agregar: guarda; duplicada cierra la sesión nueva; sin sesión no guarda; volver a entrar reemplaza el slot
  ├─ quitar: signOut local + olvida lista; la principal no se quita
  ├─ listas: token propio; rechazo refresca una vez; sin red usa la copia; caducada no pide
  └─ elegir: dueña de ?w, última, principal, primera extra; ?w desconocido; con listas guardadas
shell-cache.test.ts (+2)
  ├─ con alcance: solo foto propia; ?w gana a la última; sin alcance igual que antes
  └─ olvidar las fotos de una cuenta quitada
web-account-chooser.test.mjs (jsdom sobre dist-web)
  └─ primero las cuentas con sesión; caducada → formulario con su correo; «Usar otra cuenta»; volver; sin cuentas → formulario
web-other-accounts.test.mjs (jsdom sobre dist-web)
  └─ columna con 3 cuentas; abrir ajeno → open(id); caducada → add(email); «Agregar cuenta» → add()
```

Las 23 pruebas `tests/unit/web-*` pasan con el cambio.

**Falta probar:**

- **El viaje real a Google o Microsoft.** Requiere Supabase de verdad; se
  prueba en staging antes de desplegar.
- **El flujo de `start()` con dos sesiones sembradas,** en el navegador con
  las computadoras falsas.

## Rendimiento

- **Al cargar:** cero llamadas de más antes de pintar, porque la cuenta se
  elige con las listas guardadas. Después sale una `GET /v1/workspaces` por
  cuenta, en paralelo, y la columna se actualiza sola. Se repite al volver a
  listar (cada 10 min) y al volver a la pestaña.
- **Sin sesiones de relay** con otras cuentas.
- **Peso de la primera carga:** `AddAccount` va en un chunk lazy, y
  `accounts.ts` pesa unos pocos KB.

## Fuera de alcance / TODO

- **Workspaces de organizaciones de Danil (opción B).**
- **Atención en vivo de otras cuentas (D4).**
- **Aviso cuando `?w=` no es de ninguna cuenta.**
- **Purgar las rebanadas de la flota de una cuenta quitada.** `SliceBook` no
  expone olvidar por máquina desde fuera, y eso toca `packages/fleet`.
- **`/terminus/connect`** (aprobar una computadora) sigue con la cuenta
  principal.
- **Enlace mágico en «Agregar cuenta»:** necesita el mismo navegador.

## Fase 2: teléfono

El teléfono en la web (`/terminus/m/`, la app de Expo) comparte el
`localStorage` de este origen (`apps/mobile/src/lib/supabase.web.ts`). Por eso
la fase 2 en la web reusa `terminus.web.accounts` y las claves
`terminus-auth:<slot>`, no SecureStore. La app nativa sí guarda sus slots en
SecureStore. `toPhone` manda los teléfonos allá, así que esta página nunca
carga en un teléfono.

## Requisitos para desplegar

- En Supabase (Auth → URL Configuration), las Redirect URLs deben aceptar
  `https://app.danil.ai/terminus/**`. Si no, Supabase regresa en silencio a
  la Site URL y el slot nunca recibe su código. Hay que comprobarlo antes de
  desplegar `terminus-web`.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| Eng review (autoplan) | Pedido de Alberto | Plan de varias cuentas en la web | 1 | DONE (manual: las skills de gstack no están registradas en Danil) | 3 de arquitectura (D7, D8, la principal sobrescrita), 0 brechas críticas |
| Outside voice (subagente Claude) | autoplan | Revisión adversaria | 1 | DONE | 11; se aplicaron 1, 2, 3, 4, 5, 6, 7, 8, 9 y 10; el 11 entra a la fase 2 |

VERDICT: fase 1 implementada y probada. Quedan dos decisiones de gusto para
Alberto: D1 (recargar al cambiar de cuenta) y D10 (columna siempre visible en
la web).

OUTSIDE COVERAGE: Codex no corrió; la voz externa fue un subagente de Claude.

NO UNRESOLVED DECISIONS
