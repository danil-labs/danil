import "../../locales/secretPhrases";
import Check from "lucide-solid/icons/check";
import { createSignal, Match, onMount, Show, Switch } from "solid-js";
import { unknownCommand } from "../../lib/errorCode.ts";
import { t } from "../../lib/i18n";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { type Failure, prosaDe } from "../../ui/Failure";
import { Input } from "../../ui/Input";
import { Spinner } from "../../ui/Spinner";
import { answerSecretRequest, readSecretRequests, type SecretRequest, syncSealedCopy } from "./secretRequests";

const codeOf = (f: Failure): string => {
  const detail = f.detail as unknown;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && typeof (detail as { code?: unknown }).code === "string") return (detail as { code: string }).code;
  const clave = (f.what as { clave?: unknown } | null)?.clave;
  return typeof clave === "string" ? (clave.split(".").pop() ?? "") : "";
};

/** El error de una línea; el detalle va en `title`. */
function requestErrorText(f: Failure): string {
  const code = codeOf(f);
  if (code.includes("env_secret_reserved")) return t("chat.secret.error.reserved");
  if (code.includes("env_secret_invalid_name")) return t("chat.secret.error.grammar");
  if (code.includes("env_secret_invalid_folder")) return t("chat.secret.error.folder");
  if (code === "secret_request_limit") return t("chat.secret.error.limit");
  if (code === "secret_request_unknown") return t("chat.secret.error.unknown");
  if (code === "secret_request_timeout") return t("chat.secret.error.timeout");
  if (code === "secret_request_unsupported" || unknownCommand(f)) return t("chat.secret.error.engine");
  if (code === "no_recipients" || code === "secrets_unavailable") return t("chat.secret.error.no_machine");
  return t("chat.secret.error.failed");
}

/**
 * Guardar va por el camino de Secretos y solo después se contesta `saved`; el valor
 * nunca entra en `secret_request_answer` ni en el chat.
 */
export function SecretRequestCard(props: { request: SecretRequest; conversation: string; machine?: string }) {
  let field: HTMLInputElement | undefined;
  const [busy, setBusy] = createSignal<"save" | "decline" | null>(null);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const [exists, setExists] = createSignal(false);
  const [filled, setFilled] = createSignal(false);
  const folder = () => (props.request.folder === "*" ? null : props.request.folder);

  onMount(() => {
    void import("../settings/secrets-save").then((m) => m.envSecretExists(folder(), props.request.name)).then(setExists);
  });

  async function fail(e: unknown) {
    const f = e && typeof e === "object" && "what" in e ? (e as Failure) : { what: t("chat.secret.error.failed"), detail: String(e) };
    setFailure(f);
    if (codeOf(f) === "secret_request_unknown") await readSecretRequests(props.conversation, props.machine);
  }

  async function save() {
    const value = field?.value ?? "";
    if (!value || busy()) return;
    setBusy("save");
    setFailure(null);
    try {
      const { saveEnvSecret, savesViaEngine } = await import("../settings/secrets-save");
      const saved = await saveEnvSecret({ folder: folder(), name: props.request.name, value, replace: exists() || props.request.replace });
      if (saved) return void setFailure(saved);
      if (field) field.value = "";
      setFilled(false);
      if (!savesViaEngine()) await syncSealedCopy(props.request.workspace, props.machine);
      await answerSecretRequest(props.request, "saved", props.machine);
    } catch (e) {
      await fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    if (busy()) return;
    setBusy("decline");
    setFailure(null);
    try {
      await answerSecretRequest(props.request, "declined", props.machine);
    } catch (e) {
      await fail(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article class="col-start-1 grid min-w-0 overflow-hidden rounded-lg border border-border bg-surface-raised" data-secret-request={props.request.request_id} aria-busy={!!busy()}>
      <header class="flex h-[34px] min-w-0 items-center gap-2 bg-surface-muted px-3">
        <span class="shrink-0 text-xs font-medium text-neutral-700">{t("chat.secret.request.title")}</span>
        <span class="min-w-0 truncate font-mono text-xs font-medium text-neutral-950">{props.request.name}</span>
        <span class="flex-1" />
        <Switch>
          <Match when={props.request.state === "saved"}>
            <Badge tone="success" data-secret-request-state="saved">
              <Check size={12} aria-hidden="true" />
              {t("chat.secret.request.saved")}
            </Badge>
          </Match>
          <Match when={props.request.state === "declined"}>
            <Badge tone="neutral" data-secret-request-state="declined">{t("chat.secret.request.declined")}</Badge>
          </Match>
          <Match when={props.request.state === "expired"}>
            <Badge tone="neutral" data-secret-request-state="expired">{t("chat.secret.request.expired")}</Badge>
          </Match>
        </Switch>
      </header>
      <div class="grid gap-2 px-3 py-2.5">
        <Show when={props.request.reason.trim()}>
          <p class="m-0 border-l-2 border-border-strong pl-2.5 text-ui leading-[1.45] break-words whitespace-pre-wrap text-neutral-700" data-secret-request-reason="" data-author={props.request.reason_author ?? "agent"}>
            <span class="sr-only">{t("chat.secret.request.reason_author")}</span>
            {props.request.reason}
          </p>
        </Show>
        <Show when={props.request.state === "open"}>
          <form
            class="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Input
              ref={field}
              type="password"
              autocomplete="off"
              spellcheck={false}
              class="min-h-7 min-w-0 flex-1 basis-[220px] font-mono text-label"
              aria-label={t("chat.secret.request.value_label", { name: props.request.name })}
              disabled={!!busy()}
              onInput={(e) => setFilled(!!e.currentTarget.value)}
            />
            <Show when={failure()}>
              {(f) => (
                <span role="alert" class="min-w-0 truncate text-caption text-error-strong" title={prosaDe(f())} data-secret-request-error="">
                  {requestErrorText(f())}
                </span>
              )}
            </Show>
            <span class="ml-auto flex items-center gap-2">
              <Button type="button" variant="ghost" size="compact" disabled={!!busy()} onClick={() => void decline()} data-secret-request-decline="">
                {t("chat.secret.request.decline")}
              </Button>
              <Button type="submit" variant="primary" size="compact" disabled={!filled() || !!busy()} data-secret-request-save="">
                <Show when={busy() === "save"} fallback={exists() || props.request.replace ? t("chat.secret.paste.replace") : t("chat.secret.request.save")}>
                  <Spinner size={12} />
                  {t("chat.secret.paste.saving")}
                </Show>
              </Button>
            </span>
          </form>
        </Show>
      </div>
    </article>
  );
}

export default SecretRequestCard;
