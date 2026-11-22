import { credentialSlot, envSecretNameProblem } from "@terminus/computers";
import { createSignal, For, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { envSecretSet } from "../queries/engine-secrets";
import type { Project } from "../../../../../apps/desktop/src/lib/model";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { type Failure, FailureNote } from "../../../../ui/src/Failure";
import { Input } from "../../../../ui/src/Input";
import { Select } from "../../../../ui/src/Select";
import { Spinner } from "../../../../ui/src/Spinner";
import { act, credentialsView, failureOf } from "../queries/credentials-store";
import type { MaquinasDeAjustes } from "../model/machines-port";
import { type SecretRow, routeOf, noSecretRecipients, viaEngine, normalizeSecretName, NAME_PROBLEM, openSettings, updatedOf } from "./SecretsModel";

/**
 * Añadir o cambiar. En la ventana va al motor; en la web se sella aquí para cada
 * máquina con `secrets_v1`. Con un nombre que ya existe, solo «Reemplazar» lo pisa.
 */
export function SecretDialog(props: { rows: SecretRow[]; folders: Project[]; initial: { name: string; folder: string | null } | null; onClose: () => void; onSaved: () => void; maquinas: MaquinasDeAjustes }) {
  const route = () => routeOf(props.maquinas);
  const [name, setName] = createSignal(props.initial?.name ?? "");
  const [value, setValue] = createSignal("");
  const [folder, setFolder] = createSignal<string | null>(props.initial?.folder ?? null);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const problem = () => (name() ? envSecretNameProblem(name()) : null);
  const slot = () => credentialSlot.envSecret(folder(), name());
  const existing = () => props.rows.find((r) => r.slot === slot());
  const valid = () => route() !== "unsupported" && !!value() && !envSecretNameProblem(name()) && !noSecretRecipients();

  async function save(e: Event) {
    e.preventDefault();
    if (busy() || !valid()) return;
    setBusy(true);
    setFailure(null);
    const v = value();
    let f: Failure | null = null;
    if (viaEngine()) {
      try {
        await envSecretSet({ folder: folder() ?? "*", name: name(), value: v, replace: !!existing() });
      } catch (err) {
        f = failureOf(err);
      }
    } else {
      f = await act(async (b, ws) => {
        const now = credentialsView();
        if (now.kind !== "ready" || !b.create) return;
        await b.create(ws, { kind: "env_secret", provider: "env", slot: slot(), label: name(), config: { name: name(), folder: folder() } }, v, now.listing);
      });
    }
    setBusy(false);
    setFailure(f);
    if (!f) {
      setValue("");
      props.onSaved();
      props.onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy() && props.onClose()}>
      <DialogContent class="w-[min(460px,100%)] max-w-[460px] p-4" aria-label={props.initial ? t("danil.secrets.change_title") : t("danil.secrets.add_title")}>
        <form class="grid gap-3" onSubmit={(e) => void save(e)} data-secret-add="">
          <DialogTitle>{props.initial ? t("danil.secrets.change_title") : t("danil.secrets.add_title")}</DialogTitle>
          <div class="grid gap-1">
            <label for="secret-name" class="text-xs font-semibold">
              {t("danil.secrets.name")}
            </label>
            <Input
              id="secret-name"
              class="font-mono"
              autocomplete="off"
              spellcheck={false}
              autofocus={!props.initial}
              disabled={busy() || !!props.initial}
              placeholder={t("danil.secrets.name_placeholder")}
              aria-invalid={!!problem()}
              aria-describedby={problem() ? "secret-name-problem" : undefined}
              value={name()}
              onInput={(e) => setName(normalizeSecretName(e.currentTarget.value))}
            />
            <Show when={problem()}>
              {(p) => (
                <div id="secret-name-problem" class="flex flex-wrap items-center gap-x-2 text-xs text-error-strong" data-secret-name-problem={p()}>
                  <span>{NAME_PROBLEM[p()](name())}</span>
                  <Show when={p() === "reserved"}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="compact"
                      onClick={() => {
                        props.onClose();
                        openSettings("proveedores-ia");
                      }}
                    >
                      {t("danil.secrets.go_ai_providers")}
                    </Button>
                  </Show>
                </div>
              )}
            </Show>
            <Show when={!problem() && existing()}>
              {(r) => (
                <p class="m-0 text-xs text-warning-strong" data-secret-exists="">
                  {t("danil.secrets.exists", { name: name(), hint: r().hint ? `••••${r().hint}` : "••••", date: updatedOf(r()) ?? "—" })}
                </p>
              )}
            </Show>
          </div>
          <div class="grid gap-1">
            <label for="secret-value" class="text-xs font-semibold">
              {t("danil.secrets.value")}
            </label>
            <Input
              id="secret-value"
              type="password"
              autocomplete="off"
              spellcheck={false}
              autocapitalize="off"
              autofocus={!!props.initial}
              disabled={busy()}
              placeholder={t("danil.secrets.value_placeholder")}
              value={value()}
              onInput={(e) => setValue(e.currentTarget.value)}
            />
          </div>
          <div class="grid gap-1">
            <label for="secret-scope" class="text-xs font-semibold">
              {t("danil.secrets.scope")}
            </label>
            <Select
              id="secret-scope"
              disabled={busy() || !!props.initial}
              value={folder() ?? "*"}
              onChange={(e) => setFolder(e.currentTarget.value === "*" ? null : e.currentTarget.value)}
            >
              <option value="*">{t("danil.secrets.scope_workspace")}</option>
              <For each={props.folders}>{(p) => <option value={p.id}>{t("danil.secrets.scope_folder", { folder: p.name })}</option>}</For>
            </Select>
            <p class="m-0 text-xs text-neutral-500">{t("danil.secrets.scope_help")}</p>
          </div>
          <p class="m-0 border-t border-border pt-3 text-xs text-neutral-500">{t("danil.secrets.add_help")}</p>
          <Show when={noSecretRecipients()}>
            <p class="m-0 text-xs text-warning-strong" data-secret-no-recipients="">
              {t("danil.secrets.no_recipients")}
            </p>
          </Show>
          <Show when={failure()}>{(f) => <FailureNote f={f()} />}</Show>
          <div class="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy()} onClick={props.onClose}>
              {t("danil.credentials.cancel")}
            </Button>
            <Button type="submit" disabled={busy() || !valid()}>
              <Show when={busy()} fallback={existing() ? t("danil.secrets.replace") : t("danil.secrets.save")}>
                <Spinner size={12} />
                {t("danil.secrets.saving")}
              </Show>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
