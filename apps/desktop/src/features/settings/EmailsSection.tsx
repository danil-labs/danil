import Mail from "lucide-solid/icons/mail";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
import { createResource, createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import { t } from "../../lib/i18n";
import { createNow } from "../../lib/sharedClock";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Skeleton } from "../../ui/Skeleton";
import {
  AccountEmailsError,
  type AccountEmailsSource,
  type BlockedEmail,
  type BlockedReason,
  EMAIL_SHAPE,
  type EmailRow,
  emailErrorText,
  emailRows,
} from "./account-emails";
import { SettingsSection } from "./layout";

type Feedback = { kind: "success" | "error"; text: string } | null;

/** Segundos que faltan hasta `until` (ms), con un tic por segundo. */
function countdown(until: () => number | null) {
  const now = createNow();
  return () => {
    const end = until();
    return end == null ? 0 : Math.max(0, Math.ceil((end - now()) / 1000));
  };
}

/**
 * Configuración → Cuenta de Danil → Correos, como en GitHub: el principal
 * marcado, agregar con un código de 6 dígitos, hacer principal y quitar. Los
 * errores se dicen dentro de la sección.
 */
export function EmailsSection(props: { source: AccountEmailsSource; onPrimaryChanged?: () => void }) {
  const [list, { refetch }] = createResource(() => props.source.list());
  const [feedback, setFeedback] = createSignal<Feedback>(null);
  const [adding, setAdding] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [draftError, setDraftError] = createSignal<string | null>(null);
  const [sending, setSending] = createSignal(false);
  const [codeFor, setCodeFor] = createSignal<string | null>(null);
  /** Cuándo se puede reenviar a cada dirección: el límite del servidor es por correo. */
  const [resendAt, setResendAt] = createSignal<Record<string, number>>({});
  /** Correos que el servidor rechazó en esta visita; el servidor los devuelve tras recargar. */
  const [blocked, setBlocked] = createSignal<BlockedEmail[]>([]);
  const waitUntil = (email: string, seconds: number) => setResendAt((m) => ({ ...m, [email]: Date.now() + seconds * 1000 }));
  let addWrap: HTMLDivElement | undefined;
  let draftInput: HTMLInputElement | undefined;

  // Leer un recurso con error lanza y se lleva el panel entero: solo se lee listo.
  const ready = () => list.state === "ready" || list.state === "refreshing";
  const loading = () => list.state === "pending" || list.state === "unresolved";
  const rows = () => {
    if (!ready()) return [];
    const base = list()!;
    const known = new Set((base.blocked ?? []).map((b) => b.email));
    return emailRows({ ...base, blocked: [...(base.blocked ?? []), ...blocked().filter((b) => !known.has(b.email))] });
  };
  const focusAdd = () => queueMicrotask(() => addWrap?.querySelector("button")?.focus());

  async function sendCode(email: string, fromDraft: boolean) {
    setSending(true);
    setFeedback(null);
    try {
      const sent = await props.source.requestCode(email);
      setAdding(false);
      setDraft("");
      setCodeFor(sent.email);
      waitUntil(sent.email, sent.resendAfter);
      setFeedback({ kind: "success", text: t("danil.emails.sent", { email: sent.email }) });
      void refetch();
    } catch (err) {
      if (err instanceof AccountEmailsError && err.resendAfter != null) waitUntil(email, err.resendAfter);
      if (fromDraft) setDraftError(emailErrorText(err, email));
      else setFeedback({ kind: "error", text: emailErrorText(err, email) });
    } finally {
      setSending(false);
    }
  }

  function submitDraft() {
    const email = draft().trim().toLowerCase();
    setFeedback(null);
    if (!EMAIL_SHAPE.test(email)) return setDraftError(t("danil.emails.error.invalid_email"));
    if (rows().some((r) => r.email === email && r.verified)) return setDraftError(t("danil.emails.error.already_verified"));
    setDraftError(null);
    void sendCode(email, true);
  }

  function keepBlocked(email: string, reason: BlockedReason) {
    setBlocked((rows) => (rows.some((r) => r.email === email) ? rows : [...rows, { email, reason }]));
  }

  async function changed(kind: "verified" | "primary" | "removed" | "gone" | "merged", email?: string) {
    if (kind === "merged" && email) setBlocked((rows) => rows.filter((r) => r.email !== email));
    await refetch();
    // El principal es el correo de la persona: la identidad y el pie lo vuelven a leer.
    if (kind === "primary" || kind === "merged") props.onPrimaryChanged?.();
    if (kind === "verified" || kind === "gone" || kind === "merged") setCodeFor(null);
    if (kind === "removed" || kind === "verified" || kind === "gone" || kind === "merged") focusAdd();
    // Los workspaces de la otra cuenta entran al directorio sin recargar la ventana.
    if (kind === "merged") window.dispatchEvent(new CustomEvent("harness:account-merged"));
  }

  return (
    <SettingsSection title={t("danil.emails.title")} description={t("danil.emails.description")} data-account-emails="">
      <Switch>
        <Match when={loading()}>
          <div class="py-3.5">
            <Skeleton class="h-10" filas={3} />
          </div>
        </Match>
        <Match when={list.state === "errored"}>
          <div class="flex items-center gap-3 border-b border-border py-3.5">
            <p class="m-0 flex-1 text-ui text-neutral-950">{t("danil.emails.load_failed")}</p>
            <Button size="sm" variant="secondary" onClick={() => void refetch()}>
              {t("danil.emails.retry")}
            </Button>
          </div>
        </Match>
        <Match when={ready() && rows().length === 0}>
          <p class="m-0 border-b border-border py-3.5 text-ui text-neutral-500">{t("danil.emails.empty")}</p>
        </Match>
        <Match when={rows().length > 0}>
          <ul class="m-0 grid list-none p-0">
            <For each={rows()}>
              {(row) => (
                <li>
                  <EmailItem
                    row={row}
                    source={props.source}
                    codeOpen={codeFor() === row.email}
                    resendAt={resendAt()[row.email] ?? null}
                    onOpenCode={() => {
                      setFeedback(null);
                      setCodeFor(row.email);
                      if (row.resendAfter && resendAt()[row.email] == null) waitUntil(row.email, row.resendAfter);
                    }}
                    onCloseCode={() => setCodeFor(null)}
                    onResend={() => void sendCode(row.email, false)}
                    resending={sending()}
                    onResult={setFeedback}
                    onBlocked={keepBlocked}
                    onChanged={changed}
                  />
                </li>
              )}
            </For>
          </ul>
        </Match>
      </Switch>

      <Show when={rows().some((r) => r.primary)}>
        <p class="m-0 pt-2 text-xs text-neutral-500">{t("danil.emails.primary_locked")}</p>
      </Show>

      <Show
        when={adding()}
        fallback={
          <div ref={addWrap} class="pt-3">
            <Button
              size="sm"
              variant="secondary"
              disabled={loading()}
              onClick={() => {
                setFeedback(null);
                setAdding(true);
                queueMicrotask(() => draftInput?.focus());
              }}
            >
              <Plus size={14} />
              {t("danil.emails.add")}
            </Button>
          </div>
        }
      >
        <form
          noValidate
          class="mt-3 grid max-w-md gap-2 rounded-md border border-border bg-surface-muted p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitDraft();
          }}
        >
          <label class="grid gap-1.5 text-ui text-neutral-500">
            {t("danil.emails.new_label")}
            <Input
              ref={draftInput}
              type="email"
              value={draft()}
              onInput={(e) => {
                setDraft(e.currentTarget.value);
                setDraftError(null);
              }}
              placeholder={t("danil.emails.new_placeholder")}
              autocomplete="email"
              aria-invalid={draftError() ? true : undefined}
              aria-describedby={draftError() ? "account-email-draft-error" : "account-email-draft-hint"}
              disabled={sending()}
              data-account-email-draft=""
            />
          </label>
          <Show
            when={draftError()}
            fallback={
              <p id="account-email-draft-hint" class="m-0 text-xs text-neutral-500">
                {t("danil.emails.add_hint")}
              </p>
            }
          >
            {(text) => (
              <p id="account-email-draft-error" role="alert" class="m-0 text-ui text-neutral-950">
                {text()}
              </p>
            )}
          </Show>
          <div class="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={sending() || !draft().trim()}>
              {sending() ? t("danil.emails.sending") : t("danil.emails.send_code")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setDraft("");
                setDraftError(null);
                focusAdd();
              }}
            >
              {t("danil.emails.cancel")}
            </Button>
          </div>
        </form>
      </Show>

      <Show when={feedback()}>
        {(f) => (
          <p
            role={f().kind === "success" ? "status" : "alert"}
            class="m-0 pt-3 text-ui text-neutral-950"
            data-account-emails-feedback={f().kind}
          >
            {f().text}
          </p>
        )}
      </Show>
    </SettingsSection>
  );
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
  onBlocked: (email: string, reason: BlockedReason) => void;
  onChanged: (kind: "verified" | "primary" | "removed" | "gone" | "merged", email?: string) => Promise<void>;
};

