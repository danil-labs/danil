import { Show, type Component, type JSX } from "solid-js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@danil/ui";
import type { Route } from "./router.tsx";

// src/routes.tsx es el ÚNICO archivo del shell que compone features (Regla R3)
import * as MachinesFeature from "@danil/feature-machines";
import * as WorkspacesFeature from "@danil/feature-workspaces";
import * as AccountFeature from "@danil/feature-account";
import * as ProjectsFeature from "@danil/feature-projects";
import * as ChatFeature from "@danil/feature-chat";
import * as TerminalFeature from "@danil/feature-terminal";
import * as FilesFeature from "@danil/feature-files";
import * as AICredentialsFeature from "@danil/feature-ai-credentials";

// Conservar referencias para evitar unused warnings y permitir composición futura
export const features = {
  machines: MachinesFeature,
  workspaces: WorkspacesFeature,
  account: AccountFeature,
  projects: ProjectsFeature,
  chat: ChatFeature,
  terminal: TerminalFeature,
  files: FilesFeature,
  aiCredentials: AICredentialsFeature,
};

function PlaceholderScreen(props: { title: string; subtitle?: string }): JSX.Element {
  return (
    <div class="flex h-full flex-col p-8 font-sans">
      <div class="mb-2 text-lg font-semibold text-neutral-950 dark:text-neutral-100">
        {props.title}
      </div>
      <Show when={props.subtitle}>
        <div class="text-xs text-neutral-500">{props.subtitle}</div>
      </Show>
    </div>
  );
}

const getFeatureScreen = <T extends Component<any>>(
  module: Record<string, unknown>,
  name: string,
): T | undefined => {
  return typeof module[name] === "function" ? (module[name] as T) : undefined;
};

export interface RailSlotProps {
  activeWorkspaceId?: string | null;
  onSelectWorkspace?: (workspaceId: string) => void | Promise<void>;
  onAddWorkspace?: (orgId?: string) => void;
}

export function RailSlot(props: RailSlotProps): JSX.Element {
  const Component = getFeatureScreen<Component<WorkspacesFeature.RailGroupsProps>>(
    WorkspacesFeature,
    "RailGroups",
  );
  if (Component) {
    return (
      <Component
        activeWorkspaceId={props.activeWorkspaceId}
        onSelectWorkspace={props.onSelectWorkspace}
        onAddWorkspace={props.onAddWorkspace}
      />
    );
  }
  return null;
}

export function MachinesScreen(): JSX.Element {
  const FeatureComponent = getFeatureScreen(MachinesFeature, "MachinesScreen");
  if (FeatureComponent) {
    return <FeatureComponent />;
  }
  return <PlaceholderScreen title="Máquinas" subtitle="Gestión y estado de tus máquinas conectadas" />;
}

export function ProjectsScreen(props: { workspaceId?: string; conn?: any }): JSX.Element {
  const FeatureComponent = getFeatureScreen<Component<any>>(
    ProjectsFeature,
    "ProjectsScreen",
  );
  if (FeatureComponent) {
    return <FeatureComponent workspaceId={props.workspaceId} conn={props.conn} />;
  }
  return <PlaceholderScreen title="Proyectos" subtitle="Tareas y proyectos del espacio seleccionado" />;
}

export function ChatScreen(props: { workspaceId?: string; sessionId?: string; conn?: any }): JSX.Element {
  const FeatureComponent = getFeatureScreen<Component<any>>(
    ChatFeature,
    "ChatScreen",
  );
  if (FeatureComponent) {
    return (
      <FeatureComponent
        workspaceId={props.workspaceId}
        sessionId={props.sessionId ?? props.workspaceId ?? ""}
        conn={props.conn}
      />
    );
  }
  return <PlaceholderScreen title="Chat" subtitle="Conversación y turnos con el agente" />;
}

export function FilesScreen(props: { workspaceId?: string; conn?: any }): JSX.Element {
  const FeatureComponent = getFeatureScreen<Component<any>>(
    FilesFeature,
    "FilesScreen",
  );
  if (FeatureComponent) {
    return <FeatureComponent workspaceId={props.workspaceId} conn={props.conn} />;
  }
  return <PlaceholderScreen title="Archivos" subtitle="Explorador de archivos del espacio de trabajo" />;
}

export function TerminalScreen(props: { workspaceId?: string }): JSX.Element {
  const FeatureComponent = getFeatureScreen<Component<any>>(
    TerminalFeature,
    "TerminalScreen",
  );
  if (FeatureComponent) {
    return <FeatureComponent workspaceId={props.workspaceId} />;
  }
  return (
    <PlaceholderScreen
      title="Terminal"
      subtitle="Terminal y procesos interactivos del espacio de trabajo"
    />
  );
}

export function WorkspaceScreen(props: { id: string }): JSX.Element {
  return (
    <div class="flex h-full w-full flex-col overflow-hidden bg-background">
      <Tabs defaultValue="projects" class="flex h-full flex-col">
        <TabsList class="border-b border-border px-4 pt-2">
          <TabsTrigger value="projects">Proyectos</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="files">Archivos</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
        </TabsList>
        <div class="flex-1 min-h-0 overflow-auto">
          <TabsContent value="projects" class="h-full">
            <ProjectsScreen workspaceId={props.id} />
          </TabsContent>
          <TabsContent value="chat" class="h-full">
            <ChatScreen workspaceId={props.id} sessionId={props.id} />
          </TabsContent>
          <TabsContent value="files" class="h-full">
            <FilesScreen workspaceId={props.id} />
          </TabsContent>
          <TabsContent value="terminal" class="h-full">
            <TerminalScreen workspaceId={props.id} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export function AiCredentialsScreen(props: { workspaceId?: string }): JSX.Element {
  const FeatureComponent = getFeatureScreen<Component<{ workspaceId?: string }>>(
    AICredentialsFeature,
    "AiCredentialsScreen",
  );
  if (FeatureComponent) {
    return <FeatureComponent workspaceId={props.workspaceId} />;
  }
  return (
    <PlaceholderScreen
      title="Credenciales de IA"
      subtitle="Proveedores y modelos configurados para este espacio"
    />
  );
}

export function AccountScreen(): JSX.Element {
  const FeatureComponent = getFeatureScreen(AccountFeature, "AccountScreen");
  if (FeatureComponent) {
    return <FeatureComponent />;
  }
  return <PlaceholderScreen title="Cuenta" subtitle="Perfil y configuración del plan" />;
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
      <Show when={props.route.name === "ai-credentials"}>
        <AiCredentialsScreen workspaceId={props.activeWorkspaceId} />
      </Show>
      <Show when={props.route.name === "account"}>
        <AccountScreen />
      </Show>
    </div>
  );
}
