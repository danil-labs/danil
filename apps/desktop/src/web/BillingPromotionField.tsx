import { createUniqueId, Show } from "solid-js";
import { SettingsRow } from "../../../../packages/features/settings/src/index";
import { t } from "../lib/i18n";
import { Input } from "../../../../packages/ui/src/Input";
import { PromotionCodeFormatError } from "../../../../packages/platform-client/src/treasury";
import { PlatformSessionError } from "../../../../packages/session/src/platform-session";

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
