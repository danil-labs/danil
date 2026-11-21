import { lazy, createSignal, createMemo, createEffect, createRenderEffect, Show, on, onCleanup, untrack, type JSX } from "solid-js";
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, FailureNote, asFailure } from "@danil/ui";
import { useMachines, type MachineConnection } from "@danil/feature-machines";
import { useWorkspaces } from "@danil/feature-workspaces";
import { useSession } from "@danil/session/solid";
import type { TaskRecord } from "@danil/feature-projects";
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

function WorkspaceConnectionFallback(props: {
  machinesLoading: boolean;
  machinesError: unknown;
  onRetryMachines: () => void;
  hasMachine: boolean;
  isError: boolean;
  isWaking: boolean;
  isStopped?: boolean;
  onRetryConn?: () => void;
}): JSX.Element {
  return (
    <Show
      when={!props.isStopped || props.isWaking}
      fallback={
        <div class="flex h-48 flex-col items-center justify-center gap-3 p-6 text-center text-xs">
          <p class="m-0 font-medium text-neutral-300">La máquina está apagada.</p>
          <Button size="sm" variant="secondary" onClick={props.onRetryConn}>
            Encender y conectar
          </Button>
        </div>
      }
    >
    <Show
      when={!props.machinesError}
      fallback={
        <div class="flex h-48 flex-col items-center justify-center gap-3 p-6 text-center text-xs">
          <FailureNote f={asFailure(props.machinesError)} />
          <Button size="sm" variant="secondary" onClick={props.onRetryMachines}>
            Reintentar
          </Button>
        </div>
      }
    >
      <Show
        when={props.hasMachine || props.machinesLoading}
        fallback={
          <div class="flex h-48 flex-col items-center justify-center gap-1 p-6 text-center text-xs text-neutral-400">
            <p class="m-0 font-medium text-neutral-300">Sin máquina en esta organización</p>
            <p class="m-0 text-neutral-500">
              Este espacio de trabajo no tiene ninguna máquina asignada en esta organización.
            </p>
          </div>
        }
      >
        <Show
          when={!props.isError}
          fallback={
            <div class="flex h-48 flex-col items-center justify-center gap-3 p-6 text-center text-xs">
              <FailureNote f={asFailure("Error al conectar con la máquina del espacio.")} />
              <Show when={props.onRetryConn}>
                <Button size="sm" variant="secondary" onClick={props.onRetryConn}>
                  Reintentar conexión
                </Button>
              </Show>
            </div>
          }
        >
          <div class="flex h-32 items-center justify-center text-xs text-neutral-400">
            {props.isWaking
              ? "Despertando la máquina del espacio..."
              : "Conectando con la máquina del espacio..."}
          </div>
        </Show>
      </Show>
    </Show>
    </Show>
  );
}

