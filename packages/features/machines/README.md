# @danil/feature-machines

## Qué hace
Gestión y visualización de máquinas y flotas.
Controla el listado compartido de VMs, encendido/apagado remoto, conexión por relay o local, y selector de ejecución («Ejecutar en»).

## Qué expone
Exporta desde `src/index.ts`:
- Atención y relay: `contextAttentionStale`, `createContextRelayPool`.
- Disponibilidad y listado: `danilAvailable`, `danilAvailableContext`, `danilMachines`, `isDanilWorkspace`, `machinesListed`, `readDanil`, `readDanilContext`.
- Tipos y fusión de filas: `MachineOrganization`, `MergedMachineRow`, `SessionMachineRow`, `mergeByMachineId`.

## Qué consume
- `@danil/platform-client`, `@danil/engine-client`, `@danil/ui`.
- `@terminus/computers`, `@terminus/fleet`, `@terminus/carry`, `@danil/ui` (`src/lib/tasks.ts`).
- `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: `/v1/machines`, `/v1/machines/start`, `/v1/machines/stop`, `/v1/machines/ticket`, `/v1/machines/wake`.
- Comandos RPC1 del motor: `danil_connect_status`, `danil_connected_status`, `danil_sessions`, `danil_edge_fetch`, `danil_workspace_account`, `account_relay_token`, `guest_call`, `guest_channels`, `guest_children`, `keep_awake_status`, `set_keep_awake`, `wsl_detect`.

## Qué falta según la fase 2 del plan
- Fase 2.1: `MachineIcon` sube a `packages/ui`.
- Fase 2.2: `known-names.ts` pasa a `packages/session`.
- Fase 2.4: eliminar 52 imports cruzados hacia `settings` y otras features; desacoplar componentes hacia slots de `shell`.
- Fase 3.2: eliminar cliente duplicado `@terminus/computers` en favor de `platform-client/src/machines.ts`.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
