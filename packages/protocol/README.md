# @terminus/protocol

## Qué hace
Lista cerrada de comandos y tipos de intercambio que clientes móviles o puentes envían a las máquinas.
Define la gramática de acciones, lecturas, modelos de sesión y verificaciones de capacidades compatibles.

## Qué expone
Exporta desde `src/index.ts`:
- Tipos generales: reexporta `types.ts`.
- Comandos y capacidades: `AppCommand`, `AppFeature`, `APP_ACTIONS`, `APP_COMMANDS`, `APP_FEATURES`, `APP_READS`, `NEEDS_YOU`, `isAppAction`, `isAppCommand`.
- Traspaso de proveedores y modelos de sesión: `PROVIDER_HANDOFF_FEATURE`, `canHandOver`, `MODEL_REQUIRED_KEY`, `SESSION_MODEL_FEATURE`, `SESSION_MODEL_REFUSALS`, `SessionModelArgs`, `savesSessionModel`, `sessionModelArgs`.

## Qué consume
- Paquete puro de tipos y constantes; sin dependencias de red ni librerías de terceros.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: formaliza las firmas de los comandos RPC1 soportados (`list_tools`, `set_model`, etc.).

## Qué falta según la fase 2 del plan
- Fase 2.2: las definiciones activas migran a `packages/engine-client` (`src/activity.ts`, `src/attachments.ts`, `src/attention.ts`).
- El paquete se retira en la fase 3 una vez consolidado el cliente del motor.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
