/**
 * «Solicita acceso a Danil»: lo que ve quien entra sin licencia (`license_required`).
 * El nuevo Danil se abre cuenta por cuenta: no hay prueba ni cobro aquí, solo la solicitud por correo.
 */
import "../../locales/danilPhrases";
import { ACCESS_CONTACT, accessMailto } from "@terminus/design";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke";
import { Button } from "../../ui/Button";

/** El código con que el plano de control (o el motor) dice que la cuenta no tiene Terminus. */
export const LICENSE_REQUIRED = "license_required";

export const accessRequestHref = () => accessMailto(t("danil.license.request_subject"));

/** En la web, el cliente de correo del navegador. */
export const requestAccessInPage = () => window.location.assign(accessRequestHref());

/** En el escritorio, el cliente de correo del sistema. */
export const requestAccessInBrowser = () => void invoke("open_external", { target: accessRequestHref() }).catch(() => {});

export function TerminusLicense(props: { onRequest: () => void; onRetry: () => void; busy?: boolean; compact?: boolean }) {
  return (
    <div class="grid max-w-[60ch] gap-2" data-terminus-license="">
      <strong class={props.compact ? "text-ui font-semibold text-neutral-950" : "text-base font-semibold text-neutral-950"}>
        {t("danil.license.title")}
      </strong>
      <p class={props.compact ? "m-0 text-xs text-neutral-500" : "m-0 text-sm text-neutral-500"}>{t("danil.license.body")}</p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => props.onRequest()} data-license-request="">
          {t("danil.license.request")}
        </Button>
        <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onRetry()} data-license-retry="">
          {t("danil.license.retry")}
        </Button>
      </div>
      <a class="m-0 text-xs text-neutral-500 underline hover:text-neutral-950" href={`mailto:${ACCESS_CONTACT}`} data-license-contact="">
        {t("danil.license.contact", { email: ACCESS_CONTACT })}
      </a>
    </div>
  );
}
