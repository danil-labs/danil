import { createSignal, onMount, Show, type Component, type JSX } from "solid-js";
import { SessionProvider, useSession } from "@danil/session/solid";
import { createWebSession, webLoginUrl, type SessionSource, type Session } from "@danil/session";
import { createPlatformClient, PlatformProvider, type PlatformClient } from "@danil/platform-client";
import { host } from "@danil/host";
import { Button, FailureNote } from "@danil/ui";
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
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        height: "100vh",
        width: "100vw",
        background: "#0e0f12",
        color: "#ffffff",
        "font-family": "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          gap: "24px",
          padding: "32px",
          background: "#18191e",
          "border-radius": "12px",
          border: "1px solid #2a2c33",
          "max-width": "400px",
          width: "90%",
          "text-align": "center",
        }}
      >
        <div style={{ "font-size": "24px", "font-weight": "600", "letter-spacing": "-0.02em" }}>
          Danil
        </div>
        <p style={{ color: "#9da1b0", margin: "0", "font-size": "14px", "line-height": "1.5" }}>
          Inicia sesión para acceder a tus máquinas y espacios de trabajo.
        </p>

        <Show
          when={props.isDesk}
          fallback={
            <a
              href={webLoginUrl()}
              style={{
                display: "inline-block",
                padding: "10px 20px",
                background: "#2f68f6",
                color: "#ffffff",
                "text-decoration": "none",
                "border-radius": "8px",
                "font-weight": "500",
                "font-size": "14px",
                transition: "background 0.2s",
              }}
            >
              Iniciar sesión
            </a>
          }
        >
          <button
            type="button"
            onClick={props.onAddSession}
            style={{
              padding: "10px 20px",
              background: "#2f68f6",
              color: "#ffffff",
              border: "none",
              "border-radius": "8px",
              "font-weight": "500",
              "font-size": "14px",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
          >
            Iniciar sesión
          </button>
        </Show>
      </div>
    </div>
  );
}

function AppWithSession(props: AppProps): JSX.Element {
  const sessionContext = useSession();
  const [checking, setChecking] = createSignal(true);

  // La plataforma la dice el host, no una variable global de Tauri (R15).
  const isDesk = () => props.isDesk ?? host.kind === "desk";
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
        <div
          style={{
            display: "flex",
            height: "100vh",
            width: "100vw",
            background: "#0e0f12",
            color: "#9da1b0",
            "align-items": "center",
            "justify-content": "center",
            "font-family": "system-ui, sans-serif",
          }}
        >
          Cargando...
        </div>
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
  let sessionSource = props.sessionSource;
  if (!sessionSource) {
    sessionSource = createWebSession();
  }

  const source = sessionSource;
  // Un solo cliente del borde para toda la app (regla 2): las features lo leen con usePlatform().
  // El transporte lo da la sesión: cookie + CSRF en la web, el motor en Desk (P1).
  const platform = (props.platform as PlatformClient | undefined) ?? createPlatformClient(source.transport());

  return (
    <SessionProvider source={source}>
      <PlatformProvider client={platform}>
        <AppWithSession {...props} />
      </PlatformProvider>
    </SessionProvider>
  );
}
