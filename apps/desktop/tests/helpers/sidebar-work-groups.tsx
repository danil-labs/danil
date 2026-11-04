import "../../src/locales/catalogs";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { encode, type MergeContext } from "@terminus/fleet";
import { UNKNOWN_TASK_GIT, type SidebarGrouping, type TaskGitStatus } from "@terminus/tasks";
import Sidebar from "../../src/features/shell/Sidebar";
import type { SessionRow } from "../../src/features/projects/Sessions";
import { setMachineRoute } from "../../src/lib/invoke";
import { setSidebarView } from "../../src/lib/sidebarView";

let intervalId = 0;
window.setInterval = (() => ++intervalId) as typeof window.setInterval;
window.clearInterval = () => {};

const context: MergeContext = { self: "mac", on: () => true, order: ["mac", "vm"], registry: null };
const task = (id: string, extra: Partial<SessionRow> = {}): SessionRow => ({
  id, title: id, provider: "claude", model: null, refs: [], created_at: 1, updated_at: 1, turns: 1,
  parent: null, subagent: null, esperando: false, stage: null, agent: null, ...extra,
});
const remote = encode(context, "vm", [task("review"), task("ready"), task("draft"), task("child", { parent: "ready", subagent: "worker", pinned: true })], "list_live_sessions") as SessionRow[];
const initial = { p: [task("review"), ...remote.map(row => ({ ...row, machine: "vm" }))] };
const [sessions, setSessions] = createSignal(initial);
const status = (extra: Partial<TaskGitStatus>): TaskGitStatus => ({
  ...UNKNOWN_TASK_GIT, kind: "branch", branch: "work", head: "abc", has_remote: true, pull_known: true, ...extra,
});
const remoteGit = encode(context, "vm", {
  review: status({ pull: { number: 1, state: "open", head_sha: "abc" } }),
  ready: status({ pull: { number: 2, state: "merged", head_sha: "abc" } }),
  draft: status({ pull: null }),
  child: UNKNOWN_TASK_GIT,
}, "list_session_git") as Record<string, TaskGitStatus>;
const git: Record<string, TaskGitStatus> = { review: status({ kind: "kn", kn: "saved" }), ...remoteGit };
const calls: { project: unknown; priority: unknown; remote: unknown }[] = [];
const ipc = async (command: string, args?: Record<string, unknown>) => {
  if (command === "list_session_git") {
    calls.push({ project: args?.project, priority: args?.priority, remote: args?.remote });
    return git;
  }
  if (command === "list_agent_profiles") return {};
  if (command === "task_history") return { files: [], commits: [] };
  if (command === "list_workspace_attention") return [];
  return [];
};
Object.assign(window, { __TAURI_INTERNALS__: { transformCallback: () => 1, unregisterCallback: () => {}, invoke: ipc } });
setMachineRoute(ipc);
const noop = () => {};
const viewKey = "sidebar-groups-fixture";
setSidebarView(viewKey, { folders: [], agent: null, group: "folder" });
const dispose = render(() => <Sidebar
  projects={[{ id: "p", name: "Project", node: null, sources: [], created_at: 1, updated_at: 1, sessions: 5, kind: "git" }]}
  sessions={sessions()} current={null} vivas={[]} aprobando={[]} collapsed={false}
  viewKey={viewKey} clon={null} proyectoAbierto={null} modelos={{ superficies: [], catalogos: {} }}
  onToggle={noop} onPick={noop} onNew={noop} onRenombrarProyecto={noop} onBorrarProyecto={noop}
  onAbrirClon={noop} onAbrirProyecto={noop} onNuevaTareaEn={noop} onDelete={noop} onMove={noop}
  onEtapa={noop} onRenombrar={noop} onSettings={noop} onHablarCon={noop} onAgentProfile={noop}
/>, document.getElementById("root")!);
Object.assign(window, { workGrouping: {
  calls,
  group: (group: SidebarGrouping) => setSidebarView(viewKey, { folders: [], agent: null, group }),
  merge: () => {
    git["vm~review"] = status({ pull: { number: 1, state: "merged", head_sha: "abc" } });
    setSessions({ p: sessions().p.map(row => ({ ...row, updated_at: row.updated_at + 1 })) });
  },
  dispose,
} });
