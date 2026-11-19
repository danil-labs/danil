import { render } from "solid-js/web";
import { OrganizationAccountMenu } from "../../src/features/shell/OrganizationAccountMenu";

export function mountOrganizationMenu(root: HTMLElement, role: string) {
  const actions: string[] = [];
  let reads = 0;
  const dispose = render(() => <OrganizationAccountMenu group={{ context: "context", org: "org", name: "Acme", plan: "paid", role }} email="one@example.com" workspace="Proyecto" pinned={false} index={1} count={3} promo={false} send={async () => { reads++; throw new Error("the menu must not request a balance"); }} onPromo={() => actions.push("redeem")} onManage={() => actions.push("manage")} onHide={() => actions.push("hide")} onPin={() => actions.push("pin")} onMove={(step) => actions.push(`move/${step}`)} onCloseOrg={async (context) => { actions.push(`close/${context}`); }} onCloseEmail={async (email, context) => { actions.push(`close/${email}/${context}`); }} onDismiss={() => actions.push("dismiss")} />, root);
  return { actions, dispose, reads: () => reads };
}
