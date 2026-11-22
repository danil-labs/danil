# @terminus/fleet

## Qué hace
Gestión unificada de múltiples máquinas detrás de un mismo panel.
Provee envoltorios de llamada (`Envelope`), rebanadas de estado reactivo por máquina, control de plazos acotados (`Deadlines`) y combinación de respuestas.

## Qué expone
Exporta desde `src/index.ts`:
- Plazos y clasificación de comandos: `ACTION_DEADLINE`, `CommandClass`, `classOf`, `DEADLINES`, `Deadlines`, `INTENT_DEADLINE`, `isRead`, `PASSIVE`, `READ_DEADLINE`.
- Errores de flota: `FleetError`, `FleetErrorCode`, `fromRelay`, `isFleetError`, `NAMED_ERRORS`, `NamedError`.
- Orquestación y enlaces: `Envelope`, `Fleet`, `FleetConfig`, `FleetEvent`, `Link`, `Listed`, `MachineInfo`, `Power`, `relayLink`.
- Utilidades de identificadores: `argsFor`, `OWN_KEYS`, `SEP`, `SPREAD_KEYS`, `unwrap`, `wrap`, `memberKey`.

## Qué consume
- Utilidades puras TypeScript para WebSocket y gestión de colecciones reactivas.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna directa.
- Comandos RPC1 del motor: envuelve llamadas a comandos RPC1 para su despacho distribuido a través de relays.

## Qué falta según la fase 2 del plan
- Fase 2.4: los modelos de errores y plazos se trasladan a `packages/features/machines/src/model/`.
- La clase `Fleet` pasa a `packages/features/machines/src/queries/fleet.ts` y el paquete se borra en la fase 3.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
