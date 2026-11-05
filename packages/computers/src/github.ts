/**
 * GitHub en la cuenta de Danil (computers, `/v1/workspaces/:id/github*`, rutas
 * de persona): una sola conexión por workspace que el Worker guarda y de la que
 * cada máquina pide su token. La web llama aquí directo con el JWT, aunque todas
 * las máquinas estén apagadas; la ventana pasa por los comandos del motor
 * (`github_account_*`), que devuelven las mismas formas.
 *
 * Sin APIs del DOM: `fetch` se inyecta (navegador, React Native, Node).
 */
import { bearerCall, errorCodeOf } from "./api.ts";

/** Una cuenta u organización elegida: `key` es su login en minúsculas. */
export type GithubArea = { key: string; installation_id: number; repository_ids: number[] | null };

export type GithubMachineState = "active" | "pending" | "removed" | "signed_in";

/** Una máquina a la que el Worker ya le dio token (`credential_machines`). */
export type GithubMachine = {
  computer_id: string;
  name: string | null;
  state: GithubMachineState;
  created_at: string | null;
  last_seen_at: string | null;
};

export type GithubConfig = { github_user_id: number | null; login: string; name: string | null; avatar: string | null; areas: GithubArea[] };

/** La credencial `kind = github` con la forma común del contrato de credenciales (§ 3). */
export type GithubCredential = {
  id: string;
  kind: "github";
  label: string | null;
  status: "active" | "reauthorize";
  version: number;
  config: GithubConfig;
  machines: GithubMachine[];
};

export type GithubStatus = { connected: boolean; credential: GithubCredential | null; install_url: string | null };

export type GithubInstallation = {
  key: string;
  installation_id: number;
  account: { login: string; type: string | null; avatar: string | null };
  repository_selection: "all" | "selected" | null;
  /** La página de esa instalación en GitHub; un Worker anterior no la manda. */
  html_url: string | null;
  repository_count: number | null;
};

/** `install_pending`: alguien pidió instalar la App en una organización y falta que una admin lo apruebe. */
export type GithubInstallations = { installations: GithubInstallation[]; install_url: string | null; install_pending: boolean };

/** `opened`: el motor ya abrió el navegador (escritorio); el Worker nunca lo dice. */
export type GithubAuthorize = { url: string; expires_at: string | null; opened: boolean };

/** La respuesta de una ruta de GitHub; `failed` conserva el código del Worker (`github_not_connected`, `license_required`…). */
export type GithubAnswer<T> =
  | { kind: "ok"; value: T }
  | { kind: "unauthorized" }
  | { kind: "failed"; status: number | null; code: string | null };

export type GithubFetch = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;

/** A dónde hablar y con qué token: el JWT en la web y el teléfono. */
export type GithubSource = { endpoint: string; getToken: () => Promise<string>; fetch?: GithubFetch };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function call<T>(source: GithubSource, method: string, path: string, read: (body: unknown) => T, body?: unknown): Promise<GithubAnswer<T>> {
  const response = await bearerCall(source, method, path, body);
  if (!response) return { kind: "failed", status: null, code: null };
  const { json } = response;
  const code = errorCodeOf(json) ?? null;
  if (response.status === 401) return { kind: "unauthorized" };
  if (!response.ok) return { kind: "failed", status: response.status, code };
  try {
    return { kind: "ok", value: read(json) };
  } catch {
    return { kind: "failed", status: response.status, code: "bad_response" };
  }
}

function areaOf(raw: unknown): GithubArea | null {
  if (!isObj(raw) || !str(raw.key) || num(raw.installation_id) === null) return null;
  const ids = Array.isArray(raw.repository_ids) ? raw.repository_ids.filter((n): n is number => typeof n === "number") : null;
  return { key: raw.key as string, installation_id: raw.installation_id as number, repository_ids: ids };
}

const MACHINE_STATES = new Set(["active", "pending", "removed", "signed_in"]);

export function machineOf(raw: unknown): GithubMachine | null {
  if (!isObj(raw) || !str(raw.computer_id)) return null;
  return {
    computer_id: raw.computer_id as string,
    name: str(raw.name),
    state: (MACHINE_STATES.has(raw.state as string) ? raw.state : "active") as GithubMachineState,
    created_at: str(raw.created_at),
    last_seen_at: str(raw.last_seen_at),
  };
}

