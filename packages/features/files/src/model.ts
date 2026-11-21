import type { EngineClient } from "@danil/engine-client";

// Tipos base de comandos RPC1 derivados de EngineClient
export type TreeFilesParams = Parameters<EngineClient["tree_files"]>[0];
export type TreeFilesOutput = Awaited<ReturnType<EngineClient["tree_files"]>>;

export type TreeFolderParams = Parameters<EngineClient["tree_folder"]>[0];
export type TreeFolderOutput = Awaited<ReturnType<EngineClient["tree_folder"]>>;

export type TreeGitStatusParams = Parameters<EngineClient["tree_git_status"]>[0];
export type TreeGitStatusOutput = Awaited<ReturnType<EngineClient["tree_git_status"]>>;

export type TreeShowParams = Parameters<EngineClient["tree_show"]>[0];
export type TreeShowOutput = Awaited<ReturnType<EngineClient["tree_show"]>>;

export type TreeWriteParams = Parameters<EngineClient["tree_write"]>[0];
export type TreeWriteOutput = Awaited<ReturnType<EngineClient["tree_write"]>>;

export type TreePatchParams = Parameters<EngineClient["tree_patch"]>[0];
export type TreePatchOutput = Awaited<ReturnType<EngineClient["tree_patch"]>>;

export type TreeDeleteParams = Parameters<EngineClient["tree_delete"]>[0];
export type TreeCreateFileParams = Parameters<EngineClient["tree_create_file"]>[0];
export type TreeCreateFolderParams = Parameters<EngineClient["tree_create_folder"]>[0];
export type TreeRenameParams = Parameters<EngineClient["tree_rename"]>[0];

/** Estado git de un nodo en el árbol */
export type GitStatusKind = "modified" | "added" | "deleted" | "untracked" | "ignored";

/** Contexto de sesión y proyecto para operaciones de árbol */
export interface TreeContext {
  project?: string;
  sessionId?: string;
  tree?: string;
}

/** Nodo para la vista en árbol (archivo o carpeta) */
export interface FileNodeView {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: string;
  gitStatus?: GitStatusKind | null;
  expanded?: boolean;
  children?: FileNodeView[];
}

/** Tipo de contenido para el visor de archivos */
export interface FileContentView {
  kind: "text" | "image" | "pdf" | "binary" | string;
  text: string;
  dataUrl?: string | null;
  pdf?: string | null;
  bytes: number;
  truncated: boolean;
  isLargeFile?: boolean;
}

/** Límite de seguridad para archivos grandes: 5 MB (B-019) */
export const LARGE_FILE_THRESHOLD_BYTES = 5 * 1024 * 1024;

/** Tamaño de bloque para paginación segura */
export const SAFE_CHUNK_SIZE_BYTES = 64 * 1024;

/** Estado de paginación para lectura segura de archivos grandes (B-019) */
export interface FilePaginationState {
  offset: number;
  chunkSize: number;
  totalBytes: number;
  loadedChunks: number;
  hasMore: boolean;
  loadingMore: boolean;
}

/** Categorías de icono para el diccionario de B-020 */
export type IconCategory =
  | "folder"
  | "folderOpen"
  | "code"
  | "markup"
  | "style"
  | "document"
  | "image"
  | "media"
  | "archive"
  | "config"
  | "binary"
  | "file";
