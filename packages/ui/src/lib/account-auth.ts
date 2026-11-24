import { canonicalAgentId, OPENCODE } from "./tasks/agents.ts";
import type { AgentOpt } from "./accounts.ts";

/** OpenCode 2 inicia sesión en el navegador; su clave de Go se agrega después. */
export function accountKeyUrl(provider: Pick<AgentOpt, "id" | "api_key"> | undefined): string | null {
  if (provider && canonicalAgentId(provider.id) === OPENCODE) return null;
  return provider?.api_key ?? null;
}

/** Proveedor desconocido (máquina apagada) no bloquea: `add_account` la enciende. */
export function addBlockedByExternal(provider: Pick<AgentOpt, "available" | "external_install_url"> | undefined): boolean {
  return !!provider && !!provider.external_install_url && !provider.available;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const LOOPBACK_RE = /\b(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\b/i;
const OOB_REDIRECTS = new Set(["urn:ietf:wg:oauth:2.0:oob", "urn:ietf:wg:oauth:2.0:oob:auto"]);

/**
 * Indica si la URL de OAuth termina en una página manual/OOB donde la persona
 * debe copiar el código o el enlace de respuesta y pegarlo en Danil (por ejemplo
 * `agy acp --login` con `redirect_uri=https://antigravity.google/oauth-callback`),
 * sin esperar un callback loopback en `127.0.0.1`.
 */
export function needsManualCallbackCode(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const redirect = parsed.searchParams.get("redirect_uri")?.trim();
  if (!redirect) return false;
  if (OOB_REDIRECTS.has(redirect.toLowerCase())) return true;
  let target: URL;
  try {
    target = new URL(redirect);
  } catch {
    return false;
  }
  if (LOOPBACK_HOSTS.has(target.hostname.toLowerCase())) return false;
  return target.origin === "https://antigravity.google" && target.pathname.startsWith("/oauth-callback");
}

/** Aviso pensado para un listener loopback local (`127.0.0.1` / `localhost`) que confunde en flujos manuales. */
export function isLoopbackNotice(text: string): boolean {
  return LOOPBACK_RE.test(text);
}
