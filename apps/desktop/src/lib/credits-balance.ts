/** Proyección del saldo de Treasury para la organización del workspace activo. */
export function availableDanilCredits(value: unknown, organizationId: string): number | null {
  if (!value || typeof value !== "object") return null;
  const { organization_id, available } = value as { organization_id?: unknown; available?: unknown };
  if (organization_id !== organizationId || !available || typeof available !== "object") return null;
  const { currency, amount_micro } = available as { currency?: unknown; amount_micro?: unknown };
  if (currency !== "MXN" || typeof amount_micro !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(amount_micro)) return null;
  if (BigInt(amount_micro) > 9223372036854775807n) return null;
  return Number(amount_micro) / 1_000_000;
}
