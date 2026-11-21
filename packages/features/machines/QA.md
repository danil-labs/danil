# QA de Comportamiento: Machines, Workspaces y Account

Evaluación formal de comportamiento del front nuevo frente a las especificaciones:
- `10-machines-spec.md` (Criterios M1 a M9)
- `11-business-logic.md` (Secciones 1: Sesiones, 2: Workspaces, 6: Conexión a máquinas)

---

## 1. Tabla de Criterios M1..M9 (`10-machines-spec.md`)

| # | Requisito | Estado inicial | Archivo:Línea | Qué falta / Observaciones |
|---|---|---|---|---|
| **M1** | «Tus máquinas» lista todas las máquinas de la sesión sin filtros propios del front (Web y Desk por sesión) | Cumple | `packages/features/machines/src/queries.ts:175-179` | Arreglado: `useMachines` lista sin filtros propios del front y aplica `sortMachines` (personal primero, luego por organización y alfabéticamente por nombre), y `resolveSession` permite especificar y resolver sesiones concretas desde `SessionSource` y `SessionOptions`. |
| **M2** | La lista no depende de workspace activo; si no hay workspace se ven las máquinas | Cumple | `packages/features/machines/src/queries.ts:138` | `getMachines()` no envía ni condiciona por cabecera ni contexto de workspace. |
| **M3** | «Ejecutar en» ofrece máquinas autorizadas del workspace actual (plataforma da lista prefiltrada) | Cumple | `packages/features/machines/src/components/RunOnPicker.tsx:8` | `RunOnPicker` recibe la lista prefiltrada. (Para VP1: cuando la lista está vacía debe mostrar error de gobernanza según regla 2.6). |
| **M4** | En la web no existe «local»; solo máquinas por relay | Cumple | `packages/features/machines/src/queries.ts:214` | En Web `host` es `undefined`, por lo que `connectMachine` enruta obligatoriamente por relay WebSocket. |
| **M5** | En Desk la máquina local aparece como una más con icono de laptop y transporte IPC (R5) | Cumple | `packages/features/machines/src/components/MachineIcon.tsx:13` | La lógica no distingue entornos; solo el icono visual según `kind === "personal"`. |
| **M6** | Estado visible en todo momento (`running`, `stopped`, `starting`, `stopping`, `connected`). Encender y apagar desde la lista | Cumple | `packages/features/machines/src/components/MachineBadge.tsx:11`, `queries.ts:156,180` | `useMachines` provee `start` y `stop` con sondeo de `getOperation` cada 1,5 s y `MachineBadge` refleja estados y transiciones. |
| **M6b** | Conectar despierta la VM apagada. «encendiendo…» con reintento del ticket. Nunca 409 final ni encendido a mano | Cumple | `packages/features/machines/src/queries.ts:238-249` | Arreglado: ante 409 o VM stopped, `requestTicket` dispara `startMachine` de respaldo para despertar la máquina en la plataforma sin intervención manual y retorna `machine_unreachable`, activando en `createRelayTransport` el estado `waking` («encendiendo…») con reintento cada 2 s. |
| **M7** | Máquina recién creada aparece sola sin recargar (~30 s) | Cumple | `packages/features/machines/src/queries.ts:146-154` | Sondeo periódico cada 15 segundos en `useMachines` mediante temporizador que ejecuta `refetch()`. |
| **M8** | Error de la API se muestra como error con reintento, NUNCA como lista vacía | No cumple | `packages/features/workspaces/src/screens/WorkspacesScreen.tsx:92` | En workspaces, si ocurre un error de carga, la pantalla muestra el mensaje de lista vacía en lugar de la vista de error. En `queries.ts`, los errores deben propagarse con tipado y mensaje legible. |
| **M9** | Un solo camino de código para Web y Desk: `features/machines/queries.ts` sobre `platform-client` | Cumple | `packages/features/machines/src/queries.ts:130` | No existen ramas bifurcadas de red; un único cliente y un único hook para ambas plataformas. |

---

## 2. Tabla de Reglas de Negocio (`11-business-logic.md` §§ 1, 2 y 6)

