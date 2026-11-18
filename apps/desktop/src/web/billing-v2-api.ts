import { z } from "zod";
import { availableDanilCredits } from "../features/chat/danil-credits.ts";

type Transport = { call(path: string, init?: RequestInit): Promise<Response>; mutation(path: string, init?: RequestInit): Promise<Response> };
const money = z.object({ currency: z.literal("MXN"), amount_micro: z.string().regex(/^-?(0|[1-9]\d{0,18})$/) });
const checkout = z.object({ checkout_id: z.string(), state: z.enum(["creating", "open", "completed", "expired", "canceled"]), url: z.string().url().nullable() });
const organization = z.object({ organization_id: z.string(), plan_key: z.string(), state: z.string(), cancel_at_period_end: z.boolean(), payer: z.object({ is_you: z.boolean() }) });
const catalog = z.object({ catalog_version: z.number().int(), plans: z.array(z.object({ plan_key: z.string(), sellable: z.boolean(), price: money.nullable() })), credit_packs: z.array(z.object({ pack_id: z.string(), sellable: z.boolean(), credits: money })) });
const balance = z.object({ organization_id: z.string(), available: money, included: money, gift: money, purchased: money });
const page = z.object({ items: z.array(z.record(z.string(), z.unknown())), next_cursor: z.string().nullable() });
const purchase = z.object({ purchase_id: z.string(), state: z.string(), url: z.string().url().nullable() });
const portal = z.object({ url: z.string().url() });

export function billingV2(transport: Transport, organizationId: string) {
  const read = async <T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) => schema.parse(await (await transport.call(path, { signal })).json());
  const write = async <T>(path: string, body: unknown, key: string, schema: z.ZodType<T>) => schema.parse(await (await transport.mutation(path, {
    headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: body === undefined ? undefined : JSON.stringify(body),
  })).json());
  return {
    catalog: () => read("billing/catalog", catalog),
    async organization(signal?: AbortSignal) {
      const result = await read("billing/organization", organization, signal);
      if (result.organization_id !== organizationId) throw new Error("billing_organization_mismatch");
      return result;
    },
    async balance() {
      const result = await read("credits/balance", balance);
      if (availableDanilCredits(result, organizationId) === null) throw new Error("billing_organization_mismatch");
      return result;
    },
    transactions: () => read("credits/transactions", page),
    invoices: () => read("billing/invoices", page),
    checkout: (plan_key: "pro" | "team", catalog_version: number, key: string) => write("billing/checkout-sessions", { plan_key, catalog_version }, key, checkout),
    checkoutStatus: (id: string, signal?: AbortSignal) => read(`billing/checkout-sessions/${encodeURIComponent(id)}`, checkout, signal),
    purchase: (pack_id: string, catalog_version: number, key: string) => write("credits/purchases", { pack_id, catalog_version }, key, purchase),
    portal: (key: string) => write("billing/portal-sessions", undefined, key, portal),
    cancel: (key: string) => write("billing/subscription/cancel", undefined, key, organization),
    resume: (key: string) => write("billing/subscription/resume", undefined, key, organization),
  };
}
