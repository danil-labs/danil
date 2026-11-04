import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { readTaskGit, type TaskGitStatus } from "@terminus/tasks";
import type { Host } from "./hosts";
import { type GitBook, gitAsks, gitAsksKey, staleGit, withGitAnswer } from "./taskGit";

/** Cada cuánto se relee mientras la lista está a la vista: el CI cambia en minutos, no en segundos. */
const EVERY_MS = 30_000;

/**
 * El git de las tarjetas visibles, por máquina, workspace, carpeta e id. Una llamada por máquina y
 * carpeta (`gitAsks`), al cambiar lo visible y cada 30 s con la app al frente.
 * Leer nunca enciende: a una máquina que no está encendida no se le pregunta y
 * lo suyo queda viejo (`stale`).
 */
export function useTaskGit(hostOf: (id: string) => Host | undefined, visible: readonly { host: string; workspace: string; folder: string; id: string }[], revision = 0): GitBook {
  const [book, setBook] = useState<GitBook>({});
  const asks = useMemo(() => gitAsks(visible), [visible]);
  const key = gitAsksKey(asks);
  // Lo último pedido y la flota, sin volver a preguntar en cada render: lo
  // visible y `hostOf` cambian de objeto, no de contenido (`key` lo resume).
  const latest = useRef({ asks, hostOf });
  latest.current = { asks, hostOf };
  const powerKey = asks.map((ask) => hostOf(ask.host)?.power()).join("|");
  useEffect(() => {
    let live = true;
    let reading = false;
    const read = async () => {
      if (reading) return;
      reading = true;
      const { asks, hostOf } = latest.current;
      try {
        await Promise.all(asks.map(async (ask) => {
          const host = hostOf(ask.host);
          const scope = { host: ask.host, workspace: ask.workspace, folder: ask.project };
          if (!host || host.power() !== "on") {
            if (live) setBook((b) => staleGit(b, scope, ask.priority));
            return;
          }
          const publish = (answer: { value: Record<string, TaskGitStatus>; cachedAt: number | null }) => {
            if (live) setBook((b) => host.power() === "on" && answer.cachedAt === null ? withGitAnswer(b, scope, answer.value) : staleGit(b, scope, ask.priority));
          };
          try {
            const answer = await readTaskGit(
              remote => host.call<Record<string, TaskGitStatus>>("list_session_git", ask.workspace, { project: ask.project, remote, priority: ask.priority }),
              { onLocal: publish, current: () => live && host.power() === "on" },
            );
            publish(answer);
          } catch {
            if (live) setBook((b) => staleGit(b, scope, ask.priority));
          }
        }));
      } finally { reading = false; }
    };
    void read();
    const activity = AppState.addEventListener("change", state => { if (state === "active") void read(); });
    const timer = setInterval(() => { if (AppState.currentState === "active") void read(); }, EVERY_MS);
    return () => { live = false; clearInterval(timer); activity.remove(); };
  }, [key, revision, powerKey]);
  return book;
}