export function WorkspaceScreen(props: { id: string }): JSX.Element {
  // Resuelve la máquina del workspace y la conexión única de motor (RV1 #1, RV2 #1)
  const { machines, connect, start, refetch } = useMachines();
  const { workspaces } = useWorkspaces();
  const session = useSession();

  // Estado de vista del workspace: tarea elegida en Proyectos (RV1 #1, RV2 #1)
  const [selectedTask, setSelectedTask] = createSignal<TaskRecord | null>(null);
  // La máquina que la persona pidió encender, por id: el permiso no pasa a otro workspace (RV-FOCO1 #1).
  const [wakeFor, setWakeFor] = createSignal<string | null>(null);
  const [retryCount, setRetryCount] = createSignal(0);

  const currentWorkspace = createMemo(() => {
    return workspaces()?.find((w) => w.id === props.id);
  });

  // Cuando la ruta cambia a workspace/:id, activa la sesión de la organización del workspace (RV1b #21/N5, RV2b #9)
  createRenderEffect(() => {
    const ws = currentWorkspace();
    if (!ws?.org) return;
    const match = session.sessions().find((item) => item.organization_id === ws.org);
    if (match && session.active() !== match.key) {
      session.setActive(match.key);
    }
  });

  const targetMachine = createMemo(() => {
    const ws = currentWorkspace();
    const list = machines() ?? [];
    // La máquina de la organización del workspace; nunca la de otra organización.
    if (!ws?.org) return undefined;
    return list.find((m) => m.organization_id === ws.org);
  }, undefined, { equals: (a, b) => a?.machine_id === b?.machine_id });
  // El estado actual de esa máquina, leído de la lista en cada sondeo (no del objeto memorizado) (RV-FOCO1 #3).
  const targetState = () => {
    const id = targetMachine()?.machine_id;
    return (machines() ?? []).find((m) => m.machine_id === id)?.state;
  };

  const conn = createMemo(
    on(
      () => [targetMachine(), retryCount(), targetState() === "running"] as const,
      ([m, , running]) => {
        if (!m) return undefined;
        // Al cargar solo se conecta a una máquina encendida; una apagada se muestra «apagada» y
        // se despierta solo con el botón de ESA máquina (FOCO NUEVO, M6b).
        // El permiso vale para UNA conexión: se lee y se gasta aquí mismo (SR-FOCO C1).
        const wake = untrack(wakeFor) === m.machine_id;
        if (wake) setWakeFor(null);
        if (!wake && !running) return undefined;
        const c = connect(m, { wake });
        onCleanup(() => c.close());
        return c;
      }
    )
  );

  onCleanup(() => conn()?.close());

  // B-007, paso 2: el motor de la máquina de ESTE workspace marca el workspace activo, con su
  // propio conn y solo cuando está conectado. Por relay el motor no expone el comando
  // (`relay: false`): engine-client lo rechaza tipado y aquí se omite (RV1c N16).
  createEffect(
    on(
      () => [conn(), conn()?.status()] as const,
      ([c, status]) => {
        if (!c || status !== "connected") return;
        c.client.set_active_workspace({ id: props.id }).catch((e: { code?: string }) => {
          if (e?.code !== "not_relayable") console.warn("set_active_workspace", e);
        });
      },
    ),
  );

  const isReady = () => Boolean(conn() && !["error", "stopped"].includes(conn()!.status()));
  const isStopped = () =>
    Boolean(targetMachine()) && (conn()?.status() === "stopped" || (!conn() && targetState() !== "running" && targetState() !== "starting"));
  const isStarting = () => !conn() && targetState() === "starting";
  const isConnError = () => Boolean(conn() && conn()!.status() === "error");
  const isConnWaking = () => Boolean(conn() && conn()!.status() === "waking");

  const renderFallback = () => (
    <WorkspaceConnectionFallback
      machinesLoading={machines.loading}
      machinesError={machines.error}
      onRetryMachines={() => void refetch()}
      hasMachine={Boolean(targetMachine())}
      isError={isConnError()}
      isWaking={isConnWaking() || isStarting()}
      isStopped={isStopped()}
      onRetryConn={() => {
        setWakeFor(targetMachine()?.machine_id ?? null);
        setRetryCount((n) => n + 1);
      }}
    />
  );

  return (
    <div class="flex h-full w-full flex-col overflow-hidden">
      <Tabs defaultValue="projects" class="flex h-full w-full flex-col">
        <TabsList class="border-b border-border px-4">
          <TabsTrigger value="projects">Proyectos</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="files">Archivos</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="credentials">Credenciales</TabsTrigger>
        </TabsList>
        <div class="flex-1 overflow-auto">
          <TabsContent value="projects" class="h-full">
            <Show when={isReady() && conn()} fallback={renderFallback()}>
              {(c) => (
                <ProjectsScreen
                  conn={c()}
                  workspaceId={props.id}
                  selectedTaskId={selectedTask()?.id}
                  onSelectTask={(task) => setSelectedTask(task)}
                />
              )}
            </Show>
          </TabsContent>
          <TabsContent value="chat" class="h-full">
            <Show when={isReady() && conn()} fallback={renderFallback()}>
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
          </TabsContent>
          <TabsContent value="files" class="h-full">
            <Show when={isReady() && conn()} fallback={renderFallback()}>
              {(c) => <FilesScreen conn={c()} />}
            </Show>
          </TabsContent>
          <TabsContent value="terminal" class="h-full">
            <Show when={isReady() && conn()} fallback={renderFallback()}>
              {(c) => <TerminalScreen conn={c()} />}
            </Show>
          </TabsContent>
          <TabsContent value="credentials" class="h-full">
            <Show when={isReady() && conn()} fallback={renderFallback()}>
              {(c) => (
                <AiCredentialsScreen
                  workspaceId={props.id}
                  conn={c()}
                  // Solo las máquinas de la organización de este workspace (RV1c N17, regla 0).
                  knownMachineIds={(machines() ?? [])
                    .filter((m) => m.organization_id === currentWorkspace()?.org)
                    .map((m) => m.machine_id)}
                  onWakeMachine={async (id) => {
                    await start(id);
                  }}
                />
              )}
            </Show>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export function RouteView(props: { route: Route; activeWorkspaceId?: string }): JSX.Element {
  return (
    <div class="relative h-full w-full">
      <Show when={props.route.name === "machines"}>
        <MachinesScreen />
      </Show>
      <Show when={props.route.name === "workspace"}>
        {(props.route as { name: "workspace"; id: string }).id && (
          <WorkspaceScreen id={(props.route as { name: "workspace"; id: string }).id} />
        )}
      </Show>
      <Show when={props.route.name === "account"}>
        <AccountScreen />
      </Show>
    </div>
  );
}
