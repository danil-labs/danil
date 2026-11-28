import Plus from "lucide-solid/icons/plus";
import { For, Show } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import type { Project } from "../../../ui/src/lib/model";
import { SidebarCard, SidebarCardAction } from "../../../ui/src/SidebarCard";

/**
 * Collapsible Projects list inside the left sidebar (Claude-style structure).
 * Renders each project as a clean `SidebarCard` (no folder icon) with a `+` button
 * to immediately start a new task inside that project.
 */
export default function ProjectsDock(props: {
  projects: readonly Project[];
  activeProjectId: string | null;
  taskCountOf: (projectId: string) => number;
  onOpenProject: (projectId: string) => void;
  onNewTaskIn: (projectId: string) => void;
}) {
  return (
    <Show
      when={props.projects.length > 0}
      fallback={
        <p class="m-0 px-2 py-1 text-caption text-neutral-500" data-projects-dock-empty="">
          {t("shell.sidebar.folder_empty")}
        </p>
      }
    >
      <div class="flex min-w-0 flex-col gap-1.5" data-projects-dock="">
        <For each={props.projects}>
          {(project) => {
            const count = () => props.taskCountOf(project.id);
            return (
              <SidebarCard
                data-sidebar-card="project"
                data-sidebar-project={project.id}
                active={props.activeProjectId === project.id}
                title={project.name}
                subtitle={count() > 0 ? `${count()} ${t("shell.sidebar.tasks").toLowerCase()}` : undefined}
                ariaLabel={project.name}
                onClick={() => props.onOpenProject(project.id)}
                trailing={
                  <SidebarCardAction
                    ariaLabel={t("shell.sidebar.new_task_in", { name: project.name })}
                    title={t("shell.sidebar.new_task_in", { name: project.name })}
                    onClick={() => props.onNewTaskIn(project.id)}
                  >
                    <Plus size={13} aria-hidden="true" />
                  </SidebarCardAction>
                }
              />
            );
          }}
        </For>
      </div>
    </Show>
  );
}
