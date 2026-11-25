import { DANIL_CREDITS_MODEL, DANIL_CREDITS_TIERS, isDanilCreditsModel } from "../../../../ui/src/lib/tasks/danil-services.ts";

// El engine anuncia estos niveles desde `GET /v1/credits/inference/v1/models` con la sesión activa de Danil.
export const DANIL_CREDITS = Object.freeze({
  modelId: DANIL_CREDITS_MODEL,
  tiers: DANIL_CREDITS_TIERS,
} as const);

/** El saldo ya validado para el contexto de la ventana. */
export type DanilCreditsSource = {
  readBalance: (signal: AbortSignal) => Promise<number | null>;
  subscribe?: (clear: () => void) => () => void;
  /** Clave reactiva del contexto/organización activa para aislar el caché de saldo sin mezclar orgs. */
  scope?: () => string | null;
  /** Invalida cachés de transporte antes de una recarga explícita o tras un turno. */
  clearCache?: () => void;
  /** Abre la recarga en el navegador para la cuenta autenticada; sin ella no se ofrece. */
  recharge?: () => Promise<void>;
};

export { isDanilCreditsModel };
export { availableDanilCredits } from "../../../../platform-client/src/treasury.ts";
