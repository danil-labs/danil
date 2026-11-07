/**
 * GitLab y Bitbucket de la persona (computers, `/v1/git-hosts/:provider`): la
 * conexión es de quien llama, sin workspace en la ruta, y cada máquina de su
 * dueña pide de ahí su token. La web llama con el JWT y la ventana con el token
 * de cliente de la cuenta del workspace; el móvil puede usar lo mismo.
 *
 * Sin APIs del DOM: `fetch` se inyecta (navegador, React Native, Node).
 */
import { type GithubAnswer, type GithubMachine, type GithubSource, call, machineOf } from "./github.ts";

export type GitHostProvider = "gitlab" | "bitbucket";

export const GIT_HOST_PROVIDERS: readonly GitHostProvider[] = ["gitlab", "bitbucket"];

/** `user_id` es `gitlab_user_id` (número) o `bitbucket_uuid` (texto), según el proveedor. */
export type GitHostConfig = { user_id: string | null; login: string; name: string | null; avatar: string | null };

/** La credencial `kind = provider` con la forma común del contrato de credenciales. */
export type GitHostCredential = {
  id: string;
  kind: GitHostProvider;
  label: string | null;
  status: "active" | "reauthorize";
  version: number;
  config: GitHostConfig;
  machines: GithubMachine[];
};

export type GitHostStatus = { connected: boolean; credential: GitHostCredential | null; manage_url: string | null };

/** Un grupo (`group`) o espacio personal (`user`) de GitLab, o un espacio (`workspace`) de Bitbucket. */
export type GitHostAreaKind = "group" | "user" | "workspace";

export type GitHostArea = { key: string; name: string; kind: GitHostAreaKind | null; url: string | null };

export type GitHostAreas = { areas: GitHostArea[]; manage_url: string | null };

export type GitHostAuthorize = { url: string; expires_at: string | null };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const isGitHostProvider = (v: unknown): v is GitHostProvider => v === "gitlab" || v === "bitbucket";

const ID_FIELD: Record<GitHostProvider, string> = { gitlab: "gitlab_user_id", bitbucket: "bitbucket_uuid" };

/** Lee la credencial de GitLab o Bitbucket del Worker; null si no trae lo mínimo o es de otro proveedor. */
export function gitHostCredentialOf(provider: GitHostProvider, raw: unknown): GitHostCredential | null {
  if (!isObj(raw) || !str(raw.id)) return null;
  const kind = str(raw.kind) ?? str(raw.provider);
  if (kind && kind !== provider) return null;
  const config = isObj(raw.config) ? raw.config : {};
  const id = config[ID_FIELD[provider]];
  return {
    id: raw.id as string,
    kind: provider,
    label: str(raw.label),
    status: raw.status === "reauthorize" ? "reauthorize" : "active",
    version: num(raw.version) ?? 0,
    config: {
      user_id: num(id) !== null ? String(id) : str(id),
      login: str(config.login) ?? str(raw.label) ?? "",
      name: str(config.name),
      avatar: str(config.avatar),
    },
    machines: (Array.isArray(raw.machines) ? raw.machines : []).map(machineOf).filter((m): m is GithubMachine => m !== null),
  };
}

/** `GET /v1/git-hosts/:provider`. Sin credencial no hay conexión, diga lo que diga `connected`. */
export function gitHostStatusOf(provider: GitHostProvider, raw: unknown): GitHostStatus {
  if (!isObj(raw)) throw new Error("bad_git_host_status");
  const credential = gitHostCredentialOf(provider, raw.credential);
  return { connected: raw.connected === true && credential !== null, credential, manage_url: str(raw.manage_url) };
}

const AREA_KINDS = new Set(["group", "user", "workspace"]);

export function gitHostAreasOf(raw: unknown): GitHostAreas {
  if (!isObj(raw) || !Array.isArray(raw.areas)) throw new Error("bad_git_host_areas");
  const areas = raw.areas.flatMap((a): GitHostArea[] => {
    if (!isObj(a) || !str(a.key)) return [];
    const url = str(a.url);
    return [
      {
        key: a.key as string,
        name: str(a.name) ?? (a.key as string),
        kind: AREA_KINDS.has(a.kind as string) ? (a.kind as GitHostAreaKind) : null,
        // Solo se abre lo que es una página web: el Worker no manda otra cosa, pero el navegador la abre tal cual.
        url: url && /^https:\/\//i.test(url) ? url : null,
      },
    ];
  });
  return { areas, manage_url: str(raw.manage_url) };
}

export function gitHostAuthorizeOf(raw: unknown): GitHostAuthorize {
  if (!isObj(raw) || !str(raw.url)) throw new Error("bad_git_host_authorize");
  return { url: raw.url as string, expires_at: str(raw.expires_at) };
}

const routeOf = (provider: GitHostProvider) => `/v1/git-hosts/${encodeURIComponent(provider)}`;
const credentialRoute = (workspace: string, credential: string, computer: string) =>
  `/v1/workspaces/${encodeURIComponent(workspace)}/credentials/${encodeURIComponent(credential)}/machines/${encodeURIComponent(computer)}`;
const credentialOrThrow = (provider: GitHostProvider) => (body: unknown) => {
  const c = gitHostCredentialOf(provider, isObj(body) ? body.credential : null);
  if (!c) throw new Error("bad_credential");
  return c;
};

/** La conexión de la persona en ese proveedor y en qué máquinas está. */
export function gitHostStatus(source: GithubSource, provider: GitHostProvider): Promise<GithubAnswer<GitHostStatus>> {
  return call(source, "GET", routeOf(provider), (body) => gitHostStatusOf(provider, body));
}

/** La URL del proveedor donde la persona aprueba; `returnTo`, a dónde vuelve el navegador (sin él, la página «ya puedes cerrar»). */
export function gitHostAuthorize(source: GithubSource, provider: GitHostProvider, returnTo?: string): Promise<GithubAnswer<GitHostAuthorize>> {
  return call(source, "POST", `${routeOf(provider)}/authorize`, gitHostAuthorizeOf, returnTo ? { return_to: returnTo } : {});
}

/** Los grupos (GitLab) o espacios (Bitbucket) que alcanza la conexión, y dónde administrarla. */
export function gitHostAreas(source: GithubSource, provider: GitHostProvider): Promise<GithubAnswer<GitHostAreas>> {
  return call(source, "GET", `${routeOf(provider)}/areas`, gitHostAreasOf);
}

/** Revoca lo emitido y borra la conexión de la persona. */
export function disconnectGitHost(source: GithubSource, provider: GitHostProvider): Promise<GithubAnswer<null>> {
  return call(source, "DELETE", routeOf(provider), () => null);
}

/** Le quita la conexión a una máquina con la ruta común de credenciales; `workspace` es cualquiera de la persona. */
export function removeGitHostMachine(source: GithubSource, provider: GitHostProvider, workspace: string, credential: string, computer: string) {
  return call(source, "DELETE", credentialRoute(workspace, credential, computer), credentialOrThrow(provider));
}

/** Se la vuelve a dar: la máquina pide token en su próximo uso. */
export function restoreGitHostMachine(source: GithubSource, provider: GitHostProvider, workspace: string, credential: string, computer: string) {
  return call(source, "POST", `${credentialRoute(workspace, credential, computer)}/restore`, credentialOrThrow(provider));
}
