import { createSignal, onMount, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { AccessRequest } from "./AccessRequest";
import { workosSession } from "../workos-session";

/** Codes the entry Worker sends back in `?error=`; any other shows the generic one. */
const ERRORS = new Set(["callback_failed", "email_not_verified", "unknown_person", "no_login_yet", "login_banned", "identity_unavailable", "access_required"]);

/**
 * Sign-in with WorkOS (AuthKit): every method goes through the entry Worker,
 * which keeps the session. AuthKit's page shows the methods enabled in WorkOS
 * (code by email, password, Google once its credentials exist), so turning
 * one on or off needs no build.
 */
export function WorkosAuthPage(props: { base: string; next: string; error: string | null }) {
  const [busy, setBusy] = createSignal(true);
  const [error, setError] = createSignal(props.error ? (ERRORS.has(props.error) ? props.error : "callback_failed") : "");
  const go = () => {
    setBusy(true);
    const url = new URL(`${props.base}auth/workos/start`, window.location.origin);
    url.searchParams.set("next", props.next);
    window.location.assign(url.href);
  };
  onMount(() => {
    document.title = "Danil";
    window.history.replaceState(null, "", `${props.base}auth?next=${encodeURIComponent(props.next)}`);
    void (async () => {
      try {
        // Already signed in (another tab, or the return from WorkOS): straight to where it was going.
        if (await workosSession({ base: props.base }).user()) return window.location.replace(props.next);
      } catch {
        setError("identity_unavailable");
      }
      setBusy(false);
    })();
  });
  return (
    <main class="flex h-full flex-col items-center overflow-y-auto bg-bg px-6 py-10 text-neutral-950" data-web-auth="workos" aria-busy={busy()}>
      <div class="grid w-full max-w-sm gap-6">
        <h1 class="m-0 text-3xl font-display font-bold tracking-[-0.03em]">Danil</h1>
        <div class="grid gap-2">
          <h2 class="m-0 text-xl font-semibold">{t("web.auth.signin_title")}</h2>
          <p class="m-0 text-sm text-neutral-500" role="status">{t("web.auth.workos_hint")}</p>
        </div>
        <Button class="min-h-11" disabled={busy()} onClick={go}>{t("web.auth.workos_email")}</Button>
        <p class="m-0 text-sm text-neutral-500">{t("web.auth.workos_password_hint")}</p>
        <AccessRequest />
        <Show when={busy()}><p class="m-0 text-sm text-neutral-500" role="status">{t("web.auth.waiting")}</p></Show>
        <Show when={error()}><p class="m-0 text-sm text-error-strong" role="alert">{t(`web.auth.${error()}`)}</p></Show>
      </div>
    </main>
  );
}