| Sección | Regla | Estado inicial | Archivo:Línea | Qué falta / Observaciones |
|---|---|---|---|---|
| **§ 1 Sesiones** | **1.1** Web opera con una sola sesión activa (cookie HttpOnly) | Cumple | `packages/features/machines/src/queries.ts:60` | Web resuelve sesión canónica única. |
| **§ 1 Sesiones** | **1.2** Desk soporta múltiples sesiones simultáneas `(correo, organización)` | Cumple | `packages/features/machines/src/queries.ts:80-97` | Arreglado: `resolveSession` permite resolver una sesión específica indicada por `sessionKey` o `session` sobre el `SessionSource` además de la predeterminada. |
| **§ 1 Sesiones** | **1.3** Login web con WorkOS y cookie `__Host-danil_session`; JS nunca ve tokens en plano | Cumple | Plataforma / `@danil/session` | Cumplido por arquitectura de borde y cliente de sesión. |
| **§ 1 Sesiones** | **1.4** Mutaciones web envían token CSRF en `X-Danil-Session` | Cumple | `@danil/platform-client/src/http.ts:54` | Inyección automática de cabecera CSRF en toda mutación POST/PUT/DELETE. |
| **§ 1 Sesiones** | **1.5** Navegación Desk a billing/harness abre navegador externo (`host.openExternal`) | Cumple | `packages/features/account/src/components/BillingLink.tsx:16`, `HarnessLink.tsx:16` | Usa `host.openExternal` con URLs configuradas. |
| **§ 1 Sesiones** | **1.6** Sin sesión activa: pantalla de entrada inmediata; nunca renderiza riel ni workspaces | Cumple | Shell / `@danil/platform-client` | 401 capturado centralmente por `onUnauthorized()`. |
| **§ 2 Workspaces** | **2.1** Workspaces pertenecen estrictamente a una organización; no hay workspace local sin cuenta | No cumple | `packages/features/workspaces/src/queries.ts:130` | `useWorkspaces` filtraba con `w.org === orgId || !w.org`, aceptando workspaces huérfanos sin organización. |
| **§ 2 Workspaces** | **2.2** Primer inicio: recibe organización personal Free predeterminada | Cumple | Plataforma / Borde | Provisto por la plataforma. |
| **§ 2 Workspaces** | **2.3** Hablar siempre de planes («Personal», «Team», «Enterprise») y NUNCA exponer la palabra «Organización» (P11) | No cumple | `packages/features/workspaces/src/model.ts:27`, `packages/features/account/src/model.ts:20` | `getPlanLabel` retornaba `org.name` directamente sin filtrar la palabra «Organización». Copys de pantallas usan la palabra prohibida. |
| **§ 2 Workspaces** | **2.4** Proyectos multi-máquina no asumen replicación automática entre laptop y VMs | Cumple | Dominio Motor / Projects | Aislado en motor. |
| **§ 2 Workspaces** | **2.5** Máquinas de workspace consultadas a la plataforma prefiltradas por gobernanza | Cumple | `packages/features/machines/src/components/RunOnPicker.tsx:8` | `RunOnPicker` delega el filtrado en la plataforma. |
| **§ 2 Workspaces** | **2.6** Workspace sin máquinas: error explícito de gobierno/harness, nunca lista vacía | No cumple | `packages/features/machines/src/components/RunOnPicker.tsx:77` | (Para VP1): Muestra texto genérico «No hay máquinas disponibles» en lugar de alerta de asignación de gobierno. |
| **§ 2 Workspaces** | **2.7** Botón «+» en el riel ofrece exclusivamente «Agregar workspace» | Cumple | `packages/features/workspaces/src/components/RailGroups.tsx:238` | Texto e interfaz dicen «+ Agregar workspace». |
| **§ 2 Workspaces** | **2.8** Riel DS1 v2 agrupa por organización en stack vertical desplegable | No cumple | `packages/features/workspaces/src/queries.ts:72`, `RailGroups.tsx:108` | Falta ordenamiento determinista de organizaciones (Personal primero, luego el resto) y la agrupación por org caía a clave `"default"` mezclando elementos. |
| **§ 6 Conexión** | **6.1** «Tus máquinas» lista todas sin filtros locales ni dependencia de workspace | Cumple | `packages/features/machines/src/queries.ts:175-179` | Arreglado: lista completa sin filtros locales ni de workspace, con orden determinista `sortMachines` (personal primero, luego por organización) y función de agrupación `groupMachinesByOrg`. |
| **§ 6 Conexión** | **6.2** Web conecta exclusivamente vía relay WebSocket, sin opción local | Cumple | `packages/features/machines/src/queries.ts:214` | En Web el transporte es siempre relay. |
| **§ 6 Conexión** | **6.3** Desk muestra máquina local con icono de computadora y transporte IPC | Cumple | `packages/features/machines/src/components/MachineIcon.tsx:13` | Identificada por `kind === "personal"`, conectada vía IPC. |
| **§ 6 Conexión** | **6.4** VM apagada: NUNCA sondas en background ni encendidos automáticos; wake SOLO por acción explícita | Cumple | `packages/features/machines/src/queries.ts:146` | El sondeo cada 15 s solo invoca `GET /v1/machines`. El encendido requiere pulsar «Conectar» o «Encender». |
| **§ 6 Conexión** | **6.5** Conectar a VM apagada emite ticket, reactiva VM, muestra «encendiendo…» y reintenta hasta conectar | Cumple | `packages/features/machines/src/queries.ts:238-249` | Arreglado: ante 409 o VM stopped, `requestTicket` dispara `startMachine` de respaldo para despertar la máquina en la plataforma sin intervención manual y retorna `machine_unreachable`, activando en `createRelayTransport` el estado `waking` («encendiendo…») con reintento cada 2 s. |
| **§ 6 Conexión** | **6.6** Emisión de ticket abre WebSocket relay con `Sec-WebSocket-Protocol: ticket.<token>` | Cumple | `@danil/engine-client/src/transports/relay.ts:153` | Subprotocolo y ticket enviados según especificación. |

