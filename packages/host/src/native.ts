export { Channel, convertFileSrc, invoke as invokeNative, type InvokeOptions } from "@tauri-apps/api/core";
export { getVersion } from "@tauri-apps/api/app";
export type { EventCallback } from "@tauri-apps/api/event";
export { join, tempDir } from "@tauri-apps/api/path";
export { getCurrentWebview } from "@tauri-apps/api/webview";
export { getCurrentWindow } from "@tauri-apps/api/window";

/** El IPC de la ventana Tauri tal como lo deja el runtime en `window`; la web no lo tiene. */
export type NativeInternals = { invoke: (command: string, args?: Record<string, unknown>, options?: { headers?: HeadersInit }) => Promise<unknown> };

type Target = Window & { __TAURI_INTERNALS__?: NativeInternals };

/** El IPC nativo de la ventana, o `null` en la web. */
export const nativeInternals = (): NativeInternals | null => (window as Target).__TAURI_INTERNALS__ ?? null;

/** En macOS, el evento nativo de soltar archivos llega en puntos lógicos; en el resto, en píxeles físicos. */
export const dragDropInPoints = (): boolean =>
  typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");
