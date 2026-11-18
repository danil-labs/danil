export const CREATION_KEY = "danil.billing.creation";
type Creation = { key: string; checkoutId?: string };
function storedCreations(storage: Pick<Storage, "getItem">): Record<string, Creation> {
  try {
    const value: unknown = JSON.parse(storage.getItem(CREATION_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([fingerprint, entry]) => /^[0-9a-f]{64}$/.test(fingerprint) && entry && typeof entry === "object" && typeof (entry as Creation).key === "string"));
  } catch { return {}; }
}

export async function creationKey(storage: Pick<Storage, "getItem" | "setItem">, plan: string, version: number, name: string): Promise<string> {
  const input = JSON.stringify([plan, version, name.normalize("NFC").trim()]);
  const bytes = new TextEncoder().encode(input);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const fingerprint = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
  const entries = storedCreations(storage);
  const prior = entries[fingerprint];
  if (prior && /^[0-9a-f-]{36}$/i.test(prior.key)) return prior.key;
  const key = crypto.randomUUID();
  entries[fingerprint] = { key };
  storage.setItem(CREATION_KEY, JSON.stringify(entries));
  return key;
}

export function bindCreationCheckout(storage: Pick<Storage, "getItem" | "setItem">, key: string, checkoutId: string) {
  const entries = storedCreations(storage);
  const entry = Object.values(entries).find(item => item.key === key);
  if (entry) { entry.checkoutId = checkoutId; storage.setItem(CREATION_KEY, JSON.stringify(entries)); }
}

export function clearCreationCheckout(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, checkoutId: string) {
  const entries = storedCreations(storage);
  const matching = Object.entries(entries).find(([, value]) => value.checkoutId === checkoutId);
  if (matching) {
    delete entries[matching[0]];
    if (Object.keys(entries).length) storage.setItem(CREATION_KEY, JSON.stringify(entries));
    else storage.removeItem(CREATION_KEY);
  }
}
