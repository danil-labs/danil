/**
 * Danil Business en la web: el cliente de `/auth/account/business/*` por el proxy de
 * alfa contra un `fetch` falso, la lectura de lo que manda billing, el tope en línea,
 * los errores en palabras y las reglas de los datos fiscales.
 */
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
import { webBusinessBilling } from "../../src/web/business-billing.ts";

const jwt = (account: number) => `h.${Buffer.from(JSON.stringify({ active_account_id: account })).toString("base64url")}.s`;

function fake(handler: (url: string, init: RequestInit) => { status: number; body?: unknown }) {
  const seen: { url: string; init: RequestInit }[] = [];
  const f = async (url: string, init: RequestInit = {}) => {
    seen.push({ url, init });
    const { status, body } = handler(url, init);
    return new Response(body === undefined ? "" : JSON.stringify(body), { status });
  };
  return { f, seen };
}

const session = { getToken: async () => jwt(7), unauthorized: async () => false };

const SUMMARY = {
  business: true, account_id: 7, status: "active", currency: "mxn", included_seats: 3, extra_seats: 2,
  seats_allowed: 5, seats_used: 5, seat_amount_cents: 10_000, tax_exclusive: true, max_extra_seats: 10, credit_packs_mxn: [500, 1000],
};

test("the web source reads and writes only the business routes, for the session's active account", async () => {
  const { f, seen } = fake((url, init) => {
    if (url.endsWith("/auth/account/business/summary?account_id=7")) return { status: 200, body: SUMMARY };
    if (url.includes("/my-permissions")) return { status: 200, body: { role: "owner", permissions: ["billing.manage"], scoped: [] } };
    if (url.endsWith("/seats/preview")) return { status: 200, body: { current_extra_seats: 2, target_extra_seats: 3, allowed_after: 6, amount_due_now_cents: 6960, next_invoice_amount_cents: 266_800, proration_date: 1_762_300_000 } };
    if (url.endsWith("/business/seats") && init.method === "POST") return { status: 200, body: { status: "changed", extra_seats: 3, allowed: 6, url: null } };
    if (url.endsWith("/credit/checkout")) return { status: 200, body: { url: "https://checkout.stripe.com/c/pay/cs_1" } };
    if (url.endsWith("/business/fiscal") && init.method === "PUT") return { status: 200, body: { profile: { ...JSON.parse(String(init.body)), complete: true } } };
    return { status: 404, body: { error: "not_found" } };
  });
  const source = webBusinessBilling(session, "/alpha-api", f);
  assert.equal(await source.account(), 7);
  const summary = await source.summary(7);
  assert.ok(summary.business);
  assert.equal(summary.currency, "MXN");
  assert.equal(await source.canManage(7), true);
  assert.equal((await source.previewSeats(7, 3)).amountDueNowCents, 6960);
  assert.deepEqual(await source.changeSeats(7, 3, 1_762_300_000), { status: "changed", extraSeats: 3, allowed: 6, url: null });
  assert.equal(await source.creditCheckout(7, 500), "https://checkout.stripe.com/c/pay/cs_1");
  const profile = { rfc: "EKU9003173C9", legal_name: "ESCUELA KEMPER URGATE", tax_system: "601", cfdi_use: "G03", zip: "26015", invoice_email: "f@x.mx" };
  assert.equal((await source.saveFiscal(7, profile))?.rfc, "EKU9003173C9");
  const writes = seen.filter((s) => s.init.method && s.init.method !== "GET").map((s) => [s.init.method, s.url, JSON.parse(String(s.init.body))]);
  assert.deepEqual(writes, [
    ["POST", "/alpha-api/auth/account/business/seats/preview", { account_id: 7, extra_seats: 3 }],
    ["POST", "/alpha-api/auth/account/business/seats", { account_id: 7, extra_seats: 3, proration_date: 1_762_300_000 }],
    ["POST", "/alpha-api/auth/account/business/credit/checkout", { account_id: 7, amount_mxn: 500 }],
    ["PUT", "/alpha-api/auth/account/business/fiscal", { account_id: 7, ...profile }],
  ]);
  for (const s of seen) assert.equal((s.init.headers as Record<string, string>).Authorization, `Bearer ${jwt(7)}`);
});

test("BFF errors keep their code, and permissions fail closed", async () => {
  const { f } = fake((url) => (url.includes("/my-permissions") ? { status: 500 } : { status: 409, body: { error: "seats_below_used" } }));
  const source = webBusinessBilling(session, "/alpha-api", f);
  assert.equal(await source.canManage(7), false);
  await assert.rejects(source.previewSeats(7, 0), (e: unknown) => e instanceof BusinessBillingError && e.code === "seats_below_used" && e.status === 409);
  const member = webBusinessBilling(session, "/alpha-api", fake(() => ({ status: 200, body: { permissions: ["inbox.respond"] } })).f);
  assert.equal(await member.canManage(7), false);
});

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
  assert.equal(t("web.business.fiscal_note"), "Usamos estos datos para enviarte tu factura por correo.");
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
  elegirLengua("es");
  for (const code of ["rfc", "rfc_generic", "legal_name", "too_long", "tax_system", "regime_for_person", "regime_for_company", "cfdi_use", "zip", "email"]) {
    assert.notEqual(t(`web.business.fiscal_error_${code}`), `web.business.fiscal_error_${code}`);
  }
});

test("the Stripe return is read once from the URL", () => {
  assert.equal(creditReturnOf("?settings=business&credit=ok"), "ok");
  assert.equal(creditReturnOf("?credit=cancel"), "cancel");
  assert.equal(creditReturnOf("?credit=hacked"), null);
});
