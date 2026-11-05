/**
 * De dónde lee el panel de GitLab y Bitbucket de la persona: el Worker
 * (`/v1/git-hosts/:provider`). En la web, con la sesión de la página
 * (`web/git-host-account.ts`); en la ventana, con el token de cliente de la
 * cuenta del workspace. No hay comandos del motor para esto.
 */
import {
  type GitHostProvider,
  type GithubAnswer,
  type GithubSource,
  disconnectGitHost,
  gitHostAreas,
  gitHostAuthorize,
  gitHostCredentialOf,
  gitHostStatus,
} from "@terminus/computers";
import { invoke } from "../../../lib/invoke.ts";
import { type GitHostAccountSource, answerValue } from "./git-host-answer.ts";

export type { GitHostAccountSource } from "./git-host-answer.ts";

type ClientToken = { token: string; expires_at: number; endpoint: string };
type WorkspaceAccountOf = { account?: string | null; signed_in?: boolean };

const MARGIN_MS = 60_000;

const NO_CLIENT_TOKEN = { what: "no_client_token", detail: "credentials.error.no_client_token" };

/** La ventana: el token de cliente de la cuenta de `scope`, renovado antes de vencer. */
export function desktopGitHostSource(scope: string): GitHostAccountSource {
  let token: ClientToken | null = null;
  let account: string | null | undefined;
  async function client(): Promise<ClientToken> {
    if (token && token.expires_at - Date.now() > MARGIN_MS) return token;
    if (account === undefined) {
      const of = await invoke<WorkspaceAccountOf>("danil_workspace_account", { workspace: scope }).catch(() => null);
      if (!of?.signed_in) throw NO_CLIENT_TOKEN;
      account = of.account ?? null;
    }
    try {
      token = await invoke<ClientToken>("account_relay_token", account ? { account } : {});
    } catch {
      throw NO_CLIENT_TOKEN;
    }
    if (!token?.token || !token.endpoint) throw NO_CLIENT_TOKEN;
    return token;
  }
  const source = async (): Promise<GithubSource> => {
    const first = await client();
    return { endpoint: first.endpoint, getToken: async () => (await client()).token };
  };
  const value = <T>(provider: GitHostProvider, call: (s: GithubSource) => Promise<GithubAnswer<T>>) =>
    source().then((s) =>
      answerValue(provider, call(s), () => {
        token = null;
      }),
    );
  return {
    status: (provider) => value(provider, (s) => gitHostStatus(s, provider)),
    async authorize(provider) {
      const { url } = await value(provider, (s) => gitHostAuthorize(s, provider));
      return { url, opened: false };
    },
    areas: (provider) => value(provider, (s) => gitHostAreas(s, provider)),
    async disconnect(provider) {
      await value(provider, (s) => disconnectGitHost(s, provider));
    },
    async machine(provider, machineScope, credential, computer, restore) {
      const args = { scope: machineScope, credential, computer };
      const reply = (restore
        ? await invoke("account_credential_restore_machine", args)
        : await invoke("account_credential_remove_machine", args)) as { credential?: unknown } | null;
      return gitHostCredentialOf(provider, reply?.credential);
    },
  };
}
