import { createComponent, createContext, createSignal, onCleanup, useContext } from "solid-js";
import type { JSX } from "solid-js";
import type { Session, SessionSource } from "./types.ts";

const Ctx = createContext<{ source: SessionSource; sessions: () => Session[] }>();

export function SessionProvider(props: { source: SessionSource; children: JSX.Element }): JSX.Element {
  const [sessions, setSessions] = createSignal<Session[]>(props.source.list());
  const off = props.source.subscribe(() => setSessions([...props.source.list()]));
  onCleanup(off);
  return createComponent(Ctx.Provider, {
    value: { source: props.source, sessions },
    get children() {
      return props.children;
    },
  });
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession fuera de SessionProvider");
  return { ...c.source, sessions: c.sessions, source: c.source };
}
