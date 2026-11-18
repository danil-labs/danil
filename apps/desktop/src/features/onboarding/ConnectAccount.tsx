/**
 * El primer paso del alta en la ventana: conectar la cuenta de Danil o seguir
 * sin ella. Conectar usa el mismo inicio de sesión de Configuración.
 */
import Cloud from "lucide-solid/icons/cloud";
import Laptop from "lucide-solid/icons/laptop";
import { createEffect, createSignal, type JSX, on, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { Spinner } from "../../ui/Spinner";
import { createDanilSession } from "../settings/danil-session";
import { requestAccessInBrowser, TerminusLicense } from "../settings/TerminusLicense";
import { rememberAccountWelcome } from "./account-welcome";

type Step = "choose" | "signing";

export type ConnectAccountResult = { workspace: { id: string; nombre: string } | null; connected: boolean };

function Opcion(props: { icono: JSX.Element; titulo: string; efecto: string; disabled?: boolean; onClick: () => void; data: string }) {
  return (
    <button
      type="button"
      class="flex w-full items-start gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3.5 text-left outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
      disabled={props.disabled}
      onClick={() => props.onClick()}
      {...{ [props.data]: "" }}
    >
      <span class="mt-0.5 shrink-0 text-neutral-700">{props.icono}</span>
      <span class="grid min-w-0 gap-0.5">
        <span class="text-sm font-semibold text-neutral-950">{props.titulo}</span>
        <span class="text-xs text-neutral-500">{props.efecto}</span>
      </span>
    </button>
  );
}

export default function ConnectAccount(props: { onListo: (result: ConnectAccountResult) => void }) {
  const session = createDanilSession({ oneClick: false });
  const [step, setStep] = createSignal<Step>("choose");

  const finish = (result: ConnectAccountResult) => {
    rememberAccountWelcome(result.connected ? "connected" : "local");
    props.onListo(result);
  };

  const afterConnected = () => finish({ workspace: null, connected: true });

  function connect() {
    if (session.status()?.state === "connected") return afterConnected();
    setStep("signing");
    void session.withBrowser();
  }

  createEffect(
    on(
      () => session.status()?.state,
      (state) => {
        if (step() === "signing" && state === "connected") afterConnected();
      },
    ),
  );

  async function cancelSigning() {
    await session.signOut();
    setStep("choose");
  }

  const signInMessage = () => session.message();

  return (
    <div class="min-h-0 flex-1 overflow-y-auto" data-account-welcome={step()}>
      <section class="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-8 py-12">
        <h1 class="m-0 text-3xl leading-tight font-display font-bold tracking-[-0.03em] text-neutral-950">
          {t("danil.welcome.title")}
        </h1>

        <Show when={step() === "choose"}>
          <div class="grid gap-2.5">
            <Opcion
              data="data-account-welcome-connect"
              icono={<Cloud size={18} />}
              titulo={t("danil.welcome.connect")}
              efecto={t("danil.welcome.connect_effect")}
              disabled={session.busy() || session.view().t === "loading"}
              onClick={connect}
            />
            <Opcion
              data="data-account-welcome-local"
              icono={<Laptop size={18} />}
              titulo={t("danil.welcome.local")}
              efecto={t("danil.welcome.local_effect")}
              onClick={() => finish({ workspace: null, connected: false })}
            />
          </div>
        </Show>

        <Show when={step() === "signing"}>
          <div class="grid gap-3">
            <p class="m-0 flex items-center gap-2 text-sm text-neutral-700" role="status">
              <Spinner size={14} />
              {t("danil.welcome.waiting")}
            </p>
            <Show when={session.status()?.user_code}>
              {(code) => (
                <strong class="self-start select-all rounded-sm bg-surface-muted px-3 py-2 font-mono text-2xl font-semibold tracking-[0.12em] text-neutral-950">
                  {code()}
                </strong>
              )}
            </Show>
            <div class="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={session.reopen} disabled={!session.status()?.verification_uri_complete}>
                {t("danil.account.open_again")}
              </Button>
              <Button size="sm" variant="ghost" disabled={session.busy()} onClick={() => void cancelSigning()} data-account-welcome-cancel="">
                {t("onboarding.cancel")}
              </Button>
            </div>
          </div>
        </Show>

        <Show when={session.license()}>
          <TerminusLicense onRequest={requestAccessInBrowser} onRetry={() => void session.retry()} busy={session.busy()} compact />
        </Show>
        <Show when={signInMessage()}>
          {(m) => (
            <p class="m-0 text-xs text-error-strong" role="alert">
              {m()}
            </p>
          )}
        </Show>
      </section>
    </div>
  );
}
