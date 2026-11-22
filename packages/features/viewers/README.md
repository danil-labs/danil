# @danil/feature-viewers

## Qué hace
Visores de archivos especializados para la vista previa de contenidos.
Incluye visualización de tablas CSV, visor de imágenes con zoom y paneo, reproductor multimedia de audio/video y primera página de PDF.

## Qué expone
Exporta desde `src/index.ts`:
- Componentes y pantallas: `CsvTable`, `ImageViewer`, `Media`, `Pdf`, `IconButton`.
- Modelos y utilidades: `Table`, `MAX_ROWS`, `delimiterFor`, `parseTable`, `renderFirstPage`, `ZOOM_MIN`, `ZOOM_MAX`, `ZOOM_STEP`, `clampZoom`, `offsetOnZoom`, `LeerParte`, `urlDeArchivo`, `descargar`.

## Qué consume
- `@danil/ui`, `pdfjs-dist`.
- `packages/ui/src/lib/chat/table.ts`, `@terminus/protocol` (en proceso de retiro), `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: ninguno directo.

## Qué falta según la fase 2 del plan
- Fase 2.1: `IconButton` sube a `packages/ui`.
- Fase 2.2: aritmética de zoom (`zoom.ts`) sube a `packages/ui/lib/zoom.ts`.
- Fase 3: retirar `model/csv.ts` dependiente de `packages/ui/src/lib/chat/table.ts`.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
