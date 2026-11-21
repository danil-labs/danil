import { type Component, type JSX } from "solid-js";

export interface ExternalLinkProps {
  onOpen?: () => void;
  class?: string;
  children?: JSX.Element;
  "data-link"?: string;
}

/**
 * Enlace/botón presentacional para abrir URLs externas mediante callback onOpen (RV1 #28, R12).
 */
export const ExternalLink: Component<ExternalLinkProps> = (props) => {
  return (
    <button
      type="button"
      onClick={() => props.onOpen?.()}
      class={
        props.class ??
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer"
      }
      data-external-link={props["data-link"] ?? ""}
    >
      {props.children}
    </button>
  );
};
