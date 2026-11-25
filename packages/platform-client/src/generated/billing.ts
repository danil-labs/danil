// GENERADO por packages/platform-client/scripts/generate.mjs desde contract/billing-v2/openapi/public.openapi.json. No editar a mano.
// repo: danil-labs/danil-contracts; commit: 23b351f70eb03f241047d339510a8f1b5caef2d0; path: platform/openapi.json; billing-v2: platform/billing-v2/openapi/public.openapi.json platform/billing-v2/schemas/common.v1.schema.json (mismo commit; copiados en contract/billing-v2/)

// Dominios: treasury.

import type { RateCardVersion, Rational, Realm, ResourceSpec, SignedMoney, SubscriptionId, SubscriptionState, SuspensionReason, Timestamp, TransactionId } from "./billing-2.ts";
export type { Problem, Purchase, PurchaseCreate, PurchaseId, RateCardVersion, Rational, Realm, ResourceSpec, SignedAmountMicro, SignedMoney, SubscriptionId, SubscriptionState, SuspensionReason, Timestamp, TransactionId, TransactionPage } from "./billing-2.ts";

export type Actor = {
  type: "person" | "operator" | "service" | "stripe" | "scheduler";
  id: string;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type AmountMicro = string;

/** Disponible = included + purchased + gift + compensation; inference_hold y dispute_hold no son gastables. lots expone source y vencimiento por lote. */
export type Balance = {
  organization_id: OrganizationId;
  available: Money;
  included: Money;
  purchased: Money;
  dispute_hold: Money;
  unsettled_usage: Money;
  refund_obligation: Money;
  included_expires_at: Timestamp | null;
  admission: {
    admitted: boolean;
    reasons: Array<"balance_exhausted" | "suspended_nonpayment" | "suspended_dispute_lost">;
    version: number;
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  };
  as_of: Timestamp;
  gift: Money;
  compensation: Money;
  inference_hold: Money;
  lots: Array<CreditLot>;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type Catalog = {
  realm: Realm;
  catalog_version: CatalogVersion;
  published_at: Timestamp;
  plans: Array<CatalogPlan>;
  addons: Array<CatalogAddon>;
  credit_packs: Array<CreditPack>;
  inference_tiers: Array<InferenceTier>;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type CatalogAddon = {
  addon_key: "extra_vm" | "ram_step" | "disk_step" | "os_macos" | "os_windows" | "extra_seat" | "ram" | "disk" | "vcpu";
  /** Rev. 13, opcional. Lo que suma una unidad del complemento: RAM en 1024 MiB, disco en N GiB, 1 vCPU o 1 asiento. */
  unit?: {
    measure: "ram_mib" | "disk_gib" | "vcpu" | "seat";
    quantity: number;
  };
  /** Rev. 13, opcional. Price de Stripe de la unidad; null mientras no tenga precio. */
  price_id?: string | null;
  /** Rev. 13, opcional. Niveles que admiten el complemento. Un complemento sin precio o sin el soporte de machine-provisioning queda sellable=false (el disco, además, hasta que exista grow). */
  allowed_tiers?: Array<PlanKey>;
  sellable: boolean;
  price: Money | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type CatalogPlan = {
  /** Rev. 13, opcional. Lo incluido en el nivel (plan_key es el nivel; no hay tier). */
  included?: {
    ram_mib: number;
    vcpu: number;
    disk_gib_per_org: number;
    seats: number;
  };
  /** Rev. 13, opcional. Ediciones que admite el nivel; otra da 409 edition_not_allowed. */
  allowed_editions?: Array<string>;
  /** Rev. 13, opcional. Topes del nivel con complementos (totales). Una sola función de treasury los valida en el checkout y en /subscription/changes antes de Stripe: 409 addon_limit_exceeded. */
  limits?: {
    max_ram_mib: number;
    max_vcpu: number;
    max_disk_gib_per_org: number;
    max_extra_seats: number;
  };
  /** Rev. 13, opcional. Variantes comerciales del plan, cada una con su edición (Business = team + business). Nunca es otro plan: el derecho y los eventos llevan plan_key y, para consumidores rev. 13, edition. Se elige en el checkout con variant; una edición por suscripción. */
  display_variants?: Array<DisplayVariant>;
  plan_key: PlanKey;
  sellable: boolean;
  price: Money | null;
  interval: "month" | "contract";
  seats_included: number;
  extra_seat_price: Money | null;
  included_credits: Money | null;
  resource_spec: ResourceSpec;
  requires_card: boolean;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type CatalogVersion = number;

export type Checkout = {
  checkout_id: CheckoutId;
  kind: "plan" | "credits";
  state: "creating" | "open" | "completed" | "expired" | "canceled";
  url: string | null;
  expires_at: Timestamp | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

/** Intent obligatorio. upgrade exige org del JWT y billing.manage, prohíbe organization_name y no reserva identity. new_organization exige solo persona verificada (incluso ctx=none, org nula y scopes vacíos), requiere organization_name y reserva exitosa. Primero rechazar controles, después normalizar nombre NFC/trim y validar 1..80 caracteres; owner_person_id viene exclusivamente de sub. No acepta URLs ni campos extra: 400 invalid_request. */
export type CheckoutCreate = CheckoutUpgradeCreate | CheckoutNewOrganizationCreate;

export type CheckoutId = string;

/** Intent obligatorio. upgrade exige org del JWT y billing.manage, prohíbe organization_name y no reserva identity. new_organization exige solo persona verificada (incluso ctx=none, org nula y scopes vacíos), requiere organization_name y reserva exitosa. Primero rechazar controles, después normalizar nombre NFC/trim y validar 1..80 caracteres; owner_person_id viene exclusivamente de sub. No acepta URLs ni campos extra: 400 invalid_request. */
export type CheckoutNewOrganizationCreate = {
  promotion_code?: string;
  /** Rev. 13, opcional. Una variant de display_variants del plan en esa catalog_version (p. ej. business con team). Treasury la traduce a su edición, que debe estar en allowed_editions del plan (si no, 409 edition_not_allowed), y agrega el ítem de 0 MXN de la edición; una edición por suscripción. El plan vendido sigue siendo plan_key. Variante no ofrecida en esa versión: 409 variant_not_sellable. */
  variant?: string;
  plan_key: "pro" | "team";
  catalog_version: CatalogVersion;
  extra_seats?: number;
  intent: "new_organization";
  organization_name: OrganizationName;
};

/** Estado durable autorizado por el intent guardado y el creador/org correspondiente. organization_id SOLO existe con state=active y terminal=true (organización activada); se omite en pending, paid, canceled, expired y error, incluso si terminal=true. Sirve para que la web seleccione la nueva org, sin conceder membresía por conocer el ID. */
export type CheckoutStatus = CheckoutStatusActive | CheckoutStatusNotActive;

/** Estado durable autorizado por el intent guardado y el creador/org correspondiente. organization_id SOLO existe con state=active y terminal=true (organización activada); se omite en pending, paid, canceled, expired y error, incluso si terminal=true. Sirve para que la web seleccione la nueva org, sin conceder membresía por conocer el ID. */
export type CheckoutStatusActive = {
  checkout_id: CheckoutId;
  kind: "plan";
  state: "active";
  url: string | null;
  expires_at: Timestamp | null;
  terminal: true;
  organization_id: OrganizationId;
};

/** Estado durable autorizado por el intent guardado y el creador/org correspondiente. organization_id SOLO existe con state=active y terminal=true (organización activada); se omite en pending, paid, canceled, expired y error, incluso si terminal=true. Sirve para que la web seleccione la nueva org, sin conceder membresía por conocer el ID. */
export type CheckoutStatusNotActive = {
  checkout_id: CheckoutId;
  kind: "plan" | "credits";
  state: "pending" | "paid" | "canceled" | "expired" | "error";
  url: string | null;
  expires_at: Timestamp | null;
  /** Polling termina cuando true. paid es final para créditos; en plan espera active. canceled/expired/error son finales; pending no. No se deriva de result en el navegador. */
  terminal: boolean;
};

/** Intent obligatorio. upgrade exige org del JWT y billing.manage, prohíbe organization_name y no reserva identity. new_organization exige solo persona verificada (incluso ctx=none, org nula y scopes vacíos), requiere organization_name y reserva exitosa. Primero rechazar controles, después normalizar nombre NFC/trim y validar 1..80 caracteres; owner_person_id viene exclusivamente de sub. No acepta URLs ni campos extra: 400 invalid_request. */
export type CheckoutUpgradeCreate = {
  promotion_code?: string;
  /** Rev. 13, opcional. Una variant de display_variants del plan en esa catalog_version (p. ej. business con team). Treasury la traduce a su edición, que debe estar en allowed_editions del plan (si no, 409 edition_not_allowed), y agrega el ítem de 0 MXN de la edición; una edición por suscripción. El plan vendido sigue siendo plan_key. Variante no ofrecida en esa versión: 409 variant_not_sellable. */
  variant?: string;
  plan_key: "pro" | "team";
  catalog_version: CatalogVersion;
  extra_seats?: number;
  intent: "upgrade";
};

/** Lote público por organización; payment_reference conserva el vínculo opaco al pago. El libro interno conserva PaymentIntent, invoice y periodo. */
export type CreditLot = IncludedLot | OptionalExpiryLot;

export type CreditPack = {
  pack_id: string;
  sellable: boolean;
  price: Money;
  credits: Money;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type CreditSource = "plan_included" | "purchase" | "gift" | "compensation";

export type Currency = "MXN";

/** Rev. 13. Nombre comercial (variant, display_name) de un plan con una edición: declara explícitamente {variant, plan_key, edition}. Business = {variant: business, plan_key: team, edition: business}. La edición es un ítem de 0 MXN que solo dice qué paquetes instalar; el nombre comercial puede cambiar sin tocar a los consumidores, que leen plan_key y edition. */
export type DisplayVariant = {
  variant: string;
  plan_key: PlanKey;
  edition: string;
  display_name: string;
};

export type EntryPoint = "messaging" | "danil_ai_app" | "danil_ai_api";

export type IncludedLot = {
  lot_id: LotId;
  source: "plan_included";
  initial: Money;
  remaining: Money;
  expires_at: Timestamp;
  created_at: Timestamp;
  payment_reference: PaymentReference | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

/** Un único default. Los IDs danil/* son estables. Modelo/factor/versiones se fijan en la reserva y uso; cambiar el backend es catálogo, nunca un release de Desk. */
export type InferenceTier = {
  id: InferenceTierId;
  label: string;
  provider_model: string;
  default: boolean;
  factor: Rational;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type InferenceTierId = "danil/ligero" | "danil/equilibrado" | "danil/avanzado";

/** forfeit registra el sobrante al surtir efecto la cancelación, conserva payment_reference y no implica reembolso. lot_changes atribuye cada movimiento a su source. */
export type LedgerTransaction = {
  transaction_id: TransactionId;
  kind: "grant_included" | "purchase" | "usage" | "unsettled_recorded" | "expire" | "refund" | "dispute_hold" | "dispute_release" | "dispute_loss" | "settle" | "adjustment" | "gift" | "compensation" | "forfeit" | "reservation_created" | "reservation_settled" | "reservation_released";
  occurred_at: Timestamp;
  recorded_at: Timestamp;
  changes: {
    included?: SignedMoney;
    purchased?: SignedMoney;
    dispute_hold?: SignedMoney;
    unsettled_usage?: SignedMoney;
    refund_obligation?: SignedMoney;
    gift?: SignedMoney;
    compensation?: SignedMoney;
    inference_hold?: SignedMoney;
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  };
  actor: Actor;
  usage: {
    entry_point: EntryPoint;
    provider: string;
    model: string;
    rate_card_version: RateCardVersion;
    tokens: {
      input: number;
      output: number;
      cache_read: number;
      cache_write: number;
      /** Campos aditivos: el contrato crece sin recompilar (R10). */
      [key: string]: unknown;
    };
    workspace_id: string | null;
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  } | null;
  lot_changes: Array<{
    lot_id: LotId;
    source: CreditSource;
    amount: SignedMoney;
    payment_reference: PaymentReference | null;
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  }>;
  reason?: string | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type LotId = string;

export type Money = {
  currency: Currency;
  amount_micro: AmountMicro;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type OptionalExpiryLot = {
  lot_id: LotId;
  source: "purchase" | "gift" | "compensation";
  initial: Money;
  remaining: Money;
  expires_at: Timestamp | null;
  created_at: Timestamp;
  payment_reference: PaymentReference | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type OrganizationBilling = {
  organization_id: OrganizationId;
  state: SubscriptionState;
  suspension_reason?: SuspensionReason | null;
  plan_key: PlanKey;
  catalog_version?: CatalogVersion | null;
  subscription_id?: SubscriptionId | null;
  current_period_end?: Timestamp | null;
  cancel_at_period_end: boolean;
  suspended_at?: Timestamp | null;
  data_retention_until?: Timestamp | null;
  seats: {
    included: number;
    extra: number;
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  };
  max_members: number;
  payer: {
    is_you: boolean;
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  };
  pending?: {
    kind: "activation" | "change" | "deletion";
    since: Timestamp;
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  } | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type OrganizationId = string;

/** Texto plano: sin controles Unicode Cc ni delimitadores HTML < >. Treasury rechaza controles antes de normalizar, aplica NFC y trim, y valida después 1..80 puntos de código Unicode (no unidades UTF-16). No decodifica entidades HTML; los clientes presentan texto, no HTML. */
export type OrganizationName = string;

export type PaymentReference = string;

export type PlanKey = "free" | "pro" | "team" | "enterprise";

export type PortalSession = {
  url: string;
  expires_at: Timestamp;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};
