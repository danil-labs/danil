/**
 * Lo que comparten la ventana y la web para el panel de GitLab y Bitbucket: la
 * fuente que lee del Worker y sus fallos con la forma del motor. Sin `invoke`:
 * la web y sus pruebas lo cargan en Node.
 */
import type { GitHostAreas, GitHostCredential, GitHostProvider, GitHostStatus, GithubAnswer } from "@terminus/computers";
import { gitHostAccountFailure } from "./failures.ts";

/** `opened`: ya se abrió el navegador. Los fallos tienen la forma de los del motor (`credentials.error.<código>`). */
export type GitHostAccountSource = {
  status(provider: GitHostProvider): Promise<GitHostStatus>;
  authorize(provider: GitHostProvider): Promise<{ url: string; opened: boolean }>;
  areas(provider: GitHostProvider): Promise<GitHostAreas>;
  disconnect(provider: GitHostProvider): Promise<void>;
  /** `scope` es el workspace de la ruta común de credenciales. */
  machine(provider: GitHostProvider, scope: string, credential: string, computer: string, restore: boolean): Promise<GitHostCredential | null>;
};

/** Los nombres que el panel pone en sus frases; los del catálogo del motor son los mismos. */
export const GIT_HOST_NAMES: Record<GitHostProvider, string> = { gitlab: "GitLab", bitbucket: "Bitbucket" };

/** El fallo de un código del Worker con la forma del motor (`credentials.error.<código>`) y su frase. */
export const failureOfCode = (provider: GitHostProvider, code: string | null) => gitHostAccountFailure(provider, GIT_HOST_NAMES[provider], code);

/** El valor de una respuesta del Worker, o su fallo con la forma del motor. */
export async function answerValue<T>(provider: GitHostProvider, answer: Promise<GithubAnswer<T>>, onUnauthorized?: () => void): Promise<T> {
  const a = await answer;
  if (a.kind === "ok") return a.value;
  if (a.kind === "unauthorized") {
    onUnauthorized?.();
    throw failureOfCode(provider, "unauthorized");
  }
  throw failureOfCode(provider, a.code ?? (a.status === null ? null : `http_${a.status}`));
}
