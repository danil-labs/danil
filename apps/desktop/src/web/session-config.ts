export type WebSessionDeployment = { kind: "legacy" } | { kind: "platform"; origin: string; timeoutMs: number };

/** Build input only: an invalid deployment must fail before publishing assets. */
export function webSessionDeployment(env: Record<string, string | undefined>): WebSessionDeployment {
  const kind = env.DANIL_WEB_SESSION ?? "legacy";
  if (kind === "legacy") return { kind };
  if (kind !== "platform") throw new Error("Invalid DANIL_WEB_SESSION");
  const url = new URL(env.DANIL_WEB_API_ORIGIN ?? "https://api.danil.ai");
  if (url.href !== `${url.origin}/` || url.username || url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("Invalid DANIL_WEB_API_ORIGIN");
  }
  // Edge's initial HTTP budget is 10 s; allow 5 s for the browser/network.
  const timeoutMs = Number(env.DANIL_WEB_API_TIMEOUT_MS ?? 15000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error("Invalid DANIL_WEB_API_TIMEOUT_MS");
  return { kind, origin: url.origin, timeoutMs };
}

/** A deployment changes a whole domain, including its reads and writes. */
export function webDomainRoutes(deployment: WebSessionDeployment) {
  const session = deployment.kind === 'platform' ? 'v1' : 'legacy';
  return { identity: session, workspaces: session, inbox: session,
    channels: 'legacy', agents: 'legacy', templates: 'legacy', campaigns: 'legacy', contacts: 'legacy', media: 'legacy', billing: 'legacy', audit: 'legacy' } as const;
}
