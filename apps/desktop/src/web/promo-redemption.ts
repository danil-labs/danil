type Redemption = { machine?: { state?: string } };

/** La sesión conserva intentos inciertos al desmontar Plan; nada se escribe fuera de memoria. */
export function sessionPromoRedemption(redeem: (code: string, key: string) => Promise<Redemption>) {
  const pending = new Map<string, string>();
  return async (code: string, key: string): Promise<Redemption> => {
    const attempt = pending.get(code) ?? key;
    pending.set(code, attempt);
    const result = await redeem(code, attempt);
    if (pending.get(code) === attempt) pending.delete(code);
    return result;
  };
}
