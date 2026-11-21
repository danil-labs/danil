import { type Component, type JSX } from "solid-js";
import { host } from "@danil/host";
import { getHarnessUrl } from "../config.ts";

export interface HarnessLinkProps {
  class?: string;
  children?: JSX.Element;
}

/**
 * Enlace/botón para administrar usuarios y permisos en el Harness (F3.2).
 * Abre la URL configurada (VITE_HARNESS_URL) mediante host.openExternal de @danil/host.
 */
export const HarnessLink: Component<HarnessLinkProps> = (props) => {
  const handleClick = () => {
    void host.openExternal(getHarnessUrl());
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      class={
        props.class ??
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer"
      }
      data-harness-link=""
    >
      {props.children ?? "Administrar usuarios y permisos"}
    </button>
  );
};
