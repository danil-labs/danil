import Plus from "lucide-solid/icons/plus";
import { createResource, createSignal, For, Match, Show, Switch } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { Skeleton } from "../../../../ui/src/Skeleton";
import { AccountEmailsError, type AccountEmailsSource, EMAIL_SHAPE, emailErrorText, emailRows } from "../model/account-emails";
import { SettingsSection } from "../../../../ui/src/SettingsLayout";
import { type Feedback, EmailItem } from "./EmailsSectionItem";

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
  const waitUntil = (email: string, seconds: number) => setResendAt((m) => ({ ...m, [email]: Date.now() + seconds * 1000 }));
  let addWrap: HTMLDivElement | undefined;
  let draftInput: HTMLInputElement | undefined;

  // Leer un recurso con error lanza y se lleva el panel entero: solo se lee listo.
  const ready = () => list.state === "ready" || list.state === "refreshing";
  const loading = () => list.state === "pending" || list.state === "unresolved";
  const rows = () => (ready() ? emailRows(list()!) : []);
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

  async function changed(kind: "verified" | "primary" | "removed" | "gone") {
    await refetch();
    // El principal es el correo de la persona: la identidad y el pie lo vuelven a leer.
    if (kind === "primary") props.onPrimaryChanged?.();
    if (kind === "verified" || kind === "gone") setCodeFor(null);
    if (kind === "removed" || kind === "verified" || kind === "gone") focusAdd();
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
