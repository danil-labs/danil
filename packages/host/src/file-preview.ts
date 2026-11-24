import { convertFileSrc, type InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../engine-client/src/client.ts";

export function convertLocalFileSrc(path: string, protocol = "terminus-image"): string {
  return convertFileSrc(path, protocol);
}

export function openExternalTarget(target: string): Promise<unknown> {
  return invoke("open_external", { target });
}

export function openFileExternalTarget(target: string): Promise<unknown> {
  return invoke("open_file_external", { target });
}

export function readHostFileSize(path: string, options?: InvokeOptions): Promise<number> {
  return invoke<number>("file_size", { path }, options);
}

export function readHostFilePreview<T>(path: string, rel: string, options?: InvokeOptions): Promise<T> {
  return invoke<T>("preview_file", { path, rel }, options);
}

export function readHostOfficePreview(path: string, options?: InvokeOptions): Promise<{ pdf: string | null }> {
  return invoke<{ pdf: string | null }>("office_preview", { path }, options);
}
