/**
 * El directorio de workspaces de la cuenta (`GET /v1/me/workspaces`), el mismo
 * que usa el escritorio. Sin sesión de Danil no hay directorio: el teléfono se
 * queda con lo que publican sus máquinas. Leer no enciende nada.
 */
import { type Answer, type Directory, type DirectoryEntry, listDirectory, setDirectoryPins } from "@terminus/computers";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "./account";
import { COMPUTERS } from "./supabase";
import { pinKeys, withPins } from "./workspaceDirectory";

export type WorkspaceDirectory = {
  /** `null` mientras carga, sin cuenta o si el plano de control no lo dijo nunca. */
  directory: Directory | null;
  signedIn: boolean;
  loading: boolean;
  /** El código de la última lectura fallida; `null` si la última salió bien. */
  failure: string | null;
  reload: () => Promise<void>;
  /** Fija o quita; `null` si se guardó, o el código por el que no. */
  pin: (entry: DirectoryEntry) => Promise<string | null>;
};

/** El código que se enseña entre paréntesis: el del plano de control o el del sobre. */
function failureOf(answer: Answer<unknown>): string {
  if (answer.kind === "missing") return "directory_unavailable";
  if (answer.kind === "error") return answer.code ?? (answer.status === null ? "io" : `http_${answer.status}`);
  return answer.kind;
}

export function useWorkspaceDirectory(): WorkspaceDirectory {
  const account = useAccount();
  const signedIn = account.session !== null;
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const asked = useRef(0);
  const current = useRef(directory);
  current.current = directory;

  // Un token rechazado se refresca una vez, como la lista de computadoras.
  const call = useCallback(
    async <T,>(request: (token: string) => Promise<Answer<T>>): Promise<Answer<T>> => {
      const answer = await request(await account.getToken());
      if (answer.kind !== "unauthorized" || !(await account.unauthorized())) return answer;
      return request(await account.getToken());
    },
    [account.getToken, account.unauthorized],
  );

  const reload = useCallback(async () => {
    if (!signedIn) {
      setDirectory(null);
      setFailure(null);
      setLoading(false);
      return;
    }
    const mine = ++asked.current;
    setLoading(true);
    try {
      const answer = await call((token) => listDirectory(COMPUTERS, token));
      if (mine !== asked.current) return;
      if (answer.kind === "ok") {
        const next = answer.value;
        // Solo cambia si cambió: las filas iguales conservan su objeto.
        setDirectory((old) => (old && JSON.stringify(old) === JSON.stringify(next) ? old : next));
        setFailure(null);
      } else {
        setFailure(failureOf(answer));
      }
    } catch {
      if (mine === asked.current) setFailure("unreachable");
    } finally {
      if (mine === asked.current) setLoading(false);
    }
  }, [signedIn, call]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pin = useCallback(
    async (entry: DirectoryEntry): Promise<string | null> => {
      const known = current.current;
      if (!known || entry.support || !signedIn) return "not_allowed";
      const keys = pinKeys(known.workspaces, entry);
      // Se pinta antes de mandarlo; si el plano de control lo rechaza, la recarga lo deja como estaba.
      setDirectory({ ...known, workspaces: withPins(known.workspaces, keys) });
      try {
        const answer = await call((token) => setDirectoryPins(COMPUTERS, token, keys));
        if (answer.kind === "ok") {
          const saved = answer.value;
          setDirectory((old) => (old ? { ...old, workspaces: withPins(old.workspaces, saved) } : old));
          setFailure(null);
          return null;
        }
        // La recarga deshace lo pintado; el aviso de la pantalla lleva el código.
        void reload();
        return failureOf(answer);
      } catch {
        void reload();
        return "unreachable";
      }
    },
    [signedIn, call, reload],
  );

  return { directory, signedIn, loading, failure, reload, pin };
}
