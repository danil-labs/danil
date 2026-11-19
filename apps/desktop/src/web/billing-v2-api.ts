import { z } from "zod";
import { availableDanilCredits } from "../lib/credits-balance.ts";

type Transport = { call(path: string, init?: RequestInit): Promise<Response>; mutation(path: string, init?: RequestInit): Promise<Response> };
const money = z.object({ currency: z.literal("MXN"), amount_micro: z.string().regex(/^-?(0|[1-9]\d{0,18})$/) });
const checkout = z.object({ checkout_id: z.string(), state: z.enum(["creating", "open", "completed", "expired", "canceled"]), url: z.string().url().nullable() });
const checkoutStatus = z.object({ checkout_id: z.string(), kind: z.enum(["plan", "credits"]), state: z.enum(["pending", "paid", "active", "canceled", "expired", "error"]), terminal: z.boolean(), url: z.string().url().nullable(), expires_at: z.string().nullable(), organization_id: z.string().regex(/^org_[A-Za-z0-9]{1,64}$/).optional() }).superRefine((value, ctx) => {
  const terminal = value.state === "active" || value.state === "canceled" || value.state === "expired" || value.state === "error" || (value.state === "paid" && value.kind === "credits");
  if (value.terminal !== terminal || (value.organization_id && value.state !== "active") || (value.state === "active" && (value.kind !== "plan" || !value.organization_id))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_checkout_status" });
});
const organization = z.object({ organization_id: z.string(), plan_key: z.string(), edition: z.string().nullish(), state: z.string(), cancel_at_period_end: z.boolean(), payer: z.object({ is_you: z.boolean() }) });
export type PlanChoice = { plan_key: "pro" | "team"; variant?: "business" };
const catalog = z.object({ catalog_version: z.number().int(), plans: z.array(z.object({ plan_key: z.string(), sellable: z.boolean(), price: money.nullable() })), display_variants: z.array(z.object({ variant: z.string(), plan_key: z.string(), edition: z.string() })).optional(), credit_packs: z.array(z.object({ pack_id: z.string(), sellable: z.boolean(), credits: money })) });
const balance = z.object({ organization_id: z.string(), available: money, included: money, gift: money, purchased: money });
const page = z.object({ items: z.array(z.record(z.string(), z.unknown())), next_cursor: z.string().nullable() });
const purchase = z.object({ purchase_id: z.string(), state: z.string(), url: z.string().url().nullable() });
const portal = z.object({ url: z.string().url() });

export function billingV2(transport: Transport, organizationId: string | null) {
  const read = async <T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) => schema.parse(await (await transport.call(path, { signal: signal ?? AbortSignal.timeout(15000) })).json());
  const write = async <T>(path: string, body: unknown, key: string, schema: z.ZodType<T>) => schema.parse(await (await transport.mutation(path, {
    signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: body === undefined ? undefined : JSON.stringify(body),
  })).json());
  const pagePath = (path: string, cursor?: string) => cursor ? `${path}?${new URLSearchParams({ cursor })}` : path;
  return {
    catalog: () => read("billing/catalog", catalog),
    async organization(signal?: AbortSignal) {
      const result = await read("billing/organization", organization, signal);
      if (result.organization_id !== organizationId) throw new Error("billing_organization_mismatch");
      return result;
    },
    async balance() {
      const result = await read("credits/balance", balance);
      if (!organizationId || availableDanilCredits(result, organizationId) === null) throw new Error("billing_organization_mismatch");
      return result;
    },
    transactions: (cursor?: string) => read(pagePath("credits/transactions", cursor), page),
    invoices: (cursor?: string) => read(pagePath("billing/invoices", cursor), page),
    checkout: (plan_key: "pro" | "team", catalog_version: number, key: string, variant?: "business") => write("billing/checkout-sessions", { plan_key, variant, catalog_version, intent: "upgrade" }, key, checkout),
    async createOrganization(plan_key: "pro" | "team", catalog_version: number, name: string, key: string, variant?: "business") {
      if (/[\u0000-\u001f\u007f-\u009f<>]/u.test(name)) throw new Error("invalid_organization_name");
      const organization_name = name.normalize("NFC").trim();
      if ([...organization_name].length < 1 || [...organization_name].length > 80) throw new Error("invalid_organization_name");
      return write("billing/checkout-sessions", { plan_key, variant, catalog_version, intent: "new_organization", organization_name }, key, checkout);
    },
    async checkoutStatus(id: string, signal?: AbortSignal) {
      const status = await read(`billing/checkout-sessions/${encodeURIComponent(id)}`, checkoutStatus, signal);
      if (status.checkout_id !== id) throw new Error("checkout_id_mismatch");
      return status;
    },
    purchase: (pack_id: string, catalog_version: number, key: string) => write("credits/purchases", { pack_id, catalog_version }, key, purchase),
    portal: (key: string) => write("billing/portal-sessions", undefined, key, portal),
    cancel: (key: string) => write("billing/subscription/cancel", undefined, key, organization),
    resume: (key: string) => write("billing/subscription/resume", undefined, key, organization),
  };
}
