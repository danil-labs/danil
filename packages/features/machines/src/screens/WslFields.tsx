import { Show, createSignal } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Input } from "../../../../ui/src/Input";
import { linuxUserSlug, wslUserProblem } from "../model/wsl";

export function PasswordFields(props: { onChange: (password: string, ok: boolean) => void }) {
  const [p1, setP1] = createSignal("");
  const [p2, setP2] = createSignal("");
  const ok = () => p1().length > 0 && p1() === p2();
  const emit = () => props.onChange(p1(), ok());
  return (
    <div class="grid gap-2 sm:grid-cols-2">
      <label class="grid gap-1 text-xs text-neutral-500">
        {t("danil.wsl.password")}
        <Input type="password" value={p1()} autocomplete="new-password" placeholder={t("danil.wsl.password_placeholder")} onInput={(e) => { setP1(e.currentTarget.value); emit(); }} />
      </label>
      <label class="grid gap-1 text-xs text-neutral-500">
        {t("danil.wsl.password_again")}
        <Input type="password" value={p2()} autocomplete="new-password" placeholder={t("danil.wsl.password_again_placeholder")} onInput={(e) => { setP2(e.currentTarget.value); emit(); }} />
        <Show when={p2() && !ok()}>
          <span class="text-xs text-error-strong">{t("danil.wsl.password_mismatch")}</span>
        </Show>
      </label>
    </div>
  );
}

/** Usuario y contraseña de Linux, como la primera vez que se abre Ubuntu. */
export function UserFields(props: { onChange: (user: string, password: string, ok: boolean) => void }) {
  const [user, setUser] = createSignal("");
  const [password, setPassword] = createSignal({ value: "", ok: false });
  const problem = () => wslUserProblem(user());
  const emit = () => props.onChange(user(), password().value, problem() === null && password().ok);
  return (
    <div class="grid gap-2" data-wsl-user="">
      <label class="grid gap-1 text-xs text-neutral-500">
        {t("danil.wsl.user")}
        <Input
          value={user()}
          maxLength={32}
          autocomplete="off"
          placeholder={t("danil.wsl.user_placeholder")}
          onInput={(e) => {
            const slug = linuxUserSlug(e.currentTarget.value);
            if (slug !== e.currentTarget.value) e.currentTarget.value = slug;
            setUser(slug);
            emit();
          }}
        />
        <span class="text-xs text-neutral-500">{t("danil.wsl.user_rule")}</span>
      </label>
      <Show when={user() && problem()}>{(p) => <span class="text-xs text-error-strong">{t(`danil.wsl.user_problem.${p()}`)}</span>}</Show>
      <PasswordFields
        onChange={(value, ok) => {
          setPassword({ value, ok });
          emit();
        }}
      />
      <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.password_kept")}</p>
    </div>
  );
}
