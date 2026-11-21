// Única entrada pública de @danil/feature-search (03-structure).
// Exporta pantallas y piezas que el shell monta.

// Pantallas
export { GlobalSearch, default } from "./screens/GlobalSearch.tsx";
export type { GlobalSearchProps } from "./screens/GlobalSearch.tsx";

// Queries hacia el motor
export { useArchivedTasks, fetchArchivedTasks } from "./queries.ts";

// Modelos y utilidades de búsqueda
export {
  spaceName,
  matchesTaskQuery,
  GROUPS,
  PER_GROUP,
  RECENT,
  asFailure,
  prosa,
} from "./model.ts";
export type {
  SearchFilter,
  Group,
  SpaceRef,
  Space,
  Project,
  SessionRow,
  Archivadas,
  Result,
  RawArchivedTasksOutput,
  Failure,
  Prosa,
  Frase,
} from "./model.ts";
