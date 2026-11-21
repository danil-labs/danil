import { lazy, createSignal, createMemo, Show, on, onCleanup, type JSX } from "solid-js";
import { Tabs } from "@danil/ui";
import { useMachines, type MachineConnection } from "@danil/feature-machines";
import { useWorkspaces } from "@danil/feature-workspaces";
import type { TaskRecord } from "@danil/feature-projects";
import type { ChatScreenProps } from "@danil/feature-chat";
import type { Route } from "./router.tsx";

// src/routes.tsx es el ÚNICO archivo del shell que compone features (Regla R3).
// Carga diferida con lazy e imports con nombre por ruta y pestaña (RV1 #24, RV2 #26).
export const MachinesScreen = lazy(() =>
  import("@danil/feature-machines").then((m) => ({ default: m.MachinesScreen }))
);

export const ProjectsScreen = lazy(() =>
  import("@danil/feature-projects").then((m) => ({ default: m.ProjectsScreen }))
);

export const ChatScreen = lazy(() =>
  import("@danil/feature-chat").then((m) => ({ default: m.ChatScreen }))
);

export const FilesScreen = lazy(() =>
  import("@danil/feature-files").then((m) => ({ default: m.FilesScreen }))
);

export const TerminalScreen = lazy(() =>
  import("@danil/feature-terminal").then((m) => ({ default: m.TerminalScreen }))
);

export const AiCredentialsScreen = lazy(() =>
  import("@danil/feature-ai-credentials").then((m) => ({ default: m.AiCredentialsScreen }))
);

export const AccountScreen = lazy(() =>
  import("@danil/feature-account").then((m) => ({ default: m.AccountScreen }))
);

const RailGroups = lazy(() =>
  import("@danil/feature-workspaces").then((m) => ({ default: m.RailGroups }))
);

// Objeto features retirado para evitar un solo bundle en el arranque (RV1 #23, RV1 #24).
// Se mantiene export undefined para compatibilidad con re-exports sin crear dependencias.
export const features = undefined;

export interface RailSlotProps {
  activeWorkspaceId?: string | null;
  onSelectWorkspace?: (workspaceId: string) => void | Promise<void>;
  onAddWorkspace?: (orgId?: string) => void;
}

export function RailSlot(props: RailSlotProps): JSX.Element {
  return (
    <RailGroups
      activeWorkspaceId={props.activeWorkspaceId}
      onSelectWorkspace={props.onSelectWorkspace}
      onAddWorkspace={props.onAddWorkspace}
    />
  );
}

export function WorkspaceScreen(props: { id: string }): JSX.Element {
  // Resuelve la máquina del workspace y la conexión única de motor (RV1 #1, RV2 #1)
  const { machines, connect } = useMachines();
  const { workspaces } = useWorkspaces();

  // Estado de vista del workspace: tarea elegida en Proyectos (RV1 #1, RV2 #1)
  const [selectedTask, setSelectedTask] = createSignal<TaskRecord | null>(null);

  const currentWorkspace = createMemo(() => {
    return workspaces()?.find((w) => w.id === props.id);
  });

  const targetMachine = createMemo(() => {
    const ws = currentWorkspace();
    const list = machines() ?? [];
    // La máquina de la organización del workspace; nunca la de otra organización.
    if (!ws?.org) return undefined;
    return list.find((m) => m.organization_id === ws.org);
  }, undefined, { equals: (a, b) => a?.machine_id === b?.machine_id });

  const conn = createMemo(
    on(targetMachine, (m) => {
      if (!m) return undefined;
      const c = connect(m);
      onCleanup(() => {
        c.close();
      });
      return c;
    })
  );

  onCleanup(() => {
    conn()?.close();
  });

  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%", width: "100%", overflow: "hidden" }}>
      <Tabs defaultValue="projects" class="workspace-tabs" style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
        <Tabs.List class="workspace-tabs-list" style={{ display: "flex", "border-bottom": "1px solid var(--border-subtle, rgba(255,255,255,0.08))", padding: "0 16px" }}>
          <Tabs.Trigger value="projects" class="workspace-tab-trigger">Proyectos</Tabs.Trigger>
          <Tabs.Trigger value="chat" class="workspace-tab-trigger">Chat</Tabs.Trigger>
          <Tabs.Trigger value="files" class="workspace-tab-trigger">Archivos</Tabs.Trigger>
          <Tabs.Trigger value="terminal" class="workspace-tab-trigger">Terminal</Tabs.Trigger>
        </Tabs.List>
        <div style={{ flex: "1", overflow: "auto" }}>
          <Tabs.Content value="projects" style={{ height: "100%" }}>
            <Show
              when={conn()}
              fallback={
                <div class="flex h-32 items-center justify-center text-xs text-neutral-400">
                  Conectando con la máquina del espacio...
                </div>
              }
            >
              {(c) => (
                <ProjectsScreen
                  conn={c()}
                  workspaceId={props.id}
                  selectedTaskId={selectedTask()?.id}
                  onSelectTask={(task) => setSelectedTask(task)}
                />
              )}
            </Show>
          </Tabs.Content>
          <Tabs.Content value="chat" style={{ height: "100%" }}>
            <Show
              when={conn()}
              fallback={
                <div class="flex h-32 items-center justify-center text-xs text-neutral-400">
                  Conectando con la máquina del espacio...
                </div>
              }
            >
              {(c) => (
                <Show
                  when={selectedTask()}
                  fallback={
                    <div class="flex h-48 flex-col items-center justify-center gap-1 p-6 text-center text-xs text-neutral-400">
                      <p class="m-0 font-medium text-neutral-300">Ninguna tarea seleccionada</p>
                      <p class="m-0 text-neutral-500">
                        Selecciona una tarea en la pestaña Proyectos para iniciar o ver la conversación con el agente.
                      </p>
                    </div>
                  }
                >
                  {(task) => (
                    <ChatScreen
                      conn={c()}
                      sessionId={task().id}
                      project={task().project}
                    />
                  )}
                </Show>
              )}
            </Show>
          </Tabs.Content>
          <Tabs.Content value="files" style={{ height: "100%" }}>
            <Show
              when={conn()}
              fallback={
                <div class="flex h-32 items-center justify-center text-xs text-neutral-400">
                  Conectando con la máquina del espacio...
                </div>
              }
            >
              {(c) => <FilesScreen conn={c()} />}
            </Show>
          </Tabs.Content>
          <Tabs.Content value="terminal" style={{ height: "100%" }}>
            <Show
              when={conn()}
              fallback={
                <div class="flex h-32 items-center justify-center text-xs text-neutral-400">
                  Conectando con la máquina del espacio...
                </div>
              }
            >
              {(c) => <TerminalScreen conn={c()} />}
            </Show>
          </Tabs.Content>
        </div>
      </Tabs>
    </div>
  );
}

export function RouteView(props: { route: Route; activeWorkspaceId?: string }): JSX.Element {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Show when={props.route.name === "machines"}>
        <MachinesScreen />
      </Show>
      <Show when={props.route.name === "workspace"}>
        {(props.route as { name: "workspace"; id: string }).id && (
          <WorkspaceScreen id={(props.route as { name: "workspace"; id: string }).id} />
        )}
      </Show>
      <Show when={props.route.name === "ai-credentials"}>
        <AiCredentialsScreen workspaceId={props.activeWorkspaceId} />
      </Show>
      <Show when={props.route.name === "account"}>
        <AccountScreen />
      </Show>
    </div>
  );
}
