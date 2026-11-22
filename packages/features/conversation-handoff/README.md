# @danil/feature-conversation-handoff

## Qué hace
Gestión del traspaso de contexto de conversación entre modelos o agentes durante la ejecución de una tarea.
Mantiene los hechos clave (`HandoffFact`), el alcance y el estado de presentación del traspaso.

## Qué expone
Exporta desde `src/index.ts`:
- Función de creación y tipos: `createConversationHandoff`, `ConversationScope`, `HandoffFact`, `HandoffView`, `HandoffPresentation`.

## Qué consume
- SolidJS reactivo puro; no importa clientes de red ni otras features.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: ninguno directo.

## Qué falta según la fase 2 del plan
- Fase 2.4: conectarse únicamente a través de props y slots gestionados por `shell` en la conversación de `chat` (R3).
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
