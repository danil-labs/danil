import { createSignal, onMount, Show, ErrorBoundary, type Component, type JSX } from "solid-js";
import { SessionProvider, useSession } from "@danil/session/solid";
import { createWebSession, type SessionSource, type Session } from "@danil/session";

export interface AppProps {
  sessionSource?: SessionSource;
  platform?: unknown;
  host?: unknown;
  isDesk?: boolean;
}

function EntryScreen(props: { isDesk: boolean; onAddSession?: () => void }) {
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
              href="/login"
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

function AppWithSession(props: AppProps) {
  const sessionContext = useSession();
  const [checking, setChecking] = createSignal(true);

  const isDesk = () =>
    props.isDesk ??
    (typeof window !== "undefined" &&
      Boolean((window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI__ ||
        (window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__));

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
      <Show
        when={hasActiveSession()}
        fallback={<EntryScreen isDesk={isDesk()} onAddSession={handleAddSession} />}
      >
        <div
          style={{
            display: "flex",
            height: "100vh",
            width: "100vw",
            overflow: "hidden",
            background: "#0e0f12",
            color: "#ffffff",
          }}
        >
          {/* Layout con riel + área principal */}
          <aside
            id="danil-shell-rail"
            style={{
              width: "64px",
              height: "100%",
              "border-right": "1px solid #1f2128",
              background: "#12141a",
              display: "flex",
              "flex-direction": "column",
            }}
          >
            {/* Riel inicial */}
          </aside>
          <main
            id="danil-shell-main"
            style={{
              flex: "1",
              height: "100%",
              overflow: "auto",
              position: "relative",
            }}
          >
            {/* Área principal */}
          </main>
        </div>
      </Show>
    </Show>
  );
}

export function App(props: AppProps): JSX.Element {
  let sessionSource = props.sessionSource;
  if (!sessionSource) {
    sessionSource = createWebSession();
  }

  return (
    <SessionProvider source={sessionSource}>
      <AppWithSession {...props} />
    </SessionProvider>
  );
}
