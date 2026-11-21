import { DANIL_CREDITS_MODEL } from "../../../tasks/src/danil-services.ts";

// El engine anuncia este modelo solo con una delegación vigente del pagador.
export const DANIL_CREDITS = Object.freeze({
  modelId: DANIL_CREDITS_MODEL,
  upstreamModelId: "deepseek/deepseek-v4.1-flash",
} as const);

/** El saldo ya validado para el contexto de la ventana. */
export type DanilCreditsSource = {
  readBalance: (signal: AbortSignal) => Promise<number | null>;
  prepare?: (headers: Record<string, string>) => Promise<unknown>;
  subscribe?: (clear: () => void) => () => void;
  /** Abre la recarga en el navegador para la cuenta autenticada; sin ella no se ofrece. */
  recharge?: () => Promise<void>;
};

export { availableDanilCredits } from "../../../platform-client/src/treasury.ts";
