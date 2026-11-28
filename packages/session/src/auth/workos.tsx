import { Show } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { Button } from "../../../ui/src/Button";

/** Codes the sign-in return can bring in `?error=`; any other shows the generic one. */
const ERRORS = new Set(["callback_failed", "email_not_verified", "unknown_person", "no_login_yet", "login_banned", "identity_unavailable", "access_required"]);

/** The `?error=` of the sign-in return, as the page shows it, or none. */
export function signInError(search: string): string {
  const code = new URLSearchParams(search).get("error");
  return code ? (ERRORS.has(code) ? code : "callback_failed") : "";
}

/** The original sign-in (80b251a8); its button goes to the edge's `/v1/identity/login`. */
export function WorkosAuthPage(props: {
  loginUrl: string;
  error: string;
  onLogin?: () => void;
  otherOrgUrl?: string;
  onOtherOrg?: () => void;
}) {
  document.title = "Danil";
  return (
    <main class="flex h-full flex-col items-center overflow-y-auto bg-bg px-6 py-10 text-neutral-950" data-web-auth="workos">
      <div class="grid w-full max-w-sm gap-6">
        <h1 class="m-0 text-3xl font-display font-bold tracking-[-0.03em]">Danil</h1>
        <div class="grid gap-2">
          <h2 class="m-0 text-xl font-semibold">{t("web.auth.signin_title")}</h2>
          <p class="m-0 text-sm text-neutral-500" role="status">{t("web.auth.workos_hint")}</p>
        </div>
        <div class="grid gap-2">
          <Button as="a" class="min-h-11" href={props.loginUrl} onClick={props.onLogin}>{t("web.auth.workos_email")}</Button>
          <Show when={props.otherOrgUrl}>
            {(href) => (
              <Button as="a" variant="ghost" class="min-h-10" href={href()} data-web-auth-other-org="" onClick={props.onOtherOrg}>
                {t("web.platform.other_organization")}
              </Button>
            )}
          </Show>
        </div>
        <p class="m-0 text-sm text-neutral-500">{t("web.auth.workos_password_hint")}</p>
        <Show when={props.error}><p class="m-0 text-sm text-error-strong" role="alert">{t(`web.auth.${props.error}`)}</p></Show>
      </div>
    </main>
  );
}
