# Inventario: viewers

Visores de archivo (tabla, imagen, PDF, audio y video) y la aritmética de zoom. No mueve código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/index.ts | Table, MAX_ROWS, delimiterFor, parseTable, renderFirstPage, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, clampZoom, offsetOnZoom, IconButton, LeerParte, urlDeArchivo, descargar, CsvTable, ImageViewer, Media, Pdf | propio | se queda | Entrada pública. Quien pinta importa las pantallas por ruta profunda, no este barrel: `code`, `artifacts`, `chat` y `ui`. `queries.ts` reexportado no aporta símbolos (`export {}`). Sin red. |
| src/model.ts | Table, MAX_ROWS, delimiterFor, parseTable, renderFirstPage, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, clampZoom, offsetOnZoom | propio | se queda | Barrel de `model/csv.ts`, `pdfThumb.ts` y `zoom.ts`. Lo reexporta `index.ts`. Sin red. |
| src/queries.ts | — | propio | se queda | `export {}`. Lo reexporta `index.ts` y no añade símbolos. Esta feature no tiene queries: no llama `engine-client` ni `platform-client`. |
| src/model/csv.ts | Table, MAX_ROWS, delimiterFor, parseTable | viejo | se borra | El archivo entero es `export * from "@terminus/chat/table"` (paquete viejo `packages/chat`, tarea 1.9). Lo importan `src/screens/CsvTable.tsx:3`, `artifacts/src/components/Preview.tsx:33` y `code/src/screens/FileViewer.tsx:49`. El cuerpo está en `packages/chat/src/table.ts`. El teléfono importa `@terminus/chat/table` directo (`apps/mobile/src/lib/fileKinds.ts`, `apps/mobile/src/app/file.tsx`). El test `apps/desktop/tests/unit/csv.test.ts:4` apunta a `src/features/viewers/csv.ts`, ruta que ya no existe. |
| src/model/pdfThumb.ts | renderFirstPage | propio | se queda | Pinta la primera página de un PDF en un canvas con `pdfjs-dist`. Lo importa `packages/ui/src/FilePreview.tsx:119`. No es red de la app. Comparte el worker con `screens/Pdf.tsx`. |
| src/model/zoom.ts | ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, clampZoom, offsetOnZoom | lib | packages/ui/lib/zoom.ts | Aritmética pura de zoom, sin DOM de red. La usan esta feature (`ImageViewer.tsx:7`, `Pdf.tsx:12`), `artifacts/src/screens/Document.tsx:18` y `code/src/components/TypstPreview.tsx:21`. Fase 2.2: el parseo y la aritmética repetida suben a `ui/lib`. El test `apps/desktop/tests/unit/zoom.test.ts` apunta a `src/features/viewers/zoom.ts`, ruta que ya no existe. |
| src/screens/CsvTable.tsx | default | propio | se queda | Tabla de un CSV o TSV. La cargan en lazy `code/src/screens/FileViewer.tsx:78` y `artifacts/src/components/Preview.tsx:39`. El parseo lo pide a `model/csv.ts` (shim viejo). Sin red. |
| src/screens/ImageViewer.tsx | default | propio | se queda | Imagen con zoom. La cargan `code/src/screens/FileViewer.tsx:77`, `artifacts/src/components/Preview.tsx:38` y `packages/ui/src/EnlargeableImage.tsx:9`. Sin red. |
| src/screens/Media.tsx | LeerParte, urlDeArchivo, default, descargar | propio | se queda | Reproductor de audio y video, más `urlDeArchivo` y `descargar`. Lo usan `code/src/screens/FileViewer.tsx:37` (tipo `LeerParte`), `:79` (el componente), `:407` y `:1184` (`descargar`), y `code/src/screens/TaskFiles.tsx:123`. Línea 1: `readTreeFile` de `@terminus/protocol` (paquete viejo, tarea 1.9). No hay `engine-client` ni `platform-client`. |
| src/screens/Pdf.tsx | default | propio | se queda | Visor PDF (`pdfjs-dist`). Lo cargan `code/src/screens/FileViewer.tsx:76`, `code/src/components/TypstExportPreview.tsx:15`, `artifacts/src/components/Preview.tsx:37`, `chat/src/components/Attachments.tsx:11` y `packages/ui/src/FilePreview.tsx:19`. Sin red de la app. |
| src/components/IconButton.tsx | IconButton | ui | packages/ui/src/IconButton.tsx | Botón crudo de icono (size-6, `aria-label`), sin dominio. Lo usan `ImageViewer.tsx`, `Pdf.tsx`, `artifacts/src/screens/Document.tsx:17` y `code/src/components/TypstPreview.tsx:20`. R13: el botón vive en `packages/ui`. `ui` ya tiene `IconAction.tsx`; al subir, se unifica con ese primitivo. |

