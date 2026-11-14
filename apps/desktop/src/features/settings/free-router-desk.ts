/** Desk: el Free router de plataforma con la sesión de Rust (Bearer en `danil_edge_fetch`) y el motor de cada workspace. */
import { me, workspaces } from "../../lib/edge.ts";
import { freeModelScope } from "../../lib/free-model-policy.ts";
import { freeRouterDeskEdge, freeRouterEngine } from "./free-router-adapters.ts";
import { setFreeRouterHost } from "./free-router-session.ts";

/** Sin sesión de plataforma, o con el borde sin desplegar, la identidad es `null` y el Router queda cerrado. */
export function installDeskFreeRouter(): void {
  setFreeRouterHost({
    edge: freeRouterDeskEdge,
    identity: async () => {
      const patience = { retryBudgetMs: 5_000 };
      const [who, list] = await Promise.all([me(patience), workspaces(patience)]);
      return { sub: who.id, list };
    },
    engine: (policy) => freeRouterEngine(policy ? freeModelScope(policy) : undefined),
  });
}
