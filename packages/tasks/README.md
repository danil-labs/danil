# @terminus/tasks

## Qué hace
Paquete legado de derivación y presentación de tareas y dock de agentes.
Transforma la estructura de tareas en listas planas, agrupa por carpetas, genera tarjetas de tarea (`TaskCard`) y modela subtareas remotas.

## Qué expone
Exporta desde `src/index.ts`:
- Subtareas y lanzadores remotos: `REMOTE_CHILD_FEATURE`, `RemoteParent`, `RemoteRow`, `RemoteScope`, `remoteLauncherOf`, `remoteParentOf`, `withRemoteLaunchers`.
- Lista plana y conteos: `FlatRow`, `FlatTask`, `LauncherRow`, `delegatedOf`, `flattenTasks`, `folderCounts`, `isSubtask`, `launcherOf`.
- Tarjetas de tarea: `CardOptions`, `CardTask`, `TaskCard`, `groupCardOptions`, `taskCard`.
- Identificadores de agentes: `canonicalAgentId`, `chipModel`.

## Qué consume
- `@terminus/design`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna directa.
- Comandos RPC1 del motor: ninguno directo; procesa estructuras de datos de tareas.

## Qué falta según la fase 2 del plan
- Fase 2.1 y 2.2: componentes de tarjetas y utilidades de agentes suben a `packages/ui` (`packages/ui/lib/tasks/`).
- El dock de agentes migra a `packages/features/chat` y la lista de sesiones a `packages/features/projects`. El paquete se retira en la fase 3.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
