// La ejecución queda cerrada aunque una futura fuente de saldo esté disponible.
export const DANIL_CREDITS = Object.freeze({
  executionEnabled: false,
  modelId: "deepseek/deepseek-v4.1-flash",
} as const);

/** El contrato completo y su esquema Zod pertenecen al BFF de Appv2. */
export type DanilCreditsSource = {
  readBalance: () => Promise<unknown>;
  subscribe?: (clear: () => void) => () => void;
};

/** Proyección defensiva de los campos que muestra esta vista. */
export function availableDanilCredits(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const reply = value as Record<string, unknown>;
  const account = reply.account_id;
  const identified = typeof account === "string" ? account.trim().length > 0
    : typeof account === "number" && Number.isSafeInteger(account) && account > 0;
  if (!identified || reply.execution_available !== false || !reply.wallet) return null;
  if (typeof reply.wallet !== "object") return null;
  const wallet = reply.wallet as Record<string, unknown>;
  if (typeof wallet.available_credits !== "number"
    || !Number.isFinite(wallet.available_credits)) return null;
  return wallet.available_credits;
}
