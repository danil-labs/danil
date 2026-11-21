import type { LocalHost } from "@danil/engine-client";
import type { DeskAuthHost } from "@danil/session";

/**
 * Lo que solo la plataforma de la app sabe hacer: abrir el navegador del
 * sistema y, en Desk, hablar con el motor local por IPC de Tauri. Es el único
 * lugar del front nuevo con `invoke` (R1).
 */
export interface Host extends LocalHost, DeskAuthHost {
  kind: "desk" | "web";
  openExternal(url: string): Promise<void>;
}

export { createTauriHost } from "./tauri.ts";
export { createWebHost } from "./web.ts";

import { createWebHost as webHost } from "./web.ts";

let current: Host = webHost();

/** La app fija su host al arrancar (Desk: createTauriHost()). Por defecto, el de la web. */
export function setHost(next: Host): void {
  current = next;
}

/** El host de la app: las features lo usan para lo que solo la plataforma sabe (abrir el navegador). */
export const host: Host = {
  get kind() {
    return current.kind;
  },
  invoke: (command, args) => current.invoke(command, args),
  call: (method, params) => current.call(method, params),
  listen: (event, cb) => current.listen(event, cb),
  openExternal: (url) => current.openExternal(url),
};
