import { createComponent, createContext, useContext, type JSX } from "solid-js";
import type { PlatformClient } from "./index.ts";

/**
 * Un solo cliente del borde por app (regla 2). La app lo crea con la sesión y
 * lo provee; las features lo leen en su `queries.ts` con `usePlatform()`.
 */
const PlatformContext = createContext<PlatformClient>();

export function PlatformProvider(props: { client: PlatformClient; children: JSX.Element }): JSX.Element {
  return createComponent(PlatformContext.Provider, {
    value: props.client,
    get children() {
      return props.children;
    },
  });
}

export function usePlatform(): PlatformClient {
  const client = useContext(PlatformContext);
  if (!client) throw new Error("usePlatform: falta <PlatformProvider> en la app");
  return client;
}
