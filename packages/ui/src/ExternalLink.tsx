import type { JSX } from "solid-js";
import { invoke } from "../../engine-client/src/client.ts";
import { cn } from "./lib/utils";

export const ENLACE =
  "text-link underline underline-offset-2 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// Abre el navegador del sistema: un `href` real se llevaría la app. Sin `url` no hace nada.
export function ExternalLink(props: { url: string | null | undefined; class?: string; children: JSX.Element }) {
  return (
    <a
      class={cn(ENLACE, props.class)}
      href="#"
      onClick={(e) => {
        e.preventDefault();
        if (props.url) invoke("open_external", { target: props.url }).catch(() => {});
      }}
    >
      {props.children}
    </a>
  );
}
