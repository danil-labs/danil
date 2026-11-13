/** Shared billing display, limits, fiscal parsing and refusal messages. */
import assert from "node:assert/strict";
import { test } from "node:test";
import "../helpers/catalog.ts";
import { elegirLengua, t } from "../../src/lib/i18n.ts";
import {
  addableSeats,
  BusinessBillingError,
  creditError,
  creditReturnOf,
  fiscalSaveError,
  readChange,
  readFiscal,
  readSummary,
  seatsError,
  seatsFull,
  statusOf,
  stripeUrl,
  summaryError,
} from "../../src/features/settings/business-billing.ts";
import { checkFiscal, regimesFor, rfcPersonType } from "../../src/features/settings/fiscal.ts";

const SUMMARY = {
  business: true, account_id: 7, status: "active", currency: "mxn", included_seats: 3, extra_seats: 2,
  seats_allowed: 5, seats_used: 5, seat_amount_cents: 10_000, tax_exclusive: true, max_extra_seats: 10, credit_packs_mxn: [500, 1000],
};

test("what billing sends is read as is; a workspace without Business says so", () => {
  assert.deepEqual(readSummary({ business: false }), { business: false });
  assert.throws(() => readSummary({ business: true, account_id: 7 }));
  const b = readSummary({ ...SUMMARY, credit_packs_mxn: null });
  assert.ok(b.business);
  assert.deepEqual(b.creditPacksMxn, [500, 1000, 2500], "billing without packs uses the defaults");
  assert.equal(seatsFull(b), true);
  assert.equal(readFiscal({ profile: { rfc: null, legal_name: null } }), null, "empty fields are no profile yet");
  assert.equal(readFiscal({ profile: null }), null);
  assert.equal(readFiscal({ profile: { rfc: "EKU9003173C9", complete: false } })?.complete, false);
});

test("online cap: up to 10 extra users in total, never a negative count", () => {
  assert.equal(addableSeats({ maxExtraSeats: 10, extraSeats: 0 }), 10);
  assert.equal(addableSeats({ maxExtraSeats: 10, extraSeats: 7 }), 3);
  assert.equal(addableSeats({ maxExtraSeats: 10, extraSeats: 10 }), 0);
  assert.equal(addableSeats({ maxExtraSeats: 10, extraSeats: 12 }), 0);
});

test("only Stripe pages over https are followed", () => {
  assert.equal(stripeUrl("https://checkout.stripe.com/c/pay/x"), "https://checkout.stripe.com/c/pay/x");
  assert.equal(stripeUrl("https://invoice.stripe.com/i/acct/x"), "https://invoice.stripe.com/i/acct/x");
  for (const bad of ["http://checkout.stripe.com/x", "https://stripe.com.evil.example/x", "https://evil.example/?stripe.com", "javascript:alert(1)", 42]) assert.equal(stripeUrl(bad), null, String(bad));
  assert.throws(() => readChange({ status: "done", extra_seats: 1, allowed: 4 }));
  assert.equal(readChange({ status: "requires_action", extra_seats: 1, allowed: 4, url: "https://evil.example" }).url, null);
});

test("every error code has words in Spanish and English", () => {
  const err = (code: string) => new BusinessBillingError(code, 409);
  const keys = [
    ...["seats_below_used", "too_many_seats", "subscription_not_active", "same_seats", "no_business_order", "billing_manage_required", "other"].map((c) => `web.business.seats_error_${seatsError(err(c))}`),
    `web.business.seats_error_requires_action`,
    ...["billing_manage_required", "pack_not_offered", "x"].map((c) => `web.business.credit_error_${creditError(err(c))}`),
    ...["billing_view_forbidden", "billing_not_configured", "x"].map((c) => `web.business.load_${summaryError(err(c))}`),
    ...["invalid_fiscal_profile", "x"].map((c) => `web.business.fiscal_error_${fiscalSaveError(err(c))}`),
    ...["active", "trialing", "past_due", "incomplete", "unpaid", "paused", "canceled"].map((s) => `web.business.status_${statusOf(s)!.code}`),
  ];
  assert.equal(seatsError(err("other")), "failed");
  assert.equal(statusOf("weird"), null);
  for (const lang of ["es", "en"]) {
    elegirLengua(lang);
    for (const key of keys) assert.notEqual(t(key), key, `${lang}: ${key}`);
  }
  elegirLengua("es");
  assert.match(t("web.business.seats_error_too_many_seats"), /hola@danil\.ai/);
  assert.equal(t("web.business.fiscal_use"), "Usamos estos datos para enviarte tu factura por correo.");
});

test("fiscal data: RFC shape, regime by person type, 5-digit postal code, email; normalized for billing", () => {
  assert.equal(rfcPersonType("EKU9003173C9"), "moral");
  assert.equal(rfcPersonType("goca-800101 ab1"), "fisica");
  assert.equal(rfcPersonType("ABC991301AB1"), null, "month 13");
  assert.ok(regimesFor("moral").every((r) => r.applies.includes("moral")));
  const ok = checkFiscal({ rfc: "eku9003173c9", legal_name: "  escuela   kemper urgate ", tax_system: "601", cfdi_use: "G03", zip: "26015", invoice_email: " Facturas@Ejemplo.MX " });
  assert.deepEqual(ok, { ok: true, value: { rfc: "EKU9003173C9", legal_name: "ESCUELA KEMPER URGATE", tax_system: "601", cfdi_use: "G03", zip: "26015", invoice_email: "facturas@ejemplo.mx" } });
  const bad = checkFiscal({ rfc: "XAXX010101000", legal_name: "", tax_system: "999", cfdi_use: "P01", zip: "2601", invoice_email: "no" });
  assert.deepEqual(bad, { ok: false, errors: { rfc: "rfc_generic", legal_name: "legal_name", tax_system: "tax_system", cfdi_use: "cfdi_use", zip: "zip", invoice_email: "email" } });
  const mismatch = checkFiscal({ rfc: "EKU9003173C9", legal_name: "X", tax_system: "612", cfdi_use: "G03", zip: "26015", invoice_email: "a@b.mx" });
  assert.deepEqual(mismatch, { ok: false, errors: { tax_system: "regime_for_person" } });
  for (const name of ["Mi Empresa S.A. de C.V.", "MI EMPRESA, SA DE CV", "Taller S. de R.L. de C.V.", "Despacho SC", "Fundación A.C.", "Grupo SAPI de CV"]) {
    assert.deepEqual(checkFiscal({ rfc: "EKU9003173C9", legal_name: name, tax_system: "601", cfdi_use: "G03", zip: "26015", invoice_email: "a@b.mx" }), { ok: false, errors: { legal_name: "legal_name_society" } }, name);
  }
  assert.equal(checkFiscal({ rfc: "EKU9003173C9", legal_name: "CASA DE ASADOS", tax_system: "601", cfdi_use: "G03", zip: "26015", invoice_email: "a@b.mx" }).ok, true);
  elegirLengua("es");
  for (const code of ["rfc", "rfc_generic", "legal_name", "legal_name_society", "too_long", "tax_system", "regime_for_person", "regime_for_company", "cfdi_use", "zip", "email"]) {
    assert.notEqual(t(`web.business.fiscal_error_${code}`), `web.business.fiscal_error_${code}`);
  }
});

test("the Stripe return is read once from the URL", () => {
  assert.equal(creditReturnOf("?settings=business&credit=ok"), "ok");
  assert.equal(creditReturnOf("?credit=cancel"), "cancel");
  assert.equal(creditReturnOf("?credit=hacked"), null);
});
