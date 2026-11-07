/**
 * GitLab y Bitbucket de la persona en el navegador: el panel llama al Worker
 * con la sesión de la página, sin pasar por una máquina, como GitHub
 * (`github-account.ts`). Vuelve a esta misma página después del proveedor.
 */
import {
  type GitHostProvider,
  type GithubAnswer,
  type GithubFetch,
  type GithubSource,
  disconnectGitHost,
  gitHostAreas,
  gitHostAuthorize,
  gitHostStatus,
  removeGitHostMachine,
  restoreGitHostMachine,
} from "@terminus/computers";
import { type GitHostAccountSource, answerValue } from "../features/settings/github-account/git-host-answer.ts";

/** A dónde vuelve el navegador: esta página, sin lo que agregó la vuelta anterior (`?gitlab=connected&code=…`). */
export function gitHostReturnToOf(href: string): string {
  const url = new URL(href);
  for (const key of ["gitlab", "bitbucket", "code"]) url.searchParams.delete(key);
  url.hash = "";
  return url.toString();
}

export function webGitHostAccount(options: {
  endpoint: string;
  getToken: () => string | Promise<string>;
  onUnauthorized?: () => void;
  /** La página actual (`window.location.href`). */
  href: () => string;
  fetch?: GithubFetch;
}): GitHostAccountSource {
  const source: GithubSource = { endpoint: options.endpoint, getToken: async () => options.getToken(), fetch: options.fetch };
  const value = <T>(provider: GitHostProvider, answer: Promise<GithubAnswer<T>>) => answerValue(provider, answer, options.onUnauthorized);
  return {
    status: (provider) => value(provider, gitHostStatus(source, provider)),
    async authorize(provider) {
      const { url } = await value(provider, gitHostAuthorize(source, provider, gitHostReturnToOf(options.href())));
      return { url, opened: false };
    },
    areas: (provider) => value(provider, gitHostAreas(source, provider)),
    async disconnect(provider) {
      await value(provider, disconnectGitHost(source, provider));
    },
    machine: (provider, scope, credential, computer, restore) =>
      value(provider, restore ? restoreGitHostMachine(source, provider, scope, credential, computer) : removeGitHostMachine(source, provider, scope, credential, computer)),
  };
}
