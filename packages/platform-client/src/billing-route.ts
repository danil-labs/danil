export const BILLING_LOGIN_KEY = "danil.billing.login";
export const BILLING_PAYMENT_KEY = "danil.billing.payment";
const BILLING_MAX_AGE_MS = 60 * 60_000;
const billingPath = () => `${import.meta.env.BASE_URL}billing`;

export function billingHref() {
  return billingPath();
}

export function rememberBillingLogin() {
  const url = new URL(location.href);
  url.searchParams.delete("error");
  sessionStorage.setItem(BILLING_LOGIN_KEY, JSON.stringify({ href: url.href, expires: Date.now() + BILLING_MAX_AGE_MS }));
}

export function rememberBillingReturn(checkoutId?: string) {
  if (location.pathname !== billingPath()) return;
  const url = new URL(location.href);
  url.searchParams.delete("promo");
  sessionStorage.setItem(BILLING_PAYMENT_KEY, JSON.stringify({ href: url.href, checkoutId, expires: Date.now() + BILLING_MAX_AGE_MS }));
}
