import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";

const CONTACT_EMAIL = "hola@danil.ai";

export function AccessRequest() {
  const href = () => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t("web.auth.access_subject"))}`;
  return (
    <div class="grid gap-3" data-access-request="">
      <p class="m-0 text-sm text-neutral-500">{t("web.auth.access_hint")}</p>
      <Button as="a" class="min-h-11" variant="secondary" href={href()}>{t("web.auth.request_access")}</Button>
      <p class="m-0 text-sm text-neutral-500">{t("web.auth.access_email_hint")} <span class="select-all text-neutral-950">{CONTACT_EMAIL}</span></p>
    </div>
  );
}
