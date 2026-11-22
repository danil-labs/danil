# @danil/feature-observability

## Qué hace
Consulta y visualización de eventos de observabilidad, trazas del motor y métricas de rendimiento en tiempo de ejecución.

## Qué expone
Exporta desde `src/index.ts`:
- Store y modelos: `createObservabilityStore`, `ObservabilityEvent`, `ObservabilityView`, etc.

## Qué consume
- `@danil/engine-client` y `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: `observability_events`, `observability_status`, `observability_subscribe`.

## Qué falta según la fase 2 del plan
- Fase 2.3: asegurar que toda suscripción o consulta viva en `queries.ts`.
- Fase 2.4: integrarse como slot en el menú de herramientas (`AppTools`) sin imports cruzados.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
