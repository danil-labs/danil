/**
 * Clonar en otra máquina. El relay no abre el canal de `clone_project`: el clon
 * se pide con `start_project_clone`, avanza con el evento `project_clone` y se
 * recupera con `project_clone_status` tras recargar o perder la conexión
 * (seldon-host `docs/connector.md`, «Clonar desde el relay»).
 */
import { invoke } from "../../engine/client";
import { t } from "../../lib/i18n";
import type { Project } from "../../lib/model";
import { borrarPref, escribirPref, leerPref } from "../../lib/prefs";
import { listen } from "../../lib/serviceEvents";
import type { Failure } from "../../ui/Failure";
import { REMOTE_CLONES, type RemoteClone } from "./AddWorkdir";

export type CloneProgress = { phase: string; percent: number | null };
type CloneEvent = { operation?: string; phase?: string; percent?: number | null; done?: boolean; project?: Project; error?: unknown };

/** Los eventos pueden perderse con el relay caído: el estado se pregunta también cada tanto. */
const STATUS_EVERY = 5_000;

const on = (machine: string) => ({ headers: { "x-terminus-machine": machine } });
const saved = () => leerPref<RemoteClone[]>(REMOTE_CLONES, []);

function remember(clone: RemoteClone) {
  escribirPref(REMOTE_CLONES, [...saved().filter((c) => c.operation !== clone.operation), clone]);
}

function forget(operation: string) {
  const left = saved().filter((c) => c.operation !== operation);
  if (left.length) escribirPref(REMOTE_CLONES, left);
  else borrarPref(REMOTE_CLONES);
}

/** Un motor que se reinició ya no recuerda el clon: se dice así y no se espera para siempre. */
const lost = (): Failure => ({ what: t("projects.add.clone_lost"), detail: "clone_lost" });

/**
 * Sigue un clon de otra máquina hasta su final; con `start`, lo empieza antes.
 * Resuelve con el proyecto o rechaza con el `Failure` del motor
 * (`projects.error.clone_cancelled` si se canceló).
 */
export async function followClone(clone: RemoteClone, start: Record<string, unknown> | null, onProgress: (progress: CloneProgress) => void): Promise<Project> {
  let settle: (event: CloneEvent) => void = () => {};
  let ended = false;
  const finished = new Promise<CloneEvent>((done) => {
    settle = (event) => {
      ended = true;
      done(event);
    };
  });
  const seen = (event: CloneEvent | null | undefined) => {
    if (ended || !event || event.operation !== clone.operation) return;
    if (event.done) settle(event);
    else onProgress({ phase: event.phase ?? "waiting", percent: event.percent ?? null });
  };
  const stop = await listen<CloneEvent>("project_clone", (event) => seen(event.payload));
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    if (start) {
      remember(clone);
      try {
        await invoke("start_project_clone", start, on(clone.machine));
      } catch (error) {
        forget(clone.operation);
        throw error;
      }
    }
    const ask = async () => {
      const last = await invoke<CloneEvent | null>("project_clone_status", { operation: clone.operation, workspace: clone.workspace }, on(clone.machine)).catch(() => undefined);
      if (last === null && !ended) settle({ done: true, error: lost() });
      else seen(last);
    };
    void ask();
    timer = setInterval(() => void ask(), STATUS_EVERY);
    const last = await finished;
    forget(clone.operation);
    if (last.error || !last.project) throw last.error ?? lost();
    return last.project;
  } finally {
    clearInterval(timer);
    stop();
  }
}

export function cancelClone(clone: RemoteClone) {
  return invoke("cancel_project_clone", { operation: clone.operation, workspace: clone.workspace }, on(clone.machine));
}
