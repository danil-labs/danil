# @terminus/computers

## Qué hace
Paquete legado de control-plane de máquinas y sesiones de relay vía WebSocket (`computers.danil.ai`).
Actúa como cliente duplicado de máquinas en convivencia transitoria con `platform-client`.

## Qué expone
Exporta desde `src/index.ts`:
- Enrutamiento y control de workspaces: `groupWorkspaces`, `hasAccountWorkspaces`, `registryProjects`, `withRegistry`.
- Conexiones y enlaces: `callWorkspace`, `hasLinkedWorkspaces`, `linkedAttention`, `linkedEvent`, `linkedEvents`, `linkedListing`, `linkedWorkspaces`, `onlyLinked`, `organizationOf`, `serviceFeatures`, `unlinkedWorkspaces`.
- Sesiones de relay: `RelaySession`, `createRelaySession`, `RelaySocket`, `Envelope`.
- Nota: `src/machines.ts` fue eliminado en la tarea 3.2 al unificarse la consulta en `platform-client`.

## Qué consume
- `@terminus/fleet` y `@terminus/protocol`.
- Conexiones WebSocket al servicio relay.

## Qué contratos toca
- Rutas `/v1` del borde: referencias legadas a `/v1/computers`, `/v1/connections`, `/v1/connections/capabilities`.
- Comandos RPC1 del motor: ninguno directo.

## Qué falta según la fase 2 del plan
- Fase 3.2: consolidar la lectura única de máquinas en `packages/platform-client/src/machines.ts`.
- Las utilidades de workspaces migran a `platform-client/src/workspaces.ts` y el paquete se elimina completamente en la fase 3.4.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
