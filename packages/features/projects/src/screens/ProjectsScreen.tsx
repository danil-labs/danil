import { For, Show, createMemo, createSignal } from "solid-js";
import type { MachineConnection } from "@danil/engine-client";
import type { DeleteTaskTarget, TaskRecord } from "../model.ts";
import { useProjects } from "../queries.ts";
import { DeleteTaskDialog } from "../components/DeleteTaskDialog.tsx";
import { ProjectItemView } from "../components/ProjectItemView.tsx";
import { TaskErrorView } from "../components/TaskErrorView.tsx";

export interface ProjectsScreenProps {
  conn: MachineConnection;
  workspaceId?: string;
  selectedTaskId?: string;
  onSelectTask?: (task: TaskRecord) => void;
}

export function ProjectsScreen(props: ProjectsScreenProps) {
  const { projects, tasksByProject, loading, error, refetch } = useProjects(
    () => props.conn,
    () => props.workspaceId
  );

  const [search, setSearch] = createSignal("");
  const [deleteTarget, setDeleteTarget] = createSignal<DeleteTaskTarget | null>(null);

  const filteredProjects = createMemo(() => {
    const query = search().toLowerCase().trim();
    const allProjects = projects();
    if (!query) return allProjects;

    return allProjects.filter((p) => {
      const matchProject = p.name.toLowerCase().includes(query);
      const projectTasks = tasksByProject()[p.id] ?? [];
      const matchTask = projectTasks.some((t) =>
        t.title.toLowerCase().includes(query) || t.id.toLowerCase().includes(query)
      );
      return matchProject || matchTask;
    });
  });

  const totalTasksCount = createMemo(() => {
    return projects().reduce((acc, p) => acc + (tasksByProject()[p.id]?.length ?? 0), 0);
  });

  function handleDeleteTask(task: TaskRecord) {
    setDeleteTarget({
      project: task.project,
      id: task.id,
      workspace: props.workspaceId,
      machineName: "Esta máquina",
    });
  }

  return (
    <div class="flex h-full w-full flex-col overflow-hidden bg-neutral-50 text-ui">
      <header class="flex flex-col gap-3 border-b border-neutral-200 bg-white p-4">
        <div class="flex items-center justify-between gap-4">
          <div class="flex flex-col">
            <h1 class="m-0 text-base font-semibold text-neutral-900">
              Proyectos y Tareas
            </h1>
            <span class="text-xs text-neutral-500">
              {projects().length} {projects().length === 1 ? "proyecto" : "proyectos"} · {totalTasksCount()} {totalTasksCount() === 1 ? "tarea" : "tareas"}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              disabled={loading()}
              onClick={() => refetch()}
            >
              Actualizar
            </button>
          </div>
        </div>

        <div class="flex items-center">
          <input
            type="search"
            placeholder="Buscar proyectos o tareas..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
            class="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </header>

      <main class="flex-1 overflow-y-auto p-4">
        <Show when={error()}>
          <TaskErrorView error={error()} onRetry={() => refetch()} />
        </Show>

        <Show when={!error()}>
          <Show
            when={!loading() || projects().length > 0}
            fallback={
              <div class="flex h-32 items-center justify-center text-xs text-neutral-400">
                Cargando proyectos y tareas...
              </div>
            }
          >
            <Show
              when={filteredProjects().length > 0}
              fallback={
                <div class="flex h-48 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-500">
                  <p class="m-0 font-medium">No se encontraron proyectos</p>
                  <Show when={search()}>
                    <p class="m-0 text-neutral-400">
                      No hay coincidencias para «{search()}».
                    </p>
                  </Show>
                </div>
              }
            >
              <div class="flex flex-col gap-3">
                <For each={filteredProjects()}>
                  {(project) => (
                    <ProjectItemView
                      project={project}
                      tasks={tasksByProject()[project.id] ?? []}
                      selectedTaskId={props.selectedTaskId}
                      onSelectTask={props.onSelectTask}
                      onDeleteTask={handleDeleteTask}
                    />
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </main>

      <Show when={deleteTarget()}>
        {(target) => (
          <DeleteTaskDialog
            conn={props.conn}
            target={target()}
            onClose={() => setDeleteTarget(null)}
          />
        )}
      </Show>
    </div>
  );
}
