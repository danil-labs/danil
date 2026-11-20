import { checkoutReturn } from "./billing-v2-return";

export const webBillingEnabled = import.meta.env.VITE_DANIL_BILLING_V2 === "true";
const LOGIN = "danil.billing.login";
const PAYMENT = "danil.billing.payment";
const MAX_AGE_MS = 60 * 60_000;
const billingPath = () => `${import.meta.env.BASE_URL}billing`;

export function billingHref(org: string) {
  return `${billingPath()}?${new URLSearchParams({ org })}`;
}

export function rememberBillingLogin() {
  const url = new URL(location.href);
  url.searchParams.delete("error");
  sessionStorage.setItem(LOGIN, JSON.stringify({ href: url.href, expires: Date.now() + MAX_AGE_MS }));
}

export function rememberBillingReturn(checkoutId?: string) {
  if (location.pathname !== billingPath()) return;
  const url = new URL(location.href);
  url.searchParams.delete("promo");
  sessionStorage.setItem(PAYMENT, JSON.stringify({ href: url.href, checkoutId, expires: Date.now() + MAX_AGE_MS }));
}

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
    return returned;
  }
  const login = resume(store, LOGIN, current);
  store.removeItem(LOGIN);
  return login;
}
