import { canonicalAgentId, OPENCODE } from "./tasks/agents.ts";
import type { AgentOpt } from "./accounts.ts";
import { explicacionDelMotor, prosaDe } from "./failure.ts";

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

/**
 * Indica si la URL de OAuth apunta a una dirección loopback (`127.0.0.1`,
 * `localhost` o `[::1]`). En máquinas remotas/Web donde el motor pide entrada
 * manual (`code`), el navegador termina en una página que no puede conectar
 * cuya barra de direcciones contiene la URL completa que la persona debe pegar.
 */
export function hasLoopbackRedirect(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const redirect = parsed.searchParams.get("redirect_uri")?.trim();
  if (!redirect) return false;
  let target: URL;
  try {
    target = new URL(redirect);
  } catch {
    return false;
  }
  return LOOPBACK_HOSTS.has(target.hostname.toLowerCase());
}

const readable = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && !/\[object \w+\]/.test(v);

/**
 * Texto útil para un rechazo de `submit_login_code` (p. ej. URL incompleta,
 * parámetro `state` inválido o sesión vencida), conservando el motivo concreto
 * del motor sin añadir ruido genérico ni perder la explicación.
 */
export function loginCodeErrorText(e: unknown, fallback: string): string {
  const motor = explicacionDelMotor(e);
  if (e && typeof e === "object") {
    const rec = e as Record<string, unknown>;
    const what = readable(rec.what) ? rec.what.trim() : null;
    const detail = readable(rec.detail) ? rec.detail.trim() : null;
    if (what) {
      if (motor) return what.includes(motor) ? what : `${what}\n${motor}`;
      if (detail && detail !== what && /\s/.test(detail)) return `${what}\n${detail}`;
      return what;
    }
    if (motor) return motor;
    if (e instanceof Error && readable(e.message)) return e.message.trim();
    if (detail) return detail;
  }
  if (readable(e)) return e.trim();
  if (motor) return motor;
  const prose = prosaDe(e);
  return readable(prose) ? prose.trim() : fallback;
}