/** Lee la credencial de GitHub del Worker o del motor; null si no trae lo mínimo. */
export function githubCredentialOf(raw: unknown): GithubCredential | null {
  if (!isObj(raw) || !str(raw.id)) return null;
  const config = isObj(raw.config) ? raw.config : {};
  const login = str(config.login) ?? str(raw.label) ?? "";
  return {
    id: raw.id as string,
    kind: "github",
    label: str(raw.label),
    status: raw.status === "reauthorize" ? "reauthorize" : "active",
    version: num(raw.version) ?? 0,
    config: {
      github_user_id: num(config.github_user_id),
      login,
      name: str(config.name),
      avatar: str(config.avatar),
      areas: (Array.isArray(config.areas) ? config.areas : []).map(areaOf).filter((a): a is GithubArea => a !== null),
    },
    machines: (Array.isArray(raw.machines) ? raw.machines : []).map(machineOf).filter((m): m is GithubMachine => m !== null),
  };
}

/** `GET …/github` o `github_account_status`. Sin credencial no hay conexión, diga lo que diga `connected`. */
export function githubStatusOf(raw: unknown): GithubStatus {
  if (!isObj(raw)) throw new Error("bad_github_status");
  const credential = githubCredentialOf(raw.credential);
  return { connected: raw.connected === true && credential !== null, credential, install_url: str(raw.install_url) };
}

export function githubInstallationsOf(raw: unknown): GithubInstallations {
  if (!isObj(raw) || !Array.isArray(raw.installations)) throw new Error("bad_github_installations");
  const installations = raw.installations.flatMap((i): GithubInstallation[] => {
    if (!isObj(i) || !str(i.key) || num(i.installation_id) === null) return [];
    const account = isObj(i.account) ? i.account : {};
    const selection = i.repository_selection === "all" || i.repository_selection === "selected" ? i.repository_selection : null;
    return [
      {
        key: i.key as string,
        installation_id: i.installation_id as number,
        account: { login: str(account.login) ?? (i.key as string), type: str(account.type), avatar: str(account.avatar) },
        repository_selection: selection,
        html_url: str(i.html_url),
        repository_count: num(i.repository_count),
      },
    ];
  });
  return { installations, install_url: str(raw.install_url), install_pending: raw.install_pending === true };
}

export function githubAuthorizeOf(raw: unknown): GithubAuthorize {
  if (!isObj(raw) || !str(raw.url)) throw new Error("bad_github_authorize");
  return { url: raw.url as string, expires_at: str(raw.expires_at), opened: raw.opened === true };
}

const routeOf = (workspace: string) => `/v1/workspaces/${encodeURIComponent(workspace)}/github`;
const credentialRoute = (workspace: string, credential: string, computer: string) =>
  `/v1/workspaces/${encodeURIComponent(workspace)}/credentials/${encodeURIComponent(credential)}/machines/${encodeURIComponent(computer)}`;
const credentialOrThrow = (body: unknown) => {
  const c = githubCredentialOf(isObj(body) ? body.credential : null);
  if (!c) throw new Error("bad_credential");
  return c;
};

/** Si el workspace tiene GitHub en la cuenta, de quién y en qué máquinas. */
export function githubStatus(source: GithubSource, workspace: string) {
  return call(source, "GET", routeOf(workspace), githubStatusOf);
}

/**
 * La URL de GitHub donde la persona aprueba. `returnTo` es a dónde vuelve el
 * navegador (un origen permitido por el Worker); sin él, la página «ya puedes
 * cerrar esta pestaña» del Worker.
 */
export function githubAuthorize(source: GithubSource, workspace: string, returnTo?: string) {
  return call(source, "POST", `${routeOf(workspace)}/authorize`, githubAuthorizeOf, returnTo ? { return_to: returnTo } : {});
}

/** Las cuentas y organizaciones donde está instalada la App, y dónde instalarla en otra. */
export function githubInstallations(source: GithubSource, workspace: string) {
  return call(source, "GET", `${routeOf(workspace)}/installations`, githubInstallationsOf);
}

/** Cambia las organizaciones que alcanza el workspace; sube la versión de la credencial. */
export function setGithubAreas(source: GithubSource, workspace: string, areas: GithubArea[]) {
  const body = areas.map((a) => (a.repository_ids ? a : { key: a.key, installation_id: a.installation_id }));
  return call(source, "PUT", `${routeOf(workspace)}/areas`, credentialOrThrow, { areas: body });
}

/** Revoca los tokens emitidos y borra la conexión del workspace. */
export function disconnectGithub(source: GithubSource, workspace: string) {
  return call(source, "DELETE", routeOf(workspace), () => null);
}

/** Le quita GitHub a una máquina (revoca su token) con la ruta común de credenciales. */
export function removeGithubMachine(source: GithubSource, workspace: string, credential: string, computer: string) {
  return call(source, "DELETE", credentialRoute(workspace, credential, computer), credentialOrThrow);
}

/** Se lo vuelve a dar: la máquina pide token de nuevo en su próximo uso. */
export function restoreGithubMachine(source: GithubSource, workspace: string, credential: string, computer: string) {
  return call(source, "POST", `${credentialRoute(workspace, credential, computer)}/restore`, credentialOrThrow);
}
