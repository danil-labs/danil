// GENERADO por packages/platform-client/scripts/generate.mjs desde contract/billing-v2/openapi/public.openapi.json. No editar a mano.
// repo: danil-labs/danil-contracts; commit: 23b351f70eb03f241047d339510a8f1b5caef2d0; path: platform/openapi.json; billing-v2: platform/billing-v2/openapi/public.openapi.json platform/billing-v2/schemas/common.v1.schema.json (mismo commit; copiados en contract/billing-v2/)

// Parte 2 de 2 de `billing.ts`, que la reexporta.

import type { CatalogVersion, CheckoutId, Currency, LedgerTransaction, Money } from "./billing.ts";

export type Problem = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  retry_after_s?: number;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type Purchase = {
  purchase_id: PurchaseId;
  checkout_id: CheckoutId;
  state: "creating" | "open" | "paid" | "failed" | "expired";
  url: string | null;
  expires_at: Timestamp | null;
  credits: Money;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type PurchaseCreate = {
  pack_id: string;
  catalog_version: CatalogVersion;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type PurchaseId = string;

export type RateCardVersion = number;

export type Rational = {
  num: string;
  den: string;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type Realm = "danil-platform";

export type ResourceSpec = {
  count: number;
  os: "linux" | "macos" | "windows";
  ram_mib: number;
  vcpu: number | null;
  disk_gib_per_org: number;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type SignedAmountMicro = string;

export type SignedMoney = {
  currency: Currency;
  amount_micro: SignedAmountMicro;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type SubscriptionId = string;

export type SubscriptionState = "none" | "pending_checkout" | "incomplete" | "active" | "canceled_pending" | "suspended" | "terminated";

export type SuspensionReason = "nonpayment" | "cancellation" | "dispute_lost";

export type Timestamp = string;

export type TransactionId = string;

export type TransactionPage = {
  items: Array<LedgerTransaction>;
  next_cursor: string | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};
