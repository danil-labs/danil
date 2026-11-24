/**
 * The globals `@tauri-apps/api` reads, answered by the web transport. Every
 * Tauri import in the front keeps working unchanged: `invoke`, `Channel`,
 * `listen` and the plugins all end in `__TAURI_INTERNALS__.invoke`.
 */
import type { WebTransport } from "./transport";

type Internals = {
  invoke: (command: string, args?: Record<string, unknown>, options?: { headers?: HeadersInit }) => Promise<unknown>;
  transformCallback(callback?: (response: unknown) => void, once?: boolean): number;
  unregisterCallback(id: number): void;
  convertFileSrc(path: string, protocol?: string): string;
  metadata: { currentWindow: { label: string }; currentWebview: { windowLabel: string; label: string } };
};

export function installIpc(target: Window, transport: Pick<WebTransport, "handle">) {
  let lastId = 0;
  const internals: Internals = {
    invoke: (command, args, options) => {
      if (command === "plugin:event|listen") return Promise.resolve(++lastId);
      return transport.handle(command, args, options);
    },
    // Nothing calls back: channels and Tauri events have no sender in a browser.
    transformCallback: () => ++lastId,
    unregisterCallback: () => {},
    // Files live on the remote computer: a browser cannot read their paths.
    convertFileSrc: () => "",
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
  };
  Object.assign(target, {
    __TAURI_INTERNALS__: internals,
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
  });
}
