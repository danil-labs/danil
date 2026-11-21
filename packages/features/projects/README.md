# @danil/feature-projects

Feature de proyectos y tareas de Danil.

## Qué hace

- **Catálogo de proyectos y tareas**: lista y agrupa los proyectos y tareas de un workspace en una máquina determinada (regla 09: nunca se asume que existe en otra máquina).
- **Carga en lote acotado (B-013)**: resuelve el problema N+1 ejecutando consultas de tareas con concurrencia acotada (o mediante consulta batch si el motor la implementa).
- **Borrado con ciclo de vida (B-010)**: diálogo de eliminación de tareas que inspecciona cambios y worktrees sin guardas restrictivas de features.
- **Reinspección automática con debounce (B-011)**: si el consentimiento de la tarea cambia durante la confirmación (`task_family_consent_changed`), se re-inspecciona con debounce en lugar de bloquear la interfaz.
- **Store unificado reactivo (B-012)**: un único store reactivo que actualiza proyectos y tareas atómicamente al confirmar el borrado, evitando pestañas y sesiones huérfanas.
- **Manejo resiliente de errores**: los errores de la API se muestran con mensaje claro y botón de reintento, nunca como listas vacías.

## Qué consume y contratos

- **Comandos RPC1 del motor (`seldon-runtime` vía `@danil/engine-client`)**:
  - `list_projects`: catálogo de carpetas/proyectos en la máquina.
  - `list_live_sessions`: lectura de tareas activas de un proyecto.
  - `delete_session`: borrado de sesión/tarea en el motor.
  - `finish_task`: finalización y archivado de tarea.
- **Operaciones de plataforma (`@danil/platform-client`)**:
  - `Workspace` (modelo OpenAPI para contexto del workspace).
- **Componentes base**:
  - `@danil/ui` para primitivas visuales y estilos del sistema de diseño.

## Pendiente en el contrato del motor

- Pendiente: método RPC1 batch `list_workspace_tasks` en `commands.json` para consulta atómica de todas las tareas del workspace en una sola petición.
- Pendiente: esquema formal en `commands.json` de `task_lifecycle_preview` con campo `integration` garantizado por miembro.
- Pendiente: esquema formal en `commands.json` de `task_lifecycle_apply` con parámetros `{ project, id, consent, discard }` y resultado `DeleteResult`.
