import {
  type SidebarGrouping,
  type SidebarGroup,
  type SidebarSection,
  type SidebarStatusKey,
  type SidebarView,
  sanitizeSidebarView,
} from "@terminus/tasks";
import { createRoot, createSignal } from "solid-js";
import { t } from "./i18n.ts";
import { escribirPref, leerPref } from "./prefs.ts";

// La vista (filtrar, agrupar) es la misma en el teléfono: vive en `@terminus/tasks`.
export {
  type SidebarGroup,
  type SidebarGrouping,
  type SidebarSection,
  type SidebarStatusKey,
  type SidebarTask,
  type SidebarView,
  DEFAULT_SIDEBAR_VIEW,
  agentOptions,
  applySidebarView,
  groupKey,
  nonDefaultCount,
  sameAgent,
} from "@terminus/tasks";

/** La vista se guarda por workspace y espacio, como la tira de pestañas. */
export function sidebarViewKey(workspace: string | null, space: string | null): string {
  return space ? `sidebar.view.${workspace ?? ""}.${space}` : `sidebar.view.${workspace ?? ""}`;
}

export function loadSidebarView(key: string): SidebarView {
  return sanitizeSidebarView(leerPref<unknown>(key, null));
}

export function saveSidebarView(key: string, view: SidebarView) {
  escribirPref(key, sanitizeSidebarView(view));
}

/**
 * La vista viva de cada clave, una sola para toda la ventana: el riel la pinta
 * y el botón Personalizar de la franja la cambia, y ninguno depende de que el
 * otro sea la misma instancia. Antes cada riel tenía su señal y un cambio
 * podía guardarse sin que el riel que se ve se enterara hasta reiniciar.
 */
const [vivas, setVivas] = createRoot(() => createSignal<Record<string, SidebarView>>({}));

export function sidebarView(key: string): SidebarView {
  return vivas()[key] ?? loadSidebarView(key);
}

export function setSidebarView(key: string, view: SidebarView) {
  const limpia = sanitizeSidebarView(view);
  saveSidebarView(key, limpia);
  setVivas((antes) => ({ ...antes, [key]: limpia }));
}

export function groupingLabel(group: SidebarGrouping): string {
  switch (group) {
    case "folder": return t("shell.sidebar.view.group_folder");
    case "status": return t("shell.sidebar.view.group_status");
    case "agent": return t("shell.sidebar.view.group_agent");
    case "machine": return t("shell.sidebar.view.group_machine");
    default: return t("shell.sidebar.view.group_none");
  }
}

/** La línea bajo «Nueva tarea» que dice qué se enseña. */
export function scopeLabel(view: SidebarView, folderName: (id: string) => string): string {
  const parts = [view.folders.length ? view.folders.map(folderName).join(", ") : t("shell.sidebar.view.all_folders")];
  if (view.agent) parts.push(view.agent);
  switch (view.group) {
    case "folder": parts.push(t("shell.sidebar.view.scope_by_folder")); break;
    case "status": parts.push(t("shell.sidebar.view.scope_by_status")); break;
    case "agent": parts.push(t("shell.sidebar.view.scope_by_agent")); break;
    case "machine": parts.push(t("shell.sidebar.view.scope_by_machine")); break;
  }
  return parts.join(" · ");
}

export function sectionLabel(_section: SidebarSection): string {
  return t("shell.sidebar.view.section_active");
}

export function statusGroupLabel(key: SidebarStatusKey): string {
  switch (key) {
    case "draft": return t("shell.sidebar.view.status_draft");
    case "review": return t("shell.sidebar.view.status_review");
    case "ready": return t("shell.sidebar.view.status_ready");
    case "closed": return t("shell.sidebar.view.status_closed");
    default: return t("shell.sidebar.view.status_unknown");
  }
}

/** `machineName`: el nombre de una máquina; la clave `""` es la de la ventana, y sin nombre es «Esta máquina». */
export function groupLabel(
  group: SidebarGroup<unknown>,
  folderName: (id: string) => string,
  machineName: (id: string) => string = (id) => id,
): string {
  switch (group.kind) {
    case "machine": return machineName(group.key) || t("shell.sidebar.view.this_machine");
    case "section": return sectionLabel(group.key as SidebarSection);
    case "status": return statusGroupLabel(group.key as SidebarStatusKey);
    case "folder": {
      const folder = group.key ? folderName(group.key) : t("shell.sidebar.view.no_folder");
      // Partida por máquina: «Terminus · Esta Mac», «Terminus · vm-principal».
      if (group.machine === undefined) return folder;
      return `${folder} · ${machineName(group.machine) || t("shell.sidebar.view.this_machine")}`;
    }
    default: return group.key || t("shell.sidebar.view.no_agent");
  }
}
