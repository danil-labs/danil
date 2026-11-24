import { checkoutReturn } from "./billing-v2-return";
import { BILLING_LOGIN_KEY as LOGIN, BILLING_PAYMENT_KEY as PAYMENT, billingHref } from "../../../../packages/platform-client/src/billing-route.ts";

export { billingHref, rememberBillingLogin, rememberBillingReturn } from "../../../../packages/platform-client/src/billing-route.ts";

const billingPath = billingHref;

function resume(store: Storage, key: string, current: URL, checkoutId?: string) {
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw);
    const url = new URL(pending.href);
    if (url.origin !== current.origin || url.pathname !== billingPath() || !(pending.expires > Date.now())) return null;
    if (pending.checkoutId && pending.checkoutId !== checkoutId) return null;
    for (const [name, value] of current.searchParams) url.searchParams.set(name, value);
    return url;
  } catch {
    return null;
  }
}

export function billingEntry(location: Location, store: Storage) {
  const current = new URL(location.href);
  if (current.pathname === `${billingPath()}/`) {
    current.pathname = billingPath();
    return current;
  }
  if (current.pathname === billingPath()) {
    store.removeItem(LOGIN);
    return current;
  }
  if (current.pathname !== import.meta.env.BASE_URL) return null;
  const checkout = checkoutReturn(current.href).id;
  const settings = current.searchParams.get("settings");
  const portal = settings !== null && ["plan", "business", "fiscal"].includes(settings);
  if (checkout || portal) {
    const returned = resume(store, PAYMENT, current, checkout ?? undefined);
    if (returned) {
      store.removeItem(PAYMENT);
      returned.searchParams.delete("settings");
    }
    if (returned || !checkout) return returned;
    current.pathname = billingPath();
    return current;
  }
  const login = resume(store, LOGIN, current);
  store.removeItem(LOGIN);
  return login;
}
