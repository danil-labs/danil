/**
 * Las frases de la vista con las palabras compartidas de `@terminus/design`.
 * El escritorio arma las mismas con su `t()` y sus catálogos; el guard
 * `shared-design` comprueba que las palabras coinciden.
 */
import { word } from "../../design/src/index.ts";
import type { DockAgent } from "./dock.ts";
import type { SidebarGroup, SidebarGrouping, SidebarSection, SidebarStatusKey, SidebarView } from "./view.ts";

type Lang = "es" | "en";

export function groupingLabel(lang: Lang, group: SidebarGrouping): string {
  switch (group) {
    case "folder": return word(lang, "shell.sidebar.view.group_folder");
    case "status": return word(lang, "shell.sidebar.view.group_status");
    case "agent": return word(lang, "shell.sidebar.view.group_agent");
    case "machine": return word(lang, "shell.sidebar.view.group_machine");
    default: return word(lang, "shell.sidebar.view.group_none");
  }
}

/** La línea que dice qué se enseña. */
export function scopeLabel(lang: Lang, view: SidebarView, folderName: (id: string) => string): string {
  const parts = [view.folders.length ? view.folders.map(folderName).join(", ") : word(lang, "shell.sidebar.view.all_folders")];
  if (view.agent) parts.push(view.agent);
  switch (view.group) {
    case "folder": parts.push(word(lang, "shell.sidebar.view.scope_by_folder")); break;
    case "status": parts.push(word(lang, "shell.sidebar.view.scope_by_status")); break;
    case "agent": parts.push(word(lang, "shell.sidebar.view.scope_by_agent")); break;
    case "machine": parts.push(word(lang, "shell.sidebar.view.scope_by_machine")); break;
  }
  return parts.join(" · ");
}

export function sectionLabel(lang: Lang, _section: SidebarSection): string {
  return word(lang, "shell.sidebar.view.section_active");
}

export function statusGroupLabel(lang: Lang, key: SidebarStatusKey): string {
  switch (key) {
    case "draft": return word(lang, "shell.sidebar.view.status_draft");
    case "review": return word(lang, "shell.sidebar.view.status_review");
    case "ready": return word(lang, "shell.sidebar.view.status_ready");
    case "closed": return word(lang, "shell.sidebar.view.status_closed");
    default: return word(lang, "shell.sidebar.view.status_unknown");
  }
}

/** `machineName`: el nombre de una máquina; la clave `""` es la de la ventana. */
export function groupLabel(
  lang: Lang,
  group: SidebarGroup<unknown>,
  folderName: (id: string) => string,
  machineName: (id: string) => string = (id) => id,
): string {
  switch (group.kind) {
    case "machine": return group.key ? machineName(group.key) : word(lang, "shell.sidebar.view.this_machine");
    case "section": return sectionLabel(lang, group.key as SidebarSection);
    case "status": return statusGroupLabel(lang, group.key as SidebarStatusKey);
    case "folder": {
      const folder = group.key ? folderName(group.key) : word(lang, "shell.sidebar.view.no_folder");
      if (group.machine === undefined) return folder;
      return `${folder} · ${(group.machine && machineName(group.machine)) || word(lang, "shell.sidebar.view.this_machine")}`;
    }
    default: return group.key || word(lang, "shell.sidebar.view.no_agent");
  }
}

/** Lo que dice el dock bajo la cara de un agente: las mismas palabras que el escritorio. */
export function dockStatusText(lang: Lang, agent: DockAgent): string {
  if (!agent.status || agent.status === "asleep") return word(lang, "projects.sessions.agent_asleep");
  if (agent.status === "working") {
    return agent.liveTasks > 0
      ? word(lang, "projects.sessions.agent_working", { count: agent.liveTasks })
      : word(lang, "projects.sessions.agent_working_alone");
  }
  return agent.minutesSinceLastTurn != null
    ? word(lang, "projects.sessions.agent_awake_since", { minutes: agent.minutesSinceLastTurn })
    : word(lang, "projects.sessions.agent_awake");
}
