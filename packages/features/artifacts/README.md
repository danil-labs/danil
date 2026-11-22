# @danil/feature-artifacts

## Qué hace
Gestión y visualización de artefactos producidos por agentes durante una tarea.
Maneja el visor interactivo de documentos, descargas seguras, historial de revisiones y publicaciones de código.

## Qué expone
Exporta desde `src/index.ts`:
- Descargas y estados: `DownloadFailure`, `ArtifactDownloadError`, `readArtifactDownload`, `Forma`, `formaDe`, `Estado`, `leerEstado`, `envolver`.
- Historial y versiones: `VersionRef`, `Version`, `History`, `historiaDe`, `leerVersion`, `restaurarVersion`, `mismaVersion`, `quien`, `cuando`, `Via`, `CodeRef`, `Publicacion`, `NOMBRE_VIA`, `publicacionesDe`, `registrarSalida`, `descargarArtefacto`.
- Componentes y pantallas: `Preview`, `Versions`, `VisorDeArtefacto`, `Documento`.

## Qué consume
- `@danil/engine-client` y `@danil/ui`.
- Paquetes legados `@terminus/chat/inlineVisual` y `@terminus/chat/sandbox` (en proceso de retiro).
- `apps/desktop` (utilidades).

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: `artifact_history`, `artifact_read_part`, `download_artifact`, `open_external`, `prepare_print`, `preview_file`, `publications_of`, `read_version`, `record_export`, `restore_version`.

## Qué falta según la fase 2 del plan
- Fase 2.1: retirar imports de `@terminus/chat` (inlineVisual y sandbox) reemplazándolos por componentes visuales de `packages/ui`.
- Fase 2.3: centralizar todas las invocaciones RPC1 exclusivamente en `queries.ts`.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
