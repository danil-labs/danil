# @terminus/design

## Qué hace
Tokens de diseño compartidos entre aplicaciones desktop y mobile.
Define estados de tareas, marcas visuales de agentes, colores de carpetas, temas y escalas tipográficas y de radios.

## Qué expone
Exporta desde `src/index.ts`:
- Estados de tarea y tonos de señal: `SignalTone`, `TaskActivity`, `TaskState`, `SIGNAL_DOT_SIZE`, `TASK_STATES`, `markedState`, `rolledOutcome`, `taskSignalTone`, `taskPriority`, `topState`.
- Etiquetas de estado: `StatusLabel`, `STATUS_LABELS`, `WORK_STATUS_LABELS`.
- Iconografía y formas: `IconShape`, `LucideName`, `LUCIDE`, `STATUS_ICONS`.
- Temas y escalas: `ThemeTokens`, `CSS_SOURCE`, `CSS_THEME_BLOCKS`, `THEMES`, `RadiusStep`, `TextStep`, `CHANNEL_COLORS`, `RADIUS`, `TEXT`, `TEXT_STEPS`.

## Qué consume
- Constantes TypeScript y definiciones CSS puras; sin dependencias de red ni librerías externas.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: ninguno.

## Qué falta según la fase 2 del plan
- Fase 2.1: los componentes visuales (`agentMarks.ts`, `astro.ts`, `statusIcon.ts`) y temas suben a `packages/ui`.
- Se retira en la fase 3 conforme el cliente móvil adopte los tokens de `packages/ui`.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
