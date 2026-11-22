# @danil/feature-chat

## Qué hace
Pantalla principal de conversación con el agente y compositor de tareas («¿Qué resolvemos?»).
Gestiona streaming reactivo con cursor, máquina causal de turnos, visualización de razonamiento, deltas y aprobaciones de seguridad.

## Qué expone
Exporta desde `src/index.ts`:
- Modos y estado: `modoInicial`, `modoRecordado`, `recordarModo`, `guardable`.
- Tipos de traspaso y cola: `HandoverPending`, `Encolado`, `Msg`.
- Pantalla y componentes: `Chat`, `PendingHandoff`, `TaskLocation`, etc.

## Qué consume
- `@danil/engine-client`, `@danil/platform-client`, `@danil/ui`.
- `packages/ui/src/lib/chat`, `packages/engine-client` (history), `packages/ui`, `@terminus/protocol`, `@terminus/tasks`.
- `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna directa (consumidas a través de `platform-client` si aplica).
- Comandos RPC1 del motor: `load_session`, `send_message`, `stop_turn`, `respond_permission`, `answer_question`, `call_mcp_app_tool`, `close_mcp_app`, `chat_visual_part`, `account_limits`, etc.

## Qué falta según la fase 2 del plan
- Fase 2.1: `ProgressRing` sube a `packages/ui`.
- Fase 2.4: `DelegatedReference` y `DelegatedSkeleton` se mueven a `features/projects`; eliminar 131 imports cruzados hacia otras features (R3).
- Fase 2.6: partir `src/screens/Chat.tsx` (3.843 líneas) en archivos menores a 400 líneas (R6).
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
