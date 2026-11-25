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

export type ManualLoginMode = "code" | "hosted_code" | "callback_url";

function parseRedirectUri(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return parsed.searchParams.get("redirect_uri")?.trim() || null;
}

/**
 * Indica si la URL de OAuth apunta a una dirección loopback (`127.0.0.1`,
 * `localhost` o `[::1]`). En máquinas remotas/Web donde el motor pide entrada
 * manual (`code`), el navegador termina en una página que no puede conectar
 * cuya barra de direcciones contiene la URL completa que la persona debe pegar.
 */
export function hasLoopbackRedirect(url: string | null | undefined): boolean {
  const redirect = parseRedirectUri(url);
  if (!redirect) return false;
  let target: URL;
  try {
    target = new URL(redirect);
  } catch {
    return false;
  }
  return LOOPBACK_HOSTS.has(target.hostname.toLowerCase());
}

/**
 * Indica si la URL de OAuth usa un `redirect_uri` HTTPS alojado en el proveedor
 * (p. ej. `https://antigravity.google/oauth-callback` en `agy acp --login`, o
 * `urn:ietf:wg:oauth:2.0:oob`) donde la página final muestra un código o URL
 * que la persona pega de vuelta en Danil.
 */
export function hasHostedOAuthRedirect(url: string | null | undefined): boolean {
  const redirect = parseRedirectUri(url);
  if (!redirect) return false;
  if (redirect.toLowerCase().startsWith("urn:ietf:wg:oauth:2.0:oob")) return true;
  let target: URL;
  try {
    target = new URL(redirect);
  } catch {
    return false;
  }
  return target.protocol === "https:" && !LOOPBACK_HOSTS.has(target.hostname.toLowerCase());
}

const HEADLESS_CODE_NOTICE =
  /(?:(?:enter|paste|copy|provide|pega|ingresa|introduce)\s+(?:the\s+|el\s+|la\s+)?(?:(?:authorization|auth|verification|o?auth)\s+)?(?:code|c[oó]digo|(?:redirect|callback|final)\s+(?:url|link|enlace))|\b(?:authorization\s+code|c[oó]digo\s+de\s+autorizaci[oó]n)\b)/i;
const NOT_MANUAL_PROMPT =
  /\b(?:in your browser|en tu navegador|exchanging|intercambiando|verifying|verificando)\b/i;

/**
 * Detecta avisos del CLI que piden pegar/introducir el código de autorización o
 * la URL final en modo headless (sin confundirlos con códigos de dispositivo
 * que se teclean en el navegador ni con mensajes de progreso).
 */
export function isHeadlessCodeNotice(notice: string | null | undefined): boolean {
  if (!notice) return false;
  const text = notice.trim();
  if (!text || NOT_MANUAL_PROMPT.test(text)) return false;
  return HEADLESS_CODE_NOTICE.test(text);
}

/**
 * Determina si la UI debe abrir el campo manual de inmediato al recibir `url`
 * o `notice` (sin esperar necesariamente un evento `code` separado).
 *
 * Para `redirect_uri` loopback siempre devuelve `false`: en escritorio local el
 * relevo loopback termina solo y el campo manual solo debe abrirse cuando el
 * motor emite explícitamente `kind: "code"` (flujo en nube/Web).
 */
export function shouldOpenManualCodeInput(url: string | null | undefined, notice?: string | null): boolean {
  if (hasLoopbackRedirect(url)) return false;
  if (isHeadlessCodeNotice(notice)) return true;
  const redirect = parseRedirectUri(url);
  if (!redirect) return false;
  if (redirect.toLowerCase().startsWith("urn:ietf:wg:oauth:2.0:oob")) return true;
  let target: URL;
  try {
    target = new URL(redirect);
  } catch {
    return false;
  }
  if (target.protocol !== "https:") return false;
  const host = target.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return false;
  if (host === "antigravity.google" || host.endsWith(".antigravity.google")) return true;
  return /oauth[-_/]?(?:code[-_/]?)?callback/i.test(target.pathname);
}

/**
 * Clasifica la copia y el formato del campo manual de login:
 * - `"callback_url"`: `redirect_uri` loopback (`127.0.0.1` / `localhost` / `[::1]`)
 * - `"hosted_code"`: `redirect_uri` HTTPS alojado (p. ej. `agy acp --login`) o aviso headless de código
 * - `"code"`: flujo genérico de código
 */
export function manualLoginMode(url: string | null | undefined, notice?: string | null): ManualLoginMode {
  if (hasLoopbackRedirect(url)) return "callback_url";
  if (hasHostedOAuthRedirect(url) || isHeadlessCodeNotice(notice)) return "hosted_code";
  return "code";
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
