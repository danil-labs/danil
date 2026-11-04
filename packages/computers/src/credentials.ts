/**
 * Las credenciales de un workspace en la cuenta de Danil (contrato de
 * credenciales § 3, rutas de persona): qué claves tiene y en qué máquinas está
 * cada una. La web llama aquí directo con el JWT; la ventana pasa por los
 * comandos del motor (`account_credentials_*`), que dan la misma forma.
 *
 * Sin APIs del DOM: `fetch` se inyecta (navegador, React Native, Node).
 */
import { bearerCall, errorCodeOf } from "./api.ts";

/** Un cliente viejo recibe kinds que no conoce tal cual: cada consumidor filtra por `kinds`/`match`. */
export type CredentialKind = "api_key" | "mcp_secret" | "zotero" | "github" | "subscription" | "mcp_oauth" | "env_secret";
export type CredentialDelivery = "sealed" | "issued" | "login";
/** `unsupported`: el motor de esa máquina no anuncia `secrets_v1` y no aplicaría el secreto. */
export type CredentialMachineState = "active" | "pending" | "removed" | "signed_in" | "unsupported";

/** Una máquina de una credencial (`credential_machines`). */
export type CredentialMachine = {
  computer_id: string;
  name: string | null;
  state: CredentialMachineState;
  version: number | null;
  created_at: string | null;
  last_seen_at: string | null;
};

export type Credential = {
  id: string;
  workspace_id: string | null;
  kind: CredentialKind;
  provider: string;
  slot: string;
  label: string | null;
  /** Los últimos 4 caracteres; null en github. */
  hint: string | null;
  delivery: CredentialDelivery;
  status: "active" | "reauthorize";
  config: Record<string, unknown>;
  version: number;
  created_at: string | null;
  updated_at: string | null;
  machines: CredentialMachine[];
};

/** Una computadora ligada al workspace: para quién se sella. */
export type CredentialRecipient = {
  computer_id: string;
  name: string | null;
  public_key: string | null;
  online: boolean;
  /** Lo que anunció su motor; null si el Worker no lo dice. */
  service_features: string[] | null;
};

export const SECRETS_FEATURE = "secrets_v1";

/** Una clave de la bóveda de esta máquina que no está en la cuenta (solo el motor la da). */
export type LocalOnlyCredential = {
  slot: string;
  kind: CredentialKind;
  provider: string;
  label: string | null;
  hint: string | null;
  /** El último fallo al subirla sola (`credentials.error.<código>`), si lo hubo. */
  upload_error?: string | null;
};

export type CredentialsListing = {
  credentials: Credential[];
  recipients: CredentialRecipient[];
  /** Solo por el motor (`account_credentials_list`): lo que aún no subió. */
  local_only?: LocalOnlyCredential[];
};

/** Lo que manda `PUT …/credentials`: crea o rota una credencial sellada. */
export type CredentialPut = {
  kind: Extract<CredentialKind, "api_key" | "mcp_secret" | "zotero" | "env_secret">;
  provider: string;
  slot: string;
  label: string | null;
  hint: string | null;
  config: Record<string, unknown>;
  copies: { computer_id: string; sealed: string }[];
};

/**
 * La respuesta de una ruta de credenciales. A diferencia de `Answer`, `license`
 * y `missing` conservan el código del Worker (`github_not_connected` también es 404).
 */
export type CredentialAnswer<T> =
  | { kind: "ok"; value: T }
  | { kind: "unauthorized" }
  | { kind: "license"; code?: string }
  | { kind: "missing"; code?: string }
  | { kind: "error"; status: number | null; code?: string };

export type CredentialFetch = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;

/** A dónde hablar y con qué token: el JWT en la web, el token de cliente en la ventana. */
export type CredentialSource = { endpoint: string; getToken: () => Promise<string>; fetch?: CredentialFetch };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function call<T>(source: CredentialSource, method: string, path: string, read: (body: unknown) => T, body?: unknown): Promise<CredentialAnswer<T>> {
  const response = await bearerCall(source, method, path, body);
  if (!response) return { kind: "error", status: null };
  const { json } = response;
  const code = errorCodeOf(json);
  const withCode = <A extends object>(a: A) => (code ? { ...a, code } : a);
  if (response.status === 401) return { kind: "unauthorized" };
  if (response.status === 403) return withCode({ kind: "license" as const });
  if (response.status === 404) return withCode({ kind: "missing" as const });
  if (!response.ok) return withCode({ kind: "error" as const, status: response.status });
  try {
    return { kind: "ok", value: read(json) };
  } catch {
    return { kind: "error", status: response.status };
  }
}

const STATES = new Set(["active", "pending", "removed", "signed_in", "unsupported"]);

