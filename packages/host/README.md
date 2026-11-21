# @danil/host

Lo que solo la plataforma de la app sabe hacer. Es el único lugar del front nuevo con `invoke` de Tauri (R1).

- `createTauriHost()` (Desk): `invoke`/`call` de comandos RPC1 por el IPC de Tauri hacia el motor local, con reintento mientras el proxy responde `engine_down`; `listen` de eventos del motor; `openExternal` con el comando `open_external`.
- `createWebHost()` (web): sin motor local (todo va por relay); `openExternal` con `window.open`.
- `setHost(h)` lo llama la app al arrancar; `host` es la fachada que usan las features (p. ej. abrir billing o harness).
- Implementa `LocalHost` de `@danil/engine-client` (transporte local) y `DeskAuthHost` de `@danil/session` (sesiones del motor).
- Consume: `@tauri-apps/api`. Contrato: los comandos RPC1 del motor (`danil-engine`).
