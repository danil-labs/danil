import "../../src/locales/catalogs";
import "../../src/web/phrases";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { OrganizationWorkspaceTooltip } from "../../../../packages/shell/src/shell/OrganizationWorkspaceTooltip.tsx";
import { watchOrganizationCredits } from "../../../../packages/shell/src/shell/organization-credits-watch.ts";
import { TooltipRoot, TooltipTrigger, TooltipContent } from "../../../../packages/ui/src/Tooltip.tsx";

export function mountOrganizationTooltip(root: HTMLElement) {
  let reads = 0; let unavailable = false;
  const tile = { key: "context/workspace", id: "workspace", name: "Proyecto", logo: null, context: { context_id: "context", org: "org", org_name: "Organización", email: "one@example.com", plan: "paid", family: "family", person: "person", available: [], added: new Set<string>() } };
  const dispose = render(() => {
    const credits = watchOrganizationCredits();
    const [open, setOpen] = createSignal(false);
    return <TooltipRoot open={open()} onOpenChange={setOpen} openDelay={150} placement="right">
      <TooltipTrigger as="button" id="org-tooltip-tile" onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>Proyecto</TooltipTrigger>
      <TooltipContent><OrganizationWorkspaceTooltip tile={tile} active={open()} credits={credits} send={async (context, method, path) => {
        if (context !== "context" || method !== "GET" || path !== "/v1/credits/balance") throw new Error("wrong scope");
        reads++; return { status: 200, body: { organization_id: unavailable ? "another-org" : "org", available: { currency: "MXN", amount_micro: "12500000" } } };
      }} /></TooltipContent>
    </TooltipRoot>;
  }, root);
  return { dispose, reads: () => reads, unavailable: () => { unavailable = true; } };
}

export { mountOrganizationStack } from "./organization-stack";

export { mountGroupAccountMenu, mountOrganizationMenu } from "./organization-menu";

export { mountOrganizationLayout } from "./organization-layout";

export { mountOrganizationGroup } from "./organization-group";

