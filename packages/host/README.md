# @danil/host

## Qué hace
Abstracción de capacidades nativas dependientes de la plataforma (Tauri en desktop, navegador en web).
Gestiona apertura de URLs externas, portapapeles, selector de archivos e imágenes y controles de ventana.

## Qué expone
Exporta interfaces y funciones desde sus módulos en `src/`:
- Capacidades de plataforma: `Capabilities`, `getPlatform`, `setHost`, `host`, `LocalHost`, `DeskAuthHost` en `platform.ts`.
- Portapapeles y descargas: `readClipboardText`, `writeClipboardText` en `clipboard.ts`, y `downloadUrl` en `downloads.ts`.
- Ventana y diálogo: `minimizeWindow`, `maximizeWindow`, `closeWindow` en `window.ts`, `pickImage` en `pick-image.ts`.

## Qué consume
- `@tauri-apps/api` (en entorno de escritorio).

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: ninguno directo; provee el canal de transporte nativo para `engine-client`.

## Qué falta según la fase 2 del plan
- Fase 2.4: retirar imports residuales hacia `features/settings` y `apps/desktop` para asegurar aislamiento completo según R1 y R15.
