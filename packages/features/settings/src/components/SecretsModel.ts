import { type Credential, type CredentialMachine, sealRecipientsFor } from "@terminus/computers";
import { unknownCommand } from "../../../../ui/src/lib/errorCode.ts";
import { df } from "../../../../../apps/desktop/src/lib/format";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { envSecretsList } from "../queries/engine-secrets";
import { capabilities } from "../../../../host/src/platform";
import { type Failure } from "../../../../ui/src/Failure";
import { credentialsBackend, credentialsView, failureOf } from "../queries/credentials-store";
import type { MaquinasDeAjustes } from "../model/machines-port";
import { secretsRoute } from "../model/secrets-support";

export const NAME_PROBLEM = {
  empty: () => t("danil.secrets.name_empty"),
  grammar: () => t("danil.secrets.name_grammar"),
  reserved: (name: string) => t("danil.secrets.name_reserved", { name }),
} as const;

export const openSettings = (panel: string) => window.dispatchEvent(new CustomEvent("harness:open-settings", { detail: panel }));

/** En la web: si ninguna máquina anuncia `secrets_v1` no hay para quién sellar, y un secreto sin copias no se crea. */
export function noSecretRecipients(): boolean {
  if (viaEngine()) return false;
  const v = credentialsView();
  return v.kind === "ready" && sealRecipientsFor("env_secret", v.listing.recipients).filter((r) => r.public_key).length === 0;
}

/** Lo que el motor de esta máquina tiene en su bóveda (`env_secrets_list`), sin valores. */
type EngineSecret = { slot: string; folder: string; name: string; hint: string | null; in_account: boolean };

export type EngineSecrets = { kind: "ready"; secrets: EngineSecret[] } | { kind: "unsupported" } | { kind: "failed"; failure: Failure };

/** Un secreto en pantalla: el de esta máquina, el de la cuenta, o los dos con el mismo slot. */
export type SecretRow = { slot: string; folder: string | null; name: string; hint: string | null; local: boolean; credential: Credential | null };

export const machineLabel = (m: Pick<CredentialMachine, "computer_id" | "name">) => m.name?.trim() || capabilities().machineName?.(m.computer_id) || m.computer_id;

export const viaEngine = () => credentialsBackend().where === "engine";

export const routeOf = ({ machines }: MaquinasDeAjustes) => secretsRoute(credentialsBackend().where, machines());

/** Lo que se escribe en el nombre: mayúsculas, y espacio o guion como `_`. */
export const normalizeSecretName = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, "_");

export function updatedOf(row: SecretRow): string | null {
  const at = row.credential?.updated_at ?? row.credential?.created_at;
  const date = at ? new Date(at) : null;
  return date && !Number.isNaN(date.getTime()) ? df({ dateStyle: "medium" }).format(date) : null;
}

export async function readEngineSecrets(): Promise<EngineSecrets> {
  try {
    const answer = await envSecretsList<{ secrets?: EngineSecret[] } | null>();
    return { kind: "ready", secrets: Array.isArray(answer?.secrets) ? answer.secrets : [] };
  } catch (e) {
    return unknownCommand(e) ? { kind: "unsupported" } : { kind: "failed", failure: failureOf(e) };
  }
}
