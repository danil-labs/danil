import { render } from "solid-js/web";
import { GroupAccountMenu } from "../../src/features/shell/GroupAccountMenu";
import { OrganizationAccountMenu } from "../../src/features/shell/OrganizationAccountMenu";

export function mountOrganizationMenu(root: HTMLElement, role?: string) {
  const actions: string[] = [];
  let reads = 0;
  const dispose = render(() => <OrganizationAccountMenu group={{ context: "context", org: "org", name: "Acme", plan: "paid", role }} email="one@example.com" workspace="Proyecto" pinned={false} index={1} count={3} promo={false} send={async () => { reads++; throw new Error("the menu must not request a balance"); }} onPromo={() => actions.push("redeem")} onManage={() => actions.push("manage")} onHide={() => actions.push("hide")} onPin={() => actions.push("pin")} onMove={(step) => actions.push(`move/${step}`)} onCloseOrg={async (context) => { actions.push(`close/${context}`); }} onCloseEmail={async (email, context) => { actions.push(`close/${email}/${context}`); }} onDismiss={() => actions.push("dismiss")} />, root);
  return { actions, dispose, reads: () => reads };
}

/** El menú de cuenta de un grupo (Desk y web agrupada): el canje solo con owner o admin. */
export function mountGroupAccountMenu(root: HTMLElement, role?: string) {
  const actions: string[] = [];
  const dispose = render(() => <GroupAccountMenu group={{ context: "context", org: "org", name: "Acme", plan: "paid", role }} promo={false} send={async () => ({ status: 200, body: { organization_id: "org", available: { currency: "MXN", amount_micro: "1000000" } } })} onPromo={() => actions.push("redeem")} />, root);
  return { actions, dispose };
}
