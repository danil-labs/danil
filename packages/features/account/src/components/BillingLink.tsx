import { type Component, type JSX } from "solid-js";
import { host } from "@danil/host";
import { Button } from "@danil/ui";
import { getBillingUrl } from "../config.ts";

export interface BillingLinkProps {
  class?: string;
  children?: JSX.Element;
}

/**
 * Botón «Administrar» que abre la página de facturación y planes (/billing).
 * Abre la URL configurada (VITE_BILLING_URL) mediante host.openExternal de @danil/host.
 */
export const BillingLink: Component<BillingLinkProps> = (props) => {
  const handleClick = () => {
    void host.openExternal(getBillingUrl());
  };

  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={handleClick}
      class={props.class}
      data-billing-link=""
    >
      {props.children ?? "Administrar"}
    </Button>
  );
};
