// Danil Business por la entrada alfa (Configuración › Plan y cobro): lista cerrada de
// /auth/account/business/* del BFF de appv2, que reenvía a billing con su secreto.
// Solo el workspace activo del Bearer; cada cuerpo se reconstruye con sus campos.
// Una ruta nueva aquí es un cambio de frontera y se revisa.
export const BUSINESS_MAX_BODY = 2 * 1024;
// Tope en línea de usuarios adicionales; el BFF y billing aplican el mismo.
const MAX_EXTRA_SEATS = 10;
const MAX_CREDIT_MXN = 1_000_000;

const safeId = (value) => Number.isSafeInteger(value) && value > 0;
const keysAre = (body, keys) => Object.keys(body).length === keys.length && keys.every((key) => Object.hasOwn(body, key));
const seats = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_EXTRA_SEATS;
const bounded = (value, max, pattern) => typeof value === "string" && value.length <= max && !/[\x00-\x1f\x7f]/.test(value) && (!pattern || pattern.test(value));

const READS = ["/auth/account/business/summary", "/auth/account/business/seats", "/auth/account/business/fiscal"];

const FISCAL = ["account_id", "rfc", "legal_name", "tax_system", "cfdi_use", "zip", "invoice_email"];

const WRITES = {
  "POST /auth/account/business/seats/preview": (b) =>
    keysAre(b, ["account_id", "extra_seats"]) && seats(b.extra_seats) ? { account_id: b.account_id, extra_seats: b.extra_seats } : null,
  "POST /auth/account/business/seats": (b) =>
    keysAre(b, ["account_id", "extra_seats", "proration_date"]) && seats(b.extra_seats) && safeId(b.proration_date)
      ? { account_id: b.account_id, extra_seats: b.extra_seats, proration_date: b.proration_date }
      : null,
  // Stripe vuelve a la Configuración de esta web: la URL la arma el BFF, no el cliente.
  "POST /auth/account/business/credit/checkout": (b) =>
    keysAre(b, ["account_id", "amount_mxn"]) && safeId(b.amount_mxn) && b.amount_mxn <= MAX_CREDIT_MXN
      ? { account_id: b.account_id, amount_mxn: b.amount_mxn, return_to: "danil_web" }
      : null,
  // Forma acotada; las reglas de RFC y régimen las aplica el BFF (worker/src/fiscal.ts).
  "PUT /auth/account/business/fiscal": (b) =>
    keysAre(b, FISCAL) &&
    bounded(b.rfc, 16, /^[A-Za-zÑñ&\d\s-]+$/) &&
    bounded(b.legal_name, 254) && b.legal_name.trim() !== "" &&
    bounded(b.tax_system, 3, /^\d{3}$/) &&
    bounded(b.cfdi_use, 4, /^[A-Z]\d{2}$/) &&
    bounded(b.zip, 5, /^\d{5}$/) &&
    bounded(b.invoice_email, 254, /^[^\s@]+@[^\s@]+$/)
      ? Object.fromEntries(FISCAL.map((key) => [key, b[key]]))
      : null,
};

/** `read` si es una lectura permitida, el reconstructor del cuerpo si es una escritura, o null. */
export function businessRoute(method, path) {
  if (method === "GET" && READS.includes(path)) return { read: true };
  const write = WRITES[`${method} ${path}`];
  return write ? { read: false, body: write } : null;
}

/** El cuerpo reconstruido, o null: JSON objeto, `account_id` igual a la cuenta activa del Bearer. */
export function businessBody(route, bytes, account) {
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { error: "invalid_body" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || !safeId(value.account_id)) return { error: "invalid_body" };
  if (value.account_id !== account) return { error: "account_mismatch" };
  const body = route.body(value);
  return body ? { body } : { error: "invalid_body" };
}
