# @danil/feature-workspace

## Qué hace
Store reactivo del contexto de trabajo del motor (`createWorkspaceStore`).
Controla el espacio de trabajo activo del engine (modo, ruta raíz y generación de contexto), sin gestionar cuentas de tenancy.

## Qué expone
Exporta desde `src/index.ts`:
- Store de contexto: `createWorkspaceStore`.

## Qué consume
- SolidJS reactivo puro; sin llamadas a red ni dependencias de clientes.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna (no maneja cuentas de tenancy de `/v1/workspaces`).
- Comandos RPC1 del motor: ninguno directo.

## Qué falta según la fase 2 del plan
- Fase 2.4: mantener la estricta separación de responsabilidades con `features/workspaces` (cuentas y riel vertical) y proveer el contexto hacia `shell/App.tsx`.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
