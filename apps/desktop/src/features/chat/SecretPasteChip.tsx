import { envSecretNameProblem } from "@terminus/computers";
import { onMount, Show } from "solid-js";
import { unknownCommand } from "../../lib/errorCode.ts";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { type Failure, prosaDe } from "../../ui/Failure";
import { CancelButton } from "../../ui/IconAction";
import { Input } from "../../ui/Input";
import { Spinner } from "../../ui/Spinner";

/** Lo que el compositor retiene de un pegado con cara de secreto. El valor queda en el compositor, nunca en el borrador. */
export type HeldSecret = { name: string; hint: string; exists: boolean; saving: boolean; failure: Failure | null };

const NAME_ERROR = {
  empty: () => t("chat.secret.error.empty"),
  grammar: () => t("chat.secret.error.grammar"),
  reserved: () => t("chat.secret.error.reserved"),
} as const;

export const normalizeName = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, "_");

/** El error de una línea del chat; el detalle va en `title`. Lo comparte la tarjeta «Secreto solicitado». */
export function secretErrorText(name: string, failure: Failure | null): string | null {
  const problem = envSecretNameProblem(name);
  if (problem) return NAME_ERROR[problem]();
  if (!failure) return null;
  if (failure.detail === "no_recipients" || failure.detail === "secrets_unavailable") return t("chat.secret.error.no_machine");
  if (unknownCommand(failure)) return t("chat.secret.error.engine");
  return t("chat.secret.error.failed");
}

export function SecretPasteChip(props: {
  held: HeldSecret;
  onName: (name: string) => void;
  onSave: () => void;
  onAsText: () => void;
  onDiscard: () => void;
}) {
  let field: HTMLInputElement | undefined;
  onMount(() => {
    field?.focus();
    field?.select();
  });
  const error = () => secretErrorText(props.held.name, props.held.failure);
  const blocked = () => !!envSecretNameProblem(props.held.name) || props.held.saving;
  return (
    <div
      role="group"
      aria-label={t("chat.secret_paste.group")}
      aria-busy={props.held.saving}
      class="mx-1 mt-1 flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-raised p-[5px] pl-1.5 shadow-sm"
      data-secret-paste=""
      onKeyDown={(e) => {
        if (e.key === "Escape" && !props.held.saving) {
          e.preventDefault();
          e.stopPropagation();
          props.onDiscard();
        } else if (e.key === "Enter" && e.target === field) {
          e.preventDefault();
          if (!blocked()) props.onSave();
        }
      }}
    >
      <span class="relative min-w-[120px] basis-[200px]">
        <span class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 font-mono text-label text-neutral-500" aria-hidden="true">
          $
        </span>
        <Input
          ref={field}
          class="min-h-7 py-[3px] pr-2 pl-[18px] font-mono text-label uppercase"
          aria-label={t("chat.secret_paste.name")}
          aria-invalid={!!envSecretNameProblem(props.held.name)}
          aria-describedby={error() ? "secret-paste-error" : undefined}
          autocomplete="off"
          spellcheck={false}
          disabled={props.held.saving}
          value={props.held.name}
          onInput={(e) => props.onName(normalizeName(e.currentTarget.value))}
        />
      </span>
      <Show
        when={error()}
        fallback={<span class="shrink-0 font-mono text-caption text-neutral-500">{props.held.hint}</span>}
      >
        {(text) => (
          <span
            id="secret-paste-error"
            role={props.held.failure ? "alert" : undefined}
            class="min-w-0 truncate text-caption text-error-strong"
            title={props.held.failure ? prosaDe(props.held.failure) : undefined}
          >
            {text()}
          </span>
        )}
      </Show>
      <span class="flex-1" />
      <Button type="button" variant="ghost" size="compact" disabled={props.held.saving} onClick={props.onAsText} data-secret-paste-text="">
        {t("chat.secret_paste.as_text")}
      </Button>
      <Button type="button" variant="primary" size="compact" disabled={blocked()} onClick={props.onSave} data-secret-paste-save="">
        <Show when={props.held.saving} fallback={props.held.exists ? t("chat.secret_paste.replace") : t("chat.secret_paste.save")}>
          <Spinner size={12} />
          {t("chat.secret_paste.saving")}
        </Show>
      </Button>
      <CancelButton label={t("chat.secret_paste.discard")} disabled={props.held.saving} onClick={props.onDiscard} />
    </div>
  );
}
