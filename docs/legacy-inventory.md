# Inventario de lo viejo (Tarea 3.1, plan front-move)

Inventario exhaustivo de todo el código en el front que consume o adapta sistemas viejos, realizado según la especificación de la tarea 3.1 () de .

## Alcance de la búsqueda

- Rutas inspeccionadas: , ,  y  (excluyendo , , , , ).
- Sistemas y patrones analizados:
  1.  y  (plano de control y relay obsoleto de machines).
  2.  (reglas, contratos, estilos y filtros de la app anterior).
  3. La mensajería y Danil Agents (, , , , ).
  4.  y  (auth y base de datos heredada).
  5. Adaptadores y fallbacks a servicios viejos (, , , , , ).
  6. Subrutas viejas de workspaces (, , , , , ) y .
  7. Endpoints de conexiones legadas ().

---

## Usos encontrados

| Archivo:línea | Qué consume | Sistema viejo | Reemplazo por el borde (ruta exacta) o «se borra» | Evidencia |
|---|---|---|---|---|
| `packages/computers/src/api.ts:10` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | `listComputers`, `sessionProbe` o `startComputer`; los usa `account.tsx`/`ConnectMachine.tsx`/`Connections.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/src/api.ts:122` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | `listComputers`, `sessionProbe` o `startComputer`; los usa `account.tsx`/`ConnectMachine.tsx`/`Connections.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/src/api.ts:215` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | `listComputers`, `sessionProbe` o `startComputer`; los usa `account.tsx`/`ConnectMachine.tsx`/`Connections.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/src/api.ts:227` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | `listComputers`, `sessionProbe` o `startComputer`; los usa `account.tsx`/`ConnectMachine.tsx`/`Connections.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/src/links.ts:3` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Comentario del flujo que sigue vivo (`GET /v1/computers` en `origin/dev`): se queda |
| `packages/computers/src/links.ts:104` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Comentario del flujo que sigue vivo (`GET /v1/computers` en `origin/dev`): se queda |
| `packages/computers/src/machine.ts:15` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Comentario del flujo que sigue vivo (`GET /v1/computers` en `origin/dev`): se queda |
| `packages/computers/src/relay.ts:120` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Relay `computers.danil.ai` (URL de sesión o de API); lo usa `account.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/src/connect.ts:5` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Comentario del flujo que sigue vivo (`GET /v1/computers` en `origin/dev`): se queda |
| `packages/computers/src/connect.ts:45` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Comentario del flujo que sigue vivo (`GET /v1/computers` en `origin/dev`): se queda |
| `packages/computers/test/screen.test.ts:6` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Relay `computers.danil.ai` (URL de sesión o de API); lo usa `account.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/test/screen.test.ts:7` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Relay `computers.danil.ai` (URL de sesión o de API); lo usa `account.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/test/screen.test.ts:44` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Relay `computers.danil.ai` (URL de sesión o de API); lo usa `account.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/test/computers.test.ts:72` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Relay `computers.danil.ai` (URL de sesión o de API); lo usa `account.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/test/computers.test.ts:73` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Relay `computers.danil.ai` (URL de sesión o de API); lo usa `account.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/test/computers.test.ts:74` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Relay `computers.danil.ai` (URL de sesión o de API); lo usa `account.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/test/computers.test.ts:75` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Relay `computers.danil.ai` (URL de sesión o de API); lo usa `account.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/test/computers.test.ts:262` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Relay `computers.danil.ai` (URL de sesión o de API); lo usa `account.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/test/computers.test.ts:263` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Relay `computers.danil.ai` (URL de sesión o de API); lo usa `account.tsx` de Alberto en `origin/dev`: se queda |
| `packages/computers/README.md:20` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Comentario del flujo que sigue vivo (`GET /v1/computers` en `origin/dev`): se queda |
| `packages/features/machines/src/screens/account.tsx:457` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Comentario del flujo que sigue vivo (`GET /v1/computers` en `origin/dev`): se queda |
| `packages/features/machines/src/screens/ConnectMachine.tsx:23` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Comentario del flujo que sigue vivo (`GET /v1/computers` en `origin/dev`): se queda |
| `packages/fleet/src/fleet.ts:213` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Comentario del flujo que sigue vivo (`GET /v1/computers` en `origin/dev`): se queda |
| `packages/fleet/src/fleet.ts:249` | Endpoint legado /v1/computers | /v1/computers | Se queda en 3.4: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/machines/account.tsx:453`, `:279`, `:292`) | Comentario del flujo que sigue vivo (`GET /v1/computers` en `origin/dev`): se queda |
| `packages/ui/src/styles/global.css:237` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: comentario de tokens vivos (`--color-inbox-*`); sin cambiar clases ni estilos | Solo comentario de procedencia, no consume Appv2 |
| `packages/ui/src/styles/global.css:244` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: comentario de tokens vivos (`--color-inbox-*`); sin cambiar clases ni estilos | Solo comentario de procedencia, no consume Appv2 |
| `packages/features/settings/src/model/fiscal.ts:3` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: comentario de procedencia de reglas fiscales vivas | Solo comentario; no consume Appv2 ni su BFF |
| `packages/attention/src/inbox.ts:5` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/src/inbox.ts:16` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/src/inbox.ts:111` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/src/inbox.ts:169` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/src/inbox.ts:178` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/src/channels.ts:7` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/test/inbox.test.ts:37` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/test/inbox.test.ts:51` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/test/channels.test.ts:7` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/README.md:4` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/README.md:26` | Reglas, contratos o referencias de Appv2 | appv2 | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/src/inbox.ts:55` | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/src/channels.ts:23` | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/test/inbox.test.ts:32` | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/test/channels.test.ts:29` | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/README.md:6` | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/README.md:20` | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/README.md:27` | BFF alfa legado /terminus/alpha-api | /terminus/alpha-api | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Módulo o prueba de `inbox.ts`/`channels.ts` que usa el teléfono: se queda con el paquete |
| `packages/attention/README.md:7` | BFF alfa legado /alpha-api | /alpha-api | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Documenta el prefijo `<base>alpha-api` que el teléfono pasa a `createInbox`/`createChannels` (`apps/mobile/src/lib/alpha-mode.ts:10`): se queda con el paquete |
| `packages/attention/README.md:21` | BFF alfa legado /alpha-api | /alpha-api | Se queda en 3.4b: `apps/mobile` lo importa también en `origin/dev` 9a0ee2ad (`apps/mobile/src/lib/inbox.tsx:2`, `apps/mobile/src/app/channels.tsx:4`; corrección del CTO 2026-11-21) | Documenta el prefijo `<base>alpha-api` que el teléfono pasa a `createInbox`/`createChannels` (`apps/mobile/src/lib/alpha-mode.ts:10`): se queda con el paquete |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/connections | /v1/connections |  / ticket relay vía  |  |
|  | Endpoint legado /v1/me/workspaces | /v1/me/workspaces |  vía  |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/github | /v1/workspaces/.../github | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/memory | /v1/workspaces/.../memory | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/memory | /v1/workspaces/.../memory | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/memory | /v1/workspaces/.../memory | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/memory | /v1/workspaces/.../memory | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/memory | /v1/workspaces/.../memory | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/memory | /v1/workspaces/.../memory | «se borra» |  |
|  | Subruta legada /v1/workspaces/{id}/logo | /v1/workspaces/.../logo |  vía  |  |
| `packages/platform-client/test/edge-context.test.ts:21` | Prueba de `X-Danil-Session` en PUT del logo (p-ctx 391ae088) | /v1/workspaces/.../logo | `PUT /v1/workspaces/{id}/logo` vía `platformFetch` | Añadida por p-ctx después de 3.1 |
|  | Subruta legada /v1/workspaces/{id}/logo | /v1/workspaces/.../logo |  vía  |  |
|  | Subruta legada /v1/workspaces/{id}/background | /v1/workspaces/.../background |  vía  |  |
| `packages/platform-client/test/edge-context.test.ts:22` | Prueba de `X-Danil-Session` en DELETE del fondo (p-ctx 391ae088) | /v1/workspaces/.../background | `DELETE /v1/workspaces/{id}/background` vía `platformFetch` | Añadida por p-ctx después de 3.1 |
|  | Gate de feature legado | legacyOrganizationGate |  vía  |  |
|  | Gate de feature legado | legacyOrganizationGate |  vía  |  |
|  | Gate de feature legado | legacyOrganizationGate |  vía  |  |
|  | Componente de menú legado | LegacyProfileMenu | «se borra» |  |
|  | Componente de menú legado | LegacyProfileMenu | «se borra» |  |
|  | Componente de pie legado | LegacyDanilFooterEntry | «se borra» |  |
|  | Propiedad legacy de cuenta de grupo | groupAccount.legacy | «se borra» |  |
|  | Propiedad legacy de cuenta de grupo | groupAccount.legacy | «se borra» |  |
|  | Propiedad legacy de cuenta de grupo | groupAccount.legacy | «se borra» |  |
|  | Propiedad legacy de cuenta de grupo | groupAccount.legacy | «se borra» |  |
|  | Contratos de motor legado | machineContracts |  vía  |  |
|  | Contratos de motor legado | machineContracts |  vía  |  |
|  | Contratos de motor legado | machineContracts |  vía  |  |
|  | Contratos de motor legado | machineContracts |  vía  |  |
|  | Contratos de motor legado | machineContracts |  vía  |  |
|  | Contratos de motor legado | machineContracts |  vía  |  |

