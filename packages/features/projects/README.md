# @danil/feature-projects

## Qué hace
Catálogo de proyectos, escritorios (`spaces`) e historial de sesiones/tareas por máquina.
Maneja carga en lote, borrado seguro con confirmación, búsqueda de tareas archivadas y vinculación de repositorios git.

## Qué expone
Exporta desde `src/index.ts`:
- Store y catálogo: `createProjectsStore`, `ProjectsCatalog`.
- Pantallas y componentes: `ProjectView`, `Sessions`, `ManageProjects`, `NewAgent`.

## Qué consume
- `@danil/engine-client`, `@danil/platform-client`, `@danil/ui`, `@terminus/tasks`, `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: tipos de `Workspace` vía `platform-client`.
- Comandos RPC1 del motor: `list_projects`, `list_live_sessions`, `delete_session`, `finish_task`, `add_folder`, `attach_repo`, `archived_tasks`, `delete_space`, `rename_space`, `repo_branches`, etc.

## Qué falta según la fase 2 del plan
- Fase 2.1: `FolderChip` y `TaskStatus` suben a `packages/ui`.
- Fase 2.4: eliminar 127 imports cruzados hacia otras features; recibir `MachineChip` por slot desde `shell`.
- Fase 2.5: recibir el historial `Sidebar` desde `shell`.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