## Imports cruzados

Esta feature no importa otra feature.

Paquete viejo (no es feature):

- `src/model/csv.ts:2` → `@terminus/chat/table`. En su lugar: se borra el shim. El parseo queda en `packages/chat/src/table.ts` hasta la tarea 1.9; si sigue haciendo falta en más de un sitio, sube a `packages/ui/lib`.
- `src/screens/Media.tsx:1` → `@terminus/protocol` (`readTreeFile`, `TreePart`). En su lugar: el visor ya recibe `leer: LeerParte` por props; `readTreeFile` sale de esta pantalla y queda en el cliente que reemplace a `protocol` (tarea 1.9).

Entran desde otra feature o desde `ui`:

- `packages/features/artifacts/src/screens/Document.tsx:17` → esta feature (`IconButton`). En su lugar: `packages/ui`.
- `packages/features/artifacts/src/screens/Document.tsx:18` → esta feature (`ZOOM_STEP`). En su lugar: `packages/ui/lib/zoom.ts`.
- `packages/features/artifacts/src/components/Preview.tsx:33` → esta feature (`delimiterFor`). En su lugar: `packages/ui/lib` tras 1.9, no esta feature.
- `packages/features/artifacts/src/components/Preview.tsx:37` → esta feature (`Pdf`). En su lugar: slot desde shell.
- `packages/features/artifacts/src/components/Preview.tsx:38` → esta feature (`ImageViewer`). En su lugar: slot desde shell.
- `packages/features/artifacts/src/components/Preview.tsx:39` → esta feature (`CsvTable`). En su lugar: slot desde shell.
- `packages/features/code/src/screens/FileViewer.tsx:37` → esta feature (tipo `LeerParte`). En su lugar: el tipo viaja en props desde shell, o sube junto al cliente que lea el árbol.
- `packages/features/code/src/screens/FileViewer.tsx:49` → esta feature (`delimiterFor`). En su lugar: `packages/ui/lib` tras 1.9.
- `packages/features/code/src/screens/FileViewer.tsx:76` → esta feature (`Pdf`). En su lugar: slot desde shell.
- `packages/features/code/src/screens/FileViewer.tsx:77` → esta feature (`ImageViewer`). En su lugar: slot desde shell.
- `packages/features/code/src/screens/FileViewer.tsx:78` → esta feature (`CsvTable`). En su lugar: slot desde shell.
- `packages/features/code/src/screens/FileViewer.tsx:79` → esta feature (`Media`). En su lugar: slot desde shell.
- `packages/features/code/src/screens/FileViewer.tsx:407` → esta feature (`descargar`). En su lugar: shell pasa la acción, o la función sube al cliente de archivos.
- `packages/features/code/src/screens/FileViewer.tsx:1184` → esta feature (`descargar`). En su lugar: lo mismo.
- `packages/features/code/src/screens/TaskFiles.tsx:123` → esta feature (`descargar`). En su lugar: lo mismo.
- `packages/features/code/src/components/TypstPreview.tsx:20` → esta feature (`IconButton`). En su lugar: `packages/ui`.
- `packages/features/code/src/components/TypstPreview.tsx:21` → esta feature (`clampZoom`, `ZOOM_STEP`). En su lugar: `packages/ui/lib/zoom.ts`.
- `packages/features/code/src/components/TypstExportPreview.tsx:15` → esta feature (`Pdf`). En su lugar: slot desde shell.
- `packages/features/chat/src/components/Attachments.tsx:11` → esta feature (`Pdf`). En su lugar: slot desde shell.
- `packages/ui/src/FilePreview.tsx:19` → esta feature (`Pdf`). En su lugar: slot desde shell (`ui` no importa features).
- `packages/ui/src/FilePreview.tsx:119` → esta feature (`renderFirstPage`). En su lugar: el thumb lo pide el visor, no `ui`; o la función sube a `packages/ui/lib` si `FilePreview` se queda en `ui`.
- `packages/ui/src/EnlargeableImage.tsx:9` → esta feature (`ImageViewer`). En su lugar: slot desde shell.

Shell no monta estas pantallas directo: las componen `code`, `artifacts`, `chat` y `ui`.
