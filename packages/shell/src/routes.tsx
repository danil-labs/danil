import { Show, type Component, type JSX } from "solid-js";
import { Tabs } from "@danil/ui";
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
    <div
      style={{
        padding: "32px",
        height: "100%",
        display: "flex",
        "flex-direction": "column",
        "box-sizing": "border-box",
        "font-family": "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ "font-size": "20px", "font-weight": "600", "margin-bottom": "8px" }}>
        {props.title}
      </div>
      <Show when={props.subtitle}>
        <div style={{ opacity: "0.7", "font-size": "13px" }}>{props.subtitle}</div>
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
            <ProjectsScreen workspaceId={props.id} />
          </Tabs.Content>
          <Tabs.Content value="chat" style={{ height: "100%" }}>
            <ChatScreen workspaceId={props.id} sessionId={props.id} />
          </Tabs.Content>
          <Tabs.Content value="files" style={{ height: "100%" }}>
            <FilesScreen workspaceId={props.id} />
          </Tabs.Content>
          <Tabs.Content value="terminal" style={{ height: "100%" }}>
            <TerminalScreen workspaceId={props.id} />
          </Tabs.Content>
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
