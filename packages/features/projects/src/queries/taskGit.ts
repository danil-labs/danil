import { resolveTaskGit as resolveSharedTaskGit } from "../../../../ui/src/lib/tasks/index.ts";
import { Channel } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";
import { type Accessor, createSignal } from "solid-js";

import { type TaskGitStatus, mergeRemoteGit, readTaskGit, retainGitObservation, sameGit as mismoGit, UNKNOWN_TASK_GIT } from "../../../../ui/src/lib/tasks/index.ts";
export type { CheckState, KnState, ReviewState } from "../../../../ui/src/lib/tasks/index.ts";
export { canFinishTask, mergeRemoteGit } from "../../../../ui/src/lib/tasks/index.ts";
export type GitStatus = TaskGitStatus;
const UNKNOWN_GIT: GitStatus = UNKNOWN_TASK_GIT;

/** El registro nuevo, o el mismo si ninguna fila cambió: así no avisa a nadie. */
function conservarFilas(previous: Record<string, GitStatus>, next: Record<string, GitStatus>) {
  const ids = Object.keys(next);
  return ids.length === Object.keys(previous).length && ids.every(id => previous[id] === next[id]) ? previous : next;
}

function staleGit(rows: Record<string, GitStatus>) {
  return Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, { ...row, stale: true }]));
}

type Entry = {
  error: Accessor<unknown>;
  rows: Accessor<Record<string, GitStatus>>;
  refresh: () => void;
  dispose: () => void;
  interests: Map<symbol, string[]>;
};
const projects = new Map<string, Entry>();
// Cerrar una ventana desmonta la tira y el riel antes de montar los nuevos: el
// observador muere entre medias y el que nace hereda lo visto, no un registro vacío.
const parked = new Map<string, { rows: Record<string, GitStatus>; forget: () => void }>();
function park(project: string, rows: Record<string, GitStatus>) {
  parked.get(project)?.forget();
  const target = window;
  const forget = () => {
    clearTimeout(timer);
    target.removeEventListener("harness:workspace", forget);
    if (parked.get(project)?.rows === rows) parked.delete(project);
  };
  const timer = setTimeout(forget, 3_000);
  target.addEventListener("harness:workspace", forget);
  parked.set(project, { rows, forget });
}
function unpark(project: string) {
  const held = parked.get(project);
  held?.forget();
  return held?.rows ?? {};
}
// Sin corte, una lectura colgada se quedaba su turno hasta reiniciar: la local congelaba
// su carpeta y dos remotas toda la cola. El motor corta cada consulta a GitHub a los 12 s.
export const GIT_READ_DEADLINE = 120_000;
function withDeadline<T>(read: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("git_read_timeout")), GIT_READ_DEADLINE);
  });
  return Promise.race([read, late]).finally(() => clearTimeout(timer));
}
const remoteQueue = new Map<symbol, { rank: () => number; run: () => Promise<void> }>();
let remoteRunning = 0;
function drainRemote() {
  while (remoteRunning < 2 && remoteQueue.size) {
    const next = [...remoteQueue].sort((a, b) => b[1].rank() - a[1].rank())[0];
    remoteQueue.delete(next[0]);
    remoteRunning++;
    void next[1].run().finally(() => { remoteRunning--; drainRemote(); });
  }
}

