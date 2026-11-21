import { type Component, type JSX } from "solid-js";
import { host } from "@danil/host";
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
    <button
      type="button"
      onClick={handleClick}
      class={
        props.class ??
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer"
      }
      data-billing-link=""
    >
      {props.children ?? "Administrar"}
    </button>
  );
};
