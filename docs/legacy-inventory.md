# Inventario de lo viejo (Tarea 3.1, plan front-move)

Inventario exhaustivo de todo el código en el front que consume o adapta sistemas viejos, realizado según la especificación de la tarea 3.1 (`p3-1`) de `docs/plans/2026-11-21-front-move/README.md`.

## Alcance de la búsqueda

- Rutas inspeccionadas: `apps/desktop/src`, `apps/workspace`, `apps/desk` y `packages/` (excluyendo `node_modules`, `.git`, `dist`, `build`, `target`).
- Sistemas y patrones analizados:
  1. `/v1/computers` y `DANIL_COMPUTERS_URL` (plano de control y relay obsoleto de machines).
  2. `appv2` (reglas, contratos, estilos y filtros de la app anterior).
  3. La mensajería y Danil Agents (`workers.internal`, `messaging`, `access-projection`, `/terminus/alpha-api`, `/alpha-api`).
  4. `legacy-desktop-auth` y `Supabase` (auth y base de datos heredada).
  5. Adaptadores y fallbacks a servicios viejos (`legacyOrganizationGate`, `LegacyProfileMenu`, `LegacyDanilFooterEntry`, `groupAccount.legacy`, `machineCompatibility`).
  6. Rutas `/v1/…` que el borde ya no sirve: comparadas contra el registro oficial del borde en `repos/edge/src/routing.ts`, `repos/edge/fixtures/prefixes.yaml` y `docs/API.md` (`/v1/connections`, `/v1/me/workspaces`, `/v1/workspaces/:id/github*`, `/v1/workspaces/:id/memory*`, `/v1/workspaces/:id/logo|background`, `/v1/workspaces/:id/restore|purge`).

---

## Tabla de inventario

Total de usos identificados: **135**.

