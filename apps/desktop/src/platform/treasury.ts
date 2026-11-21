import type { edgeTransport } from "@terminus/computers";
import { z } from "zod";
import { edgeUntil, type Patience } from "./client.ts";

/** La ruta del saldo de Treasury en el borde. */
export const CREDITS_BALANCE_PATH = "/v1/credits/balance";

/** La respuesta de una lectura por contexto (saldo o promoción de un grupo). */
export type GroupReply = { status: number; body?: unknown; retry_after_ms?: number };

/** Lee el saldo de Treasury por el transporte de Desk. */
export const readCreditsBalance = (patience?: Patience, transport?: Parameters<typeof edgeUntil>[4]) => edgeUntil("GET", CREDITS_BALANCE_PATH, undefined, patience, transport);

type Transport = { call(path: string, init?: RequestInit): Promise<Response>; mutation(path: string, init?: RequestInit): Promise<Response> };
const money = z.object({ currency: z.literal("MXN"), amount_micro: z.string().regex(/^-?(0|[1-9]\d{0,18})$/) });
const checkout = z.object({ checkout_id: z.string(), state: z.enum(["creating", "open", "completed", "expired", "canceled"]), url: z.string().url().nullable() });
const checkoutStatusBase = { checkout_id: z.string(), url: z.string().url().nullable(), expires_at: z.string().nullable() };
const checkoutStatus = z.union([
  z.object({ ...checkoutStatusBase, kind: z.literal("plan"), state: z.literal("active"), terminal: z.literal(true), organization_id: z.string().regex(/^org_[A-Za-z0-9]{1,64}$/) }),
  z.object({ ...checkoutStatusBase, kind: z.enum(["plan", "credits"]), state: z.enum(["pending", "paid", "canceled", "expired", "error"]), terminal: z.boolean(), organization_id: z.never().optional() }),
]);
const organization = z.object({ organization_id: z.string(), plan_key: z.string(), edition: z.string().nullish(), state: z.string(), payer: z.object({ is_you: z.boolean() }) });
export type PlanChoice = { plan_key: "pro" | "team"; variant?: string };
const catalog = z.object({ catalog_version: z.number().int(), plans: z.array(z.object({ plan_key: z.string(), sellable: z.boolean(), price: money.nullable(), price_pending: z.boolean().optional(), display_variants: z.array(z.object({ variant: z.string(), plan_key: z.string(), edition: z.string(), display_name: z.string() })).optional() })), credit_packs: z.array(z.object({ pack_id: z.string(), sellable: z.boolean(), credits: money })) });
const balance = z.object({ organization_id: z.string(), available: money, included: money, gift: money, purchased: money });
const page = z.object({ items: z.array(z.record(z.string(), z.unknown())), next_cursor: z.string().nullable() });
const purchase = z.object({ purchase_id: z.string(), state: z.enum(["creating", "open", "paid", "failed", "expired"]), url: z.string().url().nullable() });
const portal = z.object({ url: z.string().url() });

export class PromotionCodeFormatError extends Error {
  constructor() { super("promotion_code_invalid"); }
}

function promotionCode(code: string | undefined) {
  if (code !== undefined && (code.length === 0 || code.length > 64 || /[^A-Za-z0-9_-]/.test(code))) {
    throw new PromotionCodeFormatError();
  }
  return code;
}

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
    checkout: async (plan_key: "pro" | "team", catalog_version: number, key: string, variant?: string, promotion_code?: string) => write("billing/checkout-sessions", { plan_key, variant, promotion_code: promotionCode(promotion_code), catalog_version, intent: "upgrade" }, key, checkout),
    async createOrganization(plan_key: "pro" | "team", catalog_version: number, name: string, key: string, variant?: string, promotion_code?: string) {
      if (/[\u0000-\u001f\u007f-\u009f<>]/u.test(name)) throw new Error("invalid_organization_name");
      const organization_name = name.normalize("NFC").trim();
      if ([...organization_name].length < 1 || [...organization_name].length > 80) throw new Error("invalid_organization_name");
      return write("billing/checkout-sessions", { plan_key, variant, promotion_code: promotionCode(promotion_code), catalog_version, intent: "new_organization", organization_name }, key, checkout);
    },
    async checkoutStatus(id: string, signal?: AbortSignal) {
      const status = await read(`billing/checkout-sessions/${encodeURIComponent(id)}`, checkoutStatus, signal);
      if (status.checkout_id !== id) throw new Error("checkout_id_mismatch");
      return status;
    },
    purchase: (pack_id: string, catalog_version: number, key: string) => write("credits/purchases", { pack_id, catalog_version }, key, purchase),
    async purchaseStatus(id: string, signal: AbortSignal) {
      const status = await read(`credits/purchases/${encodeURIComponent(id)}`, purchase, signal);
      if (status.purchase_id !== id) throw new Error("purchase_id_mismatch");
      return status;
    },
    portal: (key: string) => write("billing/portal-sessions", undefined, key, portal),
  };
}

/** Proyección del saldo de Treasury para la organización del workspace activo. */
export function availableDanilCredits(value: unknown, organizationId: string): number | null {
  if (!value || typeof value !== "object") return null;
  const { organization_id, available } = value as { organization_id?: unknown; available?: unknown };
  if (organization_id !== organizationId || !available || typeof available !== "object") return null;
  const { currency, amount_micro } = available as { currency?: unknown; amount_micro?: unknown };
  if (currency !== "MXN" || typeof amount_micro !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(amount_micro)) return null;
  if (BigInt(amount_micro) > 9223372036854775807n) return null;
  return Number(amount_micro) / 1_000_000;
}

/** El compositor y los menús comparten la lectura 30 s, sin sondeo; ningún saldo sin eco alimenta un grupo. */
export function scopedCreditsRead(transport: ReturnType<typeof edgeTransport>, now: () => number = Date.now, orgOf?: (context: string) => string | null) {
  const reads = new Map<string, { promise: Promise<GroupReply>; until: number }>();
  return {
    clear: () => reads.clear(),
    read(context: string): Promise<GroupReply> {
      const existing = reads.get(context);
      if (existing && existing.until > now()) return existing.promise;
      const pending = (async () => {
        const response = await transport.call("credits/balance", { headers: { "X-Danil-Session": context } });
        if (response.ok && (response.headers.get("X-Danil-Session-Applied") !== context || (orgOf && (!orgOf(context) || response.headers.get("X-Danil-Session-Applied-Org") !== orgOf(context))))) throw { detail: "session_echo_mismatch" };
        return { status: response.status, body: await response.json() };
      })();
      reads.set(context, { promise: pending, until: now() + 30_000 });
      void pending.catch(() => { if (reads.get(context)?.promise === pending) reads.delete(context); });
      return pending;
    },
  };
}
