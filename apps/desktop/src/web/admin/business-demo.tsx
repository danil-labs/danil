import BusinessBilling from "../../features/settings/BusinessBilling";
import type { BusinessBillingSource, StoredFiscal } from "../../features/settings/business-billing";

/** `?demo=1&settings=business`: Danil Business sin red. `business=none|full|member|max` elige el caso. */
export function businessBillingDemo(kind: string | null) {
  let extra = kind === "max" ? 10 : 1;
  let fiscal: StoredFiscal | null = kind === "full" ? {
    rfc: "EKU9003173C9", legal_name: "ESCUELA KEMPER URGATE", tax_system: "601", cfdi_use: "G03", zip: "26015",
    invoice_email: "facturas@ejemplo.mx", complete: true, updatedAt: "2026-11-04T15:00:00Z",
  } : null;
  const used = () => (kind === "full" ? 3 + extra : 3);
  const source: BusinessBillingSource = {
    account: async () => 1,
    canManage: async () => kind !== "member",
    summary: async () => kind === "none" ? { business: false } : {
      business: true, account: 1, status: "active", currency: "MXN", includedSeats: 3, extraSeats: extra,
      seatsAllowed: 3 + extra, seatsUsed: used(), seatAmountCents: 10_000, taxExclusive: true, maxExtraSeats: 10,
      creditPacksMxn: [500, 1000, 2500],
    },
    seats: async () => ({ business: true, seatsAllowed: 3 + extra, seatsUsed: used() }),
    previewSeats: async (_account, target) => ({
      currentExtraSeats: extra, targetExtraSeats: target, allowedAfter: 3 + target,
      amountDueNowCents: (target - extra) * 6_960, nextInvoiceAmountCents: (200_000 + target * 10_000) * 116 / 100, prorationDate: 1_762_300_000,
    }),
    changeSeats: async (_account, target) => {
      extra = target;
      return { status: "changed", extraSeats: target, allowed: 3 + target, url: null };
    },
    creditCheckout: async () => `${window.location.pathname}?demo=1&settings=business&credit=ok`,
    fiscal: async () => fiscal,
    saveFiscal: async (_account, profile) => (fiscal = { ...profile, complete: true, updatedAt: new Date().toISOString() }),
  };
  return (part: "plan" | "fiscal") => <BusinessBilling source={source} part={part} />;
}
