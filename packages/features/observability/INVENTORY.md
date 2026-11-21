# Inventario: observability

Pestaña que conecta el visor de agentes y lo muestra en un sitio. No mueve código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/index.ts | Observability, default | propio | se queda | Reexporta la pantalla (`export { default as Observability }` y `export { default }`). `model.ts` y `queries.ts` no aportan símbolos. Shell no usa el barrel: `packages/shell/src/app/App.tsx:82` importa `screens/Observability`. |
| src/model.ts | — | propio | se queda | `export {}`. Lo reexporta `index.ts`. No hay tipos de vista propios. Sin red. |
| src/queries.ts | — | propio | se queda | `export {}`. Lo reexporta `index.ts`. La pantalla llama a `engine-client` directo; fase 2.3 baja esas llamadas aquí. |
| src/screens/Observability.tsx | default | propio | se queda | Pantalla. La monta `App.tsx:82`. `engine-client` `invoke`: `agentsview_status` (23), `observability_connect` (29), `observability_disconnect` (44). Escucha `agentsview-changed` vía `apps/desktop/src/lib/serviceEvents`. Línea 6: importa `Sitio` de `features/sites`. No hay `platform-client` ni `/v1/computers`. |

## Imports cruzados

- `src/screens/Observability.tsx:6` → `sites` (`Sitio`). En su lugar: shell pasa el hueco del sitio por slot. Esta pantalla solo pide la URL (`observability_connect`) y no importa `features/sites`.

Nadie en otra feature importa `observability`. Shell la compone en `App.tsx:82`.
