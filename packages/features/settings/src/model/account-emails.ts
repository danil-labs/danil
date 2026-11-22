import { t } from "../../../../../apps/desktop/src/lib/i18n.ts";

/**
 * Los correos de la persona en su cuenta de Danil: varios, uno principal, cada
 * uno probado con un código. El servidor decide; aquí solo la forma y el orden.
 */

type AccountEmail = { email: string; primary: boolean; verified: boolean };
type PendingEmail = { email: string; resendAfter: number };
export type AccountEmails = { emails: AccountEmail[]; pending: PendingEmail[] };
type CodeSent = { email: string; expiresIn: number; resendAfter: number };

export type AccountEmailsSource = {
  list(): Promise<AccountEmails>;
  requestCode(email: string): Promise<CodeSent>;
  confirmCode(email: string, code: string): Promise<void>;
  makePrimary(email: string): Promise<void>;
  remove(email: string): Promise<void>;
};

/** Un rechazo del servidor con su código estable y lo que acompaña al texto. */
export class AccountEmailsError extends Error {
  readonly code: string;
  readonly attemptsLeft: number | null;
  readonly resendAfter: number | null;
  constructor(code: string, attemptsLeft: number | null = null, resendAfter: number | null = null) {
    super(code);
    this.name = "AccountEmailsError";
    this.code = code;
    this.attemptsLeft = attemptsLeft;
    this.resendAfter = resendAfter;
  }
}

export type EmailRow = { email: string; primary: boolean; verified: boolean; resendAfter: number };

/** Principal, luego confirmados, luego los que esperan su código. */
export function emailRows(list: AccountEmails): EmailRow[] {
  const known = new Set(list.emails.map((e) => e.email));
  const sorted = [...list.emails].sort((a, b) => Number(b.primary) - Number(a.primary) || Number(b.verified) - Number(a.verified));
  return [
    ...sorted.map((e) => ({ ...e, resendAfter: 0 })),
    ...list.pending.filter((p) => !known.has(p.email)).map((p) => ({ email: p.email, primary: false, verified: false, resendAfter: p.resendAfter })),
  ];
}

export const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Códigos con texto propio en el catálogo (`danil.emails.error.*`). */
const EMAIL_ERRORS = [
  "code_invalid",
  "code_expired",
  "no_challenge",
  "too_many_attempts",
  "rate_limited",
  "email_in_use",
  "email_needs_support",
  "primary_email_taken",
  "sso_user",
  "primary_is_danil",
  "already_verified",
  "invalid_email",
  "too_many_emails",
  "email_is_primary",
  "email_used_by_login",
  "email_send_failed",
  "email_codes_unavailable",
] as const;

/** El texto de un rechazo del servidor; `email` nombra la dirección cuando la frase la lleva. */
export function emailErrorText(err: unknown, email = ""): string {
  if (!(err instanceof AccountEmailsError)) return t("danil.emails.error.generic");
  if (err.code === "code_invalid" && err.attemptsLeft != null) {
    return t("danil.emails.error.code_invalid_left", { count: err.attemptsLeft });
  }
  return (EMAIL_ERRORS as readonly string[]).includes(err.code)
    ? t(`danil.emails.error.${err.code}`, { email })
    : t("danil.emails.error.generic");
}
