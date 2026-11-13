export type WebSessionDeployment = { origin: string; timeoutMs: number };

/** Build input only: an invalid deployment must fail before publishing assets. */
export function webSessionDeployment(env: Record<string, string | undefined>): WebSessionDeployment {
  const invalidOrigin = "DANIL_WEB_API_ORIGIN is required and must be a valid HTTPS origin (no credentials, path, query or fragment)";
  const origin = env.DANIL_WEB_API_ORIGIN;
  if (!origin || !/^https:\/\/[^/?#\\\s]+\/?$/i.test(origin)) throw new Error(invalidOrigin);
  let url: URL;
  try {
    url = new URL(origin);
  } catch (cause) {
    throw new Error(invalidOrigin, { cause });
  }
  if (url.protocol !== "https:" || url.href !== `${url.origin}/` || url.username || url.password) {
    throw new Error(invalidOrigin);
  }
  // Edge's initial HTTP budget is 10 s; allow 5 s for the browser/network.
  const timeoutMs = Number(env.DANIL_WEB_API_TIMEOUT_MS ?? 15000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error("Invalid DANIL_WEB_API_TIMEOUT_MS");
  return { origin: url.origin, timeoutMs };
}

/** Only the configured secure relay origin can receive a one-use ticket. */
export function webRelayOrigin(raw = "connect.danil.ai"): string {
  const url = new URL(raw.includes("://") ? raw : `wss://${raw}`);
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "wss:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid RELAY_ORIGIN");
  return url.origin;
}
