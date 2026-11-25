# @danil/engine-client

## Qué hace
Cliente tipado de comandos RPC1 del motor `danil-engine`.
Soporta transporte local mediante IPC de Tauri (inyectado vía `host`) y transporte remoto vía WebSocket al relay.

## Qué expone
Exporta desde `src/client.ts`:
- Función principal de ejecución RPC1: `callEngine` (captura el contexto del workspace cuando hay ruta activa y aplica `untilConnected` + `retrying`), y el alias `invoke` (`invoke = callEngine`).
- Enrutamiento y conectividad: `setMachineRoute`, `untilConnected`.
- Políticas de reintento: `canRepeat`, `neverRan`, `retrying`, `WAITS`.
- Instantáneas de contexto (temporal): `captureWorkspaceContext`, `displayWorkspaceSnapshot`, `requestedWorkspaceSnapshot`.

## Qué consume
- `apps/desktop/src/lib/workspace-context.ts` (en proceso de desacoplamiento).
- `@danil/host` para transporte IPC local.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna (es exclusivo del motor RPC1).
- Comandos RPC1 del motor: despacha todos los comandos definidos en el manifiesto vendorizado (`packages/engine-client/contract/commands.json`).

## Qué falta según la fase 2 del plan
- Fase 2.3: garantizar que sea consumido exclusivamente por los archivos `queries.ts` de cada feature (regla R12).
- Fase 4.2: tipos generados automáticamente a partir del manifiesto de comandos del motor (reglas R2 y R7).

## Protocolo (3.6c)
`src/index.ts` es el antiguo `@terminus/protocol`: la lista cerrada de comandos (`commands.ts`), los
tipos de intercambio (`types.ts`, `activity.ts`) y sus reglas puras (adjuntos, traspaso, modelo de
sesión, partes del árbol, soporte, fondo del chat, atención). Sin red. `apps/mobile` lo sigue
importando por el shim `packages/protocol`.