function machineOf(raw: unknown): CredentialMachine | null {
  if (!isObj(raw) || !str(raw.computer_id)) return null;
  return {
    computer_id: raw.computer_id as string,
    name: str(raw.name),
    state: (STATES.has(raw.state as string) ? raw.state : "pending") as CredentialMachineState,
    version: num(raw.version),
    created_at: str(raw.created_at),
    last_seen_at: str(raw.last_seen_at),
  };
}

/** Lee una credencial del Worker o del motor; null si no trae lo mínimo. */
export function credentialOf(raw: unknown): Credential | null {
  if (!isObj(raw) || !str(raw.id) || !str(raw.kind) || !str(raw.slot)) return null;
  return {
    id: raw.id as string,
    workspace_id: str(raw.workspace_id),
    kind: raw.kind as CredentialKind,
    provider: str(raw.provider) ?? (raw.kind as string),
    slot: raw.slot as string,
    label: str(raw.label),
    hint: str(raw.hint),
    delivery: (str(raw.delivery) ?? "sealed") as CredentialDelivery,
    status: raw.status === "reauthorize" ? "reauthorize" : "active",
    config: isObj(raw.config) ? raw.config : {},
    version: num(raw.version) ?? 0,
    created_at: str(raw.created_at),
    updated_at: str(raw.updated_at),
    machines: (Array.isArray(raw.machines) ? raw.machines : []).map(machineOf).filter((m): m is CredentialMachine => m !== null),
  };
}

/** Lee la lista del Worker (`GET …/credentials`) o del motor (`account_credentials_list`, con `local_only`). */
export function credentialsListingOf(raw: unknown): CredentialsListing {
  if (!isObj(raw) || !Array.isArray(raw.credentials)) throw new Error("bad_credentials");
  const recipients = (Array.isArray(raw.recipients) ? raw.recipients : []).flatMap((r): CredentialRecipient[] =>
    isObj(r) && str(r.computer_id)
      ? [
          {
            computer_id: r.computer_id as string,
            name: str(r.name),
            public_key: str(r.public_key),
            online: r.online === true,
            service_features: Array.isArray(r.service_features) ? r.service_features.filter((f): f is string => typeof f === "string") : null,
          },
        ]
      : [],
  );
  const listing: CredentialsListing = {
    credentials: raw.credentials.map(credentialOf).filter((c): c is Credential => c !== null),
    recipients,
  };
  if (Array.isArray(raw.local_only))
    listing.local_only = raw.local_only.flatMap((l): LocalOnlyCredential[] =>
      isObj(l) && str(l.slot)
        ? [
            {
              slot: l.slot as string,
              kind: (str(l.kind) ?? "api_key") as CredentialKind,
              provider: str(l.provider) ?? "",
              label: str(l.label),
              hint: str(l.hint),
              ...(str(l.upload_error) ? { upload_error: str(l.upload_error) } : {}),
            },
          ]
        : [],
    );
  return listing;
}

const routeOf = (workspace: string) => `/v1/workspaces/${encodeURIComponent(workspace)}/credentials`;
const credentialOrThrow = (body: unknown) => {
  const c = credentialOf(isObj(body) ? body.credential : null);
  if (!c) throw new Error("bad_credential");
  return c;
};

/** Las credenciales del workspace con sus máquinas, y para quién sellar. */
export function listCredentials(source: CredentialSource, workspace: string) {
  return call(source, "GET", routeOf(workspace), credentialsListingOf);
}

/** Crea o rota una credencial sellada (api_key, mcp_secret, zotero, env_secret) con una copia por máquina. */
export function putCredential(source: CredentialSource, workspace: string, put: CredentialPut) {
  return call(source, "PUT", routeOf(workspace), credentialOrThrow, put);
}

/** La borra de la cuenta; cada máquina la saca de su bóveda al reconciliar. */
export function deleteCredential(source: CredentialSource, workspace: string, credential: string) {
  return call(source, "DELETE", `${routeOf(workspace)}/${encodeURIComponent(credential)}`, () => null);
}

/** La quita de una máquina: con `sealed`, no la revoca en el proveedor. */
export function removeCredentialMachine(source: CredentialSource, workspace: string, credential: string, computer: string) {
  return call(source, "DELETE", `${routeOf(workspace)}/${encodeURIComponent(credential)}/machines/${encodeURIComponent(computer)}`, credentialOrThrow);
}

/** La vuelve a poner en una máquina; una sellada queda `pending` hasta que otra la selle para ella. */
export function restoreCredentialMachine(source: CredentialSource, workspace: string, credential: string, computer: string) {
  return call(source, "POST", `${routeOf(workspace)}/${encodeURIComponent(credential)}/machines/${encodeURIComponent(computer)}/restore`, credentialOrThrow);
}

// -----------------------------------------------------------------------------
// Reglas puras para pintar las credenciales.
// -----------------------------------------------------------------------------

