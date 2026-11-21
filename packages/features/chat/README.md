# @danil/feature-chat

Feature de conversación con agentes, visualización de turnos, streaming reactivo de tokens y aprobaciones de seguridad.

## Qué hace

- **Suscripción a streaming con cursor (`src/stream/`, B-014)**: Gestión del canal de eventos push `'chat'` con cursor de posición. Evita pérdida o duplicación de deltas tras reconexiones de red reconciliando el estado en memoria con el historial persistido sin recargar a ciegas.
- **Máquina de estados de turnos (`src/turns/`, B-015)**: Secuencia y orden causal garantizado para bloques de razonamiento (`thinking`), fragmentos de texto (`delta`), herramientas ejecutadas (`tool`) y procesos de shell. Garantiza que los bloques de razonamiento nunca desaparezcan tras concluir el turno ni cuando una herramienta se emita antes de cerrar el pensamiento.
- **Componentes modulares (`src/components/`, B-016)**: Descomposición del monolito histórico en componentes aislados y testeables de menos de 400 líneas (`MessageItem`, `ReasoningBlock`, `ToolPermissionCard`, `Composer`, `ErrorBanner`).
- **Manejo resiliente de errores**: Todo error de la API o motor se expone con interfaz explícita de fallo y botón de reintento, impidiendo el renderizado de listas vacías erróneas.

## Qué consume

Todo el flujo de chat consume exclusivamente llamadas RPC1 y eventos push del motor a través de `@danil/engine-client` (centralizado en `src/queries.ts`):

### Comandos RPC1 (`packages/engine-client`)
- `load_session`: Carga del historial completo de turnos y metadatos de la sesión.
- `send_message`: Inicio de un nuevo turno de conversación con el agente.
- `stop_turn`: Cancelación o interrupción del turno en ejecución.
- `respond_permission`: Autorización o rechazo para llamadas a herramientas restringidas.
- `answer_question`: Respuesta a formularios estructurados emitidos por el agente.

### Eventos Push (`"chat"`)
- `started`: Inicio de turno con modelo y asignación de identificador.
- `reasoning`: Fragmentos de cadena de pensamiento del agente.
- `delta`: Tokens y fragmentos de texto de respuesta.
- `tool` / `tool_done`: Invocación y finalización de pasos de herramientas.
- `shell_started` / `shell_output` / `shell_done`: Ejecución de comandos en la máquina.
- `permission`: Peticiones de interacción y aprobación de seguridad hacia el usuario.
- `done`: Cierre y consolidación del turno activo.

## Piezas pendientes

- `AgentDock`: Dock superior de visualización de subagentes pendiente de especificación de eventos multicomputer.
- `ChatVisual`: Renderizador de visualizaciones interactivas con iframe seguro pendiente de adaptador web.
