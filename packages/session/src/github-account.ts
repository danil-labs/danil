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
} from "../../platform-client/src/github.ts";
import { EdgeError, type EdgeTransport } from "../../platform-client/src/edge.ts";
import { withIdempotencyKey } from "../../platform-client/src/idempotency.ts";
import { githubAccountFailure } from "../../features/settings/src/model/github-account-failures.ts";

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

/** GitHub de la cuenta sobre el transporte de cookie/CSRF del borde (`/v1`). */
export function webEdgeGithubAccount(
  origin: string,
  transport: EdgeTransport,
  href: () => string,
  onUnauthorized?: () => void,
): ControlPlaneCommands {
  const base = `${origin.replace(/\/+$/, "")}/v1/`;
  const edgeFetch: GithubFetch = async (url, init) => {
    const relative = url.startsWith(base) ? url.slice(base.length) : url.replace(/^\/?v1\//, "");
    const method = init?.method ?? "GET";
    try {
      const response = method === "GET"
        ? await transport.call(relative)
        : await transport.mutation(relative, {
            method,
            headers: withIdempotencyKey(init?.headers),
            ...(init?.body === undefined ? {} : { body: init.body }),
          });
      const raw = response.status === 204 ? "" : await response.text();
      return { status: response.status, ok: response.ok, json: async () => (raw ? JSON.parse(raw) : null) };
    } catch (e) {
      if (!(e instanceof EdgeError)) throw e;
      return { status: e.status, ok: false, json: async () => (e.code ? { error: { code: e.code } } : null) };
    }
  };
  return webGithubAccount({
    endpoint: origin.replace(/\/+$/, ""),
    getToken: () => "",
    href,
    fetch: edgeFetch,
    onUnauthorized,
  });
}

/** Compone varios manejadores del plano de control en orden de prioridad. */
export function composeControlPlane(...handlers: (ControlPlaneCommands | undefined)[]): ControlPlaneCommands {
  const active = handlers.filter((h): h is ControlPlaneCommands => Boolean(h));
  return {
    answers: (command) => active.some((h) => h.answers(command)),
    handle: (command, args) => {
      const owner = active.find((h) => h.answers(command));
      if (!owner) throw failure("command");
      return owner.handle(command, args);
    },
  };
}
