# Inventario: sites

Hueco de una página abierta en una capa nativa (webview hijo). No mueve código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/index.ts | Site, Sitio | propio | se queda | Entrada. `export *` de `model.ts` y `queries.ts` no aporta símbolos (`export {}`). `screens/Site.tsx` solo tiene `default`, así que el `export *` tampoco lo saca; los nombres salen de las dos líneas `export { default as Site }` y `export { default as Sitio }`. Shell no usa el barrel: `App.tsx:180` importa la pantalla. |
| src/model.ts | — | propio | se queda | `export {}`. Lo reexporta `index.ts`. No hay tipos de vista propios todavía. Sin red. |
| src/queries.ts | — | propio | se queda | `export {}`. Lo reexporta `index.ts`. Las llamadas no están aquí: la pantalla importa `engine-client` directo (fase 2.3 las baja a esta queries). |
| src/screens/Site.tsx | default | propio | se queda | La pantalla del sitio. La monta `packages/shell/src/app/App.tsx:180` (`Sitio`) y la embebe `observability` (cruce). `engine-client` `invoke`: `site_navigate` (112), `site_hide` (130), `site_go` (147), `site_reload` (156), `site_open` (174), `site_close` (192), `site_place` (226), `site_open_external` (381). Escucha el evento `site` vía `apps/desktop/src/lib/serviceEvents`. No hay `platform-client` ni `/v1/computers`. |

## Imports cruzados

Esta feature no importa otra feature.

Entra desde otra feature:

- `packages/features/observability/src/screens/Observability.tsx:6` → esta feature (`Sitio`). En su lugar: shell pasa el hueco del sitio por slot. Observability pide la URL con su query y no importa `sites`.

Shell puede componerla: `App.tsx:180`.
