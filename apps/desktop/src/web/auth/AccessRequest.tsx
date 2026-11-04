import { ACCESS_CONTACT as CONTACT_EMAIL, accessMailto } from "@terminus/design";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";

export function AccessRequest() {
  const href = () => accessMailto(t("web.auth.access_subject"));
  return (
    <div class="grid gap-3" data-access-request="">
      <Button as="a" class="min-h-11" variant="secondary" href={href()}>{t("web.auth.request_access")}</Button>
      <p class="m-0 text-center text-sm select-all text-neutral-500">{CONTACT_EMAIL}</p>
    </div>
  );
}
