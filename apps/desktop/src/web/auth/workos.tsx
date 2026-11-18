import { Show } from "solid-js";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";

/** Codes the sign-in return can bring in `?error=`; any other shows the generic one. */
const ERRORS = new Set(["callback_failed", "email_not_verified", "unknown_person", "no_login_yet", "login_banned", "identity_unavailable", "access_required"]);

/** The `?error=` of the sign-in return, as the page shows it, or none. */
export function signInError(search: string): string {
  const code = new URLSearchParams(search).get("error");
  return code ? (ERRORS.has(code) ? code : "callback_failed") : "";
}

/** The original sign-in (80b251a8); its button goes to the edge's `/v1/identity/login`. */
export function WorkosAuthPage(props: { loginUrl: string; error: string }) {
  document.title = "Danil";
  return (
    <main class="flex h-full flex-col items-center overflow-y-auto bg-bg px-6 py-10 text-neutral-950" data-web-auth="workos">
      <div class="grid w-full max-w-sm gap-6">
        <h1 class="m-0 text-3xl font-display font-bold tracking-[-0.03em]">Danil</h1>
        <div class="grid gap-2">
          <h2 class="m-0 text-xl font-semibold">{t("web.auth.signin_title")}</h2>
          <p class="m-0 text-sm text-neutral-500" role="status">{t("web.auth.workos_hint")}</p>
        </div>
        <Button as="a" class="min-h-11" href={props.loginUrl}>{t("web.auth.workos_email")}</Button>
        <Show when={props.error}><p class="m-0 text-sm text-error-strong" role="alert">{t(`web.auth.${props.error}`)}</p></Show>
      </div>
    </main>
  );
}

/** While the session is checked: no sign-in and no button, only that it is connecting. */
export function SessionLoading() {
  document.title = "Danil";
  return (
    <main class="flex h-full flex-col items-center justify-center bg-bg px-6 py-10 text-neutral-950" data-web-loading="" aria-busy="true">
      <h1 class="m-0 text-3xl font-display font-bold tracking-[-0.03em]">Danil</h1>
      <p class="m-0 mt-3 text-sm text-neutral-500" role="status">{t("web.auth.waiting")}</p>
    </main>
  );
}
