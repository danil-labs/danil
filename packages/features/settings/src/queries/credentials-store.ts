/**
 * Las credenciales del workspace abierto en la cuenta de Danil, una sola vez
 * para toda la hoja de Configuración: Cuentas, MCP y Referencias pintan lo
 * mismo y una acción en una se ve en las otras.
 *
 * - La web va al Worker con la sesión de la persona (`capabilities().accountCredentials`)
 *   y sella en el navegador.
 * - La ventana pasa por el motor (`account_credentials_*`); el router lo manda a
 *   la máquina que atiende el workspace (`features/machines/router.ts`).
 */
import {
  type Credential,
  type CredentialAnswer,
  type CredentialPut,
  type CredentialsListing,
  type CredentialSource,
  credentialHint,
  credentialMachines,
  credentialsListingOf,
  deleteCredential,
  listCredentials,
  putCredential,
  removeCredentialMachine,
  restoreCredentialMachine,
  sealRecipientsFor,
} from "../../../../platform-client/src/account-credentials.ts";
import { canSeal, sealForRecipients } from "../../../../platform-client/src/seal.ts";
export { credentialMachines };
import { createRoot, createSignal } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { invoke } from "../../../../engine-client/src/client.ts";
import { capabilities } from "../../../../host/src/platform";
import { detalleDe, type Failure } from "../../../../ui/src/Failure";
import type { Startup } from "./workspaces-store";

type CredentialsView =
  | { kind: "loading" }
  /** El workspace no está en una cuenta de Danil, o el motor o el Worker no saben de credenciales. */
  | { kind: "none" }
  | { kind: "failed"; failure: Failure }
  | { kind: "ready"; workspace: string; listing: CredentialsListing };

export type CredentialsBackend = {
  where: "engine" | "worker";
  list(workspace: string): Promise<CredentialsListing | null>;
  remove(workspace: string, credential: string): Promise<void>;
  removeMachine(workspace: string, credential: string, computer: string): Promise<void>;
  restoreMachine(workspace: string, credential: string, computer: string): Promise<void>;
  /** Solo el motor: sube a la cuenta claves de su bóveda. */
  upload?(workspace: string, slots: string[]): Promise<void>;
  /** Solo la web: cambia el valor sellándolo en el navegador para cada máquina. */
  rotate?(workspace: string, credential: Credential, value: string, listing: CredentialsListing): Promise<void>;
  /** Solo la web: crea una credencial sellándola aquí; el valor no viaja en claro. */
  create?(workspace: string, put: SealedDraft, value: string, listing: CredentialsListing): Promise<void>;
};

/** Una credencial por crear o rotar, sin el valor ni sus copias. */
type SealedDraft = Omit<CredentialPut, "hint" | "copies">;

/** Los códigos que el motor manda como `credentials.error.<código>` (el del Worker o uno propio), en palabras de la persona. */
const ENGINE_CODES: Record<string, string> = {
  offline: "danil.credentials.failed.offline",
  unauthorized: "danil.credentials.failed.unauthorized",
  license_required: "danil.credentials.failed.license",
  invalid_recipient: "danil.credentials.failed.recipient",
  too_large: "credentials.error.too_large",
  storage: "credentials.error.storage",
  recipients_unsupported: "credentials.error.recipients_unsupported",
};

/** Cualquier fallo como `Failure`; uno del motor sale con frase propia y el código abajo. */
export function failureOf(e: unknown): Failure {
  const what = e && typeof e === "object" && "what" in e ? (e as Failure).what : null;
  const clave = typeof what === "string" ? what : (what as { clave?: unknown } | null)?.clave;
  const code = typeof clave === "string" ? /^credentials\.error\.([a-z_]+)$/.exec(clave)?.[1] : undefined;
  if (code) return { what: t(ENGINE_CODES[code] ?? "danil.credentials.failed.other"), detail: (e as Failure).detail || code };
  if (what) return e as Failure;
  return { what: t("danil.credentials.failed.other"), detail: detalleDe(e) };
}

/** Sin sesión de Danil o con un motor que no tiene estos comandos: la sección no se enseña. */
const HIDDEN = /credentials\.error\.not_linked|"(command|unsupported|command_not_allowed)"/;

function workerFailure(answer: Exclude<CredentialAnswer<unknown>, { kind: "ok" }>): Failure {
  const code = "code" in answer ? answer.code : undefined;
  if (answer.kind === "unauthorized") return { what: t("danil.credentials.failed.unauthorized"), detail: "unauthorized" };
  if (answer.kind === "license" && (!code || code === "license_required" || code === "unknown_user")) return { what: t("danil.credentials.failed.license"), detail: code ?? "license_required" };
  if (code === "invalid_recipient") return { what: t("danil.credentials.failed.recipient"), detail: code };
  if (answer.kind === "error" && answer.status === null) return { what: t("danil.credentials.failed.offline"), detail: "offline" };
  return { what: t("danil.credentials.failed.other"), detail: code ?? ("status" in answer ? `${answer.status}` : answer.kind) };
}

