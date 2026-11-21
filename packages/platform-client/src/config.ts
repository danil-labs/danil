/** La única URL base del borde. Nada más en el front la escribe. */
export const API_BASE: string =
  import.meta.env.VITE_DANIL_API_BASE ?? "https://edge.danil.ai/v1";

/** Destinos externos del navegador (billing y harness). Mismo archivo único de URLs. */
export const BILLING_URL: string = import.meta.env.VITE_BILLING_URL ?? "https://app.danil.ai/billing";
export const HARNESS_URL: string = import.meta.env.VITE_HARNESS_URL ?? "https://harness.danil.ai";
