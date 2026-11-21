import { createContext, useContext } from "solid-js";
import type { InvokeOptions } from "@tauri-apps/api/core";

/**
 * La máquina de la tarea cuyo chat se pinta; `undefined` es la de la ventana.
 * Una ruta del mensaje es de su disco, y una orden con solo `path` iría al
 * motor de la ventana: la máquina sale solo de esta cabecera (`router.ts`).
 */
export const FileMachine = createContext<() => string | undefined>(() => undefined);

/** Las opciones de `invoke` para leer un archivo que nombra el chat, en su máquina. */
export function useFileMachine(): () => InvokeOptions | undefined {
  const machine = useContext(FileMachine);
  return () => {
    const id = machine();
    return id ? { headers: { "x-terminus-machine": id } } : undefined;
  };
}
