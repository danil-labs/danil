# Inventario: artifacts

Qué es de esta feature, qué es UI o función reutilizable, qué es de otra feature y qué es viejo. No mueve código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/index.ts | DownloadFailure, ArtifactDownloadError, readArtifactDownload, VISUAL_THEME_TOKENS, VisualTheme, CSS_INLINE, JS_INLINE, inlineVisualStyles, CSP_ARTEFACTO, SANDBOX_ARTEFACTO, Forma, formaDe, Estado, leerEstado, envolver, VersionRef, Version, History, historiaDe, leerVersion, restaurarVersion, mismaVersion, quien, cuando, Via, CodeRef, Publicacion, NOMBRE_VIA, publicacionesDe, registrarSalida, descargarArtefacto, Preview, VisorDeArtefacto, Documento | propio | se queda | Entrada pública (`export *` de model, queries, Preview y Versions, más las dos pantallas). Shell no entra por aquí: `packages/shell/src/app/App.tsx:23` importa la pantalla y `:24` el tipo `Preview`. No llama red. |
| src/model.ts | DownloadFailure, ArtifactDownloadError, readArtifactDownload, VISUAL_THEME_TOKENS, VisualTheme, CSS_INLINE, JS_INLINE, inlineVisualStyles, CSP_ARTEFACTO, SANDBOX_ARTEFACTO, Forma, formaDe, Estado, leerEstado, envolver | propio | se queda | Barrel de `model/`. Lo reexporta `src/index.ts`. Sin red. |
| src/queries.ts | VersionRef, Version, History, historiaDe, leerVersion, restaurarVersion, mismaVersion, quien, cuando, Via, CodeRef, Publicacion, NOMBRE_VIA, publicacionesDe, registrarSalida, descargarArtefacto | propio | se queda | Barrel de `queries/history.ts`, el único que llama a `engine-client`. |
| src/model/download.ts | DownloadFailure, ArtifactDownloadError, readArtifactDownload | propio | se queda | Junta los bytes de una versión ya sellada; el `reader` lo inyecta `Preview.tsx`. Lo usa `src/components/Preview.tsx`. `unknownCommand` sale de `apps/desktop/src/lib/errorCode.ts`. No hay `fetch`, `platform-client` ni `invoke` aquí. El test `apps/desktop/tests/unit/artifact-download.test.ts:3` apunta a `src/features/artifacts/download.ts`, ruta que ya no existe. |
| src/model/inlineVisual.ts | VISUAL_THEME_TOKENS, VisualTheme, CSS_INLINE, JS_INLINE, inlineVisualStyles | viejo | se borra | El archivo entero es `export * from "@terminus/chat/inlineVisual"` (paquete viejo `packages/chat`, tarea 1.9). Lo importan `src/model.ts:2` y `packages/features/chat/src/components/ChatVisual.tsx:7`. El cuerpo está en `packages/chat/src/inlineVisual.ts`. El test `apps/desktop/tests/unit/artifact-viewer.test.ts:5` apunta a la ruta vieja `src/features/artifacts/inlineVisual.ts`. |
| src/model/sandbox.ts | CSP_ARTEFACTO, SANDBOX_ARTEFACTO, Forma, formaDe, Estado, leerEstado, envolver | viejo | se borra | El archivo entero es `export * from "@terminus/chat/sandbox"`. Lo importan `packages/ui/src/FilePreview.tsx:15`, `packages/features/code/src/components/PagePreview.tsx:2`, `packages/features/code/src/screens/FileViewer.tsx:28`, `packages/features/chat/src/components/ChatVisual.tsx:6`, `src/screens/Document.tsx:2` y `src/components/Preview.tsx:8`. El cuerpo está en `packages/chat/src/sandbox.ts` (tarea 1.9). Sin red. |
| src/screens/ArtifactViewer.tsx | default | propio | se queda | Pantalla de la pestaña de artefacto. La monta `packages/shell/src/app/App.tsx:23`. Línea 46: `engine-client` `invoke("preview_file")`. Línea 3: `machineOf` de `features/machines`. |
| src/screens/Document.tsx | default | propio | se queda | Visor HTML (iframe con el sandbox). Lo importan `packages/ui/src/FilePreview.tsx:20` y `packages/features/code/src/screens/FileViewer.tsx:26`, además de `Preview.tsx`. No llama `invoke`. Cruza a `viewers` por `IconButton` y `ZOOM_STEP`. |
| src/components/Preview.tsx | Preview, default | propio | se queda | Panel de un artefacto (preview, versiones, descarga). El tipo `Preview` lo usan `App.tsx:24`, `code/src/screens/FileViewer.tsx:27`, `chat/src/components/Attachments.tsx:8`, `chat/src/screens/Chat.tsx:2` y `settings/src/components/Appearance.tsx:22`. Llama `engine-client` `invoke`: `prepare_print` (205), `open_external` (209 y 287), `artifact_read_part` (389). Cruza a `viewers`. |
| src/components/Versions.tsx | default | propio | se queda | Popover de la cadena de versiones. Solo lo usa `Preview.tsx`. Las llamadas `invoke` viven en `queries/history.ts`. |
| src/queries/history.ts | VersionRef, Version, History, historiaDe, leerVersion, restaurarVersion, mismaVersion, quien, cuando, Via, CodeRef, Publicacion, NOMBRE_VIA, publicacionesDe, registrarSalida, descargarArtefacto | propio | se queda | Queries de la feature. `engine-client` `invoke`: `artifact_history` (36), `read_version` (39), `restore_version` (42), `publications_of` (135), `record_export` (143), `download_artifact` (150). `publicacionesDe` usa `machineOf` de `machines` (1). No hay `platform-client` ni `/v1/computers`. |

