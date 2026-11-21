import { createComponent, createContext, createSignal, onCleanup, useContext } from "solid-js";
import type { JSX } from "solid-js";
import type { Session, SessionSource } from "./types.ts";

const Ctx = createContext<{ source: SessionSource; sessions: () => Session[]; active: () => string | null }>();

export function SessionProvider(props: { source: SessionSource; children: JSX.Element }): JSX.Element {
  const [sessions, setSessions] = createSignal<Session[]>(props.source.list());
  const [active, setActive] = createSignal<string | null>(props.source.active());
  const off = props.source.subscribe(() => {
    setSessions([...props.source.list()]);
    setActive(props.source.active());
  });
  onCleanup(off);
  return createComponent(Ctx.Provider, {
    value: { source: props.source, sessions, active },
    get children() {
      return props.children;
    },
  });
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession fuera de SessionProvider");
  // `active` y `sessions` son señales (reactivas); el resto son los métodos de la fuente (RV1b N10).
  return {
    source: c.source,
    sessions: c.sessions,
    active: c.active,
    setActive: (key: string) => c.source.setActive(key),
    refresh: () => c.source.refresh(),
    add: () => c.source.add(),
    remove: (key: string) => c.source.remove(key),
  };
}
