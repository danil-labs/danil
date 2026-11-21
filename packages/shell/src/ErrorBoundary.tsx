import { ErrorBoundary as SolidErrorBoundary, type JSX, type ParentProps } from "solid-js";

export function RailErrorBoundary(props: ParentProps): JSX.Element {
  return (
    <SolidErrorBoundary
      fallback={(err, reset) => (
        <div
          style={{
            padding: "8px",
            display: "flex",
            "flex-direction": "column",
            "align-items": "center",
            gap: "8px",
            color: "#f87171",
            "font-size": "11px",
            "text-align": "center",
          }}
        >
          <span title={String(err)}>⚠</span>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#2a2c33",
              border: "none",
              color: "#ffffff",
              "border-radius": "4px",
              padding: "2px 6px",
              "font-size": "10px",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      )}
    >
      {props.children}
    </SolidErrorBoundary>
  );
}

export function MainErrorBoundary(props: ParentProps): JSX.Element {
  return (
    <SolidErrorBoundary
      fallback={(err, reset) => (
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            "align-items": "center",
            "justify-content": "center",
            height: "100%",
            padding: "32px",
            color: "#9da1b0",
            "text-align": "center",
            gap: "16px",
            "font-family": "system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{ "font-size": "20px", color: "#f87171", "font-weight": "600" }}>
            Ha ocurrido un error en esta vista
          </div>
          <pre
            style={{
              background: "#18191e",
              padding: "12px 16px",
              "border-radius": "8px",
              border: "1px solid #2a2c33",
              "max-width": "600px",
              "overflow-x": "auto",
              color: "#e2e4ed",
              "font-size": "12px",
            }}
          >
            {err instanceof Error ? err.message : String(err)}
          </pre>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#2f68f6",
              color: "#ffffff",
              border: "none",
              padding: "8px 16px",
              "border-radius": "6px",
              cursor: "pointer",
              "font-size": "13px",
              "font-weight": "500",
            }}
          >
            Reintentar
          </button>
        </div>
      )}
    >
      {props.children}
    </SolidErrorBoundary>
  );
}
