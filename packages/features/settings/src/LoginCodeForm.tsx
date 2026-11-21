import { enfocar } from "../../../../apps/desktop/src/lib/focus";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../ui/src/Button";
import { Input } from "../../../ui/src/Input";
import "../../../../apps/desktop/src/locales/settingsPhrases";

export function LoginCodeForm(props: { value: string; onInput: (value: string) => void; onSubmit: () => void }) {
  return (
    <form class="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (props.value.trim()) props.onSubmit(); }}>
      <Input
        class="min-w-0 flex-1 font-mono text-xs"
        ref={enfocar}
        autocomplete="off"
        spellcheck={false}
        aria-label={t("settings.accounts.code_placeholder")}
        placeholder={t("settings.accounts.code_placeholder")}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        data-login-code-input=""
      />
      <Button size="sm" type="submit" disabled={!props.value.trim()}>{t("settings.accounts.send_code")}</Button>
    </form>
  );
}
