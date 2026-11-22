import Mail from "lucide-solid/icons/mail";
import Trash2 from "lucide-solid/icons/trash-2";
import { createSignal, onMount, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { AccountEmailsError, type AccountEmailsSource, type EmailRow, emailErrorText } from "../model/account-emails";
import { createNow } from "../../../../../apps/desktop/src/lib/sharedClock";

export type Feedback = { kind: "success" | "error"; text: string } | null;

/** Segundos que faltan hasta `until` (ms), con un tic por segundo. */
function countdown(until: () => number | null) {
  const now = createNow();
  return () => {
    const end = until();
    return end == null ? 0 : Math.max(0, Math.ceil((end - now()) / 1000));
  };
}

type ItemProps = {
  row: EmailRow;
  source: AccountEmailsSource;
  codeOpen: boolean;
  resendAt: number | null;
  onOpenCode: () => void;
  onCloseCode: () => void;
  onResend: () => void;
  resending: boolean;
  onResult: (f: Feedback) => void;
  onChanged: (kind: "verified" | "primary" | "removed" | "gone") => Promise<void>;
};

export function EmailItem(props: ItemProps) {
  const [confirming, setConfirming] = createSignal<"primary" | "remove" | null>(null);
  const [busy, setBusy] = createSignal(false);
  const email = () => props.row.email;
  let box: HTMLDivElement | undefined;
  // El botón que se pulsó desaparece: el foco va a lo que lo reemplaza, no al body.
  const focusIn = (selector: string) => queueMicrotask(() => box?.querySelector<HTMLElement>(selector)?.focus());
  const ask = (what: "primary" | "remove") => {
    props.onResult(null);
    setConfirming(what);
    focusIn("[data-email-confirm] button");
  };
  const unask = () => {
    setConfirming(null);
    focusIn("[data-email-action]");
  };

  async function run(action: () => Promise<void>, ok: string, kind: "primary" | "removed") {
    setBusy(true);
    try {
      await action();
      setConfirming(null);
      props.onResult({ kind: "success", text: ok });
      await props.onChanged(kind);
    } catch (err) {
      props.onResult({ kind: "error", text: emailErrorText(err, email()) });
    } finally {
      setBusy(false);
    }
  }

  const subtitle = () =>
    props.row.primary
      ? t("danil.emails.primary_hint")
      : props.row.verified
        ? t("danil.emails.confirmed")
        : props.codeOpen
          ? t("danil.emails.pending_open_hint")
          : t("danil.emails.pending_hint");

  return (
    <div ref={box} class="grid gap-2 border-b border-border py-3.5" data-account-email={email()}>
      <div class="flex min-w-0 items-center gap-3">
        <span class="grid size-9 shrink-0 place-items-center rounded-md bg-surface-muted text-neutral-700">
          <Mail size={18} />
        </span>
        <div class="grid min-w-0 flex-1 gap-[3px]">
          <div class="flex min-w-0 items-center gap-2">
            <span class="min-w-0 truncate text-sm font-semibold text-neutral-950">{email()}</span>
            <Show when={props.row.primary}>
              <Badge tone="neutral">{t("danil.emails.primary")}</Badge>
            </Show>
            <Show when={!props.row.verified}>
              <Badge tone="warning">{t("danil.emails.unconfirmed")}</Badge>
            </Show>
          </div>
          <div class="min-w-0 truncate text-ui text-neutral-500">{subtitle()}</div>
        </div>
        <Show when={!props.row.primary && !confirming()}>
          <div class="flex shrink-0 items-center gap-1">
            <Show
              when={props.row.verified}
              fallback={
                <Show when={!props.codeOpen}>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={t("danil.emails.enter_code_label", { email: email() })}
                    data-email-action=""
                    onClick={props.onOpenCode}
                  >
                    {t("danil.emails.enter_code")}
                  </Button>
                </Show>
              }
            >
              <Button
                size="sm"
                variant="secondary"
                aria-label={t("danil.emails.make_primary_label", { email: email() })}
                data-email-action=""
                onClick={() => ask("primary")}
              >
                {t("danil.emails.make_primary")}
              </Button>
            </Show>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("danil.emails.remove_label", { email: email() })}
              title={t("danil.emails.remove")}
              data-email-action=""
              onClick={() => ask("remove")}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </Show>
      </div>

      <Show when={confirming() === "primary"}>
        <div class="grid gap-2 rounded-md border border-border bg-surface-muted p-3" data-email-confirm="">
          <p class="m-0 text-ui font-semibold text-neutral-950">{t("danil.emails.primary_confirm", { email: email() })}</p>
          <p class="m-0 text-ui text-neutral-500">{t("danil.emails.primary_confirm_hint")}</p>
          <div class="flex items-center gap-2">
            <Button
              size="sm"
              disabled={busy()}
              onClick={() => void run(() => props.source.makePrimary(email()), t("danil.emails.primary_changed", { email: email() }), "primary")}
            >
              {busy() ? t("danil.emails.changing") : t("danil.emails.make_primary")}
            </Button>
            <Button size="sm" variant="ghost" onClick={unask}>
              {t("danil.emails.cancel")}
            </Button>
          </div>
        </div>
      </Show>

      <Show when={confirming() === "remove"}>
        <div class="grid gap-2 rounded-md border border-border bg-surface-muted p-3" data-email-confirm="">
          <p class="m-0 text-ui font-semibold text-neutral-950">{t("danil.emails.remove_confirm", { email: email() })}</p>
          <p class="m-0 text-ui text-neutral-500">{t("danil.emails.remove_confirm_hint")}</p>
          <div class="flex items-center gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={busy()}
              onClick={() => void run(() => props.source.remove(email()), t("danil.emails.removed", { email: email() }), "removed")}
            >
              {t("danil.emails.remove")}
            </Button>
            <Button size="sm" variant="ghost" onClick={unask}>
              {t("danil.emails.cancel")}
            </Button>
          </div>
        </div>
      </Show>

      <Show when={props.codeOpen && !props.row.verified}>
        <CodeForm
          email={email()}
          source={props.source}
          resendAt={props.resendAt}
          onResend={props.onResend}
          resending={props.resending}
          onClose={() => {
            props.onCloseCode();
            focusIn("[data-email-action]");
          }}
          onResult={props.onResult}
          onChanged={props.onChanged}
        />
      </Show>
    </div>
  );
}