---

## Lista negra de patrones para  (Gate 3.4)

Patrones disjuntos y exactos para el gate de verificación  y :

| Patrón | Regex | Sistema viejo | Conteo actual | Acción |
|---|---|---|---:|---|
| /v1/computers | /v1/computers | Borde viejo /v1/computers (R8) | 24 | Se queda lo que usa `origin/dev` (3.4: 31→24) |
| DANIL_COMPUTERS_URL | DANIL_COMPUTERS_URL | Variable de entorno de computers | 0 | Borrado (3.4) |
| appv2 | [aA]ppv2 | Appv2 / Danil Agents (R8) | 14 | Se queda lo que usa `apps/mobile` y comentarios (3.4b: 19→14) |
| createMessaging | createMessaging | Mensajería Appv2 (R8) | 0 | Borrado (3.4b) |
| /terminus/alpha-api | /terminus/alpha-api | BFF alfa legado /terminus/alpha-api | 7 | Se queda lo que usa `apps/mobile` (3.4b: 21→7) |
| /alpha-api | [^s]/alpha-api | BFF alfa legado /alpha-api | 2 | Se queda lo que usa `apps/mobile` (3.4b: 12→2) |
| /v1/connections | /v1/connections | Borde viejo /v1/connections | 7 | Se queda lo que usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/settings/Connections.tsx`: `listConnections`, `updateConnection`, `revokeConnection`, `connectionCapabilities`); 3.4c borra `connectionAudit` sin uso (8→7) |
| /v1/me/workspaces | /v1/me/workspaces | Borde viejo /v1/me/workspaces | 1 | Se queda en 3.4c: comentario de `packages/attention/src/workspace-account.ts`, igual en `origin/dev` 9a0ee2ad |
| /v1/workspaces/.../github | /v1/workspaces/[^/]+/github | Borde viejo github sync | 7 | Se queda en 3.4c: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/web/github-account.ts`, `apps/mobile/src/app/github/[workspace].tsx`) |
| /v1/workspaces/.../memory | /v1/workspaces/[^/]+/memory | Borde viejo memory | 6 | Se queda en 3.4c: lo usa `origin/dev` 9a0ee2ad (`apps/desktop/src/features/projects/memory-account.ts`, `Memoria.tsx`, `MemoryHistory.tsx`, `apps/mobile/src/lib/memory.ts`) |
| /v1/workspaces/.../logo | /v1/workspaces/[^/]+/logo | Borde viejo logo | 3 | Se queda en 3.4c (assets): `readAccountAsset`/`accountAssetUrl` los usa `origin/dev` 9a0ee2ad (`apps/desktop/src/web/workspace-assets.ts`, `apps/mobile/src/lib/workspaceLogo.ts`) |
| /v1/workspaces/.../background | /v1/workspaces/[^/]+/background | Borde viejo background | 2 | Se queda en 3.4c (assets): igual que logo |
| /v1/workspaces/.../restore | /v1/workspaces/[^/]+/restore | Borde viejo restore | 0 | Borrado (3.4c): prueba muerta de `restoreWorkspace`, sin función en `src` ni uso en `origin/dev` |
| /v1/workspaces/.../purge | /v1/workspaces/[^/]+/purge | Borde viejo purge | 0 | Borrado (3.4c): prueba muerta de `purgeWorkspace`, sin función en `src` ni uso en `origin/dev` |
| legacyOrganizationGate | legacyOrganizationGate | Gate de organización legado | 3 | Se borra |
| LegacyProfileMenu | LegacyProfileMenu | Menú de perfil legado | 2 | Se borra |
| LegacyDanilFooterEntry | LegacyDanilFooterEntry | Footer legado | 1 | Se borra |
| groupAccount.legacy | groupAccount.*legacy | groupAccount legado | 4 | Se borra |
| machineCompatibility | machineCompatibility | Compatibilidad vieja de máquinas | 0 | Borrado (3.4) |
| machineContracts | machineContracts | Contratos viejos de máquinas | 6 | Se borra |
| workers.internal | workers[.]internal | workers.internal | 0 | Se borra |
| access-projection | access-projection | access-projection | 0 | Se borra |
| legacy-desktop-auth | legacy-desktop-auth | legacy-desktop-auth | 0 | Se borra |
| supabase (auth/db) | supabase(Client|-js) | supabase legado | 0 | Se borra |
