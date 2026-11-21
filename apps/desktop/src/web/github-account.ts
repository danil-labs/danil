/**
 * GitHub de la cuenta en el navegador: los comandos `github_account_*` (y quitar
 * o volver a poner una máquina de esa credencial) los contesta el Worker con la
 * sesión de la persona, no una máquina. Así funcionan con todas apagadas. La
 * ventana manda los mismos nombres a su motor.
 */
import {
  type GithubAnswer,
  type GithubArea,
  type GithubFetch,
  type GithubSource,
  disconnectGithub,
  githubAuthorize,
  githubInstallations,
  githubStatus,
  removeGithubMachine,
  restoreGithubMachine,
  setGithubAreas,
} from "@terminus/computers";
import { githubAccountFailure } from "../../../../packages/features/settings/src/github-account/failures.ts";

type Args = Record<string, unknown>;

export type ControlPlaneCommands = {
  /** Si este comando lo contesta el plano de control y no una máquina. */
  answers(command: string): boolean;
  handle(command: string, args: Args): Promise<unknown>;
};

const COMMANDS = new Set([
  "github_account_status",
  "github_account_authorize",
  "github_account_installations",
  "github_account_set_areas",
  "github_account_disconnect",
  "account_credential_remove_machine",
  "account_credential_restore_machine",
]);

const failure = githubAccountFailure;

/** A dónde vuelve el navegador después de GitHub: esta misma página, sin lo que agregó la vuelta anterior. */
export function returnToOf(href: string): string {
  const url = new URL(href);
  for (const key of ["github", "code"]) url.searchParams.delete(key);
  url.hash = "";
  return url.toString();
}

const text = (v: unknown): string => {
  if (typeof v !== "string" || !v) throw failure("bad_request");
  return v;
};

export function webGithubAccount(options: {
  endpoint: string;
  getToken: () => string | Promise<string>;
  onUnauthorized?: () => void;
  /** La página actual (`window.location.href`). */
  href: () => string;
  fetch?: GithubFetch;
}): ControlPlaneCommands {
  const source: GithubSource = { endpoint: options.endpoint, getToken: async () => options.getToken(), fetch: options.fetch };

  async function value<T>(answer: Promise<GithubAnswer<T>>): Promise<T> {
    const a = await answer;
    if (a.kind === "ok") return a.value;
    if (a.kind === "unauthorized") {
      options.onUnauthorized?.();
      throw failure("unauthorized");
    }
    throw failure(a.code ?? (a.status === null ? null : `http_${a.status}`));
  }

  return {
    answers: (command) => COMMANDS.has(command),
    async handle(command, args) {
      const scope = text(args.scope);
      switch (command) {
        case "github_account_status":
          return value(githubStatus(source, scope));
        case "github_account_authorize":
          return value(githubAuthorize(source, scope, returnToOf(options.href())));
        case "github_account_installations":
          return value(githubInstallations(source, scope));
        case "github_account_set_areas":
          return { credential: await value(setGithubAreas(source, scope, Array.isArray(args.areas) ? (args.areas as GithubArea[]) : [])) };
        case "github_account_disconnect":
          await value(disconnectGithub(source, scope));
          return { ok: true };
        case "account_credential_remove_machine":
          return { credential: await value(removeGithubMachine(source, scope, text(args.credential), text(args.computer))) };
        case "account_credential_restore_machine":
          return { credential: await value(restoreGithubMachine(source, scope, text(args.credential), text(args.computer))) };
      }
      throw failure("command");
    },
  };
}