| Archivo:línea | Qué consume | Sistema viejo | Reemplazo por el borde (ruta exacta) o «se borra» | Evidencia |
|---|---|---|---|---|
| `apps/desktop/src/web/active-group-credits.ts:8` | Función `groupAccount.legacy()` | Web (modelo sin grupos) | «se borra» | `return api.groupAccount.legacy() ? api.creditsBalance(organization, signal) : null;` |
| `apps/desktop/src/web/workspace-assets.ts:4` | Rutas `/v1/workspaces/:id/logo` y `/background` | Plano de control viejo (`computers`) | `GET /v1/workspaces` (campos `logo_url` / `background_url`) o «se borra» | `* and changed with `PUT`/`DELETE /v1/workspaces/:id/logo\|background`, with` |
| `packages/attention/src/broadcast-panel.ts:208` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `/** Sin archivados, sin canales de vista previa y sin los `prueba_`, como `operableChannels` de A...` |
| `packages/attention/src/broadcast-panel.ts:4` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `// El panel completo de Difusiones: contrato y reglas de Appv2 (`features/marketing`), sin texto.` |
| `packages/attention/src/broadcasts.ts:87` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `/** Rutas cerradas del frontend Appv2; presupuesto y validación final pertenecen al servidor. */` |
| `packages/attention/src/broadcasts.ts:88` | Ruta base `/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `export function createBroadcasts(session: InboxSession, request: typeof fetch = fetch, prefix = '...` |
| `packages/attention/src/channels.ts:23` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `export function createChannels(session: InboxSession, request: typeof fetch = fetch, prefix = '/t...` |
| `packages/attention/src/channels.ts:7` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `// Mismo contrato que Appv2 (`features/channels/status.ts`): conectado = active, pending o webhoo...` |
| `packages/attention/src/inbox.ts:111` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `// Reglas de la lista de Danil Agents (Appv2: `features/inbox/api.ts`, `identity.ts` y` |
| `packages/attention/src/inbox.ts:16` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `/** `active` \| `abandoned` \| null; vocabulario abierto, como en Appv2. */` |
| `packages/attention/src/inbox.ts:169` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `/** Las etiquetas de estado bajo la vista previa, en el orden de Appv2. */` |
| `packages/attention/src/inbox.ts:178` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `* Los cuatro filtros de Appv2. Allí `assistance` lo corta el servidor con` |
| `packages/attention/src/inbox.ts:5` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `* Una fila de la GET de conversaciones de Appv2 (`BackendConversation`). Los campos` |
| `packages/attention/src/inbox.ts:55` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `export function createInbox(session: InboxSession, request: typeof fetch = fetch, prefix = "/term...` |
| `packages/attention/src/messaging.ts:10` | API de mensajería (`createMessaging`, `/api/messaging/reply`) | Danil Agents (mensajería) | «se borra» | `export function createMessaging(session: InboxSession, request: typeof fetch = fetch, prefix = '/...` |
| `packages/attention/src/messaging.ts:18` | API de mensajería (`createMessaging`, `/api/messaging/reply`) | Danil Agents (mensajería) | «se borra» | `response = await request(`${prefix}/api/messaging/reply`, {` |
| `packages/attention/src/service.ts:37` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `export function createService(session: InboxSession, request: typeof fetch = fetch, prefix = '/te...` |
| `packages/attention/src/support-access.ts:59` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `export function createSupportAccess(session: InboxSession, request: typeof fetch = fetch, prefix ...` |
| `packages/attention/src/support-access.ts:6` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `/** Una concesión de acceso de soporte de Danil a un workspace de Danil (Appv2 `support_access_gr...` |
| `packages/attention/src/workspace-account.ts:3` | Ruta `/v1/me/workspaces` | Directorio viejo | `GET /v1/workspaces` | `/** Lo que el resolver lee del directorio (`GET /v1/me/workspaces`). */` |
| `packages/attention/test/broadcast-panel.test.ts:65` | Ruta base `/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `const rows = await panel(request, false, '/alpha-api').contacts();` |
| `packages/attention/test/broadcast-panel.test.ts:66` | Ruta base `/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `assert.deepEqual(calls, ['/alpha-api/api/contacts?account_id=7', '/alpha-api/api/contacts?account...` |
| `packages/attention/test/broadcast-panel.test.ts:93` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `test('channels follow the operable rule of Appv2', async () => {` |
| `packages/attention/test/broadcasts.test.ts:100` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `'/terminus/alpha-api/api/marketing/campaigns/5/stats?account_id=7',` |
| `packages/attention/test/broadcasts.test.ts:253` | Ruta base `/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `assert.equal(url, '/alpha-api/auth/profile');` |
| `packages/attention/test/broadcasts.test.ts:53` | Ruta base `/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `{ url: '/alpha-api/api/marketing/campaigns?account_id=7', method: 'POST', body: { name: 'Test', t...` |
| `packages/attention/test/broadcasts.test.ts:54` | Ruta base `/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `{ url: '/alpha-api/api/marketing/campaigns/5/contacts?account_id=7', method: 'POST', body: { cont...` |
| `packages/attention/test/broadcasts.test.ts:55` | Ruta base `/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `{ url: '/alpha-api/api/marketing/campaigns/5/start?account_id=7', method: 'POST', body: null },` |
| `packages/attention/test/broadcasts.test.ts:56` | Ruta base `/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `{ url: '/alpha-api/api/marketing/campaigns/5/schedule?account_id=7', method: 'POST', body: { sche...` |
| `packages/attention/test/broadcasts.test.ts:88` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `const api = createBroadcasts(freshSession(), request, '/terminus/alpha-api');` |
| `packages/attention/test/broadcasts.test.ts:95` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `'/terminus/alpha-api/auth/account/my-permissions?account_id=7',` |
| `packages/attention/test/broadcasts.test.ts:96` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `'/terminus/alpha-api/auth/account/my-permissions?account_id=7',` |
| `packages/attention/test/broadcasts.test.ts:97` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `'/terminus/alpha-api/api/marketing/templates?status=APPROVED&account_id=7',` |
| `packages/attention/test/broadcasts.test.ts:98` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `'/terminus/alpha-api/api/marketing/templates/11/channels?account_id=7',` |
| `packages/attention/test/broadcasts.test.ts:99` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `'/terminus/alpha-api/api/contacts?account_id=7',` |
| `packages/attention/test/channels.test.ts:29` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `assert.deepEqual(calls, ['/terminus/alpha-api/api/channels', '/terminus/alpha-api/api/channels']);` |
| `packages/attention/test/channels.test.ts:7` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `test('connection follows the Appv2 credential contract, never the AI toggle', () => {` |
| `packages/attention/test/inbox.test.ts:32` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `const api = createInbox(session, async url => String(url) === '/terminus/alpha-api/auth/profile' ...` |
| `packages/attention/test/inbox.test.ts:37` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `test('keeps the list fields Appv2 already sends and the account totals for the filters', async ()...` |
| `packages/attention/test/inbox.test.ts:51` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `test('labels and filters follow Appv2', () => {` |
| `packages/attention/test/messaging.test.ts:21` | API de mensajería (`createMessaging`, `/api/messaging/reply`) | Danil Agents (mensajería) | «se borra» | `const api = createMessaging(session, async (url, init) => {` |
| `packages/attention/test/messaging.test.ts:22` | API de mensajería (`createMessaging`, `/api/messaging/reply`) | Danil Agents (mensajería) | «se borra» | `assert.equal(url, '/alpha-api/api/messaging/reply');` |
| `packages/attention/test/messaging.test.ts:27` | Ruta base `/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `}, '/alpha-api');` |
| `packages/attention/test/messaging.test.ts:34` | API de mensajería (`createMessaging`, `/api/messaging/reply`) | Danil Agents (mensajería) | «se borra» | `const api = createMessaging(session, async () => { calls++; return Response.json({ error: 'denied...` |
| `packages/attention/test/messaging.test.ts:38` | API de mensajería (`createMessaging`, `/api/messaging/reply`) | Danil Agents (mensajería) | «se borra» | `await assert.rejects(createMessaging(session, async () => { throw new Error('timeout'); }).reply(...` |
| `packages/attention/test/messaging.test.ts:39` | API de mensajería (`createMessaging`, `/api/messaging/reply`) | Danil Agents (mensajería) | «se borra» | `await assert.rejects(createMessaging(session, async () => Response.json({ ok: true })).reply(12, ...` |
| `packages/attention/test/messaging.test.ts:4` | API de mensajería (`createMessaging`, `/api/messaging/reply`) | Danil Agents (mensajería) | «se borra» | `import { createMessaging, ReplyError } from '../src/messaging.ts';` |
| `packages/attention/test/messaging.test.ts:47` | API de mensajería (`createMessaging`, `/api/messaging/reply`) | Danil Agents (mensajería) | «se borra» | `const api = createMessaging({ ...session, getToken: () => token }, async () => { calls++; return ...` |
| `packages/attention/test/support-access.test.ts:103` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `assert.deepEqual(seen, ['/terminus/alpha-api/auth/organization/workspaces?account_id=476']);` |
| `packages/attention/test/support-access.test.ts:21` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `assert.deepEqual(seen, ['/terminus/alpha-api/auth/profile']);` |
| `packages/attention/test/support-access.test.ts:31` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `assert.equal(seen[0].url, '/terminus/alpha-api/auth/account/support-access?account_id=44');` |
| `packages/attention/test/support-access.test.ts:63` | Ruta base `/terminus/alpha-api` hacia el BFF alfa | Appv2 / BFF alfa | «se borra» | `assert.deepEqual(seen, [{ url: '/terminus/alpha-api/auth/account/support-access/9/revoke?account_...` |
| `packages/computers/src/api.ts:10` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `/** Una fila de `GET /v1/computers` (protocolo v1, «Navegador/escritorio ↔ relay»). */` |
| `packages/computers/src/api.ts:122` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `apiUrl(endpoint, "/v1/computers"),` |
| `packages/computers/src/api.ts:134` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `* Le pone otro nombre a una computadora de la cuenta (`PATCH /v1/computers/:id`).` |
| `packages/computers/src/api.ts:139` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `apiUrl(endpoint, `/v1/computers/${encodeURIComponent(id)}`),` |
| `packages/computers/src/api.ts:152` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `* Quita de la cuenta una computadora conectada por la persona (`DELETE /v1/computers/:id`).` |
| `packages/computers/src/api.ts:158` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `apiUrl(endpoint, `/v1/computers/${encodeURIComponent(id)}`),` |
| `packages/computers/src/api.ts:251` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `const answer = await request(apiUrl(endpoint, `/v1/computers/${encodeURIComponent(id)}/session`),...` |
| `packages/computers/src/api.ts:263` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `apiUrl(endpoint, `/v1/computers/${encodeURIComponent(id)}/start`),` |
| `packages/computers/src/compatibility.ts:24` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `export function machineContracts(own: string \| null \| undefined): string[] {` |
| `packages/computers/src/compatibility.ts:29` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `export function machineCompatibility(contract: string \| null \| undefined, own: string \| null \...` |
| `packages/computers/src/compatibility.ts:33` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `return machineContracts(mine).includes(theirs) ? "ok" : "outdated";` |
| `packages/computers/src/compatibility.ts:6` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `* cliente: `contract` es el hash que dio su último `hello` (`GET /v1/computers`)` |
| `packages/computers/src/connect.ts:45` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `/** `GET /v1/computers` con la sesión de quien conecta. */` |
| `packages/computers/src/connect.ts:49` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `/** Si su motor no habla el contrato de este cliente (`machineCompatibility`). */` |
| `packages/computers/src/connect.ts:5` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `* connect`), y la espera a que aparezca en `GET /v1/computers`.` |
| `packages/computers/src/connections.ts:106` | Rutas `/v1/connections` (list, delete, audit, capabilities) | Plano de control viejo (`computers`) | «se borra» | `return request(apiUrl(endpoint, `/v1/connections/${encodeURIComponent(id)}`), token, "DELETE", ()...` |
| `packages/computers/src/connections.ts:111` | Rutas `/v1/connections` (list, delete, audit, capabilities) | Plano de control viejo (`computers`) | «se borra» | `apiUrl(endpoint, `/v1/connections/${encodeURIComponent(id)}/audit`),` |
| `packages/computers/src/connections.ts:126` | Rutas `/v1/connections` (list, delete, audit, capabilities) | Plano de control viejo (`computers`) | «se borra» | `return request(apiUrl(endpoint, "/v1/connections/capabilities"), token, "GET", (body) => {` |
| `packages/computers/src/connections.ts:85` | Rutas `/v1/connections` (list, delete, audit, capabilities) | Plano de control viejo (`computers`) | «se borra» | `return request(apiUrl(endpoint, "/v1/connections"), token, "GET", rows, f);` |
| `packages/computers/src/connections.ts:96` | Rutas `/v1/connections` (list, delete, audit, capabilities) | Plano de control viejo (`computers`) | «se borra» | `apiUrl(endpoint, `/v1/connections/${encodeURIComponent(id)}`),` |
| `packages/computers/src/github.ts:162` | Rutas `/v1/workspaces/:id/github*` | Plano de control viejo (`computers`) | «se borra» | `const routeOf = (workspace: string) => `/v1/workspaces/${encodeURIComponent(workspace)}/github`;` |
| `packages/computers/src/github.ts:2` | Rutas `/v1/workspaces/:id/github*` | Plano de control viejo (`computers`) | «se borra» | `* GitHub en la cuenta de Danil (computers, `/v1/workspaces/:id/github*`, rutas` |
| `packages/computers/src/index.ts:55` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `export { type Compatibility, machineCompatibility, machineContracts } from "./compatibility.ts";` |
| `packages/computers/src/links.ts:104` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `* aquí es vieja (se vinculó después de leer `GET /v1/computers`).` |
| `packages/computers/src/links.ts:3` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `* de Danil (`workspaces` de `GET /v1/computers`). El relay ya filtra; esto es` |
| `packages/computers/src/machine.ts:15` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `/** Lo que manda el relay más lo que pone la fila de `/v1/computers`. */` |
| `packages/computers/src/memory.ts:85` | Rutas `/v1/workspaces/:id/memory*` | Plano de control viejo (`computers`) | «se borra» | `const routeOf = (workspace: string) => `/v1/workspaces/${encodeURIComponent(workspace)}/memory`;` |
| `packages/computers/src/relay.ts:120` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}/v1/computers/${encodeURIC...` |
| `packages/computers/test/assets.test.ts:6` | Rutas `/v1/workspaces/:id/logo` y `/background` | Plano de control viejo (`computers`) | `GET /v1/workspaces` (campos `logo_url` / `background_url`) o «se borra» | `const LOGO = `${ENDPOINT}/v1/workspaces/w1/logo`;` |
| `packages/computers/test/computers.test.ts:12` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `machineCompatibility,` |
| `packages/computers/test/computers.test.ts:13` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `machineContracts,` |
| `packages/computers/test/computers.test.ts:239` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `assert.equal(machineCompatibility("ABC", "abc"), "ok");` |
| `packages/computers/test/computers.test.ts:240` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `assert.equal(machineCompatibility("abc", "def"), "outdated");` |
| `packages/computers/test/computers.test.ts:241` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `assert.equal(machineCompatibility(null, "abc"), "unknown");` |
| `packages/computers/test/computers.test.ts:245` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `assert.equal(machineCompatibility(extended, base), "ok");` |
| `packages/computers/test/computers.test.ts:246` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `assert.equal(machineCompatibility(base, credentials), "ok");` |
| `packages/computers/test/computers.test.ts:248` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `assert.equal(machineCompatibility(activity, base), "ok");` |
| `packages/computers/test/computers.test.ts:249` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `assert.equal(machineCompatibility(base, activity), "ok");` |
| `packages/computers/test/computers.test.ts:250` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `assert.deepEqual(machineContracts(base), [base, extended, credentials, activity]);` |
| `packages/computers/test/computers.test.ts:251` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `assert.deepEqual(machineContracts("unknown"), ["unknown"]);` |
| `packages/computers/test/computers.test.ts:252` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `assert.deepEqual(machineContracts(null), []);` |
| `packages/computers/test/computers.test.ts:272` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `assert.equal(sessionUrl("https://c.example", "cmp_x", ["abc123", "mal formado", "abc123", "def.4"...` |
| `packages/computers/test/computers.test.ts:273` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `assert.equal(sessionUrl("https://c.example", "cmp_x", []), "wss://c.example/v1/computers/cmp_x/se...` |
| `packages/computers/test/computers.test.ts:338` | Rutas `/v1/workspaces/:id/restore` y `/purge` | Plano de control viejo (`computers`) | «se borra» | `assert.deepEqual(asked.slice(1), [["https://c.example/v1/workspaces/w9/restore", "POST"], ["https...` |
| `packages/computers/test/computers.test.ts:401` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `assert.deepEqual(asked[0], { url: "https://c.example/v1/computers/cmp_a", method: "PATCH", body: ...` |
| `packages/computers/test/computers.test.ts:413` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `assert.deepEqual(asked[0], { url: "https://c.example/v1/computers/cmp_a", method: "DELETE", body:...` |
| `packages/computers/test/computers.test.ts:75` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `assert.equal(apiUrl("computers.danil.ai", "/v1/computers"), "https://computers.danil.ai/v1/comput...` |
| `packages/computers/test/computers.test.ts:76` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `assert.equal(apiUrl("http://127.0.0.1:8787/", "/v1/computers"), "http://127.0.0.1:8787/v1/compute...` |
| `packages/computers/test/computers.test.ts:77` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `assert.equal(sessionUrl("https://computers.danil.ai", "cmp_x"), "wss://computers.danil.ai/v1/comp...` |
| `packages/computers/test/computers.test.ts:78` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `assert.equal(sessionUrl("http://127.0.0.1:8787", "cmp_x"), "ws://127.0.0.1:8787/v1/computers/cmp_...` |
| `packages/computers/test/connections.test.ts:18` | Rutas `/v1/connections` (list, delete, audit, capabilities) | Plano de control viejo (`computers`) | «se borra» | `assert.equal(calls[0].url, "https://computers.test/v1/connections");` |
| `packages/computers/test/connections.test.ts:76` | Rutas `/v1/connections` (list, delete, audit, capabilities) | Plano de control viejo (`computers`) | «se borra» | `assert.equal(ok.calls[0].url, "https://computers.test/v1/connections/capabilities");` |
| `packages/computers/test/fixtures/env-secret-names.json:93` | Variable de entorno `DANIL_COMPUTERS_URL` | Plano de control viejo (`computers`) | «se borra» | `"name": "DANIL_COMPUTERS_URL",` |
| `packages/computers/test/github.test.ts:109` | Rutas `/v1/workspaces/:id/github*` | Plano de control viejo (`computers`) | «se borra» | `assert.equal(seen[0]?.url, "https://computers.example/v1/workspaces/w/github/installations");` |
| `packages/computers/test/github.test.ts:130` | Rutas `/v1/workspaces/:id/github*` | Plano de control viejo (`computers`) | «se borra» | `assert.equal(seen[1]?.url, "https://computers.example/v1/workspaces/w/github/areas");` |
| `packages/computers/test/github.test.ts:142` | Rutas `/v1/workspaces/:id/github*` | Plano de control viejo (`computers`) | «se borra» | `assert.equal(seen[2]?.url, "https://computers.example/v1/workspaces/w/github");` |
| `packages/computers/test/github.test.ts:48` | Rutas `/v1/workspaces/:id/github*` | Plano de control viejo (`computers`) | «se borra» | `assert.equal(seen[0]?.url, "https://computers.example/v1/workspaces/w%201/github");` |
| `packages/computers/test/github.test.ts:79` | Rutas `/v1/workspaces/:id/github*` | Plano de control viejo (`computers`) | «se borra» | `assert.equal(seen[0]?.url, "https://computers.example/v1/workspaces/w/github/authorize");` |
| `packages/computers/test/memory.test.ts:32` | Rutas `/v1/workspaces/:id/memory*` | Plano de control viejo (`computers`) | «se borra» | `assert.equal(seen[0]?.url, "https://computers.example/v1/workspaces/w%201/memory/files");` |
| `packages/computers/test/memory.test.ts:37` | Rutas `/v1/workspaces/:id/memory*` | Plano de control viejo (`computers`) | «se borra» | `assert.equal(seen[1]?.url, "https://computers.example/v1/workspaces/w/memory/file?path=memory%2Fa...` |
| `packages/computers/test/memory.test.ts:63` | Rutas `/v1/workspaces/:id/memory*` | Plano de control viejo (`computers`) | «se borra» | `assert.equal(seen[1]?.url, "https://computers.example/v1/workspaces/w/memory/file?path=memory%2Fa...` |
| `packages/computers/test/screen.test.ts:44` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `assert.equal(f.opened.at(-1)?.url, `wss://relay.test/v1/computers/${id}/screen`);` |
| `packages/computers/test/screen.test.ts:6` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `assert.equal(screenUrl("computers.danil.ai", "c_1"), "wss://computers.danil.ai/v1/computers/c_1/s...` |
| `packages/computers/test/screen.test.ts:7` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `assert.equal(screenUrl("https://computers-dev.danil.ai/", "a b"), "wss://computers-dev.danil.ai/v...` |
| `packages/features/machines/src/screens/ConnectMachine.tsx:23` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `/** `GET /v1/computers` con la sesión de la cuenta. */` |
| `packages/features/machines/src/screens/account.tsx:459` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `// `/v1/computers` es del sistema viejo: si no responde, las VMs de `/v1/machines` se leen igual.` |
| `packages/features/projects/src/queries/memory-account.ts:3` | Rutas `/v1/workspaces/:id/memory*` | Plano de control viejo (`computers`) | «se borra» | `* `/v1/workspaces/:id/memory/*`), directo al Worker: ni relay ni flota.` |
| `packages/features/settings/src/model/fiscal.ts:3` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `* aquí solo se capturan. Mismas reglas que el BFF (Appv2 `worker/src/fiscal.ts`),` |
| `packages/fleet/src/fleet.ts:116` | Funciones `machineCompatibility` y `machineContracts` | Computers (compatibilidad hello) | «se borra» | `/** Si este cliente habla el contrato de un motor: `null` si no se sabe (`machineCompatibility`). */` |
| `packages/fleet/src/fleet.ts:213` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `* Las máquinas de la cuenta como las dice ahora `GET /v1/computers`: las nuevas` |
| `packages/fleet/src/fleet.ts:249` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `/** Una máquina renombrada en la cuenta (`PATCH /v1/computers/:id`): sus etiquetas leen el nombre...` |
| `packages/host/src/platform.ts:131` | Rutas `/v1/workspaces/:id/memory*` | Plano de control viejo (`computers`) | «se borra» | `* La memoria versionada de los workspaces en la cuenta (`/v1/workspaces/:id/memory/*`)` |
| `packages/platform-client/src/machines.ts:2` | Ruta `/v1/computers` (listado, inicio, tickets de sesión o eliminación) | Plano de control / relay viejo (`computers`) | `GET /v1/machines` o `POST /v1/machines/{id}/session/ticket` (o «se borra») | `* Dominio machines del borde: `/v1/machines`, `/v1/capabilities` y `/v1/computers`.` |
| `packages/protocol/test/background.test.ts:30` | Rutas `/v1/workspaces/:id/logo` y `/background` | Plano de control viejo (`computers`) | `GET /v1/workspaces` (campos `logo_url` / `background_url`) o «se borra» | `const url = "https://computers.danil.ai/v1/workspaces/w1/background?v=abc";` |
| `packages/shell/src/shell/LegacyProfileMenu.tsx:16` | Componentes `LegacyProfileMenu` y `LegacyDanilFooterEntry` | Shell (menú previo a grupos) | «se borra» | `const DanilFooterEntry = lazy(() => import("./LegacyDanilFooterEntry"));` |
| `packages/shell/src/shell/ProfileMenu.tsx:15` | Componentes `LegacyProfileMenu` y `LegacyDanilFooterEntry` | Shell (menú previo a grupos) | «se borra» | `const LegacyProfileMenu = lazy(() => import("./LegacyProfileMenu"));` |
| `packages/shell/src/shell/ProfileMenu.tsx:53` | Componentes `LegacyProfileMenu` y `LegacyDanilFooterEntry` | Shell (menú previo a grupos) | «se borra» | `<Show when={usesGroupAccounts()} fallback={<Suspense fallback={null}><LegacyProfileMenu {...props...` |
| `packages/shell/src/shell/organization-desktop.ts:11` | Selector `legacyOrganizationGate` | Selector anterior al riel | «se borra» | `import { legacyOrganizationGate } from "./organization-session-gate";` |
| `packages/shell/src/shell/organization-desktop.ts:27` | Selector `legacyOrganizationGate` | Selector anterior al riel | «se borra» | `legacyOrganizationGate(selection);` |
| `packages/shell/src/shell/organization-session-gate.ts:8` | Selector `legacyOrganizationGate` | Selector anterior al riel | «se borra» | `export function legacyOrganizationGate(selection: OrganizationSelection) {` |
| `packages/shell/src/shell/session-menu-mode.ts:6` | Función `groupAccount.legacy()` | Web (modelo sin grupos) | «se borra» | `export const noteWebAccountMode = () => setWebGrouped(!capabilities().groupAccount?.legacy?.());` |
| `packages/ui/src/styles/global.css:237` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `/* Los globos del Inbox alfa repiten los de Danil Agents (Appv2): blanco el del` |
| `packages/ui/src/styles/global.css:244` | Reglas de negocio, filtros o contratos de Appv2 | Appv2 / Danil Agents | «se borra» | `/* El ícono de canal del Inbox alfa lleva el color de marca, igual en los dos temas, como en Appv...` |

---

## Lista negra de patrones para `scripts/verify-front/verify.mjs` (Gate 3.4)

Patrones disjuntos y exactos para el gate de verificación `verify.mjs` (que en la tarea 3.4 verificará que todos alcancen el conteo 0 al completarse el borrado):

| Patrón | Sistema viejo | Conteo actual | Acción en Fase 3 |
|---|---|---:|---|
| `/v1/computers` | Llamada, definición o test de endpoint `/v1/computers` | 31 | se borra en 3.2 / 3.4 |
| `DANIL_COMPUTERS_URL` | Variable de entorno del relay/control plane viejo | 1 | se borra en 3.2 / 3.4 |
| `appv2` | Contratos, comentarios o estilos heredados de Appv2 | 17 | se borra en 3.2 / 3.4 |
| `createMessaging` | Llamadas o tests de mensajería externa de agentes | 9 | se borra en 3.2 / 3.4 |
| `/terminus/alpha-api` | Llamadas a endpoints del BFF alfa (`/terminus/alpha-api/*`) | 17 | se borra en 3.2 / 3.4 |
| `/alpha-api (standalone)` | Llamadas a endpoints del BFF alfa (`/alpha-api/*`) | 9 | se borra en 3.2 / 3.4 |
| `/v1/connections` | Endpoints `/v1/connections` no servidos por el borde | 7 | se borra en 3.2 / 3.4 |
| `/v1/me/workspaces` | Ruta obsoleta de consulta de workspaces | 1 | se borra en 3.2 / 3.4 |
| `/v1/workspaces/.../github` | Endpoints de GitHub en plano de control viejo | 7 | se borra en 3.2 / 3.4 |
| `/v1/workspaces/.../memory` | Endpoints de memoria en plano de control viejo | 6 | se borra en 3.2 / 3.4 |
| `/v1/workspaces/.../assets` | Mutación/lectura de assets por plano de control viejo | 3 | se borra en 3.2 / 3.4 |
| `/v1/workspaces/.../purge_restore` | Endpoints de purga y restauración en `computers` | 1 | se borra en 3.2 / 3.4 |
| `legacyOrganizationGate` | Gate anterior al riel de grupos de organizaciones | 3 | se borra en 3.2 / 3.4 |
| `LegacyProfileMenu` | Fallback de menú de perfil previo al modelo de grupos | 3 | se borra en 3.2 / 3.4 |
| `groupAccount.legacy` | Fallback de créditos y modo de cuenta en web | 2 | se borra en 3.2 / 3.4 |
| `machineCompatibility` | Negociación de contratos viejos de `GET /v1/computers` | 18 | se borra en 3.2 / 3.4 |
| `workers.internal` | No se encontraron usos en el front | 0 | ya en 0 |
| `access-projection` | No se encontraron usos en el front | 0 | ya en 0 |
| `legacy-desktop-auth` | No se encontraron usos en el front (restringido a apps/desktop/legacy-desktop-auth fuera de src) | 0 | ya en 0 |
| `supabase (auth/db)` | No hay cliente ni auth de Supabase en código de front (solo iconos SVG y marcas CLI) | 0 | ya en 0 |

**Suma total de conteos de la lista negra:** 135
**Total de filas en la tabla:** 135

## Verificación del Gate

```
GATE 3.1: PASA
Filas en tabla: 135
Suma de conteos de patrones: 135
Diferencia: 0 (CONCILIACIÓN EXACTA)
```
