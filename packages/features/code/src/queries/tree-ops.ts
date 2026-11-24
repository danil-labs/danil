import { invoke, type InvokeOptions } from "../../../../engine-client/src/client.ts";
import type { ArbolEnTarea } from "../../../../ui/src/lib/model";

export const listTaskTrees = (
  project: string,
  session: string,
  options?: InvokeOptions,
): Promise<(ArbolEnTarea[])> =>
  invoke<(ArbolEnTarea[])>("list_task_trees", { project, session }, options);

export const watchTaskTree = (
  project: string,
  session: string,
  changes: unknown,
  options?: InvokeOptions,
): Promise<string> =>
  invoke<string>("watch_task_tree", { project, session, changes }, options);

export const unwatchTaskTree = (
  id: string,
  options?: InvokeOptions,
): Promise<void> =>
  invoke("unwatch_task_tree", { id }, options);

export const previewTreeFiles = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("preview_tree_files", payload as Record<string, unknown>, options);

export const treeFiles = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("tree_files", payload as Record<string, unknown>, options);

export const treeFolder = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("tree_folder", payload as Record<string, unknown>, options);

export const treeGitStatus = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("tree_git_status", payload as Record<string, unknown>, options);

export const treeWrite = (
  payload: unknown,
  options?: InvokeOptions,
): Promise<void> =>
  invoke("tree_write", payload as Record<string, unknown>, options);

export const openFileExternal = (
  payload: { target: string },
  options?: InvokeOptions,
): Promise<void> =>
  invoke("open_file_external", payload, options);

export const openTreeExternal = (
  payload: unknown,
  options?: InvokeOptions,
): Promise<void> =>
  invoke("tree_open_external", payload as Record<string, unknown>, options);

export const readTreePart = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("tree_read_part", payload as Record<string, unknown>, options);

export const officePreview = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("office_preview", payload as Record<string, unknown>, options);

export const treeOfficePreview = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("tree_office_preview", payload as Record<string, unknown>, options);

export const previewFile = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("preview_file", payload as Record<string, unknown>, options);

export const previewTreeShow = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("preview_tree_show", payload as Record<string, unknown>, options);

export const treeShow = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("tree_show", payload as Record<string, unknown>, options);

export const treePatch = (
  payload: unknown,
  options?: InvokeOptions,
): Promise<string> =>
  invoke<string>("tree_patch", payload as Record<string, unknown>, options);

export const treeChanges = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("tree_changes", payload as Record<string, unknown>, options);

export const openExternal = (
  target: string,
  options?: InvokeOptions,
): Promise<void> =>
  invoke("open_external", { target }, options);

export const treeSummary = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("tree_summary", payload as Record<string, unknown>, options);

export const previewTreeFolder = <t = unknown>(
  payload: unknown,
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("preview_tree_folder", payload as Record<string, unknown>, options);

export const treeCreateFile = (
  payload: unknown,
  options?: InvokeOptions,
): Promise<void> =>
  invoke("tree_create_file", payload as Record<string, unknown>, options);

export const treeCreateFolder = (
  payload: unknown,
  options?: InvokeOptions,
): Promise<void> =>
  invoke("tree_create_folder", payload as Record<string, unknown>, options);

export const treeRename = (
  payload: unknown,
  options?: InvokeOptions,
): Promise<void> =>
  invoke("tree_rename", payload as Record<string, unknown>, options);

export const treeDelete = (
  payload: unknown,
  options?: InvokeOptions,
): Promise<void> =>
  invoke("tree_delete", payload as Record<string, unknown>, options);

