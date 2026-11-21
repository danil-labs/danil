/**
 * Recargar sin perder nada (plan web varias sesiones W6): la URL lleva el workspace abierto y su
 * dueño (`account` = sub del correo, `org`), nunca el `context_id`, que vence. Al recargar, el riel
 * resuelve otra vez el contexto por (correo, organización) (`requestedStartTarget`).
 */
type Router = { activeWorkspace(): string | null; activeContext(): string | null };
type Sessions = { scopeOf(context: string): { org: string; sub: string } | null };

export function openWorkspaceUrl(router: Router, sessions: Sessions, location: Pick<Location, "href"> = window.location, history: Pick<History, "replaceState" | "state"> = window.history) {
  function remember() {
    const id = router.activeWorkspace(), context = router.activeContext();
    const owner = context ? sessions.scopeOf(context) : null;
    if (!id || !owner) return;
    const url = new URL(location.href);
    url.searchParams.set("workspace", id);
    url.searchParams.set("org", owner.org);
    url.searchParams.set("account", owner.sub);
    if (url.href !== location.href) history.replaceState(history.state, "", url.href);
  }
  window.addEventListener("harness:workspace", remember);
  return { remember };
}
