import { createSignal, lazy, Show, Suspense, type JSX } from "solid-js";

const SettingsModal = lazy(() => import("@danil/feature-settings").then((m) => ({ default: m.SettingsModal })));
import { Rail } from "./Rail.tsx";
import { RailErrorBoundary, MainErrorBoundary } from "./ErrorBoundary.tsx";
import { RouteView, RailSlot } from "./routes.tsx";
import { useRouter } from "./router.tsx";

export interface LayoutProps {
  organizations?: unknown;
  activeWorkspaceId?: string;
  onAddWorkspace?: (organizationId?: string) => void;
  children?: JSX.Element;
}

export function Layout(props: LayoutProps): JSX.Element {
  const router = useRouter();
  const [settings, setSettings] = createSignal<string | null>(null);

  const currentRouteName = () => router.route().name;

  // La ruta del router es la única fuente de verdad del workspace activo (RV1 #16, RV2 #21)
  const currentWorkspaceId = () => {
    const r = router.route();
    return r.name === "workspace" ? r.id : undefined;
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
          onSettings={() => setSettings("account")}
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

      <Show when={settings()}>
        {(panel) => (
          <Suspense>
            <SettingsModal open panel={panel()} onClose={() => setSettings(null)} />
          </Suspense>
        )}
      </Show>

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