function workerBackend(source: CredentialSource): CredentialsBackend {
  const done = async <T>(answer: Promise<CredentialAnswer<T>>): Promise<T> => {
    const a = await answer;
    if (a.kind !== "ok") throw workerFailure(a);
    return a.value;
  };
  return {
    where: "worker",
    async list(workspace) {
      const a = await listCredentials(source, workspace);
      // Un plano de control sin credenciales contesta 404 sin código.
      if (a.kind === "missing" && !a.code) return null;
      if (a.kind !== "ok") throw workerFailure(a);
      return a.value;
    },
    remove: async (workspace, credential) => void (await done(deleteCredential(source, workspace, credential))),
    removeMachine: async (workspace, credential, computer) => void (await done(removeCredentialMachine(source, workspace, credential, computer))),
    restoreMachine: async (workspace, credential, computer) => void (await done(restoreCredentialMachine(source, workspace, credential, computer))),
    rotate: (workspace, credential, value, listing) =>
      sealAndPut(
        workspace,
        { kind: credential.kind as CredentialPut["kind"], provider: credential.provider, slot: credential.slot, label: credential.label, config: credential.config },
        value,
        listing,
      ),
    create: (workspace, draft, value, listing) => sealAndPut(workspace, draft, value, listing),
  };
  async function sealAndPut(workspace: string, draft: SealedDraft, value: string, listing: CredentialsListing) {
    if (!(await canSeal())) throw { what: t("danil.credentials.rotate.no_webcrypto"), detail: "webcrypto_x25519" } satisfies Failure;
    const copies = await sealForRecipients(sealRecipientsFor(draft.kind, listing.recipients), workspace, draft.slot, value);
    await done(putCredential(source, workspace, { ...draft, hint: credentialHint(draft.kind, value), copies }));
  }
}

/** El motor toma el workspace del sobre de la llamada (`scope: workspace` en el contrato), no de los argumentos. */
const engineBackend: CredentialsBackend = {
  where: "engine",
  async list() {
    try {
      return credentialsListingOf(await invoke<unknown>("account_credentials_list"));
    } catch (e) {
      if (HIDDEN.test(JSON.stringify(e ?? null))) return null;
      throw e;
    }
  },
  remove: async (_ws, credential) => void (await invoke("account_credential_delete", { credential })),
  removeMachine: async (_ws, credential, computer) => void (await invoke("account_credential_remove_machine", { credential, computer })),
  restoreMachine: async (_ws, credential, computer) => void (await invoke("account_credential_restore_machine", { credential, computer })),
  async upload(_ws, slots) {
    const report = await invoke<{ uploaded?: string[]; failed?: { slot: string; error: string }[] } | null>("account_credentials_upload", { slots });
    const failed = report?.failed ?? [];
    if (failed.length) throw { what: { clave: failed[0]!.error }, detail: failed.map((f) => `${f.slot}: ${f.error}`).join("\n") };
  },
};

export const credentialsBackend = (): CredentialsBackend => {
  const web = capabilities().accountCredentials;
  return web ? workerBackend(web) : engineBackend;
};

const [view, setView] = createRoot(() => createSignal<CredentialsView>({ kind: "loading" }));
export { view as credentialsView };

let inFlight: Promise<void> | null = null;
let readAt = 0;
const FRESH_MS = 5_000;

async function read(): Promise<void> {
  const startup = await invoke<Startup>("list_workspaces").catch(() => null);
  const workspace = startup?.active ?? null;
  if (!workspace) {
    setView({ kind: "none" });
    return;
  }
  try {
    const listing = await credentialsBackend().list(workspace);
    setView(listing ? { kind: "ready", workspace, listing } : { kind: "none" });
  } catch (e) {
    setView({ kind: "failed", failure: failureOf(e) });
  }
}

/** Vuelve a leer; varias secciones montadas a la vez comparten una sola lectura. */
export function reloadCredentials(force = true): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - readAt < FRESH_MS) return Promise.resolve();
  const running = read().finally(() => {
    readAt = Date.now();
    inFlight = null;
  });
  inFlight = running;
  return running;
}

if (typeof window !== "undefined") window.addEventListener("harness:workspace", () => void reloadCredentials());

/** Corre una acción sobre la cuenta y vuelve a leer, haya salido bien o no. */
export async function act(run: (backend: CredentialsBackend, workspace: string) => Promise<void>): Promise<Failure | null> {
  const v = view();
  if (v.kind !== "ready") return null;
  try {
    await run(credentialsBackend(), v.workspace);
    return null;
  } catch (e) {
    return failureOf(e);
  } finally {
    await reloadCredentials();
  }
}
