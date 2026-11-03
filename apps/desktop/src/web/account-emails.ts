/**
 * Los correos de la cuenta en el navegador: las rutas `/auth/emails` del BFF de
 * Danil por el proxy de alfa (`<base>alpha-api`), con la sesión de la persona.
 */
import { sessionFetch } from "../../../../packages/attention/src/request.ts";
import {
  type AccountEmails,
  AccountEmailsError,
  type AccountEmailsSource,
  type BlockedEmail,
  type MergeMembership,
  type PersonMergePreview,
} from "../features/settings/account-emails.ts";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
type Session = { getToken: () => Promise<string>; unauthorized: () => Promise<boolean> };

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown) => (typeof v === "string" ? v : "");

const blockedEmail = (v: unknown): BlockedEmail | null => {
  const row = v as { email?: unknown; reason?: unknown } | null;
  const email = str(row?.email);
  const reason = row?.reason === "in_use" || row?.reason === "needs_support" ? row.reason : null;
  return email && reason ? { email, reason } : null;
};

const mergeMembership = (v: unknown): MergeMembership | null => {
  const row = v as { account?: unknown; role?: unknown } | null;
  const account = str(row?.account);
  return account ? { account, role: str(row?.role) } : null;
};

/** Una respuesta sin la forma esperada no se inventa: se trata como «sin soporte». */
function mergePreview(data: Record<string, unknown>): PersonMergePreview | null {
  const list = (key: string) => (Array.isArray(data[key]) ? data[key] : null);
  const emails = list("emails");
  const logins = list("logins");
  const memberships = list("memberships");
  const blockers = list("blockers");
  if (!emails || !logins || !memberships || !blockers) return null;
  return {
    emails: emails.map(str).filter(Boolean),
    logins: logins.map(str).filter(Boolean),
    memberships: memberships.flatMap((m) => mergeMembership(m) ?? []),
    blockers: blockers.map(str).filter(Boolean),
  };
}

export function webAccountEmails(session: Session, prefix: string, f: Fetch = (input, init) => fetch(input, init)): AccountEmailsSource {
  const authorized = sessionFetch(session, (input, init) => f(String(input), init));
  async function send(path: string, body?: Record<string, string>): Promise<Record<string, unknown>> {
    const response = await authorized(`${prefix}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      throw new AccountEmailsError(
        str(data?.error) || `http_${response.status}`,
        typeof data?.attempts_left === "number" ? data.attempts_left : null,
        typeof data?.resend_after === "number" ? data.resend_after : null,
        response.status,
      );
    }
    return data ?? {};
  }

  return {
    async list(): Promise<AccountEmails> {
      const data = await send("/auth/emails");
      const emails = Array.isArray(data.emails) ? data.emails : [];
      const pending = Array.isArray(data.pending) ? data.pending : [];
      const blocked = Array.isArray(data.blocked) ? data.blocked : [];
      return {
        emails: emails.flatMap((e: Record<string, unknown>) => (str(e?.email) ? [{ email: str(e.email), primary: e.primary === true, verified: e.verified === true }] : [])),
        pending: pending.flatMap((p: Record<string, unknown>) => (str(p?.email) ? [{ email: str(p.email), resendAfter: num(p.resend_after, 0) }] : [])),
        blocked: blocked.flatMap((b) => blockedEmail(b) ?? []),
      };
    },
    async requestCode(email) {
      const data = await send("/auth/emails", { email });
      return { email: str(data.email) || email, expiresIn: num(data.expires_in, 900), resendAfter: num(data.resend_after, 60) };
    },
    async confirmCode(email, code) {
      await send("/auth/emails/verify", { email, code });
    },
    async makePrimary(email) {
      await send("/auth/emails/primary", { email });
      // El JWT trae el correo anterior hasta que se refresca.
      await session.unauthorized().catch(() => false);
    },
    async remove(email) {
      await send("/auth/emails/remove", { email });
    },
    async previewMerge(email) {
      try {
        return mergePreview(await send(`/auth/emails/merge?email=${encodeURIComponent(email)}`));
      } catch (err) {
        // Una ventana con un BFF anterior no tiene la ruta: no es un fallo que se muestre.
        if (err instanceof AccountEmailsError && (err.code === "merge_unavailable" || [404, 405, 501].includes(err.status))) return null;
        throw err;
      }
    },
    async mergePerson(email) {
      await send("/auth/emails/merge", { email });
    },
  };
}
