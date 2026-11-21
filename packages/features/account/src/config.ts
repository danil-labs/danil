/**
 * Configuración de URLs de destino externas para la feature de cuenta.
 * Las URLs se resuelven a partir de las variables de entorno de Vite
 * y se abren únicamente mediante host.openExternal de @danil/host.
 */

export const BILLING_URL: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_BILLING_URL) ||
  "https://app.danil.ai/billing";

export const HARNESS_URL: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_HARNESS_URL) ||
  "https://harness.danil.ai";

export function getBillingUrl(): string {
  return BILLING_URL;
}

export function getHarnessUrl(): string {
  return HARNESS_URL;
}
