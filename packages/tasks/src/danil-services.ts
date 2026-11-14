import { FREE_ROUTER_MODEL } from "./agents.ts";

/** El motor anuncia este modelo solo con una delegación vigente del pagador; el id no cambia. */
export const DANIL_CREDITS_MODEL = "danil-credits/deepseek/deepseek-v4.1-flash";

export type DanilService = "credits" | "router";

/**
 * Los servicios de Danil eligen el modelo por su cuenta: se presentan por servicio,
 * nunca por el nombre del modelo. Solo estos dos ids; otros gratuitos siguen en la lista.
 */
export function danilServiceOf(modelId: string | null | undefined): DanilService | null {
  if (modelId === DANIL_CREDITS_MODEL) return "credits";
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