export function watchSessionGit(project: string, routing?: { workspace: string; machine?: string }) {
  const key = routing?.machine ? JSON.stringify([routing.workspace, routing.machine, project]) : project;
  const options = routing?.machine ? { headers: { "x-terminus-workspace": routing.workspace, "x-terminus-machine": routing.machine } } : undefined;
  let entry = projects.get(key);
  if (!entry) {
    const [rows, setRows] = createSignal<Record<string, GitStatus>>(unpark(key));
    const [error, setError] = createSignal<unknown>(null);
    const interests = new Map<symbol, string[]>();
    let disposed = false;
    let generation = 0;
    let localBusy = false;
    let localSequence = 0;
    let scheduled = false;
    let remoteBusy = false;
    let pending = false;
    let localReady = false;
    let localFailed = false;
    let lastLocal = 0;
    let lastRemote = 0, remoteEvery = 3_000;
    const queueKey = Symbol();
    const priority = () => [...new Set([...interests.values()].flat())];
    const current = (started: number) => !disposed && started === generation;
    const remote = () => {
      if (disposed || remoteBusy || !localReady || document.hidden || Date.now() - lastRemote < remoteEvery) return;
      remoteBusy = true;
      lastRemote = Date.now();
      const started = generation;
      remoteQueue.set(queueKey, {
        rank: () => priority().some(id => rows()[id]) ? 1 : 0,
        run: async () => {
          try {
            if (!current(started) || document.hidden) return;
            const result = await readTaskGit(remote => withDeadline(invoke<Record<string, GitStatus>>("list_session_git", { project, remote, priority: priority(), progress: new Channel<Record<string, GitStatus>>() }, options)), { phase: "remote" });
            if (current(started)) {
              if (!localFailed) setError(null); const before = rows();
              setRows(previous => {
              const merged = mergeRemoteGit(previous, result);
              const next = localFailed || Date.now() - lastLocal >= 30_000 ? staleGit(merged) : merged;
              return conservarFilas(previous, Object.fromEntries(Object.entries(next).map(([id, row]) =>
                [id, previous[id] && mismoGit(previous[id], row) ? previous[id] : row])));
              });
              remoteEvery = rows() === before ? Math.min(remoteEvery * 2, 30_000) : 3_000; // Sin cambios, pregunta cada vez menos.
            }
          } catch (error) {
            if (current(started)) { setError(error); setRows(staleGit); }
          } finally {
            if (current(started)) remoteBusy = false;
          }
        },
      });
      queueMicrotask(drainRemote);
    };
    const refresh = async () => {
      if (scheduled) return;
      scheduled = true;
      await Promise.resolve();
      scheduled = false;
      if (disposed || document.hidden) return;
      if (localBusy) { pending = true; return; }
      localBusy = true;
      const sequence = ++localSequence;
      const started = generation;
      try {
        const progress = new Channel<Record<string, GitStatus>>(partial => {
          if (!current(started) || !localBusy || sequence !== localSequence) return;
          setRows(previous => conservarFilas(previous, { ...previous, ...retainGitObservation(previous, partial) }));
        });
        const local = await readTaskGit(remote => withDeadline(invoke<Record<string, GitStatus>>("list_session_git", { project, remote, priority: priority(), progress }, options)), { phase: "local" });
        if (!current(started)) return;
        setError(null);
        lastLocal = Date.now();
        localFailed = false;
        setRows(previous => conservarFilas(previous, retainGitObservation(previous, local)));
        localReady = true;
        void remote();
      } catch (error) {
        if (current(started)) { localFailed = true; setError(error); setRows(staleGit); }
      } finally {
        if (current(started)) {
          localBusy = false;
          if (pending) { pending = false; void refresh(); }
        }
      }
    };
    const timer = setInterval(() => {
      if (lastLocal && Date.now() - lastLocal >= 30_000) setRows(staleGit);
      void refresh();
    }, 15_000);
    const remoteTimer = setInterval(() => void remote(), 3_000);
    const focus = () => { lastRemote = 0; remoteEvery = 3_000; void refresh(); };
    const workspace = () => {
      generation++;
      remoteQueue.delete(queueKey);
      localBusy = false;
      remoteBusy = false;
      localReady = false;
      localFailed = false;
      lastLocal = 0;
      pending = false;
      lastRemote = 0; remoteEvery = 3_000;
      setRows({});
      void refresh();
    };
    const visible = () => { if (!document.hidden) focus(); };
    window.addEventListener("harness:workspace", workspace);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    entry = { rows, error, refresh: () => { remoteEvery = 3_000; void refresh(); }, interests, dispose: () => {
      disposed = true;
      remoteQueue.delete(queueKey);
      clearInterval(timer);
      clearInterval(remoteTimer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("harness:workspace", workspace);
      document.removeEventListener("visibilitychange", visible);
    } };
    projects.set(key, entry);
    entry.refresh();
  }
  const token = Symbol();
  const current = entry;
  current.interests.set(token, []);
  return { rows: current.rows, error: current.error, refresh: current.refresh,
    prioritize: (ids: string[]) => {
      if (JSON.stringify(current.interests.get(token)) === JSON.stringify(ids)) return;
      const covered = new Set([...current.interests.values()].flat());
      current.interests.set(token, ids);
      if (ids.some(id => !covered.has(id))) current.refresh();
    },
    release: () => {
      current.interests.delete(token);
      if (current.interests.size === 0 && projects.get(key) === current) {
        current.dispose();
        projects.delete(key);
        park(key, current.rows());
      }
    },
  };
}

export function compactGitKind(status?: GitStatus) {
  if (status?.kind === "kn") return "kn";
  if (!status || (status.kind !== "branch" && status.kind !== "detached")) return null;
  return status.pull && status.pull_known ? "pull" : "branch";
}

export function gitReviewSignals(status?: GitStatus) {
  const pull = status?.pull;
  if (!pull || !status.pull_known || !status.head || status.head !== pull.head_sha
    || (pull.state !== "open" && pull.state !== "draft")) return null;
  return { checks: pull.checks ?? "unknown", review: pull.review ?? "unknown" };
}

type TaskGitSession = { id: string; parent?: string | null; subagent?: string | null };

function resolveTaskGit(session: TaskGitSession, rows: Record<string, GitStatus>, sessions: TaskGitSession[]) {
  return resolveSharedTaskGit(session, rows, sessions, UNKNOWN_GIT);
}

export function effectiveTaskGit(
  session: TaskGitSession,
  rows: Record<string, GitStatus>,
  sessions: TaskGitSession[],
): GitStatus {
  return resolveTaskGit(session, rows, sessions).status;
}

export function sharesTaskGit(
  session: TaskGitSession,
  rows: Record<string, GitStatus>,
  sessions: TaskGitSession[],
): boolean {
  return resolveTaskGit(session, rows, sessions).owner !== session.id;
}
