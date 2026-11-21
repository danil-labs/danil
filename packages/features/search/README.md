# @danil/feature-search

Feature de búsqueda global (diálogo modal ⌘K / Ctrl+K) de Danil.

## Qué hace

- **Búsqueda global reactiva**: diálogo modal con campo de entrada para filtrar tareas, carpetas, tareas archivadas y acciones del workspace.
- **Filtro por chips de categoría**:
  - `all` (Todo): vista combinada con resultados recientes y las primeras coincidencias por grupo.
  - `tasks` (Tareas): tareas del proyecto y espacio activo coincidentes en título, último mensaje, agente o carpeta.
  - `archived` (Archivadas): tareas archivadas obtenidas bajo demanda desde el motor.
  - `folders` (Carpetas): carpetas del espacio activo.
  - `actions` (Acciones): acción rápida para crear nueva tarea en cualquiera de las carpetas disponibles.
- **Coincidencias flexibles (`matchesTaskQuery`)**: búsqueda insensible a acentos, mayúsculas y orden de términos.
- **Navegación completa por teclado**: soporte para flechas arriba/abajo (`ArrowUp`, `ArrowDown`), selección con `Enter` y cierre con `Escape`.
- **Carga bajo demanda de archivadas**: la consulta de tareas archivadas (`archived_tasks`) se ejecuta al abrir el buscador, nunca durante el arranque de la app, aislando fallos de red en el grupo correspondiente sin bloquear el resto de secciones.

## Qué consume y contratos

- **Comandos RPC1 de Danil Engine (`@danil/engine-client`)**:
  - `archived_tasks` (`spaces::archived_tasks` en el manifiesto RPC1): consulta de tareas archivadas (`ArchivedTasksOutput`) y referencias de espacios (`SpaceRef`). Centralizado en `src/queries.ts`.
- **Componentes y tokens de diseño (`@danil/ui`)**:
  - Primitivas visuales: `Dialog`, `DialogContent`, `DialogTitle`, `Input`, `FailureNote`.
  - Utilidad de estilos: `cn`.
  - Catálogo de internacionalización: `@danil/ui/i18n` (claves `search.*` y `spaces.default_name`).
- **Iconos**:
  - `Archive`, `Folder`, `Plus`, `Search`, `SquarePen` de `lucide-solid`.

## Montaje en el shell

El montaje en el shell lo hace `sq-shell`: la feature exporta `GlobalSearch` y sus tipos asociados desde `src/index.ts` para ser montado en el layout principal de la aplicación.
