# Paridad visual del chat (VP2a / R13)

Componentes portados de `apps/desktop/src/features/chat` a `packages/features/chat/src/components/`:
- `MessageText.tsx`: Texto del mensaje de usuario (con marcas de comandos/menciones) o de agente (Markdown).
- `Reasoning.tsx`: Desplegable de razonamiento del modelo.
- `Questions.tsx`: Tarjeta interactiva de preguntas del agente con selección de opciones y texto libre.
- `ShellCard.tsx`: Tarjeta de ejecución de comandos terminal con salida ANSI y estado de salida.
- `TurnStatus.tsx`: Indicador de estado del turno activo (pensando, esperando respuesta, reloj transcurrido).
- `Timeline.tsx`: Línea de tiempo de pasos y herramientas de la respuesta.

## Componentes UI nuevos portados a `packages/ui/src/` (para exportar al integrar en index.ts):
- `Markdown.tsx`: Renderizado estilizado de bloques de texto markdown con soporte para transformador de texto de marcas.
