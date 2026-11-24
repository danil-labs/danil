/**
 * La misma regla que el servidor (`computers` `webhookUrlOk`), para avisar antes
 * de mandar: HTTPS en el 443, sin credenciales ni hosts locales o de red privada.
 */
export function webhookUrlOk(raw: string): boolean {
  if (raw.length > 512) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\[|^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  return host.includes(".");
}

/** Los modos del motor, del más estricto al más permisivo; el de la conexión es su techo. */
export const PERMISSION_MODES = ["lectura", "manual", "ediciones", "auto"] as const;

export const MCP_URL = "https://mcp.danil.ai/mcp";
