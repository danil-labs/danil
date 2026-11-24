import { createUniqueId, Show } from "solid-js";
import { SettingsRow } from "../../features/settings/src/index";
import { t } from "../../../apps/desktop/src/lib/i18n";
import { Input } from "../../ui/src/Input";
import { PromotionCodeFormatError } from "../../platform-client/src/treasury";
import { PlatformSessionError } from "./platform-session";

export function promotionCodeInvalid(error: unknown) {
  return error instanceof PromotionCodeFormatError || error instanceof PlatformSessionError && error.status === 422 && error.code === "promotion_code_invalid";
}

export function BillingPromotionField(props: { label?: string; value: string; disabled: boolean; invalid: boolean; onEdit: (value: string) => void }) {
  const field = createUniqueId();
  const error = `${field}-error`;
  return <SettingsRow label={<label for={field}>{props.label ?? t("web.billing_v2.promotion_code")}</label>}>
    <div class="grid gap-1">
      <Input id={field} value={props.value} disabled={props.disabled} autocomplete="off"
        aria-invalid={props.invalid ? "true" : undefined} aria-describedby={props.invalid ? error : undefined}
        onInput={event => props.onEdit(event.currentTarget.value)} />
      <Show when={props.invalid}><p id={error} role="alert">{t("web.billing_v2.promotion_code_invalid")}</p></Show>
    </div>
  </SettingsRow>;
}
