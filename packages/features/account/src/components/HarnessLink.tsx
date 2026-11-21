import { type Component, type JSX } from "solid-js";
import { host } from "@danil/host";
import { Button } from "@danil/ui";
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
    <Button
      size="sm"
      variant="secondary"
      onClick={handleClick}
      class={props.class}
      data-harness-link=""
    >
      {props.children ?? "Administrar usuarios y permisos"}
    </Button>
  );
};