/** El slot de cada tipo, como lo nombra la bóveda del motor (contrato § 2). */
export const credentialSlot = {
  apiKey: (agent: string, account: string) => `agentes/${agent}:${account}`,
  goUsageKey: (agent: string, account: string) => `agentes/${agent}:go-usage:${account}`,
  zotero: () => "referencias/zotero-key",
  mcpSecret: (server: string, field: "env" | "headers", name: string) => `mcp/${server}/${field}/${name}`,
  /** Sin carpeta vale para todo el workspace (`*`); la de la carpeta gana. */
  envSecret: (folder: string | null, name: string) => `env/${folder ?? "*"}/${name}`,
};

export const ENV_SECRET_NAME = /^[A-Z_][A-Z0-9_]*$/;

/** Un secreto genérico leído de su slot `env/<carpeta|*>/<NOMBRE>`; null si el slot no es de uno. */
export type EnvSecretSlot = { folder: string | null; name: string };

export function envSecretOf(slot: string): EnvSecretSlot | null {
  const m = /^env\/([^/]+)\/([^/]+)$/.exec(slot);
  if (!m || !ENV_SECRET_FOLDER.test(m[1]!) || !ENV_SECRET_NAME.test(m[2]!)) return null;
  return { folder: m[1] === "*" ? null : m[1]!, name: m[2]! };
}

/** Copia de seldon-host `docs/account-credentials.md` § Secretos genéricos; `test/fixtures/env-secret-names.json` es el mismo archivo que prueba el motor. */
const RESERVED_ENV_PREFIXES = ["DANIL_", "TERMINUS_", "SELDON_", "HARNESS_", "ANTHROPIC_", "OPENAI_", "CLAUDE_", "CODEX_", "OPENCODE_", "GROK_", "AGY_", "XDG_", "LD_", "DYLD_", "GIT_"];
const RESERVED_ENV = new Set([
  "PATH", "HOME", "SHELL", "USER", "TMPDIR", "TERM", "NODE_OPTIONS", "GH_TOKEN", "GITHUB_TOKEN", "XAI_API_KEY", "ZCODE_DATA_BASE_DIR",
  "USERPROFILE", "APPDATA", "LOCALAPPDATA", "SYSTEMROOT", "COMSPEC", "PATHEXT", "TEMP", "TMP", "SYSTEMDRIVE", "WINDIR", "PROGRAMFILES", "PROGRAMDATA", "PSMODULEPATH",
]);
const ENV_SECRET_NAME_MAX = 128;
const ENV_SECRET_FOLDER = /^(\*|[A-Za-z0-9_-]{1,64})$/;

/** Por qué un nombre no sirve para un secreto genérico, o null si sirve. */
export function envSecretNameProblem(name: string): "empty" | "grammar" | "reserved" | null {
  if (!name) return "empty";
  if (!ENV_SECRET_NAME.test(name) || name.length > ENV_SECRET_NAME_MAX) return "grammar";
  if (RESERVED_ENV.has(name) || RESERVED_ENV_PREFIXES.some((p) => name.startsWith(p))) return "reserved";
  return null;
}

/** Si sirve como alcance de un secreto: `*` (todo el workspace) o el id de una carpeta. */
export const envSecretFolderValid = (folder: string) => ENV_SECRET_FOLDER.test(folder);

/** Los últimos 4 que se enseñan; un secreto genérico corto no da pista (deja poco por adivinar). */
export function credentialHint(kind: CredentialKind, value: string): string | null {
  if (kind === "env_secret") return value.length >= 16 ? value.slice(-4) : null;
  return value.length >= 4 ? value.slice(-4) : null;
}

/** Las máquinas que se enseñan en «En uso en»: primero las que la tienen, luego las pendientes y al final las quitadas. */
export function credentialMachines(credential: Pick<Credential, "machines">): CredentialMachine[] {
  const rank: Record<CredentialMachineState, number> = { active: 0, signed_in: 0, pending: 1, unsupported: 2, removed: 3 };
  return [...credential.machines].sort((a, b) => rank[a.state] - rank[b.state] || (a.name ?? a.computer_id).localeCompare(b.name ?? b.computer_id));
}

/** Para quién se sella: un secreto genérico solo para las máquinas cuyo motor anunció `secrets_v1`. */
export function sealRecipientsFor<R extends Pick<CredentialRecipient, "service_features">>(kind: CredentialKind, recipients: readonly R[]): R[] {
  return kind === "env_secret" ? recipients.filter((r) => r.service_features?.includes(SECRETS_FEATURE) === true) : [...recipients];
}

/** Si la credencial es de esa cuenta de agente (`config.agent` / `config.account`). */
export function isAgentCredential(credential: Pick<Credential, "kind" | "config">, agent: string, account: string): boolean {
  return credential.kind === "api_key" && credential.config.agent === agent && credential.config.account === account;
}
