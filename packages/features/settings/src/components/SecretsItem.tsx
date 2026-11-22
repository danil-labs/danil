import { credentialMachines } from "@terminus/computers";
import { createMemo, createSignal, For, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { envSecretRemove } from "../queries/engine-secrets";
import { capabilities } from "../../../../host/src/platform";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { type Failure, FailureNote } from "../../../../ui/src/Failure";
import { CredentialMachines } from "./AccountCredentials";
import { act, failureOf } from "../queries/credentials-store";
import { SettingsBlock } from "../../../../ui/src/SettingsLayout";
import { type SecretRow, viaEngine, updatedOf, machineLabel, openSettings } from "./SecretsModel";

/** Una fila: nombre en mono, los últimos 4, fecha, Cambiar y Borrar, y sus máquinas. */
export function SecretItem(props: { row: SecretRow; overrides: boolean; onChange: () => void; onChanged: () => void }) {
  const [deleting, setDeleting] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const unsupported = createMemo(() => (props.row.credential ? credentialMachines(props.row.credential).filter((m) => m.state === "unsupported") : []));
  const pending = () => !!props.row.credential?.machines.some((m) => m.state === "pending");
  let cancelButton: HTMLButtonElement | undefined;

  async function remove() {
    setBusy(true);
    setFailure(null);
    let f: Failure | null = null;
    if (viaEngine() && props.row.local) {
      try {
        await envSecretRemove({ folder: props.row.folder ?? "*", name: props.row.name });
      } catch (e) {
        f = failureOf(e);
      }
    }
    const credential = props.row.credential;
    if (!f && credential) f = await act((b, ws) => b.remove(ws, credential.id));
    setBusy(false);
    setFailure(f);
    if (!f) setDeleting(false);
    props.onChanged();
  }

  return (
    <SettingsBlock data-secret={props.row.slot}>
      <div class="flex min-w-0 items-center gap-2">
        <span class="min-w-0 truncate font-mono text-ui text-neutral-950">{props.row.name}</span>
        <Show when={props.row.hint}>{(hint) => <Badge forma="dato">{`••••${hint()}`}</Badge>}</Show>
        <span class="flex-1" />
        <Button variant="ghost" size="compact" onClick={() => props.onChange()}>
          {t("danil.secrets.change")}
        </Button>
        <Button
          variant="ghost"
          size="compact"
          class="hover:text-error-strong"
          onClick={() => {
            setDeleting(true);
            queueMicrotask(() => cancelButton?.focus());
          }}
        >
          {t("danil.secrets.delete")}
        </Button>
      </div>
      <Show when={updatedOf(props.row)}>{(at) => <p class="m-0 text-xs text-neutral-500">{t("danil.secrets.updated", { date: at() })}</p>}</Show>
      <Show when={props.overrides}>
        <p class="m-0 text-xs text-neutral-500">{t("danil.secrets.overrides")}</p>
      </Show>
      <Show when={deleting()}>
        <div class="grid gap-2 rounded-md border border-border bg-surface-muted px-3 py-2" data-delete-warning="">
          <p class="m-0 text-xs text-neutral-950">{props.row.credential ? t("danil.secrets.delete_warning") : t("danil.secrets.delete_warning_local")}</p>
          <div class="flex justify-end gap-2">
            <Button ref={cancelButton} variant="outline" size="compact" disabled={busy()} onClick={() => setDeleting(false)}>
              {t("danil.credentials.cancel")}
            </Button>
            <Button variant="danger" size="compact" disabled={busy()} onClick={() => void remove()}>
              {t("danil.secrets.delete_yes")}
            </Button>
          </div>
        </div>
      </Show>
      <Show when={failure()}>{(f) => <FailureNote f={f()} />}</Show>
      <Show when={props.row.credential}>{(c) => <CredentialMachines credential={c()} />}</Show>
      <Show when={pending()}>
        <p class="m-0 text-xs text-neutral-500" data-secret-pending-help="">{t("danil.secrets.pending_help")}</p>
      </Show>
      <For each={unsupported()}>
        {(m) => (
          <p class="m-0 text-xs text-neutral-500" data-secret-unsupported-help={m.computer_id}>
            {t("danil.secrets.unsupported_help", { machine: machineLabel(m) })}
          </p>
        )}
      </For>
    </SettingsBlock>
  );
}

/** «Solo en esta máquina»: el workspace no está en una cuenta de Danil. */
export function ModeLine() {
  return (
    <div class="flex items-center gap-2 py-2" data-secrets-mode="no_session">
      <Badge>{t("danil.secrets.mode_local")}</Badge>
      <p class="m-0 min-w-0 flex-1 text-xs text-neutral-500">{t("danil.secrets.mode_no_session")}</p>
      <Show when={capabilities().danilAccount || capabilities().accountProfile}>
        <Button variant="ghost" size="compact" onClick={() => openSettings("cuenta-danil")}>
          {t("danil.secrets.sign_in")}
        </Button>
      </Show>
    </div>
  );
}
