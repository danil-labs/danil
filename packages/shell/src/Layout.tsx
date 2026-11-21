import { type JSX } from "solid-js";
import { Rail, type OrganizationItem } from "./Rail.tsx";
import { RailErrorBoundary, MainErrorBoundary } from "./ErrorBoundary.tsx";
import { RouteView, RailSlot } from "./routes.tsx";
import { useRouter } from "./router.tsx";

export interface LayoutProps {
  organizations?: OrganizationItem[];
  activeWorkspaceId?: string;
  onAddWorkspace?: (organizationId?: string) => void;
  children?: JSX.Element;
}

export function Layout(props: LayoutProps): JSX.Element {
  const router = useRouter();

  const currentRouteName = () => router.route().name;

  const currentWorkspaceId = () => {
    const r = router.route();
    return r.name === "workspace" ? r.id : props.activeWorkspaceId;
  };

  const handleSelectWorkspace = (id: string) => {
    router.navigate(`/workspace/${encodeURIComponent(id)}`);
  };

  const handleSelectRoute = (to: "machines" | "account" | string) => {
    router.navigate(`/${to}`);
  };

  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#0e0f12",
        color: "#ffffff",
      }}
    >
      {/* Riel con ErrorBoundary por zona */}
      <RailErrorBoundary>
        <Rail
          activeRoute={currentRouteName()}
          onSelectRoute={handleSelectRoute}
          slots={{
            stacks: (
              <RailSlot
                activeWorkspaceId={currentWorkspaceId()}
                onSelectWorkspace={handleSelectWorkspace}
                onAddWorkspace={props.onAddWorkspace}
              />
            ),
          }}
        />
      </RailErrorBoundary>

      {/* Área principal con ErrorBoundary por zona */}
      <main
        style={{
          flex: "1",
          height: "100%",
          overflow: "auto",
          position: "relative",
          background: "#0e0f12",
        }}
      >
        <MainErrorBoundary>
          {props.children ?? <RouteView route={router.route()} />}
        </MainErrorBoundary>
      </main>
    </div>
  );
}