## Imports cruzados

Salen de esta feature:

- `src/screens/ArtifactViewer.tsx:3` → `machines` (`machineOf`). En su lugar: shell pasa el sobre de la máquina (headers) por props.
- `src/queries/history.ts:1` → `machines` (`machineOf`). En su lugar: el scope de máquina entra como argumento desde shell; esta query no lee el store de `machines`.
- `src/screens/Document.tsx:17` → `viewers` (`IconButton`). En su lugar: sube a `packages/ui/src/IconButton.tsx`.
- `src/screens/Document.tsx:18` → `viewers` (`ZOOM_STEP`). En su lugar: sube a `packages/ui/lib/zoom.ts`.
- `src/components/Preview.tsx:33` → `viewers` (`delimiterFor`). En su lugar: el shim `viewers/src/model/csv.ts` se borra; el parseo, si sobrevive a la tarea 1.9, sube a `packages/ui/lib`.
- `src/components/Preview.tsx:37` → `viewers` (`Pdf`). En su lugar: slot desde shell.
- `src/components/Preview.tsx:38` → `viewers` (`ImageViewer`). En su lugar: slot desde shell.
- `src/components/Preview.tsx:39` → `viewers` (`CsvTable`). En su lugar: slot desde shell.

Entran desde otra feature o desde `ui` (R4: `ui` no importa features):

- `packages/ui/src/FilePreview.tsx:15` → esta feature (`sandbox`, shim viejo). En su lugar: `ui` deja de importar el shim; el hogar del código lo decide la tarea 1.9 (`packages/chat/src/sandbox.ts`).
- `packages/ui/src/FilePreview.tsx:20` → esta feature (`Document`). En su lugar: slot desde shell.
- `packages/features/code/src/components/PagePreview.tsx:2` → esta feature (`SANDBOX_ARTEFACTO`). En su lugar: el mismo hogar que decida 1.9, o shell pasa la constante.
- `packages/features/code/src/screens/FileViewer.tsx:26` → esta feature (`Documento`). En su lugar: slot desde shell.
- `packages/features/code/src/screens/FileViewer.tsx:27` → esta feature (tipo `Preview`). En su lugar: shell pasa el preview ya armado por props.
- `packages/features/code/src/screens/FileViewer.tsx:28` → esta feature (`formaDe`). En su lugar: el hogar que decida 1.9 para el sandbox.
- `packages/features/chat/src/components/ChatVisual.tsx:6` → esta feature (`envolver`, `SANDBOX_ARTEFACTO`). En su lugar: el hogar que decida 1.9.
- `packages/features/chat/src/components/ChatVisual.tsx:7` → esta feature (`VISUAL_THEME_TOKENS`, `VisualTheme`). En su lugar: el hogar que decida 1.9 (`packages/chat/src/inlineVisual.ts`).
- `packages/features/chat/src/components/Attachments.tsx:8` → esta feature (tipo `Preview`). En su lugar: props desde shell.
- `packages/features/chat/src/screens/Chat.tsx:2` → esta feature (tipo `Preview`). En su lugar: props desde shell.
- `packages/features/settings/src/components/Appearance.tsx:22` → esta feature (tipo `Preview`). En su lugar: props desde shell.

Shell puede componer esta feature: `App.tsx:23` y `:24`. Eso no es un cruce entre features.