function EmailItem(props: ItemProps) {
  const [confirming, setConfirming] = createSignal<"primary" | "remove" | null>(null);
  const [merging, setMerging] = createSignal(false);
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
    props.row.blocked === "in_use"
      ? t("danil.emails.blocked_in_use", { email: email() })
      : props.row.blocked === "needs_support"
        ? t("danil.emails.blocked_needs_support", { email: email() })
        : props.row.primary
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
            <Show when={props.row.blocked === "in_use"}>
              <Badge tone="warning">{t("danil.emails.blocked_badge_in_use")}</Badge>
            </Show>
            <Show when={props.row.blocked === "needs_support"}>
              <Badge tone="warning">{t("danil.emails.blocked_badge_needs_support")}</Badge>
            </Show>
            <Show when={!props.row.verified && !props.row.blocked}>
              <Badge tone="warning">{t("danil.emails.unconfirmed")}</Badge>
            </Show>
          </div>
          <div class="min-w-0 truncate text-ui text-neutral-500">{subtitle()}</div>
        </div>
        <Show when={props.row.blocked}>
          <Show when={!merging()}>
            <div class="flex shrink-0 items-center gap-1">
              <Show when={props.row.blocked === "in_use"}>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={t("danil.emails.merge_label", { email: email() })}
                  data-email-action=""
                  onClick={() => {
                    props.onResult(null);
                    setMerging(true);
                  }}
                >
                  {t("danil.emails.merge")}
                </Button>
              </Show>
            </div>
          </Show>
        </Show>
        <Show when={!props.row.blocked && !props.row.primary && !confirming()}>
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

      <Show when={merging() && props.row.blocked === "in_use"}>
        <MergePanel
          email={email()}
          source={props.source}
          onResult={props.onResult}
          onMerged={async () => {
            setMerging(false);
            await props.onChanged("merged", email());
          }}
          onClose={() => {
            setMerging(false);
            focusIn("[data-email-action]");
          }}
        />
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
          onBlocked={props.onBlocked}
          onChanged={props.onChanged}
        />
      </Show>
    </div>
  );
}

