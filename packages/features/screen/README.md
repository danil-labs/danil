# @danil/feature-screen

## Qué hace
Visualización y control interactivo de pantallas gráficas de máquinas remotas.
Integra el cliente noVNC en SolidJS para visualización remota de escritorios y terminales gráficas.

## Qué expone
Exporta desde `src/index.ts`:
- Componentes y store: `ScreenViewer`, `createScreenStore`, tipos de conexión noVNC.

## Qué consume
- `@novnc/novnc`, `@danil/ui`, `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: ninguno directo (conecta vía WebSocket con el puerto VNC de la máquina).

## Qué falta según la fase 2 del plan
- Fase 2.1: desacoplar la barra de herramientas gráfica hacia componentes de `packages/ui`.
- Fase 2.4: montarse como slot de pestaña desde `shell` sin acoplamiento a otras pantallas.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
