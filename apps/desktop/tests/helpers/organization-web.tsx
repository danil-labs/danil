import { Fleet } from "@terminus/fleet";
import { machinesListed, setDanilFleet } from "../../src/features/machines/danil-source";
import { render } from "solid-js/web";
import { capabilities, setCapabilities } from "../../src/lib/platform";
import { WebOrganizationRows } from "../../src/features/shell/WebOrganizationRows";

export function mountWebOrganization(root: HTMLElement) {
  const before = capabilities();
  const fleet = new Fleet({ self: null, connect: () => ({ state: () => "online", call: async () => { throw new Error("unexpected relay read"); }, onState: () => () => {}, onEvents: () => () => {}, subscribe: () => {}, start: () => {}, close: () => {} }) });
  fleet.setMachines([{ id: "cloud", name: "Acme", kind: "organization", organizationId: "org", context: "web-context", state: "online" }]);
  fleet.setListing("cloud", [{ id: "shared", name: "Docs" }], "web-context");
  machinesListed(fleet);
  const actions: string[] = [];
  setCapabilities({ ...before, webRailSource: { group: () => ({ context: "web-context", org: "org", name: "Acme", plan: "paid", role: "member" }), workspaces: () => [{ id: "shared", name: "Docs" }] }, nativeWindow: false, groupAccount: { current: async () => ({ context: "web-context", org: "org", name: "Acme", plan: "paid", role: "member" }), send: async (context) => { actions.push(`balance/${context}`); return { status: 200, body: { organization_id: "org", available: { currency: "MXN", amount_micro: "1000000" } } }; } }, webAccounts: { current: { user_id: "person", email: "web@example.test", name: null, extra: false }, others: () => [], open: () => {}, remove: async () => {}, signOut: () => { actions.push("sign-out"); } } });
  const dispose = render(() => <WebOrganizationRows rows={[{ id: "shared", name: "Docs", logo: null }]} active="shared" tasksOf={() => []} stateLabel={() => ""} onOpen={(id) => actions.push(`open/${id}`)} onManage={() => {}} onRemove={() => {}} fallback={<span data-legacy-fallback="" />} />, root);
  return { actions, dispose: () => { dispose(); fleet.close(); setDanilFleet(null); setCapabilities(before); } };
}