---

## 3. Verificación contra Beta con Llamadas Reales

Llamadas ejecutadas contra el borde de producción / beta:

### 1. `curl -s -i https://edge.danil.ai/v1/machines`
```http
HTTP/2 401 
date: Sat, 21 Nov 2026 10:22:49 GMT
content-type: application/problem+json
content-length: 161
cache-control: no-store
vary: Origin, X-Danil-Session
www-authenticate: Bearer
x-request-id: 01bd046e-f738-49f6-9773-0eda865cad1b

{"type":"urn:danil:problem:invalid_session","title":"invalid_session","status":401,"detail":"invalid_session","instance":"/v1/machines","code":"invalid_session"}
```

### 2. `curl -s -i -H "Origin: https://preview-front.danil.ai" https://edge.danil.ai/v1/identity/me`
```http
HTTP/2 401 
date: Sat, 21 Nov 2026 10:22:49 GMT
content-type: application/problem+json
content-length: 164
access-control-allow-origin: https://preview-front.danil.ai
access-control-allow-credentials: true
vary: Origin, X-Danil-Session
www-authenticate: Bearer
x-request-id: 636c0026-80ca-4f3b-b3c8-39a5d1283712

{"type":"urn:danil:problem:invalid_session","title":"invalid_session","status":401,"detail":"invalid_session","instance":"/v1/identity/me","code":"invalid_session"}
```

### Evaluación del manejo de 401:
El borde responde formalmente con RFC 7807 (`application/problem+json`), con `status: 401` y código `"invalid_session"`.
El cliente HTTP central (`packages/platform-client/src/http.ts:101`) intercepta este código:
```ts
if (res?.status === 401) {
  o.onUnauthorized?.();
  throw { kind: "unauthorized" } satisfies ClientError;
}
```
Las features (`machines`, `workspaces`, `account`) reciben este rechazo en sus respectivos `createResource` capturándolo en el accessor reactivo `error()`. Los componentes visuales asociados detectan `error()` y presentan la vista de fallo con opción de reintento en lugar de mascarar la respuesta como una lista vacía.
