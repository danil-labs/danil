/**
 * Danil Business en Configuración: plan, usuarios, crédito de IA y datos fiscales.
 * Los números salen de billing por el BFF (`/auth/account/business/*`); aquí solo se
 * leen y se validan. La vista no calcula precios.
 */

/** Tope de usuarios adicionales en la compra en línea; billing aplica el mismo (`too_many_seats`). */
export const BUSINESS_MAX_EXTRA_SEATS = 10;
export const BUSINESS_INCLUDED_SEATS = 3;
export const BUSINESS_SALES_EMAIL = "hola@danil.ai";
/** Los paquetes si billing no manda los suyos. */
export const AI_CREDIT_PACKS_MXN: readonly number[] = [500, 1000, 2500];

export type ActiveBusiness = {
  business: true;
  account: number;
  /** El estado de la suscripción en Stripe (`active`, `past_due`…); `null` si billing no lo manda. */
  status: string | null;
  currency: string;
  includedSeats: number;
  extraSeats: number;
  seatsAllowed: number;
  /** Personas con membresía más invitaciones pendientes. */
  seatsUsed: number;
  /** Precio de cada usuario adicional al mes, en centavos. */
  seatAmountCents: number | null;
  taxExclusive: boolean;
  maxExtraSeats: number;
  creditPacksMxn: number[];
};

export type BusinessSummary = { business: false } | ActiveBusiness;
export type SeatUsage = { business: false } | { business: true; seatsAllowed: number; seatsUsed: number };

export type SeatsPreview = {
  currentExtraSeats: number;
  targetExtraSeats: number;
  allowedAfter: number;
  /** Lo que se cobra hoy por el resto del periodo, IVA incluido. */
  amountDueNowCents: number;
  /** La siguiente mensualidad completa con el cambio, IVA incluido. */
  nextInvoiceAmountCents: number | null;
  /** Se devuelve tal cual al confirmar. */
  prorationDate: number;
};

export type SeatsChange = { status: "changed" | "requires_action"; extraSeats: number; allowed: number; url: string | null };

export type FiscalProfile = {
  rfc: string;
  legal_name: string;
  tax_system: string;
  cfdi_use: string;
  zip: string;
  invoice_email: string;
};

export type StoredFiscal = { [K in keyof FiscalProfile]: string | null } & { complete: boolean; updatedAt: string | null };

export type BusinessBillingSource = {
  /** El workspace de Danil activo de la sesión; `null` si no tiene. */
  account: () => Promise<number | null>;
  summary: (account: number) => Promise<BusinessSummary>;
  seats: (account: number) => Promise<SeatUsage>;
  /** Si la persona tiene `billing.manage`. Ante la duda, `false`: el BFF decide de todos modos. */
  canManage: (account: number) => Promise<boolean>;
  previewSeats: (account: number, extraSeats: number) => Promise<SeatsPreview>;
  changeSeats: (account: number, extraSeats: number, prorationDate: number) => Promise<SeatsChange>;
  /** La URL de Stripe Checkout. */
  creditCheckout: (account: number, amountMxn: number) => Promise<string>;
  fiscal: (account: number) => Promise<StoredFiscal | null>;
  saveFiscal: (account: number, profile: FiscalProfile) => Promise<StoredFiscal | null>;
};

/** Un error del BFF con su código (`too_many_seats`, `billing_manage_required`…). */
export class BusinessBillingError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(code);
    this.name = "BusinessBillingError";
    this.code = code;
    this.status = status;
  }
}

const invalid = () => new BusinessBillingError("invalid_response", 0);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw invalid();
  return value;
}

function cents(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw invalid();
  return value;
}

const optionalCents = (value: unknown): number | null => (value === null || value === undefined ? null : cents(value));
const optionalText = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const countOr = (value: unknown, fallback: number) => (value === undefined || value === null ? fallback : count(value));

export function readSummary(value: unknown): BusinessSummary {
  const row = object(value);
  if (row.business === false) return { business: false };
  if (row.business !== true) throw invalid();
  const packs = Array.isArray(row.credit_packs_mxn)
    ? row.credit_packs_mxn.filter((n): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0)
    : [];
  const account = count(row.account_id);
  if (account === 0) throw invalid();
  return {
    business: true,
    account,
    status: optionalText(row.status),
    currency: optionalText(row.currency)?.toUpperCase() ?? "MXN",
    includedSeats: countOr(row.included_seats, BUSINESS_INCLUDED_SEATS),
    extraSeats: countOr(row.extra_seats, 0),
    seatsAllowed: count(row.seats_allowed),
    seatsUsed: count(row.seats_used),
    seatAmountCents: optionalCents(row.seat_amount_cents),
    taxExclusive: row.tax_exclusive !== false,
    maxExtraSeats: countOr(row.max_extra_seats, BUSINESS_MAX_EXTRA_SEATS),
    creditPacksMxn: packs.length ? packs : [...AI_CREDIT_PACKS_MXN],
  };
}

