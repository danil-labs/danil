import { createSignal, onMount, Show, type Component, type JSX } from "solid-js";
import { SessionProvider, useSession } from "@danil/session/solid";
import { createWebSession, webLoginUrl, type SessionSource, type Session } from "@danil/session";
import { createPlatformClient, PlatformProvider, type PlatformClient } from "@danil/platform-client";
import { Button } from "@danil/ui";
import { RouterProvider } from "./router.tsx";
import { Layout } from "./Layout.tsx";
import type { OrganizationItem } from "./Rail.tsx";

export interface AppProps {
  sessionSource?: SessionSource;
  platform?: unknown;
  host?: unknown;
  initialPath?: string;
  isDesk?: boolean;
  organizations?: OrganizationItem[];
  activeWorkspaceId?: string;
  onAddWorkspace?: (organizationId?: string) => void;
  children?: JSX.Element;
}

function EntryScreen(props: { isDesk: boolean; onAddSession?: () => void }): JSX.Element {
  return (
    <main
      class="flex h-full min-h-screen w-full flex-col items-center justify-center overflow-y-auto bg-bg px-6 py-10 text-neutral-950 dark:text-neutral-100"
      data-web-auth="workos"
    >
      <div class="grid w-full max-w-sm gap-6">
        <h1 class="m-0 font-display text-3xl font-bold tracking-[-0.03em]">Danil</h1>
        <div class="grid gap-2">
          <h2 class="m-0 text-xl font-semibold">Iniciar sesión</h2>
          <p class="m-0 text-sm text-neutral-500" role="status">
            Inicia sesión para acceder a tus máquinas y espacios de trabajo.
          </p>
        </div>

        <Show
          when={props.isDesk}
          fallback={
            <Button as="a" class="min-h-11" href={webLoginUrl()}>
              Iniciar sesión
            </Button>
          }
        >
          <Button class="min-h-11" onClick={props.onAddSession}>
            Iniciar sesión
          </Button>
        </Show>
      </div>
    </main>
  );
}

function AppWithSession(props: AppProps): JSX.Element {
  const sessionContext = useSession();
  const [checking, setChecking] = createSignal(true);

  const isDesk = () =>
    props.isDesk ??
    (typeof window !== "undefined" &&
      Boolean(
        (window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI__ ||
          (window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
      ));

  onMount(() => {
    // Arranque lineal (B-030, B-031):
    // 1) Una sola llamada para validar sesión en lugar de estampida de 15 llamadas
    const source = sessionContext.source as SessionSource & { refresh?: () => Promise<unknown> };
    if (typeof source.refresh === "function") {
      source
        .refresh()
        .catch(() => {})
        .finally(() => {
          setChecking(false);
        });
    } else {
      setChecking(false);
    }
  });

  const activeSessions = () =>
    sessionContext.sessions().filter((s: Session) => !s.expired);

  const hasActiveSession = () => activeSessions().length > 0;

  const handleAddSession = () => {
    sessionContext.source.add().catch((e: unknown) => {
      console.error("Error al añadir sesión:", e);
    });
  };

  return (
    <Show
      when={!checking()}
      fallback={
        <main
          class="flex h-full min-h-screen w-full flex-col items-center justify-center bg-bg px-6 py-10 text-neutral-950 dark:text-neutral-100"
          data-web-loading=""
        >
          <h1 class="m-0 font-display text-3xl font-bold tracking-[-0.03em]">Danil</h1>
          <p class="m-0 mt-3 text-sm text-neutral-500" role="status">
            Conectando…
          </p>
        </main>
      }
    >
      <Show
        when={hasActiveSession()}
        fallback={<EntryScreen isDesk={isDesk()} onAddSession={handleAddSession} />}
      >
        <RouterProvider initialPath={props.initialPath}>
          <Layout
            organizations={props.organizations}
            activeWorkspaceId={props.activeWorkspaceId}
            onAddWorkspace={props.onAddWorkspace}
          >
            {props.children}
          </Layout>
        </RouterProvider>
      </Show>
    </Show>
  );
}

export function App(props: AppProps): JSX.Element {
  let sessionSource = props.sessionSource;
  if (!sessionSource) {
    sessionSource = createWebSession();
  }

  const source = sessionSource;
  // Un solo cliente del borde para toda la app (regla 2): las features lo leen con usePlatform().
  const platform =
    (props.platform as PlatformClient | undefined) ??
    createPlatformClient({
      getToken: async (workspaceId) => {
        const key = workspaceId ?? source.list().find((s) => !s.expired)?.key;
        return key ? ((await source.tokenFor(key)) ?? undefined) : undefined;
      },
      csrf: () => source.csrf(),
      onUnauthorized: () => source.onUnauthorized(source.list()[0]?.key),
    });

  return (
    <SessionProvider source={source}>
      <PlatformProvider client={platform}>
        <AppWithSession {...props} />
      </PlatformProvider>
    </SessionProvider>
  );
}
