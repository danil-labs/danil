import { Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { isHeadlessCodeNotice, type ManualLoginMode } from "../../../../ui/src/lib/account-auth.ts";
import { LoginCodeForm } from "../screens/LoginCodeForm";
import { Paso } from "./ConnectionStep";

/** Paso compartido de entrada manual de código o URL final para conectar una cuenta de IA. */
export function LoginCodeStep(props: {
  numero: number;
  titulo: string;
  modo: ManualLoginMode;
  aviso?: string | null;
  value: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
  error?: string | null;
}) {
  return (
    <Paso numero={props.numero} titulo={props.titulo}>
      <Show when={props.modo === "callback_url"}>
        <p class="m-0 text-xs text-neutral-500" data-login-loopback-hint="">
          {t("settings.accounts.step_callback_url_hint")}
        </p>
      </Show>
      <Show when={props.modo === "hosted_code"}>
        <p class="m-0 text-xs text-neutral-500" data-login-hosted-hint="">
          {t("settings.accounts.step_hosted_code_hint")}
        </p>
      </Show>
      <Show
        when={
          props.aviso &&
          props.modo !== "callback_url" &&
          !(props.modo === "hosted_code" && isHeadlessCodeNotice(props.aviso))
        }
      >
        <p class="m-0 text-xs text-neutral-500" data-login-notice="">{props.aviso}</p>
      </Show>
      <LoginCodeForm
        value={props.value}
        onInput={props.onInput}
        onSubmit={props.onSubmit}
        submitting={props.submitting}
        error={props.error}
        mode={props.modo}
      />
    </Paso>
  );
}
