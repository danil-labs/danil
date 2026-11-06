// La ejecución queda cerrada aunque una futura fuente de saldo esté disponible.
export const DANIL_CREDITS = Object.freeze({
  executionEnabled: false,
  modelId: "deepseek/deepseek-v4.1-flash",
} as const);

export type DanilCreditsBalance = {
  account_id: string | number;
  wallet: null | { balance_credits: number; available_credits: number; status: string };
  execution_available: false;
};

/** Solo un adaptador BFF autenticado puede instalar esta fuente de cuenta. */
export type DanilCreditsSource = {
  readBalance: () => Promise<DanilCreditsBalance>;
};

export function availableDanilCredits(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const reply = value as Partial<DanilCreditsBalance>;
  const account = reply.account_id;
  const identified = typeof account === "string" ? account.trim().length > 0
    : typeof account === "number" && Number.isSafeInteger(account) && account > 0;
  if (!identified || reply.execution_available !== false || !reply.wallet) return null;
  const wallet = reply.wallet;
  if (typeof wallet.status !== "string" || !wallet.status.trim()
    || !Number.isFinite(wallet.balance_credits)
    || typeof wallet.available_credits !== "number"
    || !Number.isFinite(wallet.available_credits)) return null;
  return wallet.available_credits;
}
