import { Show } from "solid-js";
import type { Capabilities } from "../lib/platform";
import { t } from "../lib/i18n";
import { Button } from "../ui/Button";
import { Toast, ToastPortal } from "../ui/Toast";

/** Identity pidió un login nuevo para la organización y la página no vuelve sola: lo ofrece aquí. */
export function ReauthNote(props: { reauth?: Capabilities["webReauth"] }) {
  return (
    <Show when={props.reauth?.needed()}>
      <ToastPortal>
        <Toast data-web-reauth="">
          <p class="m-0 text-xs text-neutral-950">{t("web.organization.reauth")}</p>
          <Button size="compact" data-web-reauth-sign-in="" onClick={() => props.reauth?.signIn()}>{t("web.organization.reauth_action")}</Button>
        </Toast>
      </ToastPortal>
    </Show>
  );
}
