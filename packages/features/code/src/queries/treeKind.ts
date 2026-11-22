import { invoke } from "../../../../engine-client/src/client.ts";
import { machineOf } from "../../../../host/src/machine";
import type { ArbolEnTarea } from "../../../../../apps/desktop/src/lib/model";
import { esDeCodigo } from "../../../../ui/src/lib/workdirKind";

/**
 * De qué clase es cada árbol de una tarea, para que una pestaña sepa si abre en
 * código o como documento sin que cada camino que abre archivos lo tenga que
 * pasar. Lo llena `Code.tsx` al listar; quien llega antes lo pide.
 */
const clases = new Map<string, string>();
const clave = (session: string, arbol: string) => `${session}\n${arbol}`;

export function recordarArboles(session: string, arboles: readonly Pick<ArbolEnTarea, "key" | "kind">[]) {
  for (const a of arboles) clases.set(clave(session, a.key), a.kind);
}

export async function arbolesDe(project: string, session: string): Promise<ArbolEnTarea[]> {
  const arboles = await invoke<ArbolEnTarea[]>("list_task_trees", { project, session }, machineOf(session));
  recordarArboles(session, arboles);
  return arboles;
}

/** Sin tarea se lee el commit base de un repositorio: siempre es código. */
export async function esArbolDeCodigo(project: string, session: string, arbol: string): Promise<boolean> {
  if (!session) return true;
  if (!clases.has(clave(session, arbol))) await arbolesDe(project, session);
  return esDeCodigo(clases.get(clave(session, arbol)) ?? "git");
}

const conBarras = (ruta: string) => ruta.replaceAll("\\", "/").replace(/\/+$/, "");

/** El árbol que contiene una ruta absoluta y la ruta dentro de él. */
export function ubicar(arboles: readonly ArbolEnTarea[], absoluta: string): { arbol: ArbolEnTarea; rel: string } | null {
  const ruta = conBarras(absoluta);
  for (const arbol of arboles) {
    const raiz = conBarras(arbol.path);
    if (raiz && ruta.startsWith(`${raiz}/`)) return { arbol, rel: ruta.slice(raiz.length + 1) };
  }
  return null;
}

export function contiene(carpeta: string, absoluta: string): boolean {
  const raiz = conBarras(carpeta);
  return Boolean(raiz) && conBarras(absoluta).startsWith(`${raiz}/`);
}
