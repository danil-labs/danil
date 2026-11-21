import { Show, type Component, type JSX } from "solid-js";
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
        background: "#0e0f12",
        color: "#ffffff",
        "font-family": "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ "font-size": "20px", "font-weight": "600", "margin-bottom": "8px" }}>
        {props.title}
      </div>
      <Show when={props.subtitle}>
        <div style={{ color: "#8b8f9e", "font-size": "13px" }}>{props.subtitle}</div>
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

export function MachinesScreen(): JSX.Element {
  const FeatureComponent = getFeatureScreen(MachinesFeature, "MachinesScreen");
  if (FeatureComponent) {
    return <FeatureComponent />;
  }
  return <PlaceholderScreen title="Máquinas" subtitle="Gestión y estado de tus máquinas conectadas" />;
}

export function WorkspaceScreen(props: { id: string }): JSX.Element {
  const FeatureComponent = getFeatureScreen<Component<{ id: string }>>(
    WorkspacesFeature,
    "WorkspaceScreen",
  );
  if (FeatureComponent) {
    return <FeatureComponent id={props.id} />;
  }
  return (
    <PlaceholderScreen
      title={`Espacio de trabajo: ${props.id}`}
      subtitle="Proyectos, tareas y agentes del espacio seleccionado"
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

export function RouteView(props: { route: Route }): JSX.Element {
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
      <Show when={props.route.name === "account"}>
        <AccountScreen />
      </Show>
    </div>
  );
}