export function readSeats(value: unknown): SeatUsage {
  const row = object(value);
  if (row.business === false) return { business: false };
  if (row.business !== true) throw invalid();
  return { business: true, seatsAllowed: count(row.seats_allowed), seatsUsed: count(row.seats_used) };
}

export function readPreview(value: unknown): SeatsPreview {
  const row = object(value);
  const prorationDate = count(row.proration_date);
  if (prorationDate === 0) throw invalid();
  return {
    currentExtraSeats: count(row.current_extra_seats),
    targetExtraSeats: count(row.target_extra_seats),
    allowedAfter: count(row.allowed_after),
    amountDueNowCents: cents(row.amount_due_now_cents),
    nextInvoiceAmountCents: optionalCents(row.next_invoice_amount_cents),
    prorationDate,
  };
}

/** Solo una página de Stripe por https: la vista manda ahí al navegador. */
export function stripeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com")) ? url.href : null;
  } catch {
    return null;
  }
}

export function readChange(value: unknown): SeatsChange {
  const row = object(value);
  if (row.status !== "changed" && row.status !== "requires_action") throw invalid();
  return { status: row.status, extraSeats: count(row.extra_seats), allowed: count(row.allowed), url: stripeUrl(row.url) };
}

export function readCheckout(value: unknown): string {
  const url = stripeUrl(object(value).url);
  if (!url) throw invalid();
  return url;
}

/** `{profile}` del BFF. Sin RFC ni razón social todavía no hay datos capturados. */
export function readFiscal(value: unknown): StoredFiscal | null {
  const profile = object(value).profile;
  if (profile === null || profile === undefined) return null;
  const row = object(profile);
  const stored: StoredFiscal = {
    rfc: optionalText(row.rfc),
    legal_name: optionalText(row.legal_name),
    tax_system: optionalText(row.tax_system),
    cfdi_use: optionalText(row.cfdi_use),
    zip: optionalText(row.zip),
    invoice_email: optionalText(row.invoice_email),
    complete: row.complete === true,
    updatedAt: optionalText(row.updated_at),
  };
  return stored.rfc || stored.legal_name ? stored : null;
}

/** Cuántos usuarios más se pueden agregar en línea. */
export const addableSeats = (b: Pick<ActiveBusiness, "maxExtraSeats" | "extraSeats">) => Math.max(0, b.maxExtraSeats - b.extraSeats);

export const seatsFull = (s: { seatsUsed: number; seatsAllowed: number }) => s.seatsUsed >= s.seatsAllowed;

export type StatusTone = "success" | "warning" | "danger" | "neutral";

const STATUS_TONES: Record<string, StatusTone> = {
  active: "success",
  trialing: "success",
  past_due: "warning",
  incomplete: "warning",
  unpaid: "danger",
  paused: "neutral",
  canceled: "neutral",
};

/** El estado que se pinta (sufijo de `web.business.status_`); uno desconocido no lleva insignia. */
export function statusOf(status: string | null): { code: string; tone: StatusTone } | null {
  return status && Object.hasOwn(STATUS_TONES, status) ? { code: status, tone: STATUS_TONES[status] } : null;
}

const SEATS_ERRORS = ["seats_below_used", "too_many_seats", "subscription_not_active", "same_seats", "no_business_order", "billing_manage_required"];

const codeOf = (error: unknown) => (error instanceof BusinessBillingError ? error.code : "");

/** El error de usuarios (sufijo de `web.business.seats_error_`); cualquier otro es `failed`. */
export function seatsError(error: unknown): string {
  const code = codeOf(error);
  return SEATS_ERRORS.includes(code) ? code : "failed";
}

/** El error al abrir el pago del crédito (sufijo de `web.business.credit_error_`). */
export function creditError(error: unknown): string {
  const code = codeOf(error);
  return code === "billing_manage_required" || code === "pack_not_offered" ? code : "failed";
}

/** Por qué no se pudo leer el plan (sufijo de `web.business.load_`). */
export function summaryError(error: unknown): "forbidden" | "unavailable" | "failed" {
  const code = codeOf(error);
  if (code === "billing_view_forbidden" || code === "forbidden") return "forbidden";
  if (code === "billing_not_configured" || code === "billing_unreachable" || code === "bff_unavailable") return "unavailable";
  return "failed";
}

/** Por qué no se guardaron los datos fiscales (sufijo de `web.business.fiscal_error_`). */
export const fiscalSaveError = (error: unknown) => (codeOf(error) === "invalid_fiscal_profile" ? "invalid" : "failed");

/** Lo que la vuelta de Stripe deja en la URL (`?credit=ok|cancel`). */
export function creditReturnOf(search: string): "ok" | "cancel" | null {
  const value = new URLSearchParams(search).get("credit");
  return value === "ok" || value === "cancel" ? value : null;
}
