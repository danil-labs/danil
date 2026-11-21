# @danil/feature-account

Feature de cuenta y perfil de usuario de solo lectura (F2.8 y F3.2).

## Qué hace

- Muestra la identidad y perfil del usuario autenticado (`AccountScreen`).
- Muestra el plan y organización actual usando el nombre del plan (`Personal`, `Team`, `Enterprise`), sanitizando estrictamente para no exponer nunca la palabra genérica «Organización» (P11).
- Enlaza a la aplicación externa de facturación mediante el botón «Administrar» (`BillingLink`).
- Enlaza a la consola de gobernanza y permisos mediante «Administrar usuarios y permisos» (`HarnessLink`, F3.2).
- Toda navegación externa se ejecuta a través de `host.openExternal` de `@danil/host`.
- No incluye la gestión de máquinas: esa responsabilidad corresponde a la feature `machines` y la compone la shell.

## Qué consume

### Borde HTTPS (`/v1`) vía `@danil/platform-client`
- `getMe` (`GET /v1/identity/me` o `GET /v1/me`): consulta de identidad y datos del perfil.
- `getOrganizations` (`GET /v1/organizations`): consulta de organizaciones para determinar la activa y su plan.

### Host nativo vía `@danil/host`
- `host.openExternal`: apertura de URLs externas hacia billing y el harness.

### Sesión vía `@danil/session`
- Consulta de sesión activa para resolver tokens y credenciales.

## Estructura y Reglas

- `src/index.ts`: única entrada pública que expone `AccountScreen`, `HarnessLink`, `BillingLink`, `useProfile` y el modelo.
- `src/queries.ts`: único archivo que realiza llamadas a `@danil/platform-client` mediante `createResource`.
- `src/model.ts`: tipos de vista derivados exclusivamente de `@danil/platform-client`.
- `src/config.ts`: lectura de `import.meta.env.VITE_BILLING_URL` y `import.meta.env.VITE_HARNESS_URL`.
- `src/components/`: componentes visuales (`HarnessLink.tsx`, `BillingLink.tsx`, `AccountErrorView.tsx`).
- `src/screens/`: pantalla de cuenta (`AccountScreen.tsx`).

## Pendientes

- Adopción de componentes atómicos de `@danil/ui` cuando el paquete implemente primitivas compartidas.
