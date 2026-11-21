import type { Host } from "./index.ts";

const unsupported = (what: string) => () => Promise.reject(new Error(`unsupported_on_web: ${what}`));

/** Host de la web: no hay motor local; todas las máquinas van por relay. */
export function createWebHost(): Host {
  return {
    kind: "web",
    invoke: unsupported("invoke"),
    call: unsupported("call"),
    listen: () => () => {},
    openExternal: async (url) => {
      window.open(url, "_blank", "noopener");
    },
  };
}
