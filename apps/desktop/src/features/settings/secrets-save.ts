/**
 * Guardar un `env_secret` por el único camino permitido: en la ventana, el motor
 * (`env_secret_set`, nunca por el relay); en la web, sellado en el navegador.
 * Lo usan Configuración › Secretos y el pegado protegido del chat.
 */
import "../../locales/danilPhrases";
import { credentialSlot, sealRecipientsFor } from "@terminus/computers";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import type { Failure } from "../../ui/Failure";
import { act, credentialsBackend, credentialsView, failureOf, reloadCredentials } from "./credentials/store";

export type EnvSecretWrite = { folder: string | null; name: string; value: string; replace: boolean };

export const savesViaEngine = () => credentialsBackend().where === "engine";

/** En la web: si ninguna máquina anuncia `secrets_v1` no hay para quién sellar, y un secreto sin copias no se crea. */
export function noSecretRecipients(): boolean {
  if (savesViaEngine()) return false;
  const v = credentialsView();
  return v.kind === "ready" && sealRecipientsFor("env_secret", v.listing.recipients).filter((r) => r.public_key).length === 0;
}

export async function saveEnvSecret(write: EnvSecretWrite): Promise<Failure | null> {
  const { folder, name, value, replace } = write;
  if (savesViaEngine()) {
    try {
      await invoke("env_secret_set", { folder: folder ?? "*", name, value, replace });
      return null;
    } catch (err) {
      return failureOf(err);
    }
  }
  if (credentialsView().kind !== "ready") await reloadCredentials(false);
  const listed = credentialsView();
  if (listed.kind === "failed") return listed.failure;
  if (listed.kind !== "ready" || !credentialsBackend().create) return { what: t("danil.secrets.no_recipients"), detail: "secrets_unavailable" };
  if (noSecretRecipients()) return { what: t("danil.secrets.no_recipients"), detail: "no_recipients" };
  const slot = credentialSlot.envSecret(folder, name);
  return act(async (b, ws) => {
    const now = credentialsView();
    if (now.kind !== "ready" || !b.create) return;
    await b.create(ws, { kind: "env_secret", provider: "env", slot, label: name, config: { name, folder } }, value, now.listing);
  });
}

/** Si ya hay un secreto con ese nombre en ese alcance; ante la duda, no (guardar sin `replace` lo dice el motor). */
export async function envSecretExists(folder: string | null, name: string): Promise<boolean> {
  const slot = credentialSlot.envSecret(folder, name);
  try {
    if (savesViaEngine()) {
      const answer = await invoke<{ secrets?: { slot: string }[] } | null>("env_secrets_list");
      return !!answer?.secrets?.some((s) => s.slot === slot);
    }
    if (credentialsView().kind !== "ready") await reloadCredentials(false);
    const v = credentialsView();
    return v.kind === "ready" && v.listing.credentials.some((c) => c.kind === "env_secret" && c.slot === slot);
  } catch {
    return false;
  }
}
