import { ACCESS_CONTACT as CONTACT_EMAIL, accessMailto } from "@terminus/design";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";

export function AccessRequest() {
  const href = () => accessMailto(t("web.auth.access_subject"));
  return (
    <div class="grid gap-3" data-access-request="">
      <Button as="a" class="min-h-11" variant="secondary" href={href()}>{t("web.auth.request_access")}</Button>
      <a class="m-0 text-center text-sm text-neutral-500 underline hover:text-neutral-950" href={`mailto:${CONTACT_EMAIL}`} data-access-contact="">
        {t("web.auth.access_contact", { email: CONTACT_EMAIL })}
      </a>
    </div>
  );
}
