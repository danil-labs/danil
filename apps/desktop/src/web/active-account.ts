/** `active_account_id` of the session's JWT; `null` if it has none. */
export function activeAccountOf(token: string): number | null {
  try {
    const part = token.split(".")[1] ?? "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const id = Number((JSON.parse(json) as { active_account_id?: unknown }).active_account_id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
