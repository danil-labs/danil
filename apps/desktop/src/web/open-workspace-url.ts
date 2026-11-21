/**
 * Recargar sin perder nada (plan web varias sesiones W6): la URL lleva el workspace abierto y su
 * dueño (`account` = sub del correo, `org`), nunca el `context_id`, que vence. Al recargar, el
 * contexto se resuelve otra vez por (correo, organización) con el conjunto de la cookie.
 */
type Router = { handle(command: string, args?: Record<string, unknown>, options?: { headers?: HeadersInit }): Promise<unknown>; activeWorkspace(): string | null; activeContext(): string | null };
type Sessions = { contextOf(sub: string, org: string): string | null; scopeOf(context: string): { org: string; sub: string } | null };
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export function requestedWorkspace(search: string) {
  const params = new URLSearchParams(search);
  const [id, org, sub] = ["workspace", "org", "account"].map((name) => params.get(name));
  return id && org && sub && ID.test(id) ? { id, org, sub } : null;
}

export function openWorkspaceUrl(router: Router, sessions: Sessions, location: Pick<Location, "href" | "search"> = window.location, history: Pick<History, "replaceState" | "state"> = window.history) {
  let pending = requestedWorkspace(location.search);
  function remember() {
    const id = router.activeWorkspace(), context = router.activeContext();
    const owner = context ? sessions.scopeOf(context) : null;
    if (!id || !owner || pending) return;
    const url = new URL(location.href);
    url.searchParams.set("workspace", id);
    url.searchParams.set("org", owner.org);
    url.searchParams.set("account", owner.sub);
    if (url.href !== location.href) history.replaceState(history.state, "", url.href);
  }
  if (typeof window !== "undefined") window.addEventListener("harness:workspace", remember);
  return {
    remember,
    /** Abre el de la URL en cuanto su (correo, organización) tiene contexto; una vez. */
    async restore() {
      const wanted = pending;
      const context = wanted ? sessions.contextOf(wanted.sub, wanted.org) : null;
      pending = null;
      if (!wanted || !context) return;
      await router.handle("set_active_workspace", { id: wanted.id }, { headers: { "x-danil-context": context } }).catch(() => {});
    },
  };
}
