import { Show } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { Button } from "../../../ui/src/Button";

/** While the session is checked: no sign-in, only that it is connecting; a retried check offers to sign out. */
export function SessionLoading(props: { onSignOut?: () => void }) {
  document.title = "Danil";
  return (
    <main class="flex h-full flex-col items-center justify-center bg-bg px-6 py-10 text-neutral-950" data-web-loading="">
      <h1 class="m-0 text-3xl font-display font-bold tracking-[-0.03em]">Danil</h1>
      <p class="m-0 mt-3 text-sm text-neutral-500" role="status">{t("web.auth.waiting")}</p>
      <Show when={props.onSignOut}>{signOut => <Button class="mt-6" variant="ghost" data-web-sign-out="" onClick={() => signOut()()}>{t("web.platform.sign_out")}</Button>}</Show>
    </main>
  );
}
