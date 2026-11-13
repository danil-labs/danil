/**
 * Danil Business en el navegador: las rutas `/auth/account/business/*` del BFF por el
 * proxy de alfa (`<base>alpha-api`), con la sesión de la persona. El proxy deja pasar
 * solo el workspace activo de la sesión: la cuenta sale del token.
 */
import { sessionFetch } from "../../../../packages/attention/src/request.ts";
import {
  BusinessBillingError,
  type BusinessBillingSource,
  readChange,
  readCheckout,
  readFiscal,
  readPreview,
  readSeats,
  readSummary,
} from "../features/settings/business-billing.ts";
import { activeAccountOf } from "./active-account.ts";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
type Session = { getToken: () => Promise<string>; unauthorized: () => Promise<boolean> };

export function webBusinessBilling(session: Session, prefix: string, f: Fetch = (input, init) => fetch(input, init)): BusinessBillingSource {
  const authorized = sessionFetch(session, (input, init) => f(String(input), init));
  async function send(path: string, method: "GET" | "POST" | "PUT" = "GET", body?: Record<string, unknown>): Promise<unknown> {
    let response: Response;
    try {
      response = await authorized(`${prefix}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new BusinessBillingError("bff_unavailable", 0);
    }
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) throw new BusinessBillingError(typeof data?.error === "string" ? data.error : `http_${response.status}`, response.status);
    return data;
  }
  const query = (account: number) => `?account_id=${account}`;

  return {
    account: async () => activeAccountOf(await session.getToken()),
    summary: async (account) => readSummary(await send(`/auth/account/business/summary${query(account)}`)),
    seats: async (account) => readSeats(await send(`/auth/account/business/seats${query(account)}`)),
    async canManage(account) {
      try {
        const data = (await send(`/auth/account/my-permissions${query(account)}`)) as { permissions?: unknown } | null;
        return Array.isArray(data?.permissions) && data.permissions.includes("billing.manage");
      } catch {
        return false;
      }
    },
    previewSeats: async (account, extraSeats) =>
      readPreview(await send("/auth/account/business/seats/preview", "POST", { account_id: account, extra_seats: extraSeats })),
    changeSeats: async (account, extraSeats, prorationDate) =>
      readChange(await send("/auth/account/business/seats", "POST", { account_id: account, extra_seats: extraSeats, proration_date: prorationDate })),
    creditCheckout: async (account, amountMxn) =>
      readCheckout(await send("/auth/account/business/credit/checkout", "POST", { account_id: account, amount_mxn: amountMxn })),
    fiscal: async (account) => readFiscal(await send(`/auth/account/business/fiscal${query(account)}`)),
    saveFiscal: async (account, profile) => readFiscal(await send("/auth/account/business/fiscal", "PUT", { account_id: account, ...profile })),
  };
}