/** Qué se une antes de unir: correos, accesos, membresías y lo que lo impide. */
function MergePanel(props: {
  email: string;
  source: AccountEmailsSource;
  onResult: (f: Feedback) => void;
  onMerged: () => Promise<void>;
  onClose: () => void;
}) {
  const [preview] = createResource(() => props.source.previewMerge(props.email));
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await props.source.mergePerson(props.email);
      props.onResult({ kind: "success", text: t("danil.emails.merge_done", { email: props.email }) });
      await props.onMerged();
    } catch (err) {
      setError(emailErrorText(err, props.email));
    } finally {
      setBusy(false);
    }
  }

  // Leer el recurso con error lanza: el error tiene su propio aviso.
  const previewValue = () => (preview.error ? undefined : preview());
  const blockers = () => previewValue()?.blockers ?? [];

  return (
    <div class="grid gap-2 rounded-md border border-border bg-surface-muted p-3" data-email-merge="">
      <p class="m-0 text-ui font-semibold text-neutral-950">{t("danil.emails.merge_title")}</p>
      <p class="m-0 text-ui text-neutral-500">{t("danil.emails.merge_explain", { email: props.email })}</p>
      <Switch>
        <Match when={preview.loading}>
          <p role="status" class="m-0 text-ui text-neutral-500">{t("danil.emails.merge_checking")}</p>
        </Match>
        <Match when={previewValue() === null}>
          <p class="m-0 text-ui text-neutral-950">{t("danil.emails.merge_unavailable")}</p>
        </Match>
        <Match when={preview.error}>
          <p role="alert" class="m-0 text-ui text-neutral-950">{t("danil.emails.error.merge_failed")}</p>
        </Match>
        <Match when={previewValue()}>
          {(p) => (
            <>
              <dl class="m-0 grid gap-1 text-ui" data-email-merge-preview="">
                <div class="flex min-w-0 gap-2">
                  <dt class="w-24 shrink-0 text-neutral-500">{t("danil.emails.merge_emails")}</dt>
                  <dd class="m-0 min-w-0 break-words">{p().emails.join(", ") || t("danil.emails.merge_none")}</dd>
                </div>
                <div class="flex min-w-0 gap-2">
                  <dt class="w-24 shrink-0 text-neutral-500">{t("danil.emails.merge_logins")}</dt>
                  <dd class="m-0 min-w-0 break-words">{p().logins.join(", ") || t("danil.emails.merge_none")}</dd>
                </div>
                <div class="flex min-w-0 gap-2">
                  <dt class="w-24 shrink-0 text-neutral-500">{t("danil.emails.merge_memberships")}</dt>
                  <dd class="m-0 min-w-0 break-words">
                    {p()
                      .memberships.map((m) => t("danil.emails.merge_membership", { account: m.account, role: m.role }))
                      .join(" · ") || t("danil.emails.merge_none")}
                  </dd>
                </div>
              </dl>
              <Show when={blockers().length > 0}>
                <div class="grid gap-1 rounded-md border border-warning-strong/40 p-2" data-email-merge-blocked="">
                  <p class="m-0 text-ui font-semibold text-warning-strong">{t("danil.emails.merge_blockers")}</p>
                  <ul class="m-0 grid list-disc gap-1 pl-5 text-ui text-neutral-950">
                    <For each={blockers()}>{(blocker) => <li>{blocker}</li>}</For>
                  </ul>
                </div>
              </Show>
            </>
          )}
        </Match>
      </Switch>
      <Show when={error()}>
        {(text) => (
          <p role="alert" class="m-0 text-ui text-neutral-950">
            {text()}
          </p>
        )}
      </Show>
      <div class="flex flex-wrap items-center gap-2">
        <Show when={previewValue() && blockers().length === 0}>
          <Button size="sm" variant="danger" disabled={busy()} onClick={() => void run()} data-email-merge-confirm="">
            {busy() ? t("danil.emails.merge_working") : t("danil.emails.merge_confirm")}
          </Button>
        </Show>
        <Button size="sm" variant="ghost" onClick={props.onClose}>
          {t("danil.emails.cancel")}
        </Button>
      </div>
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
  onBlocked: (email: string, reason: BlockedReason) => void;
  onChanged: (kind: "verified" | "gone", email?: string) => Promise<void>;
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
        props.onBlocked(props.email, reason === "email_in_use" ? "in_use" : "needs_support");
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