function CodeForm(props: {
  email: string;
  source: AccountEmailsSource;
  resendAt: number | null;
  onResend: () => void;
  resending: boolean;
  onClose: () => void;
  onResult: (f: Feedback) => void;
  onChanged: (kind: "verified" | "gone") => Promise<void>;
}) {
  const [code, setCode] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [dead, setDead] = createSignal<"expired" | "exhausted" | null>(null);
  const [busy, setBusy] = createSignal(false);
  const wait = countdown(() => props.resendAt);
  const errorId = `account-email-code-error-${props.email}`;
  let input: HTMLInputElement | undefined;
  let resend: HTMLSpanElement | undefined;
  onMount(() => input?.focus());

  async function confirm() {
    if (code().length !== 6 || dead()) return;
    setBusy(true);
    try {
      await props.source.confirmCode(props.email, code());
      props.onResult({ kind: "success", text: t("danil.emails.verified", { email: props.email }) });
      await props.onChanged("verified");
    } catch (err) {
      const reason = err instanceof AccountEmailsError ? err.code : "";
      if (reason === "email_in_use" || reason === "email_needs_support") {
        props.onResult({ kind: "error", text: emailErrorText(err, props.email) });
        await props.onChanged("gone");
        return;
      }
      if (reason === "code_expired" || reason === "no_challenge") setDead("expired");
      if (reason === "too_many_attempts") setDead("exhausted");
      setError(emailErrorText(err, props.email));
      // El campo queda desactivado y suelta el foco: pasa a pedir otro código.
      if (reason === "too_many_attempts") queueMicrotask(() => resend?.closest("form")?.querySelector<HTMLElement>("button:not(:disabled)")?.focus());
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      class="grid gap-2 rounded-md border border-border bg-surface-muted p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void confirm();
      }}
    >
      <label class="grid gap-1.5 text-ui text-neutral-700">
        <span>{t("danil.emails.code_prompt", { email: props.email })}</span>
        <Input
          ref={input}
          value={code()}
          onInput={(e) => {
            const digits = e.currentTarget.value.replace(/\D/g, "").slice(0, 6);
            e.currentTarget.value = digits;
            setCode(digits);
            setError(null);
          }}
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength={6}
          aria-label={t("danil.emails.code_label")}
          aria-invalid={error() ? true : undefined}
          aria-describedby={error() ? errorId : undefined}
          disabled={busy() || dead() === "exhausted"}
          class="max-w-40 font-mono tracking-[0.3em] tabular-nums"
          data-account-email-code=""
        />
      </label>
      <Show when={error()}>
        {(text) => (
          <p id={errorId} role="alert" class="m-0 text-ui text-neutral-950">
            {text()}
          </p>
        )}
      </Show>
      <div class="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={code().length !== 6 || busy() || dead() != null}>
          {busy() ? t("danil.emails.confirming") : t("danil.emails.confirm")}
        </Button>
        <span ref={resend} class="contents">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={wait() > 0 || props.resending}
            aria-label={wait() > 0 ? t("danil.emails.resend") : undefined}
            onClick={() => {
              setCode("");
              setError(null);
              setDead(null);
              props.onResend();
            }}
          >
            <Show
              when={wait() > 0}
              fallback={dead() === "expired" ? t("danil.emails.send_new") : t("danil.emails.resend")}
            >
              <span aria-hidden="true">{t("danil.emails.resend_in", { seconds: String(wait()).padStart(2, "0") })}</span>
            </Show>
          </Button>
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>
          {t("danil.emails.later")}
        </Button>
      </div>
      <p class="m-0 text-xs text-neutral-500">{t("danil.emails.spam_hint")}</p>
    </form>
  );
}
