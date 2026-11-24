/** El IPC de la ventana Tauri tal como lo deja el runtime en `window`; la web no lo tiene. */
export type NativeInternals = { invoke: (command: string, args?: Record<string, unknown>, options?: { headers?: HeadersInit }) => Promise<unknown> };

type Target = Window & { __TAURI_INTERNALS__?: NativeInternals };

/** El IPC nativo de la ventana, o `null` en la web. */
export const nativeInternals = (): NativeInternals | null => (window as Target).__TAURI_INTERNALS__ ?? null;

/** En macOS, el evento nativo de soltar archivos llega en puntos lógicos; en el resto, en píxeles físicos. */
export const dragDropInPoints = (): boolean =>
  typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");
