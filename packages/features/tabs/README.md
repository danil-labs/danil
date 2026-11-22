# @danil/feature-tabs

## Qué hace
Componentes de soporte y comportamiento para la barra de pestañas.
Provee la capa visual de arrastre (`DragOverlay`) para reordenar pestañas y el diálogo de advertencia de cierre sin guardar (`UnsavedCloseDialog`).

## Qué expone
Exporta desde `src/index.ts`:
- Componentes de pestaña: `DragOverlay`, `UnsavedCloseDialog`.

## Qué consume
- `@danil/ui`, `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: ninguno directo.

## Qué falta según la fase 2 del plan
- Fase 2.1: evaluar la promoción de `DragOverlay` y el diálogo de cierre a primitivas reutilizables en `packages/ui`.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
