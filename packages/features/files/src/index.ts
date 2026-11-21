// Pantallas montadas por el shell
export { FilesScreen } from "./screens/FilesScreen.tsx";
export type { FilesScreenProps } from "./screens/FilesScreen.tsx";

// Componentes y piezas visuales
export { FileTree } from "./components/FileTree.tsx";
export type { FileTreeProps } from "./components/FileTree.tsx";

export { FileViewer } from "./components/FileViewer.tsx";
export type { FileViewerProps } from "./components/FileViewer.tsx";

export { FileIcon, getFileCategory } from "./components/FileIcon.tsx";
export type { FileIconProps } from "./components/FileIcon.tsx";

// Queries y mutaciones
export {
  useTree,
  useFileContent,
  useFileDiff,
  useWriteFile,
} from "./queries.ts";
export type { TreeResult, UseFileContentOptions } from "./queries.ts";

// Modelos y contratos de vista
export {
  LARGE_FILE_THRESHOLD_BYTES,
  SAFE_CHUNK_SIZE_BYTES,
} from "./model.ts";
export type {
  TreeContext,
  FileNodeView,
  FileContentView,
  GitStatusKind,
  FilePaginationState,
  IconCategory,
} from "./model.ts";
