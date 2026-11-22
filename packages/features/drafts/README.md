# @danil/feature-drafts

## Qué hace
Almacén de borradores de mensajes por tarea y agente.
Preserva el texto en edición y la configuración de contexto cuando el usuario cambia de pestaña o tarea.

## Qué expone
Exporta desde `src/index.ts`:
- Store y tipos: `createDraftsStore`, `Draft`, `DraftConfiguration`.

## Qué consume
- SolidJS y utilidades de `apps/desktop/src/lib/taskDraft.ts` (en proceso de migración).

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: ninguno directo.

## Qué falta según la fase 2 del plan
- Fase 2.2: retirar dependencias de `apps/desktop` y subir utilidades de fusión de borradores a `packages/ui/lib`.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
