import LegacyProfileMenu from "../../../../packages/shell/src/shell/LegacyProfileMenu.tsx";
import "../../src/locales/catalogs";
import "../../src/web/phrases";
import { render } from "solid-js/web";
import { setCapabilities } from "../../../../packages/host/src/platform.ts";
import { AccountHeader } from "../../../../packages/shell/src/shell/AccountHeader.tsx";
import { setWebOrganizationAttention, setWebOrganizationName } from "../../../../packages/shell/src/shell/GroupOrganizationWatch.tsx";

export function mountWebGroup(root: HTMLElement, role?: string) {
  const chosen: string[] = [];
  const signedOut: string[] = [];
  const listeners = new Set<() => void>();
  let active = "org-a";
  const selection = {
    state: () => ({ kind: "ready", items: [{ id: "org-a", name: "Acme", plan: "paid" }, { id: "org-b", name: "Bravo", plan: "paid" }], active, busy: false, error: null }),
    needed: () => true,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    choose: async (id: string) => { chosen.push(id); active = id; for (const listener of listeners) listener(); },
  };
  const accounts = { current: { user_id: "web-person", email: "one@example.com", name: null, extra: false }, others: () => [], open: () => {}, remove: async () => {}, signOut: () => { signedOut.push("email"); } };
  setCapabilities({ nativeWindow: false, webAccounts: accounts, organizations: async () => selection as never, groupAccount: {
    current: async () => ({ context: "ctx-a", org: "org-a", name: "Acme", plan: "paid", role }),
    send: async () => ({ status: 200, body: { organization_id: "org-a", available: { currency: "MXN", amount_micro: "1000000" } } }),
  } } as never);
  setWebOrganizationName("Acme");
  setWebOrganizationAttention(true);
  const dispose = render(() => <AccountHeader id="web-person" email="one@example.com" accounts={accounts} extra={false} signedIn />, root);
  return { chosen, signedOut, dispose };
}

export function mountLegacyPromo(root: HTMLElement, role?: string) {
  setCapabilities({ nativeWindow: false, webPromoRole: role, webPromo: async () => ({}) } as never);
  return render(() => <LegacyProfileMenu initialOpen onAccount={() => {}} onReportarBug={() => {}} />, root);
}
