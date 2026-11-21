import { createEffect, createSignal, type JSX } from "solid-js";
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

  const [lastWorkspaceId, setLastWorkspaceId] = createSignal<string | undefined>(props.activeWorkspaceId);

  createEffect(() => {
    const r = router.route();
    if (r.name === "workspace" && r.id) {
      setLastWorkspaceId(r.id);
    }
  });

  const currentRouteName = () => router.route().name;

  const currentWorkspaceId = () => {
    const r = router.route();
    return r.name === "workspace" ? r.id : (lastWorkspaceId() ?? props.activeWorkspaceId);
  };

  const handleSelectWorkspace = (id: string) => {
    router.navigate(`/workspace/${encodeURIComponent(id)}`);
  };

  const handleSelectRoute = (to: "machines" | "account" | string) => {
    router.navigate(`/${to}`);
  };

  return (
    <div class="flex h-screen w-screen overflow-hidden bg-bg text-neutral-950">
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
      <main class="relative h-full flex-1 overflow-auto bg-bg">
        <MainErrorBoundary>
          {props.children ?? (
            <RouteView
              route={router.route()}
              activeWorkspaceId={currentWorkspaceId()}
            />
          )}
        </MainErrorBoundary>
      </main>
    </div>
  );
}
