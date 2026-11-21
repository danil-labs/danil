import type { Host } from "./index.ts";

const unsupported = (what: string) => () => Promise.reject(new Error(`unsupported_on_web: ${what}`));

/** Host de la web: no hay motor local; todas las máquinas van por relay. */
export function createWebHost(): Host {
  return {
    kind: "web",
    invoke: unsupported("invoke"),
    call: unsupported("call"),
    listen: () => () => {},
    // En la web no hay máquina local: todas van por relay.
    isLocal: () => false,
    openExternal: async (url) => {
      // Solo https: una URL `javascript:` o `data:` que venga del servidor no se abre (SR1, 12).
      if (!/^https:\/\//i.test(url)) throw new Error("unsupported_url");
      window.open(url, "_blank", "noopener,noreferrer");
    },
  };
}
