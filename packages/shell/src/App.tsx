import { createSignal, onMount, Show, type JSX } from "solid-js";
import { SessionProvider, useSession } from "@danil/session/solid";
import { createWebSession, webLoginUrl, type SessionSource, type Session } from "@danil/session";
import { createPlatformClient, PlatformProvider, type PlatformClient } from "@danil/platform-client";
import { host as defaultHost, setHost, type Host } from "@danil/host";
import { Button, FailureNote } from "@danil/ui";
import { RouterProvider } from "./router.tsx";
import { Layout } from "./Layout.tsx";

export interface AppProps {
  sessionSource?: SessionSource;
  platform?: PlatformClient;
  host?: Host;
  initialPath?: string;
  isDesk?: boolean;
  organizations?: unknown;
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

  // La plataforma la dice el host, no una variable global de Tauri (R15).
  const isDesk = () => props.isDesk ?? defaultHost.kind === "desk";
  // Un error al leer la sesión no es «sin sesión» (M8): se muestra con reintento.
  const [failure, setFailure] = createSignal<unknown>(null);

  const check = () => {
    setChecking(true);
    setFailure(null);
    sessionContext.source
      .refresh()
      .then((state) => {
        if (state.kind === "error") setFailure(state.error);
      })
      .finally(() => setChecking(false));
  };
  // Arranque lineal (B-030, B-031): una sola lectura de sesión; cada pantalla pide lo suyo al montarse.
  onMount(check);

  const activeSessions = () =>
    sessionContext.sessions().filter((s: Session) => !s.expired);

  const hasActiveSession = () => activeSessions().length > 0;

  const handleAddSession = () => {
    sessionContext.source
      .add()
      .then((pending) => pending.done)
      .catch((e: unknown) => setFailure(e));
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
      <Show when={!failure()} fallback={<SessionFailure onRetry={check} />}>
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
    </Show>
  );
}

/** La sesión no se pudo leer (borde o motor caídos): error con reintento, nunca la pantalla de entrada. */
function SessionFailure(props: { onRetry: () => void }): JSX.Element {
  return (
    <div class="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-bg">
      <FailureNote what="No pudimos comprobar tu sesión." />
      <Button onClick={props.onRetry}>Reintentar</Button>
    </div>
  );
}

export function App(props: AppProps): JSX.Element {
  if (props.host) {
    setHost(props.host);
  }
  let sessionSource = props.sessionSource;
  if (!sessionSource) {
    sessionSource = createWebSession();
  }

  const source = sessionSource;
  // Un solo cliente del borde para toda la app (regla 2): las features lo leen con usePlatform().
  // El transporte lo da la sesión: cookie + CSRF en la web, el motor en Desk (P1).
  const platform = props.platform ?? createPlatformClient(source.transport());

  return (
    <SessionProvider source={source}>
      <PlatformProvider client={platform}>
        <AppWithSession {...props} />
      </PlatformProvider>
    </SessionProvider>
  );
}
