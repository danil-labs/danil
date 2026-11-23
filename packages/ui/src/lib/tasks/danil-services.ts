import { FREE_ROUTER_MODEL } from "./agents.ts";

/** Niveles canónicos del catálogo de inferencia de Danil Credits (`GET /v1/credits/inference/v1/models`). */
export const DANIL_CREDITS_TIERS = [
  "danil-credits/danil/equilibrado",
  "danil-credits/danil/ligero",
  "danil-credits/danil/avanzado",
] as const;

export type DanilCreditsTierId = (typeof DANIL_CREDITS_TIERS)[number];

/** Modelo predeterminado de Danil Credits; el motor solo anuncia los niveles vigentes del servicio. */
export const DANIL_CREDITS_MODEL: DanilCreditsTierId = "danil-credits/danil/equilibrado";

export function isDanilCreditsModel(modelId: string | null | undefined): modelId is DanilCreditsTierId {
  return typeof modelId === "string" && (DANIL_CREDITS_TIERS as readonly string[]).includes(modelId);
}

export type DanilService = "credits" | "router";

/**
 * Los servicios de Danil eligen el modelo por su cuenta: se presentan por servicio,
 * nunca por el nombre del modelo subyacente. Solo los niveles de Credits y la ruta
 * del Free Router; otros gratuitos siguen en la lista.
 */
export function danilServiceOf(modelId: string | null | undefined): DanilService | null {
  if (isDanilCreditsModel(modelId)) return "credits";
  if (modelId === FREE_ROUTER_MODEL) return "router";
  return null;
}

export type CreditsBalanceState = { kind: "loading" } | { kind: "unavailable" } | { kind: "amount"; count: number };

/**
 * Qué dice el saldo: `undefined` es que se está consultando; `null`, que no se sabe
 * (sin capacidad, sin cuenta o respuesta rara). Un saldo desconocido nunca es cero.
 */
export function creditsBalanceState(amount: number | null | undefined): CreditsBalanceState {
  if (amount === undefined) return { kind: "loading" };
  if (amount === null || !Number.isFinite(amount)) return { kind: "unavailable" };
  return { kind: "amount", count: amount };
}
