# Inventario — packages/fleet

Paquete viejo `@terminus/fleet` (varias máquinas detrás de un panel). 1.9 lo funde en `features/machines`: se usa, no está muerto. No es el cliente HTTP de máquinas. No se movió código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/deadlines.ts | READ_DEADLINE, ACTION_DEADLINE, INTENT_DEADLINE, Deadlines, DEADLINES, CommandClass, classOf, isRead, PASSIVE | otra-feature | packages/features/machines/src/model/deadlines.ts | Feature machines. Plazos del relay (lecturas 15 s, acciones 60 s, wake 330 s) tomados de @terminus/computers. No hace fetch y no duplica platform-client/src/machines.ts. classOf e isRead los usan machines router.ts y guestLink.ts, apps/desktop/src/web/workspace-runtime.ts y mobile hosts.ts. |
| src/errors.ts | NAMED_ERRORS, NamedError, FleetErrorCode, FleetError, isFleetError, fromRelay | otra-feature | packages/features/machines/src/model/fleet-errors.ts | Feature machines. Errores con nombre de la flota (FleetError, fromRelay). Sin red y sin /v1. No duplica platform-client/src/machines.ts. Lo usan router.ts, context-router.ts, scoped-fleet.ts, active-turns-read.ts, workspace-runtime.ts y mobile hosts.ts. |
| src/fleet.ts | MachineInfo, Listed, Power, Envelope, Link, relayLink, FleetEvent, FleetConfig, Fleet | otra-feature | packages/features/machines/src/queries/fleet.ts | Feature machines. Panel de varias máquinas: una sesión de relay por par máquina y contexto, y rebanadas. No hace fetch. Importa @terminus/computers y @terminus/protocol. Nombra filas de GET /v1/computers (fleet.ts:213 y :249) y de GET /v1/machines (:35 y :330) pero no es el cliente HTTP de platform-client/src/machines.ts. Lo usan account.tsx, router, window.tsx:2, workspace-runtime.ts, mobile hosts.ts y shell workspace-added-wiring.ts. |
| src/ids.ts | SEP, OWN_KEYS, SPREAD_KEYS, wrap, unwrap, argsFor | otra-feature | packages/features/machines/src/model/ids.ts | Feature machines. Ids máquina~id (wrap, unwrap, argsFor) para que dos máquinas no choquen. Sin red. No duplica platform-client/src/machines.ts. Lo usan router.ts, store.ts, account.tsx y window.tsx. |
| src/index.ts | ACTION_DEADLINE, CommandClass, classOf, DEADLINES, Deadlines, INTENT_DEADLINE, isRead, PASSIVE, READ_DEADLINE, FleetError, FleetErrorCode, fromRelay, isFleetError, NAMED_ERRORS, NamedError, Envelope, Fleet, FleetConfig, FleetEvent, Link, Listed, MachineInfo, Power, relayLink, argsFor, OWN_KEYS, SEP, SPREAD_KEYS, unwrap, wrap, memberKey, AttentionBook, encode, encodeEvent, MergeContext, merge, registryRow, SAVE_EVERY, SLICES_KEY, Slice, SliceBook, SliceStatus, StorageLike, listedWorkspaces | otra-feature | packages/features/machines/src/index.ts | Feature machines. Barril de @terminus/fleet. grep from @terminus/fleet: window.tsx:2, workspace-runtime.ts, mobile hosts.ts y sliceStorage.ts, las queries de machines y shell workspace-added-wiring.ts. El paquete viejo se funde en la feature (1.9) y este archivo desaparece. No duplica platform-client/src/machines.ts. |
| src/member-key.ts | memberKey, sameContext, memberContext | otra-feature | packages/features/machines/src/model/member-key.ts | Feature machines. Clave interna de máquina y contexto; los ids públicos no cambian. Sin red. No duplica platform-client/src/machines.ts. memberKey lo importa window.tsx; sameContext lo usa fleet.ts. |
| src/merge.ts | MergeContext, encode, encodeEvent, merge, registryRow, AttentionBook | otra-feature | packages/features/machines/src/model/merge.ts | Feature machines. Junta rebanadas de varias máquinas sin vaciar las que no contestaron. Importa @terminus/computers y @terminus/protocol. Sin fetch. No duplica platform-client/src/machines.ts. AttentionBook y registryRow los usa queries/router.ts; encode lo usa el propio Fleet. |
| src/slices.ts | SliceStatus, Slice, StorageLike, SAVE_EVERY, SLICES_KEY, SliceBook | otra-feature | packages/features/machines/src/model/slices.ts | Feature machines. Rebanada con estado por máquina (SliceBook) y su almacenamiento. Sin red. No duplica platform-client/src/machines.ts. Lo usan router.ts, mobile hosts.ts y mobile sliceStorage.ts. |
| src/workspace-listing.ts | WorkspaceAccount, ListedWorkspace, listedWorkspaces | otra-feature | packages/features/machines/src/model/workspace-listing.ts | Feature machines. listedWorkspaces: workspaces que una máquina lista para la flota. Sin red. No duplica platform-client/src/machines.ts. Lo importa queries/danil-source.ts vía el barril. |

## Imports cruzados

Ningún import desde otra feature.

`src/deadlines.ts:6`, `src/fleet.ts:17` y `src/merge.ts:11` importan `packages/computers`. `src/fleet.ts:18` y `src/merge.ts:12` importan `packages/protocol`. Son paquetes viejos, no features. Al fundir este paquete en `features/machines`, computers ya no se importa: la fila de máquinas sale de `platform-client`.

## Duplicados de platform-client/src/machines.ts (insumo 3.2)

Ningún archivo de este paquete es el cliente HTTP de `/v1/machines`, `/v1/capabilities` o `/v1/computers`. No duplica `packages/platform-client/src/machines.ts`.

`src/fleet.ts` solo lee filas que ya trajo `@terminus/computers`. Nombra `GET /v1/computers` en las líneas 213 y 249 y `GET /v1/machines` en las líneas 35 y 330. Cuando 3.2 deje una sola fuente, esas filas salen de `platform-client/src/machines.ts` y este panel vive en `features/machines`.
