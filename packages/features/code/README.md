# @danil/feature-code

## Qué hace
Explorador del árbol de código y archivos de proyectos de una máquina.
Controla el visor de archivos, estado de sincronización git, refresco de carpetas de trabajo y previsualización de documentos.

## Qué expone
Exporta desde `src/index.ts`:
- Iconos y componentes: `WorkdirIcon`.
- Componentes internos de visor y árbol: `FileViewer`, `FileTree`, `FileBreadcrumbs`, `GitStatusBadge`.

## Qué consume
- `@danil/engine-client` y `@danil/ui`.
- `@terminus/protocol` y `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: `tree_files`, `tree_folder`, `tree_git_status`, `tree_show`, `tree_write`, `tree_patch`, `list_task_trees`, `kn_status`, `kn_pending`, `kn_update`, `kn_finish`, `kn_cloud_start`, `kn_cloud_state`, `office_preview`, `open_external`.

## Qué falta según la fase 2 del plan
- Fase 2.1: `FileIcon`, `WorkdirIcon` y el catálogo `file-icons.ts` suben a `packages/ui`.
- Fase 2.4: eliminar 66 imports cruzados hacia otras features (como `chat` y `machines`).
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
