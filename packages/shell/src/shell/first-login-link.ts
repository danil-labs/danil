/**
 * Liga los locales antes de montar la app, sin el riel (como el alta en `first-free-workspace.ts`):
 * lee sus propios contextos, abre la personal si falta y adopta. Lo que no termina sigue en el riel.
 */
import { linkingOutcome } from "./first-login.ts";
import { createPersonalOpener } from "./personal-open.ts";
import { createAccountWorkspaces } from "./session-account-workspaces.ts";
import type { ContextInvoke } from "./session-context-types.ts";
import { createSessionContexts } from "./session-contexts.ts";

/** Entre repasos: identity puede tardar en listar el contexto recién admitido. */
const DELAYS = [0, 1000, 2000, 4000, 8000];
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createLinker(invoke: ContextInvoke, features: () => Promise<readonly string[] | null>, { wait = pause }: { wait?: (ms: number) => Promise<void> } = {}) {
  const noop = () => {};
  const sessions = createSessionContexts(invoke, noop);
  const accounts = createAccountWorkspaces(invoke, true, noop, features);
  const opener = createPersonalOpener({ send: sessions.send, reread: async () => { await sessions.refresh(); return sessions.groups(); }, defaultContext: sessions.defaultContext, groups: sessions.groups });
  return {
    progress: accounts.adoptionProgress,
    report: accounts.adoptionReport,
    sealedElsewhere: accounts.sealedElsewhere,
    groups: sessions.groups,
    /** `done`: el repaso terminó (con o sin pendientes). `background`: lo transitorio sigue en el riel. */
    async run(): Promise<"done" | "background"> {
      for (const delay of DELAYS) {
        await wait(delay);
        await sessions.refresh();
        await accounts.refresh(sessions.groups() ?? [], sessions.send, () => null, opener);
        const outcome = linkingOutcome(accounts.adoptionProgress(), accounts.personalOutcome());
        if (outcome === "done") return "done";
        if (outcome === "background") return "background";
      }
      return "background";
    },
  };
}
