import { t } from "../../lib/i18n.ts";

/**
 * Los correos de la persona en su cuenta de Danil: varios, uno principal, cada
 * uno probado con un código. El servidor decide; aquí solo la forma y el orden.
 */

export type AccountEmail = { email: string; primary: boolean; verified: boolean };
export type PendingEmail = { email: string; resendAfter: number };
/** Un correo que el servidor ya vio y no pudo agregar: es de otra persona. */
export type BlockedReason = "in_use" | "needs_support";
export type BlockedEmail = { email: string; reason: BlockedReason };
export type AccountEmails = {
  emails: AccountEmail[];
  pending: PendingEmail[];
  blocked?: BlockedEmail[];
};
export type CodeSent = { email: string; expiresIn: number; resendAfter: number };

/** Lo que la otra persona trae a esta cuenta; `null` si el servidor no lo sabe decir. */
export type MergeMembership = { account: string; role: string };
export type PersonMergePreview = {
  emails: string[];
  logins: string[];
  memberships: MergeMembership[];
  blockers: string[];
};

export type AccountEmailsSource = {
  list(): Promise<AccountEmails>;
  requestCode(email: string): Promise<CodeSent>;
  confirmCode(email: string, code: string): Promise<void>;
  makePrimary(email: string): Promise<void>;
  remove(email: string): Promise<void>;
  /** Qué se movería al unir la persona dueña de `email` con esta. Sin soporte, `null`. */
  previewMerge(email: string): Promise<PersonMergePreview | null>;
  /** Une la persona dueña de `email` con la de la sesión. */
  mergePerson(email: string): Promise<void>;
};

/** Un rechazo del servidor con su código estable y lo que acompaña al texto. */
export class AccountEmailsError extends Error {
  readonly code: string;
  readonly attemptsLeft: number | null;
  readonly resendAfter: number | null;
  readonly status: number;
  constructor(code: string, attemptsLeft: number | null = null, resendAfter: number | null = null, status = 0) {
    super(code);
    this.name = "AccountEmailsError";
    this.code = code;
    this.attemptsLeft = attemptsLeft;
    this.resendAfter = resendAfter;
    this.status = status;
  }
}

export type EmailRow = {
  email: string;
  primary: boolean;
  verified: boolean;
  resendAfter: number;
  /** `null` en un correo que la persona puede usar; si no, por qué no. */
  blocked: BlockedReason | null;
};

/** Principal, luego confirmados, luego los que esperan su código, luego los bloqueados. */
export function emailRows(list: AccountEmails): EmailRow[] {
  const known = new Set(list.emails.map((e) => e.email));
  const blocked = list.blocked ?? [];
  const blockedEmails = new Set(blocked.map((b) => b.email));
  const sorted = [...list.emails].sort((a, b) => Number(b.primary) - Number(a.primary) || Number(b.verified) - Number(a.verified));
  return [
    ...sorted.map((e) => ({ ...e, resendAfter: 0, blocked: null })),
    ...list.pending
      .filter((p) => !known.has(p.email) && !blockedEmails.has(p.email))
      .map((p) => ({ email: p.email, primary: false, verified: false, resendAfter: p.resendAfter, blocked: null })),
    ...blocked
      .filter((b) => !known.has(b.email))
      .map((b) => ({ email: b.email, primary: false, verified: false, resendAfter: 0, blocked: b.reason })),
  ];
}

export const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Códigos con texto propio en el catálogo (`danil.emails.error.*`). */
export const EMAIL_ERRORS = [
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
  "merge_unavailable",
  "merge_blocked",
  "merge_failed",
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
