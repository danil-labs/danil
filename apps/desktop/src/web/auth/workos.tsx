import { Show } from "solid-js";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { AccessRequest } from "./AccessRequest";

/** Codes the sign-in return can bring in `?error=`; any other shows the generic one. */
const ERRORS = new Set(["callback_failed", "email_not_verified", "unknown_person", "no_login_yet", "login_banned", "identity_unavailable", "access_required"]);

/** The `?error=` of the sign-in return, as the page shows it, or none. */
export function signInError(search: string): string {
  const code = new URLSearchParams(search).get("error");
  return code ? (ERRORS.has(code) ? code : "callback_failed") : "";
}

/**
 * Sign-in with WorkOS (AuthKit), the original web screen (restored from
 * 80b251a8, design unchanged). Its button goes to the edge's
 * `/v1/identity/login`, which sends the person to AuthKit and, from its
 * `callback`, back here with the `__Host-danil_session` cookie. AuthKit's page
 * shows the methods enabled in WorkOS, so turning one on or off needs no build.
 * While the window still asks who is signed in, the button waits disabled.
 */
export function WorkosAuthPage(props: { loginUrl: string; busy: boolean; error: string }) {
  document.title = "Danil";
  return (
    <main class="flex h-full flex-col items-center overflow-y-auto bg-bg px-6 py-10 text-neutral-950" data-web-auth="workos" aria-busy={props.busy}>
      <div class="grid w-full max-w-sm gap-6">
        <h1 class="m-0 text-3xl font-display font-bold tracking-[-0.03em]">Danil</h1>
        <div class="grid gap-2">
          <h2 class="m-0 text-xl font-semibold">{t("web.auth.signin_title")}</h2>
          <p class="m-0 text-sm text-neutral-500" role="status">{t("web.auth.workos_hint")}</p>
        </div>
        <Show when={!props.busy} fallback={<Button class="min-h-11" disabled>{t("web.auth.workos_email")}</Button>}>
          <Button as="a" class="min-h-11" href={props.loginUrl}>{t("web.auth.workos_email")}</Button>
        </Show>
        <p class="m-0 text-sm text-neutral-500">{t("web.auth.workos_password_hint")}</p>
        <AccessRequest />
        <Show when={props.busy}><p class="m-0 text-sm text-neutral-500" role="status">{t("web.auth.waiting")}</p></Show>
        <Show when={props.error}><p class="m-0 text-sm text-error-strong" role="alert">{t(`web.auth.${props.error}`)}</p></Show>
      </div>
    </main>
  );
}
