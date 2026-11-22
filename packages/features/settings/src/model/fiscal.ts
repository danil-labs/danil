/**
 * Datos fiscales para la factura CFDI 4.0 de Danil Business. Danil factura a mano:
 * aquí solo se capturan. Mismas reglas que el BFF (Appv2 `worker/src/fiscal.ts`),
 * que las vuelve a aplicar antes de guardar en billing. Los errores son sufijos de `web.business.fiscal_error_`.
 */
import type { FiscalProfile } from "./business-billing";

export type PersonType = "moral" | "fisica";

/** c_RegimenFiscal y a quién aplica; mismas claves que billing (`TAX_SYSTEMS`). */
export const TAX_REGIMES: ReadonlyArray<{ code: string; applies: readonly PersonType[] }> = [
  { code: "601", applies: ["moral"] },
  { code: "603", applies: ["moral"] },
  { code: "605", applies: ["fisica"] },
  { code: "606", applies: ["fisica"] },
  { code: "612", applies: ["fisica"] },
  { code: "616", applies: ["fisica"] },
  { code: "621", applies: ["fisica"] },
  { code: "625", applies: ["fisica"] },
  { code: "626", applies: ["fisica", "moral"] },
];

/** c_UsoCFDI ofrecidos (billing `CFDI_USES`). */
export const CFDI_USES: readonly string[] = ["G03", "G01", "S01"];

export const GENERIC_RFC = "XAXX010101000";
export const FISCAL_MAX = { legalName: 254, email: 254 } as const;

/** «abc-010101 xy9» → «ABC010101XY9». */
export const normalizeRfc = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, "");

// 3 letras (moral) o 4 (física) + fecha AAMMDD + homoclave de 3.
const RFC_RE = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{2}[A\d])$/;

/** Moral (12 caracteres) o física (13); `null` si el RFC no tiene forma válida. */
export function rfcPersonType(raw: string): PersonType | null {
  const match = RFC_RE.exec(normalizeRfc(raw));
  if (!match) return null;
  const month = Number(match[3]);
  const day = Number(match[4]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return match[1].length === 3 ? "moral" : "fisica";
}

export const regimesFor = (type: PersonType | null) => (type ? TAX_REGIMES.filter((r) => r.applies.includes(type)) : TAX_REGIMES);

export type FiscalField = keyof FiscalProfile;
export type FiscalCheck = { ok: true; value: FiscalProfile } | { ok: false; errors: Partial<Record<FiscalField, string>> };

/** CFDI 4.0: la razón social va sin el régimen societario («S.A. de C.V.», «S. de R.L.»…). */
const SOCIETY_RE = /[\s,]+(S\.?\s?A\.?P?\.?I?\.?(\s?DE\s?C\.?\s?V\.?)?|S\.?\s?DE\s?R\.?\s?L\.?(\s?DE\s?C\.?\s?V\.?)?|S\.?\s?C\.?|A\.?\s?C\.?)$/;

const EMAIL_RE = /^[^\s@\x00-\x1f]+@[^\s@\x00-\x1f]+\.[^\s@\x00-\x1f]{2,}$/;

/** Valida y normaliza (RFC y razón social en mayúsculas, correo en minúsculas). */
export function checkFiscal(input: FiscalProfile): FiscalCheck {
  const errors: Partial<Record<FiscalField, string>> = {};
  const rfc = normalizeRfc(input.rfc);
  const type = rfcPersonType(rfc);
  if (rfc === GENERIC_RFC) errors.rfc = "rfc_generic";
  else if (!type) errors.rfc = "rfc";
  const legal = input.legal_name.trim().toUpperCase().replace(/\s+/g, " ");
  if (!legal) errors.legal_name = "legal_name";
  else if (SOCIETY_RE.test(legal)) errors.legal_name = "legal_name_society";
  else if (legal.length > FISCAL_MAX.legalName) errors.legal_name = "too_long";
  const regime = TAX_REGIMES.find((r) => r.code === input.tax_system);
  if (!regime) errors.tax_system = "tax_system";
  else if (type && !regime.applies.includes(type)) {
    errors.tax_system = type === "moral" ? "regime_for_person" : "regime_for_company";
  }
  if (!CFDI_USES.includes(input.cfdi_use)) errors.cfdi_use = "cfdi_use";
  const zip = input.zip.trim();
  if (!/^\d{5}$/.test(zip)) errors.zip = "zip";
  const email = input.invoice_email.trim().toLowerCase();
  if (email.length > FISCAL_MAX.email) errors.invoice_email = "too_long";
  else if (!EMAIL_RE.test(email)) errors.invoice_email = "email";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { rfc, legal_name: legal, tax_system: input.tax_system, cfdi_use: input.cfdi_use, zip, invoice_email: email } };
}
