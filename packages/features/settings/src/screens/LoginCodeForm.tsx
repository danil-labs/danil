import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import ExternalLink from "lucide-solid/icons/external-link";
import { createSignal, Show } from "solid-js";
import { createCopied } from "../../../../host/src/clipboard";
import { enfocar } from "../../../../ui/src/lib/focus";
import { t } from "../../../../ui/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { prosaDe } from "../../../../ui/src/Failure";
import { Input } from "../../../../ui/src/Input";
import type { ManualLoginMode } from "../../../../ui/src/lib/account-auth.ts";
import "../../../../ui/src/locales/settingsPhrases";

export function LoginUrlActions(props: { url: string; openLabel: string }) {
  const [copyError, setCopyError] = createSignal<string | null>(null);
  const { copied, copy } = createCopied(1400, (e) => setCopyError(prosaDe(e)));
  return (
    <div class="grid gap-1.5">
      <div class="flex flex-wrap items-center gap-2">
        <a
          class="inline-flex h-7 items-center gap-1.5 rounded-md bg-surface-muted px-2.5 text-xs font-medium text-neutral-950 no-underline hover:bg-neutral-200/70"
          href={props.url}
          target="_blank"
          rel="noopener noreferrer"
          data-login-url=""
        >
          <ExternalLink size={13} />
          {props.openLabel}
        </a>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setCopyError(null);
            void copy(props.url);
          }}
        >
          <Show when={copied()} fallback={<Copy size={13} />}>
            <Check size={13} />
          </Show>
          {copied() ? t("settings.accounts.link_copied") : t("settings.accounts.copy_link")}
        </Button>
      </div>
      <Show when={copyError()}>{(err) => <p class="m-0 text-xs text-error-strong">{err()}</p>}</Show>
    </div>
  );
}

export function LoginCodeForm(props: {
  value: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
  error?: string | null;
  mode?: ManualLoginMode;
}) {
  const mode = () => props.mode ?? "code";
  const placeholder = () =>
    mode() === "callback_url"
      ? t("settings.accounts.callback_url_placeholder")
      : mode() === "hosted_code"
        ? t("settings.accounts.hosted_code_placeholder")
        : t("settings.accounts.code_placeholder");
  const submitLabel = () =>
    props.submitting
      ? t("settings.accounts.sending_code")
      : mode() === "callback_url" || mode() === "hosted_code"
        ? t("settings.accounts.send_callback_url")
        : t("settings.accounts.send_code");
  return (
    <div class="flex flex-col gap-1.5" data-login-code-mode={mode()}>
      <form
        class="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!props.submitting && props.value.trim()) props.onSubmit();
        }}
      >
        <Input
          variant="plain"
          class="min-w-0 flex-1 min-h-9 rounded-md border border-border-strong bg-surface px-[11px] py-[7px] font-mono text-xs text-neutral-950 outline-none placeholder:text-neutral-500 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          ref={enfocar}
          autocomplete="off"
          spellcheck={false}
          disabled={props.submitting}
          aria-label={placeholder()}
          placeholder={placeholder()}
          value={props.value}
          onInput={(event) => props.onInput(event.currentTarget.value)}
          data-login-code-input=""
        />
        <Button size="sm" type="submit" disabled={props.submitting || !props.value.trim()}>
          {submitLabel()}
        </Button>
      </form>
      <Show when={props.error}>
        {(err) => (
          <p role="alert" data-login-code-error="" class="m-0 whitespace-pre-line text-xs text-error-strong">
            {err()}
          </p>
        )}
      </Show>
    </div>
  );
}
